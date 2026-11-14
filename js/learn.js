// 하루 패키지: 편지 → 문장 카드 → 낱말 10개 → 묻고 답하기 → 3분 대화
import { state, register, go, mount, on, $, esc, topBar, shuffle, today, loading, errorScreen, avatar, tileBuilder, toTiles, ICON, spotlight, clearSpotlight, hear, celebrate, carousel } from './ui.js';
import { speak, prefetch, setVoiceLevel, cancelListening, canListen, bestSimilarity, sameSentence } from './speech.js';
import { TOPICS, topicForDay, cycleForDay, SPEECH_RATE } from './content.js';
import { TALK_SECONDS } from './config.js';
import * as api from './api.js';

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

async function startDay({ day, review = false }) {
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
      () => startDay({ day, review }));
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
  let fromName = '가족';
  try {
    const members = await api.myContacts();
    fromName = (members.find((m) => m.id === L.from_id) || {}).name || '가족';
  } catch (e) { /* 무시 */ }
  loading(`${fromName}님의 편지를 읽기 쉽게 준비하고 있어요…`);
  let info = null;
  try { info = await api.ai('letter', { text: L.body, level: S.level, from_name: fromName }); } catch (e) { /* 원문만 보여주기 */ }

  function read() {
    mount(`<section class="screen scroll">
      ${header(S, 0)}
      <h2>✉️ ${esc(fromName)}님이 편지를 보냈어요</h2>
      <div class="card letter">
        <p class="en letter-text" lang="en">${esc(L.body)}</p>
        ${info && info.ko ? `<p class="ko">${esc(info.ko)}</p>` : ''}
      </div>
      <div class="listen-row">
        <button class="listen" id="play" type="button">${ICON.sound} 듣기</button>
        <button class="slow" id="slow" type="button">천천히<br>듣기</button>
      </div>
      ${info && Array.isArray(info.words) && info.words.length ? `<div class="panel">
        <h3>편지 속 낱말 <span class="muted">(누르면 소리가 나요)</span></h3>
        <div class="chips">${info.words.slice(0, 6).map((w, j) => `<button class="chip" type="button" data-j="${j}"><span lang="en">${esc(w.en)}</span><small>${esc(w.ko)}</small></button>`).join('')}</div>
      </div>` : ''}
      <div class="nav">
        <button class="prev" id="later" type="button">다음에 답장</button>
        <button class="next" id="write" type="button">답장 쓰기</button>
      </div>
    </section>`);
    bindQuit();
    on('play', () => say(L.body, S));
    on('slow', () => say(L.body, S, 'play', true));
    document.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => speak(info.words[Number(b.dataset.j)].en, { rate: S.rate })));
    on('later', async () => { try { await api.markLetter(L.id); } catch (e) { /* 무시 */ } nextStep(S); });
    on('write', () => compose(''));
  }

  function compose(prefill) {
    const reply = info && info.reply && info.reply.en ? info.reply : null;
    mount(`<section class="screen scroll">
      ${header(S, 0.4)}
      <h2>답장을 만들어 봐요</h2>
      ${reply
        ? `<p class="lead">이런 뜻으로 써 볼까요?<br><b>${esc(reply.ko)}</b></p><div id="tiles" class="tiles"></div>`
        : '<p class="lead">하고 싶은 말을 말하거나 적어 주세요.</p>'}
      <div class="row">
        ${reply ? '<button class="plain mid" id="clear" type="button">다시 하기</button>' : ''}
        ${canListen ? `<button class="plain mid" id="mic" type="button">${ICON.mic} 말로 하기</button>` : ''}
      </div>
      <label class="lbl" for="draft">내 답장 <span class="muted">(직접 고쳐도 돼요)</span></label>
      <textarea id="draft" rows="3" lang="en" autocapitalize="sentences">${esc(prefill)}</textarea>
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="nav">
        <button class="prev" id="back" type="button">편지 다시 보기</button>
        <button class="next" id="check" type="button">클라우디아에게 보여주기</button>
      </div>
    </section>`);
    bindQuit();
    if (reply) {
      let first = true;
      const extra = (Array.isArray(info.extra) ? info.extra : []).filter((w) => typeof w === 'string').slice(0, 4);
      const tb = tileBuilder($('tiles'), shuffle([...toTiles(reply.en), ...extra]), (txt) => {
        if (first) { first = false; return; }
        $('draft').value = txt;
      });
      on('clear', () => { tb.clear(); $('draft').value = ''; });
    }
    on('mic', async () => {
      const hint = $('hint'), d = $('draft');
      const alts = await hear($('mic'), hint, { listening: '듣고 있어요… 다 말씀하시면 정지를 누르세요', silenceMs: 2500 });
      if (!alts || !d.isConnected) return;
      d.value = (d.value ? d.value.trim() + ' ' : '') + (alts[0] || '');
      hint.textContent = '적었어요. 틀린 곳은 고쳐도 돼요.';
    });
    on('back', read);
    on('check', () => {
      const draft = $('draft').value.trim();
      if (!draft) { $('hint').textContent = '답장을 먼저 만들어 주세요.'; return; }
      polish(draft);
    });
  }

  async function polish(draft) {
    loading('클라우디아가 답장을 봐 주고 있어요…');
    let r;
    try {
      r = await api.ai('polish', { letter: L.body, draft, level: S.level });
      if (!r.fixed_en) throw new Error('empty');
    } catch (e) {
      r = { fixed_en: draft, fixed_ko: '', changed: false, tips_ko: [api.aiMessage(e)], better_words: [] };
    }
    const tips = Array.isArray(r.tips_ko) ? r.tips_ko.filter(Boolean).slice(0, 3) : [];
    const better = Array.isArray(r.better_words) ? r.better_words.filter((w) => w && w.en).slice(0, 3) : [];
    mount(`<section class="screen scroll">
      ${header(S, 0.8)}
      <h2>이렇게 보내면 좋아요</h2>
      <div class="card">
        <p class="en" lang="en">${esc(r.fixed_en)}</p>
        ${r.fixed_ko ? `<p class="ko">${esc(r.fixed_ko)}</p>` : ''}
      </div>
      <button class="listen" id="play" type="button">${ICON.sound} 듣기</button>
      ${!sameSentence(r.fixed_en, draft) ? `<p class="muted">내가 쓴 문장: <span lang="en">${esc(draft)}</span></p>` : ''}
      ${tips.length ? `<div class="panel"><h3>클라우디아의 한마디</h3><ul class="tips">${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
      ${better.length ? `<div class="panel"><h3>이런 말도 써 보세요</h3><div class="chips">${better.map((w, j) => `<button class="chip" type="button" data-j="${j}"><span lang="en">${esc(w.en)}</span><small>${esc(w.ko || '')}</small></button>`).join('')}</div></div>` : ''}
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="nav">
        <button class="prev" id="edit" type="button">다시 고치기</button>
        <button class="next" id="send" type="button">이대로 보내기</button>
      </div>
    </section>`);
    bindQuit();
    on('play', () => say(r.fixed_en, S));
    document.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => speak(better[Number(b.dataset.j)].en, { rate: S.rate })));
    on('edit', () => compose(r.fixed_en));
    on('send', async () => {
      $('send').disabled = true;
      try {
        await api.sendLetter({ to_id: L.from_id, body: r.fixed_en, reply_to: L.id });
        await api.markLetter(L.id);
        S.score.letter = true;
        save(S, { kind: 'letter', prompt_en: L.body, answer_en: draft, better_en: r.fixed_en, answer_ko: r.fixed_ko });
        mount(`<section class="screen center">
          <div class="big-emoji" aria-hidden="true">✉️</div>
          <h1>답장을 보냈어요!</h1>
          <p class="lead">${esc(fromName)}님이 기뻐할 거예요.</p>
          <button class="big primary" id="go" type="button">오늘 공부 계속하기</button>
        </section>`);
        on('go', () => nextStep(S));
      } catch (e) {
        $('send').disabled = false;
        $('hint').textContent = '보내지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.';
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
  const qs = shuffle(words).slice(0, Math.min(5, words.length));
  const nOpt = S.level >= 3 ? 3 : 2;
  const total = words.length + qs.length;
  let k = startAt(S, words.length);

  function learn() {
    const w = words[k];
    mark(S, k);
    mount(`<section class="screen fit">
      ${header(S, k / total)}
      <div class="card word">
        <p class="count">${k + 1} <span>/ ${words.length}</span></p>
        ${w.emoji ? `<div class="big-emoji" aria-hidden="true">${esc(w.emoji)}</div>` : ''}
        <p class="en" lang="en">${esc(w.en)}</p>
        <p class="ko">${esc(w.ko)}</p>
        ${w.say ? `<p class="say">${esc(w.say)}</p>` : ''}
      </div>
      <button class="listen" id="play" type="button">${ICON.sound} 듣기</button>
      ${canListen ? `<button class="mic" id="mic" type="button">${ICON.mic} 따라 말하기</button>` : ''}
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="nav">
        <button class="prev" id="prev" type="button" ${k === 0 ? 'disabled' : ''}>이전</button>
        <button class="next" id="next" type="button">${k === words.length - 1 ? '문제 풀기' : '다음'}</button>
      </div>
    </section>`);
    bindQuit();
    on('play', () => say(w.en, S));
    on('mic', () => repeatAfter(w.en));
    on('prev', () => { if (k > 0) { k--; learn(); } });
    on('next', () => { if (k < words.length - 1) { k++; learn(); } else quiz(0); });
    setTimeout(() => { if ($('play')) say(w.en, S); }, 300);
  }

  // 문제마다 보기와 고른 답을 기억해서 이전/다음으로 오가도 그대로 보여요.
  const quizState = qs.map(() => null);
  function quiz(qi) {
    if (qi >= qs.length) return nextStep(S);
    const q = qs[qi];
    if (!quizState[qi]) {
      const others = shuffle(words.filter((w) => w.en !== q.en)).slice(0, nOpt - 1);
      quizState[qi] = { opts: shuffle([q, ...others]), picked: null };
    }
    const st = quizState[qi];
    const opts = st.opts;
    mount(`<section class="screen fit">
      ${header(S, (words.length + qi) / total)}
      <p class="lead">잘 듣고 맞는 뜻을 고르세요. <span class="muted">(${qi + 1}/${qs.length})</span></p>
      <button class="listen" id="play" type="button">${ICON.sound} 다시 듣기</button>
      <div class="choices">${opts.map((o, j) => `<button class="choice" type="button" data-j="${j}"><span class="emoji" aria-hidden="true">${esc(o.emoji || '')}</span>${esc(o.ko)}</button>`).join('')}</div>
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="nav">
        <button class="prev" id="qprev" type="button">이전</button>
        <button class="next" id="qnext" type="button" ${st.picked == null ? 'disabled' : ''}>${qi === qs.length - 1 ? '다 했어요' : '다음'}</button>
      </div>
    </section>`);
    bindQuit();
    const buttons = document.querySelectorAll('.choice');
    function showResult(celebrateNow) {
      const pick = opts[st.picked];
      const right = pick.en === q.en;
      buttons.forEach((x) => {
        x.disabled = true;
        const o = opts[Number(x.dataset.j)];
        if (o.en === q.en) x.classList.add('right');
        else if (Number(x.dataset.j) === st.picked) x.classList.add('wrong');
      });
      $('hint').textContent = right ? `맞았어요! 👏  ${q.en} = ${q.ko}` : `정답은 "${q.ko}"이에요.`;
      $('qnext').disabled = false;
      if (right && celebrateNow) celebrate($('hint'));
      spotlight($('qnext'), $('hint'), document.querySelector('.choices'));
    }
    on('play', () => say(q.en, S));
    on('qprev', () => { if (qi > 0) quiz(qi - 1); else { k = words.length - 1; learn(); } });
    on('qnext', () => { if (st.picked != null) quiz(qi + 1); });
    buttons.forEach((b) => b.addEventListener('click', () => {
      if (st.picked != null) return;
      st.picked = Number(b.dataset.j);
      S.score.words[1]++;
      if (opts[st.picked].en === q.en) S.score.words[0]++;
      showResult(true);
    }));
    if (st.picked != null) showResult(false);
    else setTimeout(() => { if ($('play')) say(q.en, S); }, 300);
  }

  learn();
}

// 4. 묻고 답하기 ----------------------------------------------------------------------
const CHEERS = [
  ['Great!', '좋아요!'], ['Good answer!', '좋은 대답이에요!'], ['Wonderful!', '훌륭해요!'], ['Thank you for telling me!', '말해 줘서 고마워요!'],
];

function qaStep(S) {
  const qs = S.c.questions;
  let k = startAt(S, qs.length);

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
      <button class="big primary bottom" id="nextQ" type="button">다음</button>`;
    if ($('again')) $('again').hidden = true;
    on('hearBetter', () => emma(r.better_en, S));
    on('nextQ', () => { k++; ask(); });
    spotlight($('feedback'), $('nextQ'));
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
      <button class="big primary bottom" id="nextTurn" type="button">다음</button>`;
    on('hearFix', () => emma(r.fix_en, S));
    on('nextTurn', () => {
      waitingNext = false;
      dock(true);
      document.querySelector('.talk2')?.classList.remove('fb');
      if (nextSugg.length) sugg = nextSugg.slice(0, 3);
      restoreLower();
      if (reply) reply.hidden = false;
      if (timeUp) return end();
      if (reply) klaudiaSays(reply.en); else yourTurn();
    });
    spotlight($('feedback'), $('nextTurn'));
    if (better) prefetch(r.fix_en);
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
