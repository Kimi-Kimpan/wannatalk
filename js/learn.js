// 하루 패키지: 편지 → 문장 카드 → 낱말 10개 → 묻고 답하기 → 3분 대화
import { state, register, go, mount, on, $, esc, topBar, shuffle, today, loading, errorScreen, avatar, tileBuilder, toTiles, ICON } from './ui.js';
import { speak, prefetch, setVoiceLevel, listen, canListen, bestSimilarity, sameSentence, LISTEN_ERRORS } from './speech.js';
import { TOPICS, topicForDay, cycleForDay, SPEECH_RATE } from './content.js';
import { TALK_SECONDS } from './config.js';
import * as api from './api.js';

const STEP_NAMES = { letter: '편지', cards: '문장 카드', words: '낱말 10개', qa: '묻고 답하기', talk: '3분 대화' };

register('day', (opts) => startDay(opts || {}));

// 진행 상황 기억 (중간에 나가도 이어서 하기) --------------------------------------------
function saveProgress(S) {
  if (S.review) return;
  try { localStorage.setItem('wt-progress', JSON.stringify({ day: S.day, i: S.i, step: S.steps[S.i], score: S.score })); } catch (e) { /* 무시 */ }
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
  c.talk = { scene_ko: str(c.talk.scene_ko), opener_en: str(c.talk.opener_en), opener_ko: str(c.talk.opener_ko) };
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
  loading('Emma 선생님이 오늘 공부를 준비하고 있어요…');
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
      if (idx > 0) { S.i = idx; if (saved.score) S.score = saved.score; }
    }
  }
  runStep(S);
}

function runStep(S) {
  if (S.i >= S.steps.length) return finishDay(S);
  saveProgress(S);
  const fn = { letter: letterStep, cards: cardsStep, words: wordsStep, qa: qaStep, talk: talkStep }[S.steps[S.i]];
  fn(S);
}
function nextStep(S) { S.i++; runStep(S); }
function header(S, part = 0) {
  return topBar(`${S.i + 1}/${S.steps.length} · ${STEP_NAMES[S.steps[S.i]]}`, (S.i + part) / S.steps.length);
}
function bindQuit() { on('quit', () => go('home')); }
function say(text, S, btnId = 'play', slow = false) {
  return speak(text, { rate: slow ? 0.55 : S.rate, button: $(btnId), natural: true });
}
// Emma 목소리로 말하기
function emma(text, S) {
  return speak(text, { rate: S.rate, natural: true });
}
function save(S, row) {
  api.addEntry({ day: S.day, topic: S.topic, ...row }).catch(() => {});
}

// 따라 말하기 공통
async function repeatAfter(target) {
  const mic = $('mic'), hint = $('hint');
  if (!mic || !hint) return;
  mic.classList.add('recording');
  hint.textContent = '듣고 있어요… 말씀하세요';
  try {
    const alts = await listen();
    const s = bestSimilarity(target, alts);
    if (!$('hint')) return;
    hint.textContent = s >= 0.8 ? '아주 잘하셨어요! 👏'
      : s >= 0.5 ? `좋아요! 들린 말: "${alts[0]}"`
      : `한 번 더 해 볼까요? 들린 말: "${alts[0] || ''}"`;
  } catch (err) {
    if ($('hint')) hint.textContent = LISTEN_ERRORS[err] || '다시 눌러 주세요.';
  } finally {
    if ($('mic')) mic.classList.remove('recording');
  }
}

// 1. 편지 ----------------------------------------------------------------------------
async function letterStep(S) {
  const L = S.letter;
  let fromName = '가족';
  try {
    const members = await api.familyMembers(state.profile.family);
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
        <button class="next" id="check" type="button">선생님께 보여주기</button>
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
      const mic = $('mic');
      mic.classList.add('recording');
      $('hint').textContent = '듣고 있어요… 영어로 말씀하세요';
      try {
        const alts = await listen();
        const d = $('draft');
        d.value = (d.value ? d.value.trim() + ' ' : '') + (alts[0] || '');
        $('hint').textContent = '적었어요. 틀린 곳은 고쳐도 돼요.';
      } catch (err) {
        if ($('hint')) $('hint').textContent = LISTEN_ERRORS[err] || '다시 눌러 주세요.';
      } finally {
        if ($('mic')) mic.classList.remove('recording');
      }
    });
    on('back', read);
    on('check', () => {
      const draft = $('draft').value.trim();
      if (!draft) { $('hint').textContent = '답장을 먼저 만들어 주세요.'; return; }
      polish(draft);
    });
  }

  async function polish(draft) {
    loading('Emma 선생님이 답장을 봐 주고 있어요…');
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
      ${tips.length ? `<div class="panel"><h3>선생님 한마디</h3><ul class="tips">${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
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
        await api.sendLetter({ family: state.profile.family, to_id: L.from_id, body: r.fixed_en, reply_to: L.id });
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
  let k = 0;
  function render() {
    const it = cards[k];
    mount(`<section class="screen">
      ${header(S, k / cards.length)}
      <div class="card">
        <p class="count">${k + 1} <span>/ ${cards.length}</span></p>
        <p class="ko">${esc(it.ko)}</p>
        <p class="en" lang="en">${esc(it.en)}</p>
        ${it.say ? `<p class="say">${esc(it.say)}</p>` : ''}
      </div>
      <div class="listen-row">
        <button class="listen" id="play" type="button">${ICON.sound} 듣기</button>
        <button class="slow" id="slow" type="button">천천히<br>듣기</button>
      </div>
      ${canListen ? `<button class="mic" id="mic" type="button">${ICON.mic} 따라 말하기</button>` : ''}
      <p class="hint" id="hint" aria-live="polite">듣고 나서 큰 소리로 따라 말해 보세요.</p>
      <div class="nav">
        <button class="prev" id="prev" type="button" ${k === 0 ? 'disabled' : ''}>이전</button>
        <button class="next" id="next" type="button">${k === cards.length - 1 ? '다 했어요' : '다음'}</button>
      </div>
    </section>`);
    bindQuit();
    on('play', () => say(it.en, S));
    on('slow', () => say(it.en, S, 'play', true));
    on('mic', () => repeatAfter(it.en));
    on('prev', () => { if (k > 0) { k--; render(); } });
    on('next', () => { if (k < cards.length - 1) { k++; render(); } else nextStep(S); });
    setTimeout(() => { if ($('play')) say(it.en, S); }, 350);
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
  let k = 0;

  function learn() {
    const w = words[k];
    mount(`<section class="screen">
      ${header(S, k / total)}
      <div class="card word">
        <p class="count">${k + 1} <span>/ ${words.length}</span></p>
        ${w.emoji ? `<div class="big-emoji" aria-hidden="true">${esc(w.emoji)}</div>` : ''}
        <p class="en" lang="en">${esc(w.en)}</p>
        <p class="ko">${esc(w.ko)}</p>
        ${w.say ? `<p class="say">${esc(w.say)}</p>` : ''}
      </div>
      <button class="listen" id="play" type="button">${ICON.sound} 듣기</button>
      <div class="nav">
        <button class="prev" id="prev" type="button" ${k === 0 ? 'disabled' : ''}>이전</button>
        <button class="next" id="next" type="button">${k === words.length - 1 ? '문제 풀기' : '다음'}</button>
      </div>
    </section>`);
    bindQuit();
    on('play', () => say(w.en, S));
    on('prev', () => { if (k > 0) { k--; learn(); } });
    on('next', () => { if (k < words.length - 1) { k++; learn(); } else quiz(0); });
    setTimeout(() => { if ($('play')) say(w.en, S); }, 300);
  }

  function quiz(qi) {
    if (qi >= qs.length) return nextStep(S);
    const q = qs[qi];
    const others = shuffle(words.filter((w) => w.en !== q.en)).slice(0, nOpt - 1);
    const opts = shuffle([q, ...others]);
    mount(`<section class="screen">
      ${header(S, (words.length + qi) / total)}
      <p class="lead">잘 듣고 맞는 뜻을 고르세요. <span class="muted">(${qi + 1}/${qs.length})</span></p>
      <button class="listen" id="play" type="button">${ICON.sound} 다시 듣기</button>
      <div class="choices">${opts.map((o, j) => `<button class="choice" type="button" data-j="${j}"><span class="emoji" aria-hidden="true">${esc(o.emoji || '')}</span>${esc(o.ko)}</button>`).join('')}</div>
      <p class="hint" id="hint" aria-live="polite"></p>
      <div id="after"></div>
    </section>`);
    bindQuit();
    on('play', () => say(q.en, S));
    setTimeout(() => { if ($('play')) say(q.en, S); }, 300);
    const buttons = document.querySelectorAll('.choice');
    buttons.forEach((b) => b.addEventListener('click', () => {
      buttons.forEach((x) => (x.disabled = true));
      const pick = opts[Number(b.dataset.j)];
      const right = pick.en === q.en;
      S.score.words[1]++;
      buttons.forEach((x) => { if (opts[Number(x.dataset.j)].en === q.en) x.classList.add('right'); });
      if (right) {
        S.score.words[0]++;
        $('hint').textContent = `맞았어요! 👏  ${q.en} = ${q.ko}`;
        setTimeout(() => { if ($('hint')) quiz(qi + 1); }, 1300);
      } else {
        b.classList.add('wrong');
        $('hint').textContent = `정답은 "${q.ko}"이에요.`;
        $('after').innerHTML = '<button class="big primary" id="go" type="button">다음</button>';
        on('go', () => quiz(qi + 1));
      }
    }));
  }

  learn();
}

// 4. 묻고 답하기 ----------------------------------------------------------------------
const CHEERS = [
  ['Great!', '좋아요!'], ['Good answer!', '좋은 대답이에요!'], ['Wonderful!', '훌륭해요!'], ['Thank you for telling me!', '말해 줘서 고마워요!'],
];

function qaStep(S) {
  const qs = S.c.questions;
  let k = 0;

  function ask() {
    if (k >= qs.length) return nextStep(S);
    const q = qs[k];
    mount(`<section class="screen scroll">
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
        ${canListen ? `<button class="mic" id="mic" type="button">${ICON.mic} 내 말로 대답하기</button>` : ''}
        <p class="hint" id="hint" aria-live="polite">${canListen ? '마이크를 누르고 대답하거나, 아래에서 골라 주세요.' : '아래에서 대답을 골라 주세요.'}</p>
        <div class="choices">${q.choices.map((c, j) => `<button class="choice text" type="button" data-j="${j}"><span lang="en">${esc(c.en)}</span><small>${esc(c.ko)}</small></button>`).join('')}</div>
        ${canListen ? '' : `<form id="typed" class="typed"><input id="typedIn" type="text" autocomplete="off" placeholder="영어로 적어도 돼요" aria-label="영어로 적기"><button class="primary" type="submit">보내기</button></form>`}
      </div>
    </section>`);
    bindQuit();
    const play = () => emma(q.en, S);
    on('again', play);
    setTimeout(() => { if ($('again')) play(); }, 350);
    if (qs[k + 1]) prefetch(qs[k + 1].en);
    else if (S.c.talk && S.c.talk.opener_en) prefetch(S.c.talk.opener_en);
    document.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => answered(q, q.choices[Number(b.dataset.j)].en, 'choice', q.choices[Number(b.dataset.j)].ko)));
    on('mic', async () => {
      const mic = $('mic');
      mic.classList.add('recording');
      $('hint').textContent = '듣고 있어요… 영어로 말씀하세요';
      try {
        const alts = await listen();
        if (alts[0]) answered(q, alts[0], 'voice');
      } catch (err) {
        if ($('hint')) $('hint').textContent = LISTEN_ERRORS[err] || '다시 눌러 주세요.';
        if ($('mic')) mic.classList.remove('recording');
      }
    });
    const typed = $('typed');
    if (typed) typed.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('typedIn').value.trim();
      if (v) answered(q, v, 'voice');
    });
  }

  async function answered(q, text, how, ko = '') {
    $('area').innerHTML = `<div class="msg-me"><span class="who">나</span><span lang="en">${esc(text)}</span></div>
      <p class="hint">Emma 선생님이 듣고 있어요…</p>`;
    let r;
    if (how === 'choice') {
      const c = CHEERS[Math.floor(Math.random() * CHEERS.length)];
      r = { reply_en: c[0], reply_ko: c[1], better_en: '', tip_ko: '' };
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
    $('area').innerHTML = `<div class="msg-me"><span class="who">나</span><span lang="en">${esc(text)}</span>${ko ? `<small>${esc(ko)}</small>` : ''}</div>
      ${showBetter ? `<div class="better">
          <p class="label">이렇게 말하면 더 좋아요</p>
          <p class="en" lang="en">${esc(r.better_en)}</p>
          ${r.better_ko ? `<p class="ko">${esc(r.better_ko)}</p>` : ''}
          <button class="ghost" id="hearBetter" type="button">${ICON.sound} 들어 보기</button>
        </div>` : ''}
      ${r.tip_ko ? `<p class="tip">💡 ${esc(r.tip_ko)}</p>` : ''}
      <button class="big primary" id="nextQ" type="button">${k === qs.length - 1 ? '다음으로' : '다음 질문'}</button>`;
    const ag = $('again');
    if (ag) { const fresh = ag.cloneNode(true); ag.replaceWith(fresh); }
    on('again', () => emma(r.reply_en, S));
    on('hearBetter', () => emma(r.better_en, S));
    on('nextQ', () => { k++; ask(); });
    emma(r.reply_en, S);
    if (showBetter) prefetch(r.better_en);
  }

  ask();
}

// 5. 3분 대화 -------------------------------------------------------------------------
const FIRST_HELP = {
  1: ['Hello, Emma!', '안녕하세요, 엠마!'],
  2: ["Hi, Emma. I'm fine, thank you.", '안녕하세요, 엠마. 잘 지내요, 고마워요.'],
  3: ["Hi, Emma! I'm good. How are you?", '안녕하세요, 엠마! 잘 지내요. 당신은요?'],
  4: ["Hi, Emma! I'm doing well. It's nice to talk with you.", '안녕하세요, 엠마! 잘 지내요. 이야기하게 되어 좋아요.'],
  5: ["Hi, Emma! I'm doing well, thanks. I had a busy day today.", '안녕하세요, 엠마! 잘 지내요. 오늘은 바쁜 하루였어요.'],
};

function talkStep(S) {
  const t = S.c.talk;
  const history = [{ role: 'emma', en: t.opener_en, ko: t.opener_ko }];
  const fh = FIRST_HELP[S.level] || FIRST_HELP[1];
  let help = { en: fh[0], ko: fh[1] };
  let left = TALK_SECONDS;
  let ended = false, busy = false;

  mount(`<section class="screen talk">
    ${header(S, 0)}
    <div class="talk-top">
      ${avatar('sm')}
      <div class="talk-info">
        <p class="scene">${esc(t.scene_ko || 'Emma 선생님과 이야기해요.')}</p>
        <p class="timer" id="timer">남은 시간 ${fmt(left)}</p>
      </div>
    </div>
    <div class="log" id="log" aria-live="polite"></div>
    <div id="helpBox"></div>
    <p class="hint" id="hint"></p>
    <div class="talk-controls" id="controls">
      ${canListen ? `<button class="mic" id="mic" type="button">${ICON.mic} 말하기</button>` : ''}
      <div class="row">
        <button class="plain mid" id="help" type="button">도와주세요</button>
        <button class="plain mid" id="again" type="button">${ICON.sound} 다시 듣기</button>
      </div>
      <form id="typed" class="typed ${canListen ? 'optional' : ''}"><input id="typedIn" type="text" autocomplete="off" placeholder="영어로 적어서 보내도 돼요" aria-label="영어로 적기"><button class="primary" type="submit">보내기</button></form>
    </div>
  </section>`);
  bindQuit();

  function fmt(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  function lastEmma() { for (let i = history.length - 1; i >= 0; i--) if (history[i].role === 'emma') return history[i]; return null; }
  function renderLog() {
    const log = $('log');
    if (!log) return;
    log.innerHTML = history.map((m) => m.role === 'emma'
      ? `<div class="msg-emma"><span lang="en">${esc(m.en)}</span>${m.ko ? `<small>${esc(m.ko)}</small>` : ''}</div>`
      : `<div class="msg-me"><span lang="en">${esc(m.en)}</span>${m.fix ? `<small class="fix">더 자연스럽게: <span lang="en">${esc(m.fix)}</span></small>` : ''}</div>`).join('');
    log.scrollTop = log.scrollHeight;
  }
  function setHint(s) { if ($('hint')) $('hint').textContent = s; }

  async function send(text) {
    text = String(text || '').trim();
    if (busy || ended || !text) return;
    busy = true;
    $('helpBox').innerHTML = '';
    history.push({ role: 'me', en: text });
    S.score.talk++;
    renderLog();
    setHint('Emma 선생님이 생각하고 있어요…');
    try {
      const r = await api.ai('chat', {
        topic: S.topic, level: S.level, scene: t.scene_ko, notes: S.notes,
        history: history.map(({ role, en }) => ({ role, en })),
      });
      if (r.fix_en && !sameSentence(r.fix_en, text)) history[history.length - 1].fix = r.fix_en;
      save(S, { kind: 'talk', prompt_en: (lastEmma() || {}).en, answer_en: text, better_en: r.fix_en || '', answer_ko: r.said_ko || '' });
      if (r.en) history.push({ role: 'emma', en: r.en, ko: r.ko || '' });
      if (r.help_en) help = { en: r.help_en, ko: r.help_ko || '' };
      api.addNotes(r.facts, S.topic).catch(() => {});
      if (Array.isArray(r.facts)) S.notes = [...r.facts, ...S.notes].slice(0, 40);
      renderLog();
      setHint('');
      if (r.en && !ended) { if (r.help_en) prefetch(r.help_en); await emma(r.en, S); }
    } catch (e) {
      setHint(api.aiMessage(e));
      showSkip();
    } finally {
      busy = false;
    }
  }

  function showSkip() {
    if ($('skip')) return;
    const c = $('controls');
    if (c) c.insertAdjacentHTML('beforeend', '<button class="plain mid" id="skip" type="button">대화 건너뛰고 마치기</button>');
    on('skip', () => nextStep(S));
  }

  async function end() {
    if (ended) return;
    ended = true;
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    $('helpBox').innerHTML = '';
    $('controls').innerHTML = '';
    setHint('시간이 다 됐어요. Emma 선생님이 인사하고 있어요…');
    let bye = { en: 'It was so nice talking with you. See you tomorrow!', ko: '이야기해서 정말 좋았어요. 내일 또 만나요!' };
    try {
      const r = await api.ai('chat', { topic: S.topic, level: S.level, scene: t.scene_ko, notes: S.notes, ending: true, history: history.map(({ role, en }) => ({ role, en })) });
      if (r.en) bye = { en: r.en, ko: r.ko || '' };
    } catch (e) { /* 기본 인사 */ }
    if (!$('log')) return;
    history.push({ role: 'emma', ...bye });
    renderLog();
    setHint('');
    $('controls').innerHTML = '<button class="big primary" id="done" type="button">오늘 공부 마치기</button>';
    on('done', () => nextStep(S));
    emma(bye.en, S);
  }

  on('again', () => { const m = lastEmma(); if (m) emma(m.en, S); });
  on('help', () => {
    $('helpBox').innerHTML = `<div class="better">
      <p class="label">이렇게 말해 보세요</p>
      <p class="en" lang="en">${esc(help.en)}</p>
      ${help.ko ? `<p class="ko">${esc(help.ko)}</p>` : ''}
      <div class="row">
        <button class="plain mid" id="hearHelp" type="button">${ICON.sound} 듣기</button>
        <button class="primary mid" id="useHelp" type="button">이렇게 말할래요</button>
      </div>
    </div>`;
    on('hearHelp', () => emma(help.en, S));
    on('useHelp', () => send(help.en));
  });
  on('mic', async () => {
    if (busy || ended) return;
    const mic = $('mic');
    mic.classList.add('recording');
    setHint('듣고 있어요… 영어로 말씀하세요');
    try {
      const alts = await listen();
      setHint('');
      if (alts[0]) send(alts[0]);
    } catch (err) {
      setHint(LISTEN_ERRORS[err] || '다시 눌러 주세요.');
    } finally {
      if ($('mic')) mic.classList.remove('recording');
    }
  });
  $('typed').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('typedIn').value;
    $('typedIn').value = '';
    send(v);
  });

  renderLog();
  setTimeout(() => { if ($('log')) emma(t.opener_en, S); }, 350);
  state.timer = setInterval(() => {
    left--;
    if ($('timer')) $('timer').textContent = `남은 시간 ${fmt(Math.max(0, left))}`;
    if (left <= 0) end();
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
