// 하루 패키지: 편지 → 문장 카드 → 낱말 10개 → 묻고 답하기 → 3분 대화
import { state, register, go, mount, on, $, esc, topBar, shuffle, today, loading, errorScreen, avatar, tileBuilder, toTiles, ICON, spotlight, clearSpotlight, hear, celebrate, carousel } from './ui.js';
import { speak, prefetch, setVoiceLevel, cancelListening, canListen, bestSimilarity, sameSentence } from './speech.js';
import { TOPICS, topicForDay, cycleForDay, SPEECH_RATE } from './content.js';
import { TALK_SECONDS } from './config.js';
import * as api from './api.js';
import { wordDiff, hasHangul } from './message.js';

const STEP_NAMES = { letter: '편지', cards: '문장 카드', words: '낱말 10개', qa: '묻고 답하기', talk: '3분 대화' };

register('day', (opts) => startDay(opts || {}));

// 진행 상황 기억 (중간에 나가도 이어서 하기) --------------------------------------------
function saveProgress(S) {
  if (S.review) return;
  try {
    localStorage.setItem('wt-progress', JSON.stringify({
      day: S.day, i: S.i, step: S.steps[S.i], sub: S.sub || 0,
      done: S.steps.slice(0, S.i), score: S.score,
    }));
  } catch (e) { /* 무시 */ }
}
function readProgress() {
  try { return JSON.parse(localStorage.getItem('wt-progress') || 'null'); } catch (e) { return null; }
}
function clearProgress() {
  try { localStorage.removeItem('wt-progress'); } catch (e) { /* 무시 */ }
}

// 오늘 내용 불러오기 (없으면 AI가 만들기) ----------------------------------------------
function validPack(c) {
  return c && Array.isArray(c.cards) && c.cards.length && Array.isArray(c.words) && c.words.length &&
    Array.isArray(c.questions) && c.questions.length && c.talk && c.talk.opener_en;
}
function tidy(c) {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  c.cards = c.cards.slice(0, 8).map((x) => ({ en: str(x.en), ko: str(x.ko), say: str(x.say) })).filter((x) => x.en);
  c.words = c.words.slice(0, 10).map((x) => ({ en: str(x.en), ko: str(x.ko), say: str(x.say), emoji: str(x.emoji).slice(0, 8) })).filter((x) => x.en);
  c.questions = c.questions.slice(0, 5).map((q) => ({
    en: str(q.en), ko: str(q.ko),
    choices: (Array.isArray(q.choices) ? q.choices : []).slice(0, 3).map((x) => ({ en: str(x.en), ko: str(x.ko) })).filter((x) => x.en),
  })).filter((q) => q.en);
  c.talk = {
    scene_ko: str(c.talk.scene_ko), opener_en: str(c.talk.opener_en), opener_ko: str(c.talk.opener_ko),
    suggestions: (Array.isArray(c.talk.suggestions) ? c.talk.suggestions : []).slice(0, 3).map((x) => ({ en: str(x && x.en), ko: str(x && x.ko) })).filter((x) => x.en),
  };
  c.title_ko = str(c.title_ko);
  return c;
}
async function loadPack(day) {
  const existing = await api.getPack(day);
  if (existing && validPack(existing.content)) return existing;
  const p = state.profile;
  const t = topicForDay(day);
  const notes = await api.recentNotes(40);
  const content = await api.ai('pack', { topic: t.id, level: p.level, cycle: cycleForDay(day), name: p.name, notes });
  if (!validPack(content)) throw new api.AIError('ai_error');
  return await api.savePack(day, p.level, t.id, tidy(content));
}

async function startDay({ day, review = false, startStep = null }) {
  loading('클라우디아가 오늘 공부를 준비하고 있어요…');
  const slow = setTimeout(() => {
    const p = document.querySelector('.screen .lead');
    if (p) p.textContent = '조금만 기다려 주세요. 새 공부를 만들 때는 30초쯤 걸려요…';
  }, 12000);
  let pack;
  try {
    pack = await loadPack(day);
  } catch (e) {
    clearTimeout(slow);
    return errorScreen(e instanceof api.AIError ? api.aiMessage(e) : '공부를 불러오지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.',
      () => startDay({ day, review, startStep }));
  }
  clearTimeout(slow);
  let letter = null;
  if (!review) { try { letter = await api.pendingLetter(state.user.id); } catch (e) { /* 편지 없이 진행 */ } }
  let notes = [];
  try { notes = await api.recentNotes(30); } catch (e) { /* 무시 */ }

  const steps = [letter ? 'letter' : null, 'cards', 'words', 'qa', 'talk'].filter(Boolean);
  const S = {
    day, review, pack, c: pack.content, letter, steps, i: 0, notes,
    level: pack.level, topic: pack.topic, rate: SPEECH_RATE[pack.level] || 0.85,
    score: { words: [0, 0], qa: [0, 0], talk: 0, letter: false },
  };
  setVoiceLevel(S.level);
  if (S.c.cards[0]) prefetch(S.c.cards[0].en);
  if (!review) {
    const saved = readProgress();
    if (saved && saved.day === day) {
      const idx = steps.indexOf(saved.step);
      if (idx >= 0 && (idx > 0 || saved.sub > 0)) {
        S.i = idx;
        S.resumeSub = saved.sub || 0;
        if (saved.score) S.score = saved.score;
      }
    }
  }
  // 홈에서 고른 단계부터 다시 하기
  if (startStep && steps.includes(startStep)) { S.i = steps.indexOf(startStep); S.resumeSub = 0; }
  runStep(S);
}

function runStep(S) {
  if (S.i >= S.steps.length) return finishDay(S);
  S.sub = 0;
  current = S;
  saveProgress(S);
  const fn = { letter: letterStep, cards: cardsStep, words: wordsStep, qa: qaStep, talk: talkStep }[S.steps[S.i]];
  fn(S);
}
function nextStep(S) { S.i++; S.resumeSub = 0; runStep(S); }
let current = null;
// 단계 안에서 몇 번째까지 했는지 (나갔다 와도 그 자리부터)
function startAt(S, n) { const k = Math.min(Math.max(0, S.resumeSub || 0), Math.max(0, n - 1)); S.resumeSub = 0; return k; }
function mark(S, k) { S.sub = k; saveProgress(S); }
function header(S, part = 0) {
  return topBar(`${S.i + 1}/${S.steps.length} · ${STEP_NAMES[S.steps[S.i]]}`, (S.i + part) / S.steps.length, '나가기');
}
// 나가기: 여기까지 저장하고 홈으로
function bindQuit() {
  on('quit', () => {
    if (current) saveProgress(current);
    go('home');
  });
}
function say(text, S, btnId = 'play', slow = false) {
  return speak(text, { rate: slow ? 0.55 : S.rate, button: $(btnId), restart: slow });
}
// Klaudia 목소리로 말하기. 끝까지 말했으면 true, 중간에 멈췄으면 false
function emma(text, S) {
  return speak(text, { rate: S.rate });
}
function save(S, row) {
  api.addEntry({ day: S.day, topic: S.topic, ...row }).catch(() => {});
}

// 따라 말하기: 잘 따라 하면 작은 팡파레
async function repeatAfter(target) {
  const mic = $('mic'), hint = $('hint');
  if (!mic || !hint) return;
  const alts = await hear(mic, hint);
  if (!alts || !hint.isConnected) return;
  const s = bestSimilarity(target, alts);
  if (s >= 0.8) {
    hint.innerHTML = '<span class="cheer">🎉 아주 잘하셨어요! 🎉</span>';
    celebrate(hint);
  } else {
    hint.textContent = s >= 0.5 ? `좋아요! 들린 말: "${alts[0]}"` : `한 번 더 해 볼까요? 들린 말: "${alts[0] || ''}"`;
  }
}

// 1. 편지 ----------------------------------------------------------------------------
async function letterStep(S) {
  const L = S.letter;
  let from = { id: L.from_id, name: '가족' };
  try {
    const members = await api.myContacts();
    from = members.find((m) => m.id === L.from_id) || from;
  } catch (e) { /* 무시 */ }
  const fromName = from.name || '가족';
  loading(`${fromName}님의 편지를 읽기 쉽게 준비하고 있어요…`);
  const base = {
    writer_role: 'learner', level: S.level, reader_level: from.level || 1,
    from_name: state.profile.name, to_name: fromName, topic: 'reply', reply_to: L.body,
  };
  let plan = null;
  try { plan = await api.ai('compose', { ...base, mode: 'plan', notes: S.notes.slice(0, 10) }); } catch (e) { /* 원문만 */ }
  const ok = (x) => x && typeof x.en === 'string' && x.en.trim();
  const points = plan && Array.isArray(plan.points) ? plan.points.filter((x) => x && x.ko) : [];
  const answers = [
    ...points.flatMap((x) => (Array.isArray(x.body) ? x.body.filter(ok) : [])),
    ...((plan && Array.isArray(plan.body)) ? plan.body.filter(ok) : []),
  ];
  const nWords = (x) => x.en.trim().split(/\s+/).length;
  // 1번: 낱말 조합용 짧은 문장 (낱말 7개 이하)
  const tileTarget = answers.filter((x) => nWords(x) <= 7).sort((a, b) => nWords(a) - nWords(b))[0] || answers[0] || null;
  // 2번: 말하기 힌트 (편지의 다른 부분)
  const speakHint = points[1] || points[0] || null;
  const speakExample = (speakHint && Array.isArray(speakHint.body) ? speakHint.body.find(ok) : null) || answers.find((x) => x !== tileTarget) || null;
  // 3번: 끝인사 고르기
  const closers = ((plan && Array.isArray(plan.close)) ? plan.close.filter(ok) : []).slice(0, 3);
  if (!closers.length) closers.push({ en: 'Talk soon!', ko: '또 이야기해요!' }, { en: 'Take care!', ko: '잘 지내요!' }, { en: 'How about you?', ko: '당신은 어때요?' });

  // 세 부분에 쓴 문장
  const parts = [
    { key: 'tiles', title: '낱말로 만든 문장', items: [] },
    { key: 'speak', title: '말로 한 문장', items: [] },
    { key: 'pick', title: '고른 끝인사', items: [] },
  ];
  let backTo = null; // + 버튼으로 들어왔으면 끝나고 요약으로

  function frame(n, inner, { bubble = '', compact = false } = {}) {
    mount(`<section class="screen fit letter-reply">
      ${header(S, 0.2 + (n / 3) * 0.6)}
      <div class="reply-steps"><span class="${n === 0 ? 'on' : ''}">1 낱말</span><span class="${n === 1 ? 'on' : ''}">2 말하기</span><span class="${n === 2 ? 'on' : ''}">3 끝인사</span>
        <button class="letter-link" id="seeLetter" type="button">편지 보기 ▾</button></div>
      ${compact ? '' : `<div class="emma-row">${avatar('sm')}<div class="bubble"><p class="ko-line">${bubble}</p></div></div>`}
      ${inner}
    </section>`);
    bindQuit();
    on('seeLetter', openLetter);
  }
  function openLetter() {
    const pop = document.createElement('div');
    pop.className = 'sheet letter-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    pop.innerHTML = `<div class="sheet-inner">
      <div class="bar"><b class="sheet-title">${esc(fromName)}님 편지</b><button class="ghost" id="letterClose" type="button">닫기</button></div>
      <div class="sheet-list">
        <p class="en big-letter" lang="en">${esc(L.body)}</p>
        ${plan && plan.letter_ko ? `<p class="muted big-letter-ko">${esc(plan.letter_ko)}</p>` : ''}
        <button class="ghost" id="letterHear" type="button">${ICON.sound} 듣기</button>
      </div></div>`;
    document.body.appendChild(pop);
    document.body.classList.add('sheet-open');
    const close = () => { pop.remove(); document.body.classList.remove('sheet-open'); };
    pop.querySelector('#letterClose').addEventListener('click', close);
    pop.querySelector('#letterHear').addEventListener('click', (e) => speak(L.body, { rate: S.rate, button: e.currentTarget }));
  }
  const after = (n) => { if (backTo) { backTo = null; return summary(); } return [tilesStep, speakStep, pickStep][n + 1] ? [tilesStep, speakStep, pickStep][n + 1]() : summary(); };

  // 0. 편지 읽기
  function read() {
    mount(`<section class="screen fit letter-read">
      ${header(S, 0)}
      <h2>✉️ ${esc(fromName)}님이 편지를 보냈어요</h2>
      <div class="card letter grow-box">
        <p class="en letter-text" lang="en">${esc(L.body)}</p>
        ${plan && plan.letter_ko ? `<p class="ko">${esc(plan.letter_ko)}</p>` : ''}
      </div>
      <div class="listen-row">
        <button class="listen" id="play" type="button">${ICON.sound} 듣기</button>
        <button class="slow" id="slow" type="button">천천히<br>듣기</button>
      </div>
      <div class="nav">
        <button class="prev" id="later" type="button">다음에 답장</button>
        <button class="next" id="write" type="button">답장 쓰기</button>
      </div>
    </section>`);
    bindQuit();
    on('play', () => say(L.body, S));
    on('slow', () => say(L.body, S, 'play', true));
    on('later', async () => { try { await api.markLetter(L.id); } catch (e) { /* 무시 */ } nextStep(S); });
    on('write', () => (tileTarget ? tilesStep() : speakStep()));
  }

  // 1. 낱말 조합: 짧은 문장 하나를 낱말 조각(최대 4개)으로
  function chunks(sentence) {
    const w = String(sentence).trim().split(/\s+/);
    const n = Math.min(4, w.length);
    const out = [];
    for (let i = 0; i < n; i++) out.push(w.slice(Math.round((i * w.length) / n), Math.round(((i + 1) * w.length) / n)).join(' '));
    return out.filter(Boolean);
  }
  function tilesStep() {
    if (!tileTarget) return speakStep();
    const pieces = chunks(tileTarget.en);
    let order = shuffle(pieces.map((_, i) => i));
    if (order.every((v, i) => v === i) && order.length > 1) order = order.slice(1).concat(order[0]);
    frame(0, `<p class="target-ko">"${esc(tileTarget.ko || '')}"</p>
      <div id="tiles" class="tiles big-tiles"></div>
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="nav bottom">
        <button class="prev" id="reset" type="button">다시 하기</button>
        <button class="next" id="done" type="button" disabled>다음</button>
      </div>`, { bubble: '이런 뜻으로 답장해 볼까요?<br><b>조각을 차례대로 눌러</b> 문장을 만들어요.' });
    const tb = tileBuilder($('tiles'), order.map((i) => pieces[i]), (txt) => {
      const right = sameSentence(txt, tileTarget.en);
      if ($('done')) $('done').disabled = !right;
      if (right && $('hint')) {
        $('hint').innerHTML = '<span class="cheer">🎉 잘 만들었어요!</span>';
        celebrate($('hint'));
        say(tileTarget.en, S);
        spotlight($('done'), $('hint'), $('tiles'));
      } else if ($('hint') && txt && txt.split(' ').length >= tileTarget.en.split(' ').length) {
        $('hint').textContent = '순서가 조금 달라요. 위의 조각을 누르면 빠져요.';
      } else if ($('hint')) { $('hint').textContent = ''; clearSpotlight(); }
    });
    on('reset', () => tb.clear());
    on('done', () => { parts[0].items.push({ en: tileTarget.en, ko: tileTarget.ko || '' }); clearSpotlight(); after(0); });
  }

  // 2. 말하기: 한국어로 말해도 클라우디아가 쉬운 영어로
  function speakStep() {
    const hintKo = speakHint ? speakHint.ko : '편지에 대한 내 생각';
    frame(1, `<div class="example-box">${speakExample ? `<p class="label">예를 들면</p><p class="en" lang="en">${esc(speakExample.en)}</p><p class="muted">${esc(speakExample.ko || '')}</p>` : ''}</div>
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="compose-dock bottom">
        <button class="round-ghost" id="skip" type="button">건너뛰기</button>
        ${canListen ? `<button class="mic-round" id="mic" type="button" aria-label="말하기">${ICON.mic}<span>말하기</span></button>` : '<span></span>'}
        ${speakExample ? '<button class="round-ghost" id="useEx" type="button">예시 쓰기</button>' : '<span></span>'}
      </div>`, { bubble: `이번엔 <b>직접 말해</b> 볼까요?<br>· ${esc(hintKo)}<br><small>한국어로 말해도 영어로 바꿔 드려요.</small>` });
    on('skip', () => after(1));
    on('useEx', () => compare({ en: speakExample.en, ko: speakExample.ko || '', said: speakExample.en }));
    on('mic', async () => {
      const said = await hear($('mic'), $('hint'), { listening: '듣고 있어요… 한국어로 말해도 돼요', lang: 'auto', silenceMs: 2200 });
      if (!said || !said[0] || !$('hint')) return;
      $('hint').textContent = '영어로 바꾸고 있어요…';
      try {
        const r = await api.ai('compose', { ...base, mode: 'voice', step: 'body', said: said[0], draft: parts.flatMap((x) => x.items.map((i) => i.en)) });
        if (!r || !r.en) throw new Error('empty');
        compare({ en: r.en, ko: r.ko || '', said: said[0] });
      } catch (e) { if ($('hint')) $('hint').textContent = '바꾸지 못했어요. 한 번 더 말씀해 주세요.'; }
    });
  }
  function compare(x) {
    const korean = hasHangul(x.said);
    const d = korean ? { mine: esc(x.said), fixed: esc(x.en), changed: true } : wordDiff(x.said, x.en);
    frame(1, `<div class="compare">
        <p class="label">내가 한 말</p><p class="mine-line">${d.mine}</p>
        <p class="label">클라우디아가 고친 문장</p><p class="fixed-line" lang="en">${d.fixed}</p>
        ${x.ko ? `<p class="muted">${esc(x.ko)}</p>` : ''}
        ${!d.changed ? '<p class="praise">고칠 곳이 없어요. 잘 말했어요!</p>' : ''}
      </div>
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="compare-actions">
        <button class="mic plain mid" id="again" type="button">${ICON.mic} 다시 말하기</button>
        <button class="primary mid" id="use" type="button">이 문장 사용하기</button>
      </div>`, { compact: true });
    on('again', speakStep);
    on('use', () => { parts[1].items.push({ en: x.en, ko: x.ko }); after(1); });
  }

  // 3. 끝인사 고르기
  function pickStep() {
    frame(2, `<div class="sugg-list bottom" id="opts"></div>`, { bubble: '마지막으로 <b>끝인사</b>를 골라요.<br>옆으로 넘겨 보고 마음에 드는 걸 누르세요.' });
    carousel($('opts'), closers, {
      action: '이 문장 사용하기',
      onListen: (x) => speak(x.en, { rate: S.rate }),
      onPick: (x) => { parts[2].items.push({ en: x.en, ko: x.ko || '' }); after(2); },
    });
  }

  // 4. 보내기 전에: 세 부분을 나눠 보여 주고, + 로 더 붙이거나 수정
  function body() { return parts.flatMap((x) => x.items.map((i) => i.en.trim())).filter(Boolean).join(' '); }
  function summary() {
    clearSpotlight();
    mount(`<section class="screen fit letter-summary">
      ${header(S, 0.85)}
      <h2>이렇게 보낼게요 <button class="letter-link inline" id="seeLetter" type="button">편지 보기 ▾</button></h2>
      <div class="sum-list">${parts.map((x, i) => `<div class="sum-part">
        <div class="sum-head"><span class="label">${i + 1}. ${x.title}</span>
          <span class="sum-btns"><button class="ghost sum-add" type="button" data-i="${i}" aria-label="${x.title}에 더 붙이기">＋</button><button class="ghost sum-edit" type="button" data-i="${i}">수정</button></span></div>
        <div class="sum-text" id="sum${i}">${x.items.length ? `<p lang="en">${esc(x.items.map((t) => t.en).join(' '))}</p>` : '<p class="muted">비어 있어요</p>'}</div>
      </div>`).join('')}</div>
      <p class="msg" id="msg" role="alert"></p>
      <div class="nav bottom">
        <button class="prev" id="hearAll" type="button">${ICON.sound} 전체 듣기</button>
        <button class="next" id="send" type="button">보내기</button>
      </div>
    </section>`);
    bindQuit();
    on('seeLetter', openLetter);
    on('hearAll', () => say(body(), S, 'hearAll'));
    document.querySelectorAll('.sum-add').forEach((b) => b.addEventListener('click', () => {
      backTo = 'summary';
      [tilesStep, speakStep, pickStep][Number(b.dataset.i)]();
    }));
    document.querySelectorAll('.sum-edit').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.i);
      const box = $(`sum${i}`);
      box.innerHTML = `<textarea rows="2" lang="en" id="ed${i}">${esc(parts[i].items.map((t) => t.en).join(' '))}</textarea>
        <button class="primary mid" id="ok${i}" type="button">저장</button>`;
      $(`ed${i}`).focus();
      on(`ok${i}`, () => {
        const v = $(`ed${i}`).value.replace(/\s+/g, ' ').trim();
        parts[i].items = v ? [{ en: v, ko: '' }] : [];
        summary();
      });
    }));
    on('send', async () => {
      const text = body();
      if (!text) { $('msg').textContent = '보낼 문장이 없어요. ＋를 눌러 만들어 주세요.'; return; }
      $('send').disabled = true;
      $('msg').textContent = '보내는 중이에요…';
      try {
        await api.sendLetter({ to_id: L.from_id, body: text.slice(0, 2000), reply_to: L.id });
        await api.markAllFrom(state.user.id, L.from_id).catch(() => api.markLetter(L.id));
        S.score.letter = true;
        save(S, { kind: 'letter', prompt_en: L.body, answer_en: text, answer_ko: parts.flatMap((x) => x.items.map((i) => i.ko)).filter(Boolean).join(' ') });
        mount(`<section class="screen center">
          <div class="big-emoji" aria-hidden="true">✉️</div>
          <h1>답장을 보냈어요!</h1>
          <p class="lead">${esc(fromName)}님이 기뻐할 거예요.</p>
          <button class="big primary" id="go" type="button">오늘 공부 계속하기</button>
        </section>`);
        on('go', () => nextStep(S));
      } catch (e) {
        $('send').disabled = false;
        $('msg').textContent = '보내지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.';
      }
    });
  }

  read();
}

// 2. 문장 카드 ------------------------------------------------------------------------
function cardsStep(S) {
  const cards = S.c.cards;
  let k = startAt(S, cards.length);
  function render() {
    const it = cards[k];
    mark(S, k);
    mount(`<section class="screen fit">
      ${header(S, k / cards.length)}
      <div class="sentence">
        <p class="count">${k + 1} <span>/ ${cards.length}</span></p>
        <p class="ko">${esc(it.ko)}</p>
        <p class="en" lang="en">${esc(it.en)}</p>
        ${it.say ? `<p class="say">${esc(it.say)}</p>` : ''}
      </div>
      <div class="listen-row with-coach">
        <div class="coach-wrap grow">
          <span class="coach" id="coachListen" role="status">듣고 나서 따라 말해 보세요</span>
          <button class="listen" id="play" type="button">${ICON.sound} 듣기</button>
        </div>
        <button class="slow" id="slow" type="button">천천히<br>듣기</button>
      </div>
      ${canListen ? `<div class="coach-wrap">
          <span class="coach below" id="coachMic" role="status" hidden>눌러서 말하기를 시작해 보세요</span>
          <button class="mic" id="mic" type="button">${ICON.mic} 따라 말하기</button>
        </div>` : ''}
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="nav">
        <button class="prev" id="prev" type="button" ${k === 0 ? 'disabled' : ''}>이전</button>
        <button class="next" id="next" type="button">${k === cards.length - 1 ? '다 했어요' : '다음'}</button>
      </div>
    </section>`);
    bindQuit();
    // 듣기를 누르면 듣기 말풍선은 사라지고, 따라 말하기 말풍선이 나타나요
    const heard = () => {
      if ($('coachListen')) $('coachListen').hidden = true;
      if ($('coachMic') && !$('mic').classList.contains('used')) $('coachMic').hidden = false;
    };
    on('play', () => { heard(); say(it.en, S); });
    on('slow', () => { heard(); say(it.en, S, 'play', true); });
    on('mic', () => {
      if ($('coachMic')) $('coachMic').hidden = true;
      $('mic').classList.add('used');
      repeatAfter(it.en);
    });
    on('prev', () => { if (k > 0) { k--; render(); } });
    on('next', () => { if (k < cards.length - 1) { k++; render(); } else nextStep(S); });
    if (cards[k + 1]) prefetch(cards[k + 1].en);
    else if (S.c.questions[0]) prefetch(S.c.questions[0].en);
  }
  render();
}

// 3. 낱말 10개 ------------------------------------------------------------------------
function wordsStep(S) {
  const words = S.c.words;
  // 1부: 영어 낱말을 읽고 뜻 고르기 (10개) · 2부: 소리만 듣고 뜻 고르기 (5개)
  const listenQs = shuffle(words).slice(0, Math.min(5, words.length));
  const total = words.length + listenQs.length;
  const N_OPT = 3;
  const states = { read: words.map(() => null), listen: listenQs.map(() => null) };
  let k = startAt(S, words.length);

  // 한 문제 화면 (두 부분이 같은 모양을 써요)
  function question(part, qi) {
    const list = part === 'read' ? words : listenQs;
    if (qi >= list.length) return part === 'read' ? question('listen', 0) : nextStep(S);
    if (part === 'read') mark(S, qi);
    const q = list[qi];
    const st = states[part][qi] || (states[part][qi] = {
      opts: shuffle([q, ...shuffle(words.filter((w) => w.en !== q.en)).slice(0, N_OPT - 1)]),
      picked: null,
    });
    const done = (part === 'read' ? qi : words.length + qi) / total;
    const lastOfAll = part === 'listen' && qi === list.length - 1;
    mount(`<section class="screen fit words-q">
      ${header(S, done)}
      <p class="lead" id="hint" aria-live="polite">${part === 'read' ? '영어를 읽고 <b>맞는 뜻</b>을 고르세요.' : '<b>소리만 듣고</b> 맞는 뜻을 고르세요.'}
        <span class="muted">(${qi + 1}/${list.length})</span></p>
      ${part === 'read'
        ? `<div class="word-show">
             <p class="en" lang="en">${esc(q.en)}</p>
             <p class="say" id="say" hidden>${esc(q.say || '')}</p>
             <div class="word-actions">
               <button class="ghost small-listen" id="play" type="button">${ICON.sound} 소리 듣기</button>
               ${canListen ? `<button class="ghost small-listen" id="mic" type="button" hidden>${ICON.mic} 따라 말하기</button>` : ''}
             </div>
           </div>`
        : `<div class="word-actions wide">
             <button class="listen" id="play" type="button">${ICON.sound} 다시 듣기</button>
             ${canListen ? `<button class="mic plain" id="mic" type="button" hidden>${ICON.mic} 따라 말하기</button>` : ''}
           </div>`}
      <div class="choices">${st.opts.map((o, j) => `<button class="choice" type="button" data-j="${j}"><span class="emoji" aria-hidden="true">${part === 'listen' ? esc(o.emoji || '') : ''}</span>${esc(o.ko)}</button>`).join('')}</div>
      <div class="nav">
        <button class="prev" id="qprev" type="button" ${part === 'read' && qi === 0 ? 'disabled' : ''}>이전</button>
        <button class="next" id="qnext" type="button" ${st.picked == null ? 'disabled' : ''}>${lastOfAll ? '다 했어요' : '다음'}</button>
      </div>
    </section>`);
    bindQuit();
    const buttons = document.querySelectorAll('.choice');
    function showResult(fresh) {
      const right = st.opts[st.picked].en === q.en;
      buttons.forEach((x) => {
        x.disabled = true;
        const o = st.opts[Number(x.dataset.j)];
        if (o.en === q.en) { x.classList.add('right'); x.querySelector('.emoji').textContent = o.emoji || ''; }
        else if (Number(x.dataset.j) === st.picked) x.classList.add('wrong');
      });
      if ($('mic')) $('mic').hidden = false;
      if ($('say') && q.say) $('say').hidden = false;
      $('hint').innerHTML = right ? `맞았어요! 👏 <b lang="en">${esc(q.en)}</b> = ${esc(q.ko)}` : `정답은 "<b>${esc(q.ko)}</b>"이에요. <span lang="en">${esc(q.en)}</span>`;
      $('qnext').disabled = false;
      if (fresh) {
        if (right) celebrate($('hint'));
        say(q.en, S);
      }
      spotlight($('qnext'), $('hint'), document.querySelector('.word-actions'), document.querySelector('.choices'));
    }
    on('play', () => say(q.en, S));
    on('mic', () => repeatAfter(q.en));
    on('qprev', () => {
      if (qi > 0) question(part, qi - 1);
      else if (part === 'listen') question('read', words.length - 1);
    });
    on('qnext', () => { if (st.picked != null) question(part, qi + 1); });
    buttons.forEach((b) => b.addEventListener('click', () => {
      if (st.picked != null) return;
      st.picked = Number(b.dataset.j);
      S.score.words[1]++;
      if (st.opts[st.picked].en === q.en) S.score.words[0]++;
      showResult(true);
    }));
    if (st.picked != null) showResult(false);
    else if (part === 'listen') setTimeout(() => { if ($('play')) say(q.en, S); }, 300);
  }

  question('read', k);
}

// 4. 묻고 답하기 ----------------------------------------------------------------------
const CHEERS = [
  ['Great!', '좋아요!'], ['Good answer!', '좋은 대답이에요!'], ['Wonderful!', '훌륭해요!'], ['Thank you for telling me!', '말해 줘서 고마워요!'],
];

function qaStep(S) {
  const qs = S.c.questions;
  let k = startAt(S, qs.length);
  const got = {}; // 문제마다 받은 점수 (다시 대답하면 바꿔 셉니다)

  // 클라우디아가 말한 뒤: 마이크만 밝게
  function yourTurn() {
    if (!$('area') || $('feedback')) return;
    if (canListen) {
      $('hint').innerHTML = '이제 말씀하실 차례예요.<br>마이크를 누르거나, 아래에서 골라 주세요.';
      spotlight($('mic'), $('hint'), $('again'), $('qaChoices'));
    } else {
      $('hint').textContent = '아래에서 대답을 고르거나 영어로 적어 주세요.';
      spotlight($('area'), $('again'));
    }
  }

  function ask() {
    if (k >= qs.length) return nextStep(S);
    const q = qs[k];
    mark(S, k);
    mount(`<section class="screen fit qa">
      ${header(S, k / qs.length)}
      <div class="emma-row">
        ${avatar()}
        <div class="bubble" id="bubble">
          <p class="en" lang="en">${esc(q.en)}</p>
          <p class="ko">${esc(q.ko)}</p>
        </div>
      </div>
      <button class="ghost again" id="again" type="button">${ICON.sound} 다시 듣기</button>
      <div id="area">
        ${canListen ? `<button class="mic" id="mic" type="button">${ICON.mic} 눌러서 대답하기</button>` : ''}
        <p class="hint" id="hint" aria-live="polite">클라우디아가 묻고 있어요…</p>
        <div class="sugg-list bottom" id="qaChoices"></div>
        ${canListen ? '' : `<form id="typed" class="typed"><input id="typedIn" type="text" autocomplete="off" placeholder="영어로 적어도 돼요" aria-label="영어로 적기"><button class="primary" type="submit">보내기</button></form>`}
      </div>
    </section>`);
    bindQuit();
    const play = async () => { clearSpotlight(); if (await emma(q.en, S)) yourTurn(); };
    on('again', play);
    // 클라우디아 말풍선을 누르면 흐린 화면이 풀려요
    on('bubble', () => { if (!$('feedback')) clearSpotlight(); });
    setTimeout(() => { if ($('again')) play(); }, 350);
    if (qs[k + 1]) prefetch(qs[k + 1].en);
    else if (S.c.talk && S.c.talk.opener_en) prefetch(S.c.talk.opener_en);
    carousel($('qaChoices'), q.choices, {
      action: '이 대답 고르기',
      onListen: (c) => { clearSpotlight(); speak(c.en, { rate: S.rate }); },
      onPick: (c) => answered(q, c.en, 'choice', c.ko),
    });
    on('mic', async () => {
      const alts = await hear($('mic'), $('hint'), { listening: '듣고 있어요… 말이 끝나면 저절로 넘어가요' });
      if (alts && alts[0] && $('area') && !$('feedback')) answered(q, alts[0], 'voice');
    });
    const typed = $('typed');
    if (typed) typed.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('typedIn').value.trim();
      if (v) answered(q, v, 'voice');
    });
  }

  async function answered(q, text, how, ko = '') {
    clearSpotlight();
    if (got[k] != null) { S.score.qa[0] -= got[k]; S.score.qa[1] -= 1; delete got[k]; }
    const before = S.score.qa[0];
    $('area').innerHTML = `<div class="feedback"><p class="label">내가 한 말</p><p class="en" lang="en">${esc(text)}</p><p class="muted">클라우디아가 듣고 있어요…</p></div>`;
    let r;
    if (how === 'choice') {
      const c = CHEERS[Math.floor(Math.random() * CHEERS.length)];
      r = { reply_en: c[0], reply_ko: c[1], better_en: '', tip_ko: '', answer_ko: ko };
      S.score.qa[0] += 1;
    } else {
      try {
        r = await api.ai('check', { question: q.en, answer: text, level: S.level, topic: S.topic });
        api.addNotes(r.facts, S.topic).catch(() => {});
        save(S, { kind: 'qa', prompt_en: q.en, answer_en: text, better_en: r.better_en, answer_ko: r.answer_ko });
        S.score.qa[0] += r.good ? 1 : 0.5;
      } catch (e) {
        r = { reply_en: 'Thank you!', reply_ko: '고마워요!', better_en: '', tip_ko: '' };
        S.score.qa[0] += 0.5;
        save(S, { kind: 'qa', prompt_en: q.en, answer_en: text });
      }
    }
    S.score.qa[1] += 1;
    got[k] = S.score.qa[0] - before;
    if (!$('area')) return;
    $('bubble').innerHTML = `<p class="en" lang="en">${esc(r.reply_en || 'Good!')}</p><p class="ko">${esc(r.reply_ko || '')}</p>`;
    const showBetter = r.better_en && !sameSentence(r.better_en, text);
    $('area').innerHTML = `<div class="feedback" id="feedback">
        <p class="label">내가 한 말</p>
        <p class="en" lang="en">${esc(text)}</p>
        ${r.answer_ko ? `<p class="ko">${esc(r.answer_ko)}</p>` : ''}
        ${showBetter ? `<div class="better">
            <p class="label">이렇게 말하면 더 좋아요</p>
            <p class="en" lang="en">${esc(r.better_en)}</p>
            ${r.better_ko ? `<p class="ko">${esc(r.better_ko)}</p>` : ''}
            <button class="ghost" id="hearBetter" type="button">${ICON.sound} 들어 보기</button>
          </div>` : '<p class="praise">👍 잘 말했어요!</p>'}
        ${r.tip_ko ? `<p class="tip">💡 ${esc(r.tip_ko)}</p>` : ''}
      </div>
      <div class="answer-nav" id="answerNav">
        <button class="plain prev-btn" id="prevQ" type="button" ${k === 0 ? 'disabled' : ''}>이전</button>
        <button class="plain retry-btn" id="retryQ" type="button">${ICON.mic} 다시 대답하기</button>
        <button class="primary next-btn" id="nextQ" type="button">다음</button>
      </div>`;
    if ($('again')) $('again').hidden = true;
    on('hearBetter', () => emma(r.better_en, S));
    on('nextQ', () => { k++; ask(); });
    on('retryQ', () => ask());           // 같은 질문에 다시 대답
    on('prevQ', () => { if (k > 0) { k--; ask(); } });
    spotlight($('feedback'), $('answerNav'));
    emma(r.reply_en, S);
    if (showBetter) prefetch(r.better_en);
  }

  ask();
}

// 5. 3분 대화 -------------------------------------------------------------------------
const FIRST_HELP = {
  1: ['Hello, Klaudia!', '안녕하세요, 클라우디아!'],
  2: ["Hi, Klaudia. I'm fine, thank you.", '안녕하세요, 클라우디아. 잘 지내요, 고마워요.'],
  3: ["Hi, Klaudia! I'm good. How are you?", '안녕하세요, 클라우디아! 잘 지내요. 당신은요?'],
  4: ["Hi, Klaudia! I'm doing well. It's nice to talk with you.", '안녕하세요, 클라우디아! 잘 지내요. 이야기하게 되어 좋아요.'],
  5: ["Hi, Klaudia! I'm doing well, thanks. I had a busy day today.", '안녕하세요, 클라우디아! 잘 지내요. 오늘은 바쁜 하루였어요.'],
};

function talkStep(S) {
  const t = S.c.talk;
  const history = [{ role: 'emma', en: t.opener_en, ko: t.opener_ko }];
  const fh = FIRST_HELP[S.level] || FIRST_HELP[1];
  let sugg = t.suggestions && t.suggestions.length ? t.suggestions.slice(0, 3) : [{ en: fh[0], ko: fh[1] }];
  history[0].sugg = sugg; // 클라우디아의 말마다 그때의 대답 예시를 기억해 둡니다 (이전으로 돌아갈 때)
  let slide = 0;
  let left = TALK_SECONDS;
  let ended = false, busy = false, waitingNext = false, timeUp = false;

  mount(`<section class="screen fit talk2">
    ${header(S, 0)}
    <p class="timer2" id="timer">남은 시간 ${fmt(left)}</p>

    <div class="stage" id="stage">
      <div class="bubble-nav">
        <button class="nav-arrow" id="prevSlide" type="button" aria-label="이전 말">‹</button>
        <div class="say-bubble" id="sayBubble" aria-live="polite"></div>
        <button class="nav-arrow" id="nextSlide" type="button" aria-label="다음 말">›</button>
      </div>
      <div class="slide-dots" id="dots"></div>
      ${avatar('xl')}
    </div>

    <div id="lower">
      <p class="sugg-title">이렇게 말해 볼까요? <span class="muted">(옆으로 넘겨 보세요)</span></p>
      <div class="sugg-list" id="sugg"></div>
    </div>

    <div class="dock">
      <p class="hint" id="hint"></p>
      <div class="talk-bottom" id="controls">
        <button class="round-ghost" id="again" type="button" aria-label="다시 듣기">${ICON.sound}<span>다시 듣기</span></button>
        ${canListen ? `<button class="mic-round" id="mic" type="button" aria-label="말하기">${ICON.mic}<span>말하기</span></button>` : ''}
        <span class="round-spacer"></span>
      </div>
    </div>
    <form id="typed" class="typed ${canListen ? 'optional' : ''}"><input id="typedIn" type="text" autocomplete="off" placeholder="영어로 적어서 보내도 돼요" aria-label="영어로 적기"><button class="primary" type="submit">보내기</button></form>
  </section>`);
  bindQuit();

  function fmt(sec) { return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
  function setHint(x) { if ($('hint')) $('hint').textContent = x; }
  function lines() { return history.filter((m) => m.role === 'emma' && !m.hidden); }
  function myReplyAfter(line) {
    const i = history.indexOf(line);
    for (let j = i + 1; j < history.length; j++) { if (history[j].role === 'me') return history[j]; if (history[j].role === 'emma') break; }
    return null;
  }

  // 클라우디아 말풍선 (좌우로 넘겨 보기)
  function renderBubble() {
    const L = lines();
    if (!L.length || !$('sayBubble')) return;
    slide = Math.max(0, Math.min(slide, L.length - 1));
    const m = L[slide];
    const mine = myReplyAfter(m);
    $('sayBubble').innerHTML = `<p class="en" lang="en">${esc(m.en)}</p>${m.ko ? `<p class="ko">${esc(m.ko)}</p>` : ''}
      ${mine ? `<p class="mine"><span>내 대답</span> <span lang="en">${esc(mine.en)}</span></p>` : ''}`;
    $('dots').innerHTML = L.length > 1 ? L.map((_, i) => `<span class="${i === slide ? 'on' : ''}"></span>`).join('') : '';
    $('prevSlide').disabled = slide === 0;
    $('nextSlide').disabled = slide === L.length - 1;
  }
  function showLatest() { slide = lines().length - 1; renderBubble(); }

  // 대답 예시 카드
  function renderSugg() {
    if (!$('sugg')) return;
    carousel($('sugg'), sugg.slice(0, 3), {
      action: '이 문장으로 대답하기',
      onListen: (x) => { clearSpotlight(); emma(x.en, S); },
      onPick: (x) => send(x.en),
    });
  }
  function setSugg(list) {
    const clean = (Array.isArray(list) ? list : []).filter((x) => x && x.en).slice(0, 3);
    if (clean.length) { sugg = clean; renderSugg(); }
  }

  // 내 차례: 마이크만 밝게
  function yourTurn() {
    if (ended || busy || waitingNext || !$('controls')) return;
    if (timeUp) return end();
    if (canListen && $('mic')) {
      setHint('이제 말씀하실 차례예요');
      spotlight($('mic'), $('hint'), $('lower'), $('again'));
    } else {
      setHint('영어로 적어서 보내 주세요.');
      spotlight($('typed'), $('hint'), $('lower'), $('again'));
    }
  }
  async function klaudiaSays(line) {
    clearSpotlight();
    showLatest();
    setHint('');
    if (await emma(line, S)) yourTurn();
  }

  async function send(text) {
    text = String(text || '').trim();
    if (busy || ended || waitingNext || !text) return;
    busy = true;
    clearSpotlight();
    history.push({ role: 'me', en: text });
    S.score.talk++;
    renderBubble();
    $('lower').innerHTML = `<div class="feedback"><p class="label">내가 한 말</p><p class="en" lang="en">${esc(text)}</p><p class="muted">클라우디아가 듣고 있어요…</p></div>`;
    setHint('');
    try {
      const r = await api.ai('chat', {
        topic: S.topic, level: S.level, scene: t.scene_ko, notes: S.notes,
        history: history.filter((m) => !m.hidden).map(({ role, en }) => ({ role, en })),
      });
      const prev = lines()[lines().length - 1];
      save(S, { kind: 'talk', prompt_en: prev ? prev.en : '', answer_en: text, better_en: r.fix_en || '', answer_ko: r.said_ko || '' });
      const reply = r.en ? { role: 'emma', en: r.en, ko: r.ko || '', hidden: true } : null;
      if (reply) { history.push(reply); prefetch(reply.en); }
      const next = Array.isArray(r.suggestions) && r.suggestions.length ? r.suggestions : (r.help_en ? [{ en: r.help_en, ko: r.help_ko || '' }] : []);
      api.addNotes(r.facts, S.topic).catch(() => {});
      if (Array.isArray(r.facts)) S.notes = [...r.facts, ...S.notes].slice(0, 40);
      busy = false;
      showFeedback(text, r, reply, next);
    } catch (e) {
      busy = false;
      restoreLower();
      setHint(api.aiMessage(e));
      showSkip();
    }
  }

  function restoreLower() {
    if (!$('lower')) return;
    $('lower').innerHTML = `<p class="sugg-title">이렇게 말해 볼까요? <span class="muted">(옆으로 넘겨 보세요)</span></p><div class="sugg-list" id="sugg"></div>`;
    renderSugg();
  }

  // 말한 뒤: 피드백과 '다음'만 밝게
  const dock = (show) => { const d = document.querySelector('.dock'); if (d) d.hidden = !show; };
  function showFeedback(text, r, reply, nextSugg) {
    if (!$('lower')) return;
    waitingNext = true;
    dock(false);
    document.querySelector('.talk2')?.classList.add('fb');
    const better = r.fix_en && !sameSentence(r.fix_en, text);
    $('lower').innerHTML = `<div class="feedback" id="feedback">
        <p class="label">내가 한 말</p>
        <p class="en" lang="en">${esc(text)}</p>
        ${r.said_ko ? `<p class="ko">${esc(r.said_ko)}</p>` : ''}
        ${better ? `<div class="better">
            <p class="label">이렇게 말하면 더 자연스러워요</p>
            <p class="en" lang="en">${esc(r.fix_en)}</p>
            <button class="ghost" id="hearFix" type="button">${ICON.sound} 들어 보기</button>
          </div>` : '<p class="praise">👍 잘 말했어요!</p>'}
      </div>
      <p class="muted center-note">다음을 누르면 클라우디아가 대답해요</p>
      <div class="answer-nav" id="answerNav">
        <button class="plain prev-btn" id="prevTurn" type="button" ${lines().length < 2 ? 'disabled' : ''}>이전</button>
        <button class="plain retry-btn" id="retryTurn" type="button">${ICON.mic} 다시 대답하기</button>
        <button class="primary next-btn" id="nextTurn" type="button">다음</button>
      </div>`;
    on('hearFix', () => emma(r.fix_en, S));
    // 다시 대답하기: 방금 내 대답을 지우고 같은 말에 다시 대답
    on('retryTurn', () => { rewind(1); });
    // 이전: 클라우디아의 바로 앞 질문으로 돌아가서 다시 대답
    on('prevTurn', () => { rewind(2); });
    on('nextTurn', () => {
      waitingNext = false;
      dock(true);
      document.querySelector('.talk2')?.classList.remove('fb');
      if (nextSugg.length) sugg = nextSugg.slice(0, 3);
      restoreLower();
      if (reply) { reply.hidden = false; reply.sugg = sugg; }
      if (timeUp) return end();
      if (reply) klaudiaSays(reply.en); else yourTurn();
    });
    spotlight($('feedback'), $('answerNav'));
    if (better) prefetch(r.fix_en);
  }

  // 대화 되돌리기: steps=1 → 방금 대답만, steps=2 → 클라우디아의 앞 질문까지
  function rewind(steps) {
    const pop = () => history.pop();
    while (history.length && history[history.length - 1].hidden) pop();          // 아직 안 보인 클라우디아 대답
    if (history.length && history[history.length - 1].role === 'me') { pop(); S.score.talk = Math.max(0, S.score.talk - 1); }
    if (steps === 2 && lines().length > 1) {
      pop();                                                                       // 지금 질문
      if (history.length && history[history.length - 1].role === 'me') { pop(); S.score.talk = Math.max(0, S.score.talk - 1); }
    }
    const cur = lines()[lines().length - 1];
    waitingNext = false;
    dock(true);
    document.querySelector('.talk2')?.classList.remove('fb');
    if (cur && cur.sugg) sugg = cur.sugg;
    restoreLower();
    if (timeUp) return end();
    if (steps === 2 && cur) klaudiaSays(cur.en); else { showLatest(); yourTurn(); }
  }

  function showSkip() {
    if ($('skip')) return;
    const c = $('controls');
    if (c) c.insertAdjacentHTML('afterend', '<button class="plain mid wide" id="skip" type="button">대화 건너뛰고 마치기</button>');
    on('skip', () => nextStep(S));
  }

  async function end() {
    if (ended) return;
    ended = true;
    dock(true);
    clearSpotlight();
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    cancelListening();
    $('lower').innerHTML = '';
    $('controls').innerHTML = '';
    setHint('시간이 다 됐어요. 클라우디아가 인사하고 있어요…');
    let bye = { en: 'It was so nice talking with you. See you tomorrow!', ko: '이야기해서 정말 좋았어요. 내일 또 만나요!' };
    try {
      const r = await api.ai('chat', { topic: S.topic, level: S.level, scene: t.scene_ko, notes: S.notes, ending: true, history: history.filter((m) => !m.hidden).map(({ role, en }) => ({ role, en })) });
      if (r.en) bye = { en: r.en, ko: r.ko || '' };
    } catch (e) { /* 기본 인사 */ }
    if (!$('stage')) return;
    history.push({ role: 'emma', ...bye });
    showLatest();
    setHint('');
    $('controls').innerHTML = '<button class="big primary wide" id="done" type="button">오늘 공부 마치기</button>';
    on('done', () => nextStep(S));
    spotlight($('done'));
    emma(bye.en, S);
  }

  on('prevSlide', () => { slide--; renderBubble(); });
  on('nextSlide', () => { slide++; renderBubble(); });
  // 말풍선을 손가락으로 밀어서 넘기기
  let x0 = null;
  // 클라우디아 말풍선을 누르면 흐린 화면이 풀려요 (대답 확인 중일 때는 그대로)
  $('sayBubble').addEventListener('click', () => { if (!waitingNext && !ended) clearSpotlight(); });
  $('sayBubble').addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  $('sayBubble').addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) < 40) return;
    slide += dx < 0 ? 1 : -1;
    renderBubble();
  });

  on('again', async () => {
    const L = lines();
    const m = L[slide] || L[L.length - 1];
    if (!m) return;
    clearSpotlight();
    if (await emma(m.en, S)) yourTurn();
  });
  on('mic', async () => {
    const mic = $('mic');
    if (!mic.classList.contains('recording') && (busy || ended || waitingNext)) return;
    clearSpotlight();
    const alts = await hear(mic, $('hint'), { listening: '듣고 있어요… 말이 끝나면 저절로 보내져요' });
    if (!alts || !alts[0]) return;
    setHint('');
    send(alts[0]);
  });
  $('typed').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('typedIn').value;
    $('typedIn').value = '';
    send(v);
  });

  showLatest();
  renderSugg();
  // 첫 대사에 맞는 대답 예시를 미리 받아 둡니다.
  if (!(t.suggestions && t.suggestions.length)) {
    api.ai('chat', { topic: S.topic, level: S.level, scene: t.scene_ko, notes: S.notes, suggest_only: true, history: [{ role: 'emma', en: t.opener_en }] })
      .then((r) => { if (!busy && !waitingNext && Array.isArray(r.suggestions)) setSugg(r.suggestions); })
      .catch(() => {});
  }
  setTimeout(() => { if ($('stage')) klaudiaSays(t.opener_en); }, 350);
  state.timer = setInterval(() => {
    left--;
    if ($('timer')) $('timer').textContent = `남은 시간 ${fmt(Math.max(0, left))}`;
    if (left <= 0) {
      clearInterval(state.timer); state.timer = null;
      if (busy || waitingNext) timeUp = true; else end();
    }
  }, 1000);
}

// 마치기 ------------------------------------------------------------------------------
async function finishDay(S) {
  clearProgress();
  const ratio = ([a, b]) => (b ? a / b : null);
  const words = ratio(S.score.words);
  const qa = ratio(S.score.qa);
  const talk = Math.min(1, S.score.talk / 6);
  const parts = [words, qa, talk].filter((x) => x !== null);
  const total = Math.round((parts.reduce((x, y) => x + y, 0) / parts.length) * 100) / 100;
  const score = { words, qa, talk: S.score.talk, letter: S.score.letter, total };
  let levelMsg = '';

  if (!S.review) {
    loading('오늘 공부를 저장하고 있어요…');
    try {
      await api.finishPack(S.pack.id, score);
      const p = state.profile;
      const fields = { day: S.day + 1, last_done_date: today() };
      if (S.day % TOPICS.length === 0) {
        const scores = await api.cycleScores(S.day - TOPICS.length + 1, S.day);
        const avg = scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : 0;
        if (avg >= 0.75 && p.level < 5) {
          fields.level = p.level + 1;
          levelMsg = `한 바퀴를 다 돌았어요! 다음 바퀴는 ${fields.level}단계로 올라가요. 🎉`;
        } else {
          levelMsg = `한 바퀴를 다 돌았어요! 다음 바퀴는 새로운 질문으로 ${p.level}단계를 한 번 더 해요.`;
        }
      }
      state.profile = await api.updateProfile(state.user.id, fields);
    } catch (e) {
      return errorScreen('저장하지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.', () => finishDay(S));
    }
  }

  mount(`<section class="screen center">
    <div class="big-emoji" aria-hidden="true">🎉</div>
    <h1>참 잘하셨어요!</h1>
    <ul class="summary">
      ${S.score.letter ? '<li>✉️ 답장 1통 보냄</li>' : ''}
      <li>📖 문장 ${S.c.cards.length}개</li>
      <li>🔤 낱말 ${S.c.words.length}개 · 문제 ${S.score.words[0]}/${S.score.words[1]} 맞힘</li>
      <li>💬 질문 ${S.score.qa[1]}개에 대답</li>
      <li>🗣️ 대화 ${S.score.talk}번 주고받음</li>
    </ul>
    ${levelMsg ? `<p class="lead">${esc(levelMsg)}</p>` : ''}
    <button class="big primary" id="home" type="button">처음으로</button>
  </section>`);
  on('home', () => go('home'));
}
