// 하루 패키지: 편지 → 문장 카드 → 낱말 10개 → 묻고 답하기 → 3분 대화
import { state, register, go, mount, on, $, esc, topBar, shuffle, today, loading, errorScreen, avatar, tileBuilder, toTiles, ICON, spotlight, clearSpotlight, hear, celebrate, carousel } from './ui.js';
import { speak, prefetch, setVoiceLevel, cancelListening, canListen, bestSimilarity, sameSentence } from './speech.js';
import { TOPICS, topicForDay, cycleForDay, SPEECH_RATE } from './content.js';
import { TALK_SECONDS, TOTAL_DAYS } from './config.js';
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
    Array.isArray(c.questions) && c.questions.length;
}
function tidy(c) {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  c.cards = c.cards.slice(0, 8).map((x) => ({ en: str(x.en), ko: str(x.ko), say: str(x.say) })).filter((x) => x.en);
  c.words = c.words.slice(0, 10).map((x) => ({ en: str(x.en), ko: str(x.ko), say: str(x.say), emoji: str(x.emoji).slice(0, 8) })).filter((x) => x.en);
  c.questions = c.questions.slice(0, 5).map((q) => ({
    en: str(q.en), ko: str(q.ko),
    choices: (Array.isArray(q.choices) ? q.choices : []).slice(0, 3).map((x) => ({ en: str(x.en), ko: str(x.ko) })).filter((x) => x.en),
  })).filter((q) => q.en);
  if (c.talk) c.talk = {
    scene_ko: str(c.talk.scene_ko), opener_en: str(c.talk.opener_en), opener_ko: str(c.talk.opener_ko),
    suggestions: (Array.isArray(c.talk.suggestions) ? c.talk.suggestions : []).slice(0, 3).map((x) => ({ en: str(x && x.en), ko: str(x && x.ko) })).filter((x) => x.en),
  };
  c.title_ko = str(c.title_ko);
  return c;
}
// 같은 날 공부를 두 번 만들지 않도록 기다리는 중인 것을 함께 써요
const preparing = new Map();
function loadPack(day) {
  if (!preparing.has(day)) {
    const p = makeOrGetPack(day);
    preparing.set(day, p);
    p.catch(() => preparing.delete(day));
  }
  return preparing.get(day);
}
// 홈 화면이나 공부를 마친 뒤 다음 공부를 미리 만들어 둬요 (누르면 바로 시작)
export function prepareDay(day) {
  if (!day || day > TOTAL_DAYS || !state.profile) return;
  loadPack(day).catch(() => {});
}
async function makeOrGetPack(day) {
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
  // 편지와 기억해 둔 이야기는 공부 내용과 함께 동시에 불러와요
  const letterP = review ? Promise.resolve(null) : api.pendingLetter(state.user.id).catch(() => null);
  const notesP = api.recentNotes(30).catch(() => []);
  try {
    pack = await loadPack(day);
  } catch (e) {
    clearTimeout(slow);
    return errorScreen(e instanceof api.AIError ? api.aiMessage(e) : '공부를 불러오지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.',
      () => startDay({ day, review, startStep }));
  }
  clearTimeout(slow);
  const [letter, notes] = await Promise.all([letterP, notesP]);

  const steps = ['cards', 'words', 'qa', letter ? 'letter' : null].filter(Boolean);   // 편지 답장은 연습을 다 한 뒤 맨 마지막에
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
function nextStep(S) { logStep(S); S.i++; S.resumeSub = 0; runStep(S); }
// 단계를 마칠 때마다 시간과 점수를 기억해 둡니다 (홈에서 눌러 보면 보여 줘요)
function logStep(S) {
  if (S.review) return;
  try {
    const log = JSON.parse(localStorage.getItem('wt-steplog') || '{}');
    const d = (log[S.day] = log[S.day] || {});
    const step = S.steps[S.i];
    d[step] = { at: new Date().toISOString(), score: JSON.parse(JSON.stringify(S.score)), n: step === 'cards' ? S.c.cards.length : step === 'words' ? S.c.words.length : step === 'qa' ? S.c.questions.length : 0 };
    Object.keys(log).map(Number).sort((a, b) => b - a).slice(30).forEach((x) => delete log[x]); // 최근 30일만
    localStorage.setItem('wt-steplog', JSON.stringify(log));
  } catch (e) { /* 무시 */ }
}
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
  const base = {
    writer_role: 'learner', level: S.level, reader_level: from.level || 1,
    from_name: state.profile.name, to_name: fromName, topic: 'reply', reply_to: L.body,
  };
  // 편지를 읽는 동안 답장 준비를 뒤에서 해 둬요 (기다리는 화면 없이)
  let plan = null;
  const planP = api.ai('compose', { ...base, mode: 'plan', notes: S.notes.slice(0, 10) })
    .then((r) => { plan = r; if ($('letterKo') && r && r.letter_ko) $('letterKo').textContent = r.letter_ko; return r; })
    .catch(() => null);

  const ok = (x) => x && typeof x.en === 'string' && x.en.trim();
  const nWords = (x) => x.en.trim().split(/\s+/).length;
  let steps = [];   // [{ko, options:[{en,ko}], mode:'tiles'|'speak'}]
  let parts = [];   // 단계마다 쓴 문장 [{items:[{en,ko}]}]
  let backTo = false; // ＋로 들어왔으면 끝나고 요약으로

  // 편지 내용에 따라 단계 수를 정해요: 앞쪽 절반은 낱말 조각, 뒤쪽 절반은 말하기
  function buildSteps() {
    const pts = plan && Array.isArray(plan.points) ? plan.points.filter((x) => x && x.ko && Array.isArray(x.body) && x.body.some(ok)) : [];
    const list = pts.map((x) => ({ ko: x.ko, options: x.body.filter(ok).slice(0, 3) }));
    const generic = [
      { ko: `${fromName}님이 편지를 보냈어요.`, options: (plan && Array.isArray(plan.body) ? plan.body : []).filter(ok).slice(0, 3) },
      { ko: '마지막으로 짧게 인사해요.', options: (plan && Array.isArray(plan.close) ? plan.close : []).filter(ok).slice(0, 3) },
    ];
    for (const g of generic) if (list.length < 2 && g.options.length) list.push(g);
    if (!list.length) list.push({ ko: `${fromName}님에게 하고 싶은 말을 해 봐요.`, options: [{ en: 'Thank you for your letter.', ko: '편지 고마워요.' }] });
    steps = list.slice(0, 6);
    const tilesN = Math.ceil(steps.length / 2);
    steps.forEach((x, i) => {
      x.mode = i < tilesN ? 'tiles' : 'speak';
      // 낱말 조각 단계는 짧은 문장이 먼저 오게
      if (x.mode === 'tiles') x.options = x.options.slice().sort((p, q) => nWords(p) - nWords(q));
    });
    parts = steps.map(() => ({ items: [] }));
  }

  function chips(n) {
    return steps.map((x, i) => `<span class="${i === n ? 'on' : ''}">${i + 1}${i === n ? (x.mode === 'tiles' ? ' 낱말' : ' 말하기') : ''}</span>`).join('');
  }
  function frame(n, inner, { bubble = '', compact = false } = {}) {
    mount(`<section class="screen fit letter-reply">
      ${header(S, 0.15 + (n / steps.length) * 0.7)}
      <div class="reply-steps">${chips(n)}<button class="letter-link" id="seeLetter" type="button">편지 보기 ▾</button></div>
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
  const ask = (x) => `${esc(x.ko)} <b>뭐라고 답해 볼까요?</b>`;
  function done(n, item) {
    if (backTo) parts[n].items.push(item); else parts[n].items = [item];
    clearSpotlight();
    if (backTo) { backTo = false; return summary(); }
    return n + 1 < steps.length ? runStep(n + 1) : summary();
  }
  function runStep(n) { return steps[n].mode === 'tiles' ? tilesPick(n) : speakStep(n); }
  const backBtn = (n) => `<button class="round-ghost" id="prevStep" type="button">${n === 0 && !backTo ? '편지 다시 보기' : '이전 단계'}</button>`;
  function bindBack(n) { on('prevStep', () => { if (backTo) { backTo = false; summary(); } else if (n === 0) read(); else runStep(n - 1); }); }

  // 0. 편지 읽기 (번역은 준비되는 대로 나타나요)
  function read() {
    mount(`<section class="screen fit letter-read">
      ${header(S, 0)}
      <h2>✉️ ${esc(fromName)}님이 편지를 보냈어요</h2>
      <div class="card letter grow-box">
        <p class="en letter-text" lang="en">${esc(L.body)}</p>
        <p class="ko" id="letterKo">${plan && plan.letter_ko ? esc(plan.letter_ko) : ''}</p>
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
    on('write', async () => {
      if (!plan) { loading('클라우디아가 답장 쓸 준비를 하고 있어요…'); await planP; }
      if (!steps.length) buildSteps();
      runStep(0);
    });
  }

  // 한국어로 말해도 영어로 바꿔 주는 마이크 (낱말 단계와 말하기 단계가 함께 써요)
  function bindVoice(n) {
    on('mic', async () => {
      const said = await hear($('mic'), $('hint'), { listening: '듣고 있어요… 한국어로 말해도 돼요', lang: 'auto', silenceMs: 2200 });
      if (!said || !said[0] || !$('hint')) return;
      $('hint').textContent = '영어로 바꾸고 있어요…';
      try {
        const r = await api.ai('compose', { ...base, mode: 'voice', step: 'body', said: said[0], draft: parts.flatMap((p0) => p0.items.map((i) => i.en)) });
        if (!r || !r.en) throw new Error('empty');
        compare(n, { en: r.en, ko: r.ko || '', said: said[0] });
      } catch (e) { if ($('hint')) $('hint').textContent = '바꾸지 못했어요. 한 번 더 말씀해 주세요.'; }
    });
  }
  const micBtn = () => (canListen ? `<button class="mic-round" id="mic" type="button" aria-label="말하기">${ICON.mic}<span>말하기</span></button>` : '<span></span>');

  // 낱말 단계 ①: 예시를 골라 낱말로 만들거나, 마이크로 직접 말하기
  function tilesPick(n) {
    const x = steps[n];
    frame(n, `<p class="pick-tip">아래 예시를 골라 낱말로 만들거나, 직접 말해주세요</p>
      <div class="sugg-list" id="opts"></div>
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="compose-dock bottom">${backBtn(n)}${micBtn()}<button class="round-ghost" id="skipStep" type="button">건너뛰기</button></div>`,
      { bubble: ask(x) });
    bindBack(n);
    on('skipStep', () => (backTo ? (backTo = false, summary()) : n + 1 < steps.length ? runStep(n + 1) : summary()));
    carousel($('opts'), x.options, {
      action: '이 문장 만들기',
      soft: true,
      onListen: (o) => speak(o.en, { rate: S.rate }),
      onPick: (o) => tilesBuild(n, o),
    });
    bindVoice(n);
  }
  // 낱말 단계 ②: 조각(최대 4개)을 순서대로 눌러 만들기
  function chunks(sentence) {
    const w = String(sentence).trim().split(/\s+/);
    const k2 = Math.min(4, w.length);
    const out = [];
    for (let i = 0; i < k2; i++) out.push(w.slice(Math.round((i * w.length) / k2), Math.round(((i + 1) * w.length) / k2)).join(' '));
    return out.filter(Boolean);
  }
  function tilesBuild(n, target) {
    const pieces = chunks(target.en);
    let order = shuffle(pieces.map((_, i) => i));
    if (order.length > 1 && order.every((v, i) => v === i)) order = order.slice(1).concat(order[0]);
    frame(n, `<p class="target-ko">"${esc(target.ko || '')}"</p>
      <div id="tiles" class="tiles big-tiles"></div>
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="nav bottom">
        <button class="prev" id="backPick" type="button">다른 문장</button>
        <button class="next" id="doneTiles" type="button" disabled>다음</button>
      </div>`, { bubble: '<b>조각을 차례대로 눌러</b> 문장을 만들어요.<br><small>잘못 누른 조각은 위에서 다시 누르면 빠져요.</small>' });
    const tb = tileBuilder($('tiles'), order.map((i) => pieces[i]), (txt) => {
      const right = sameSentence(txt, target.en);
      if ($('doneTiles')) $('doneTiles').disabled = !right;
      if (!$('hint')) return;
      if (right) {
        $('hint').innerHTML = '<span class="cheer">🎉 잘 만들었어요!</span>';
        celebrate($('hint'));
        say(target.en, S);
        spotlight($('doneTiles'), $('hint'), $('tiles'));
      } else if (txt && txt.split(' ').length >= target.en.split(' ').length) {
        $('hint').textContent = '순서가 조금 달라요. 위의 조각을 누르면 빠져요.';
      } else { $('hint').textContent = ''; clearSpotlight(); }
    });
    on('backPick', () => { clearSpotlight(); tilesPick(n); });
    on('doneTiles', () => done(n, { en: target.en, ko: target.ko || '' }));
    void tb;
  }

  // 말하기 단계: 예시 카드 안에 '예시 쓰기', 아래에 이전 단계 · 마이크 · 건너뛰기
  function speakStep(n) {
    const x = steps[n];
    frame(n, `<p class="pick-tip">아래 예시를 고르거나, 직접 말해주세요 · 한국어로 말해도 돼요</p>
      <div class="sugg-list" id="opts"></div>
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="compose-dock bottom">${backBtn(n)}${micBtn()}<button class="round-ghost" id="skipStep" type="button">건너뛰기</button></div>`,
      { bubble: ask(x) });
    bindBack(n);
    on('skipStep', () => (backTo ? (backTo = false, summary()) : n + 1 < steps.length ? runStep(n + 1) : summary()));
    carousel($('opts'), x.options, {
      action: '예시 쓰기',
      soft: true,
      onListen: (o) => speak(o.en, { rate: S.rate }),
      onPick: (o) => done(n, { en: o.en, ko: o.ko || '' }),
    });
    bindVoice(n);
  }
  function compare(n, x) {
    const korean = hasHangul(x.said);
    const d = korean ? { mine: esc(x.said), fixed: esc(x.en), changed: true } : wordDiff(x.said, x.en);
    frame(n, `<div class="compare">
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
    on('again', () => runStep(n));
    on('use', () => done(n, { en: x.en, ko: x.ko }));
  }

  // 보내기 전에: 단계마다 나눠 보여 주고 ＋(더 붙이기) · 수정 · 삭제
  function body() { return parts.flatMap((p0) => p0.items.map((i) => i.en.trim())).filter(Boolean).join(' '); }
  function summary() {
    clearSpotlight();
    mount(`<section class="screen fit letter-summary">
      ${header(S, 0.9)}
      <h2>이렇게 보낼게요 <button class="letter-link inline" id="seeLetter" type="button">편지 보기 ▾</button></h2>
      <div class="sum-list">${steps.map((x, i) => `<div class="sum-part">
        <div class="sum-head"><span class="label">${i + 1}. ${x.mode === 'tiles' ? '낱말로 만든 문장' : '말로 한 문장'}</span>
          <span class="sum-btns">
            <button class="ghost sum-add" type="button" data-i="${i}" aria-label="${i + 1}번에 더 붙이기">＋</button>
            <button class="ghost sum-edit" type="button" data-i="${i}">수정</button>
            <button class="ghost sum-del" type="button" data-i="${i}" ${parts[i].items.length ? '' : 'disabled'}>삭제</button>
          </span></div>
        <div class="sum-text" id="sum${i}">${parts[i].items.length ? `<p lang="en">${esc(parts[i].items.map((t) => t.en).join(' '))}</p>` : '<p class="muted">비어 있어요 · ＋를 눌러 채울 수 있어요</p>'}</div>
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
    document.querySelectorAll('.sum-add').forEach((b) => b.addEventListener('click', () => { backTo = true; runStep(Number(b.dataset.i)); }));
    document.querySelectorAll('.sum-del').forEach((b) => b.addEventListener('click', () => { parts[Number(b.dataset.i)].items = []; summary(); }));
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
        save(S, { kind: 'letter', prompt_en: L.body, answer_en: text, answer_ko: parts.flatMap((p0) => p0.items.map((i) => i.ko)).filter(Boolean).join(' ') });
        mount(`<section class="screen center">
          <div class="big-emoji" aria-hidden="true">✉️</div>
          <h1>답장을 보냈어요!</h1>
          <p class="lead">${esc(fromName)}님이 기뻐할 거예요.</p>
          <button class="big primary" id="go" type="button">오늘 공부 마치기</button>
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

const QA_TURNS = 6; // 묻고 답하기에서 주고받는 횟수 (3분 대화를 합친 길이)
function qaStep(S) {
  // 하나의 이어지는 대화예요: 대답하면 클라우디아가 반응하고 바로 이어서 물어요.
  // qs[k] = { pre: 앞 대답에 대한 반응, q: 질문, ko, choices, used: 여기까지 쓴 준비된 질문 수 }
  const pack = S.c.questions;
  const total = S.level >= 5 ? QA_TURNS + 1 : QA_TURNS;
  const fromPack = (i, pre = '', preKo = '') => ({ pre, preKo, q: pack[i].en, ko: pack[i].ko, choices: pack[i].choices, used: i + 1 });
  let k = startAt(S, total);
  const qs = [];
  for (let i = 0; i <= k; i++) qs.push(fromPack(Math.min(i, pack.length - 1)));
  const answers = [];
  const got = {}; // 문제마다 받은 점수 (다시 대답하면 바꿔 셉니다)
  const full = (q) => (q.pre ? `${q.pre} ${q.q}` : q.q);
  const fullKo = (q) => (q.preKo ? `${q.preKo} ${q.ko}` : q.ko);
  // 사용자가 클라우디아에게 물어보는 차례: 말하기에 익숙해진 뒤쪽에 넣고, 단계가 오를수록 주고받기가 늘어요
  //   1·2단계  대답 4번 → 질문 → 대답            3·4단계  대답 2번 → 질문 → 대답 → 질문 → 대답
  //   5단계~   대답 → 질문 → 대답 → 질문 → 대답 → 질문 → 대답 (한 번 더 길게)
  const askAt = new Set(S.level >= 5 ? [1, 3, 5] : S.level >= 3 ? [2, 4] : [4]);
  let canAsk = true;   // 서버가 질문 차례를 지원하지 않으면 예전처럼 대답만 해요

  // 클라우디아가 말한 뒤: 마이크만 밝게
  function yourTurn() {
    if (!$('area') || $('feedback')) return;
    if (canListen) {
      $('hint').innerHTML = qs[k] && qs[k].ask ? '<b>이번엔 물어볼 차례예요.</b><br>마이크를 누르거나 예시 질문을 골라 주세요.' : '이제 말씀하실 차례예요.<br>마이크를 누르거나 예시를 골라 주세요.';
      spotlight($('mic'), $('hint'), $('again'), $('qaChoices'), $('pickTip'));
    } else {
      $('hint').textContent = '아래에서 대답을 고르거나 영어로 적어 주세요.';
      spotlight($('area'), $('again'));
    }
  }

  function ask() {
    const q = qs[k];
    if (k >= total || !q) return nextStep(S);
    mark(S, k);
    mount(`<section class="screen fit qa">
      ${header(S, k / total)}
      <div class="emma-row">
        ${avatar()}
        <div class="bubble" id="bubble">
          <p class="en" lang="en">${q.pre ? `<span class="pre">${esc(q.pre)}</span> ` : ''}${esc(q.q)}</p>
          <p class="ko">${esc(fullKo(q))}</p>
        </div>
      </div>
      <button class="ghost again" id="again" type="button">${ICON.sound} 다시 듣기</button>
      <div id="area">
        <p class="pick-tip" id="pickTip">${canListen ? (q.ask ? '아래 예시를 고르거나, 직접 물어보세요' : '아래 예시를 고르거나, 직접 말해주세요') : '아래 예시를 골라 주세요'}</p>
        <div class="sugg-list" id="qaChoices"></div>
        <p class="hint say-tip" id="hint" aria-live="polite">클라우디아가 ${q.pre || q.ask ? '말하고' : '묻고'} 있어요…</p>
        ${canListen ? `<button class="mic" id="mic" type="button">${ICON.mic} ${q.ask ? '눌러서 물어보기' : '눌러서 대답하기'}</button>` : ''}
        ${canListen ? '' : `<form id="typed" class="typed"><input id="typedIn" type="text" autocomplete="off" placeholder="영어로 적어도 돼요" aria-label="영어로 적기"><button class="primary" type="submit">보내기</button></form>`}
      </div>
    </section>`);
    bindQuit();
    const play = async () => { clearSpotlight(); if (await emma(full(q), S)) yourTurn(); };
    on('again', play);
    // 클라우디아 말풍선을 누르면 흐린 화면이 풀려요
    on('bubble', () => { if (!$('feedback')) clearSpotlight(); });
    setTimeout(() => { if ($('again')) play(); }, 350);
    carousel($('qaChoices'), q.choices, {
      action: q.ask ? '이 질문 하기' : '이 대답 고르기',
      soft: true,
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

  // 클라우디아의 반응 + 다음 질문을 한 덩어리로 만들어요
  function nextItem(q, r) {
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    let pre = str(r && r.reply_en) || 'Thank you!';
    let preKo = str(r && r.reply_ko) || (r && r.reply_en ? '' : '고마워요!');
    const task = r && r.ask_task;
    if (task && str(task.en) && Array.isArray(task.choices)) {
      const qsn = task.choices.filter((c) => c && str(c.en)).slice(0, 3).map((c) => ({ en: str(c.en), ko: str(c.ko) }));
      if (qsn.length) return { pre, preKo, q: str(task.en), ko: str(task.ko), choices: qsn, used: q.used, ask: true };
    }
    const fu = r && r.follow_up;
    const choices = fu && Array.isArray(fu.choices)
      ? fu.choices.filter((c) => c && str(c.en)).slice(0, 3).map((c) => ({ en: str(c.en), ko: str(c.ko) })) : [];
    if (fu && str(fu.en) && choices.length) {
      const fq = str(fu.en);
      if (pre.includes(fq)) { pre = pre.replace(fq, '').trim(); preKo = preKo.replace(str(fu.ko), '').trim(); }
      return { pre, preKo, q: fq, ko: str(fu.ko), choices, used: q.used };
    }
    if (q.used >= pack.length) return null;                       // 이어 갈 질문이 없으면 여기서 마쳐요
    // 반응에 질문이 섞여 있으면 빼고, 준비된 다음 질문으로 넘어가요
    if (pre.includes('?')) { pre = pre.split(/(?<=[.!?])\s+/).filter((x) => !x.includes('?')).join(' ') || 'I see!'; preKo = ''; }
    return fromPack(q.used, pre, preKo);
  }

  async function answered(q, text, how, ko = '') {
    clearSpotlight();
    const at = k;
    const last = at === total - 1;
    if (got[at] != null) { S.score.qa[0] -= got[at]; S.score.qa[1] -= 1; delete got[at]; }
    const before = S.score.qa[0];
    answers[at] = text;
    $('area').innerHTML = `<div class="feedback"><p class="label">${q.ask ? '내가 한 질문' : '내가 한 말'}</p><p class="en" lang="en">${esc(text)}</p><p class="muted">클라우디아가 듣고 있어요…</p></div>`;
    const req = {
      question: q.q, answer: text, level: S.level, topic: S.topic, last, turn: at + 1, total,
      mode: q.ask ? 'ask' : 'answer', next_ask: canAsk && askAt.has(at + 1),
      history: qs.slice(0, at).map((x, i) => ({ q: x.q, a: answers[i] || '' })),
      ideas: pack.slice(q.used, q.used + 3).map((x) => x.en),
    };
    let r;
    let nextP; // 다음에 클라우디아가 할 말 (반응 + 이어지는 질문)
    if (how === 'choice') {
      // 고른 대답은 바로 보여 주고, 이어지는 질문은 뒤에서 받아 와요
      r = { better_en: '', tip_ko: '', answer_ko: ko };
      S.score.qa[0] += 1;
      nextP = api.ai('check', { ...req, tapped: true }).catch(() => null);
    } else {
      try {
        r = await api.ai('check', req);
        if (!r.can_ask) canAsk = false;
        if (!q.ask) {   // 내가 한 질문은 자서전 자료로 남기지 않아요
          api.addNotes(r.facts, S.topic).catch(() => {});
          save(S, { kind: 'qa', prompt_en: q.q, answer_en: text, better_en: r.better_en, answer_ko: r.answer_ko });
        }
        S.score.qa[0] += r.good ? 1 : 0.5;
      } catch (e) {
        r = { better_en: '', tip_ko: '' };
        S.score.qa[0] += 0.5;
        if (!q.ask) save(S, { kind: 'qa', prompt_en: q.q, answer_en: text });
      }
      nextP = Promise.resolve(r);
    }
    S.score.qa[1] += 1;
    got[at] = S.score.qa[0] - before;
    // 다음 말을 미리 만들어 두고 목소리도 준비해요
    const cheer = CHEERS[Math.floor(Math.random() * CHEERS.length)];
    const itemP = nextP.then((rr) => {
      const src = rr && rr.reply_en ? rr : { ...(rr || {}), reply_en: how === 'choice' ? cheer[0] : '', reply_ko: how === 'choice' ? cheer[1] : '' };
      if (last) return { bye: true, en: src.reply_en || 'It was so nice talking with you. See you tomorrow!', ko: src.reply_en ? (src.reply_ko || '') : '이야기해서 정말 좋았어요. 내일 또 만나요!' };
      return nextItem(q, src);
    });
    itemP.then((it) => { if (it) prefetch(it.bye ? it.en : full(it)); });
    if (!$('area') || k !== at) return;
    const showBetter = r.better_en && !sameSentence(r.better_en, text);
    $('area').innerHTML = `<div class="feedback" id="feedback">
        <p class="label">${q.ask ? '내가 한 질문' : '내가 한 말'}</p>
        <p class="en" lang="en">${esc(text)}</p>
        ${r.answer_ko ? `<p class="ko">${esc(r.answer_ko)}</p>` : ''}
        ${showBetter ? `<div class="better">
            <p class="label">${q.ask ? '이렇게 물어보면 더 좋아요' : '이렇게 말하면 더 좋아요'}</p>
            <p class="en" lang="en">${esc(r.better_en)}</p>
            ${r.better_ko ? `<p class="ko">${esc(r.better_ko)}</p>` : ''}
            <button class="ghost" id="hearBetter" type="button">${ICON.sound} 들어 보기</button>
          </div>` : `<p class="praise">👍 ${q.ask ? '잘 물어봤어요!' : '잘 말했어요!'}</p>`}
        ${r.tip_ko ? `<p class="tip">💡 ${esc(r.tip_ko)}</p>` : ''}
      </div>
      <div class="answer-nav" id="answerNav">
        <button class="plain prev-btn" id="prevQ" type="button" ${at === 0 ? 'disabled' : ''}>이전</button>
        <button class="plain retry-btn" id="retryQ" type="button">${ICON.mic} ${q.ask ? '다시 물어보기' : '다시 대답하기'}</button>
        <button class="primary next-btn" id="nextQ" type="button">다음</button>
      </div>`;
    if ($('again')) $('again').hidden = true;
    on('hearBetter', () => emma(r.better_en, S));
    // 클라우디아의 대답은 '다음'을 눌렀을 때 이어지는 질문과 함께 들려요
    on('nextQ', async () => {
      $('nextQ').disabled = true;
      $('nextQ').textContent = '잠시만요…';
      const it = await itemP.catch(() => null);
      if (k !== at || !$('nextQ')) return;
      if (!it) return nextStep(S);
      if (it.bye) return goodbye(it);
      qs.length = at + 1;
      qs.push(it);
      k = at + 1;
      ask();
    });
    on('retryQ', () => ask());           // 같은 질문에 다시 대답
    on('prevQ', () => { if (k > 0) { k--; ask(); } });
    spotlight($('feedback'), $('answerNav'));
    if (showBetter) prefetch(r.better_en);
  }

  // 마지막 대답 뒤: 클라우디아의 마무리 인사
  function goodbye(it) {
    clearSpotlight();
    mount(`<section class="screen fit qa">
      ${header(S, 1)}
      <div class="emma-row">
        ${avatar()}
        <div class="bubble" id="bubble"><p class="en" lang="en">${esc(it.en)}</p><p class="ko">${esc(it.ko)}</p></div>
      </div>
      <button class="ghost again" id="again" type="button">${ICON.sound} 다시 듣기</button>
      <button class="big primary" id="doneQa" type="button" style="margin-top:auto">마치기</button>
    </section>`);
    bindQuit();
    on('again', () => emma(it.en, S));
    on('doneQa', () => nextStep(S));
    setTimeout(() => { if ($('doneQa')) emma(it.en, S); }, 350);
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

    <div class="stage talk-q" id="stage">
      <div class="emma-row">
        ${avatar()}
        <div class="bubble-col">
          <div class="bubble talk-bubble" id="sayBubble" aria-live="polite"></div>
          <div class="bubble-tools" id="bubbleTools" hidden>
            <button class="nav-arrow" id="prevSlide" type="button" aria-label="이전 말">‹</button>
            <div class="slide-dots" id="dots"></div>
            <button class="nav-arrow" id="nextSlide" type="button" aria-label="다음 말">›</button>
          </div>
        </div>
      </div>
      <button class="ghost again" id="again" type="button">${ICON.sound} 다시 듣기</button>
    </div>

    <div id="lower">
      <div class="sugg-list" id="sugg"></div>
    </div>

    <div class="dock">
      <p class="hint say-tip" id="hint"></p>
      <div class="talk-bottom" id="controls">
        ${canListen ? `<button class="mic" id="mic" type="button">${ICON.mic} 눌러서 대답하기</button>` : ''}
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
    $('bubbleTools').hidden = L.length < 2;
    $('prevSlide').disabled = slide === 0;
    $('nextSlide').disabled = slide === L.length - 1;
  }
  function showLatest() { slide = lines().length - 1; renderBubble(); }

  // 대답 예시 카드
  function renderSugg() {
    if (!$('sugg')) return;
    carousel($('sugg'), sugg.slice(0, 3), {
      action: '이 문장으로 대답하기',
      soft: true,
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
      if ($('hint')) $('hint').innerHTML = '이제 말씀하실 차례예요.<br>마이크를 누르거나 예시를 골라 주세요.';
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
    $('lower').innerHTML = `<div class="sugg-list" id="sugg"></div>`;
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
    if (c) c.insertAdjacentHTML('afterend', `<button class="plain mid wide" id="skip" type="button">${timeUp ? '대답하지 않고 마치기' : '대화 건너뛰고 마치기'}</button>`);
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
      // 바로 끊지 않고, 지금 질문에 대답하고 '다음'을 누르면 마무리해요.
      timeUp = true;
      if ($('timer')) { $('timer').textContent = '시간 끝 · 이번 대답까지 하고 마쳐요'; $('timer').classList.add('time-up'); }
      showSkip();
    }
  }, 1000);
}

// 마치기 ------------------------------------------------------------------------------
async function finishDay(S) {
  clearProgress();
  const ratio = ([a, b]) => (b ? a / b : null);
  const words = ratio(S.score.words);
  const qa = ratio(S.score.qa);
  const parts = [words, qa].filter((x) => x !== null);
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
      prepareDay(S.day + 1);   // 내일 공부를 미리 만들어 둬요
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
      <li>💬 클라우디아와 ${S.score.qa[1]}번 묻고 답함</li>
    </ul>
    ${levelMsg ? `<p class="lead">${esc(levelMsg)}</p>` : ''}
    <button class="big primary" id="home" type="button">처음으로</button>
  </section>`);
  on('home', () => go('home'));
}
