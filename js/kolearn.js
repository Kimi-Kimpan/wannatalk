// 한국어 하루 레슨 (영어 화면): 문장 카드 → 낱말 → 묻고 답하기 → (편지가 있으면) 답장
// 영어 레슨(learn.js)과 같은 모양의 화면을 쓰고, 내용만 한국어예요.
import { state, register, go, mount, on, $, esc, topBar, shuffle, today, loading, errorScreen, avatar, ICON, hear, celebrate, carousel, spotlight, clearSpotlight } from './ui.js';
import { speak, prefetch, canListen } from './speech.js';
import * as api from './api.js';

const STEP_NAMES = { cards: 'Sentences', words: 'Words', qa: 'Q & A' };
const RATE = { 1: 0.7, 2: 0.8, 3: 0.9 };
const LEVEL_TEXT = {
  1: ['I just learned Hangul', 'Very short sentences, romanization always shown.'],
  2: ['I know a little Korean', 'Short everyday sentences.'],
  3: ['I can have simple chats', 'Longer sentences that join two ideas.'],
};

// 한글만 남겨서 글자 단위로 비교해요 (따라 말하기 점수)
function koSimilarity(target, heard) {
  const t = [...String(target || '').replace(/[^가-힣]/g, '')];
  const h = [...String(heard || '').replace(/[^가-힣]/g, '')];
  if (!t.length) return 0;
  const dp = Array.from({ length: t.length + 1 }, () => new Array(h.length + 1).fill(0));
  for (let i = 1; i <= t.length; i++)
    for (let j = 1; j <= h.length; j++)
      dp[i][j] = t[i - 1] === h[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[t.length][h.length] / t.length;
}
const bestKo = (target, alts) => Math.max(0, ...(alts || []).map((a) => koSimilarity(target, a)));

// 오늘 레슨 불러오기 (없으면 클라우디아가 만들어요) ----------------------------------------
const str = (v) => (typeof v === 'string' ? v.trim() : '');
function validPack(c) {
  return c && Array.isArray(c.cards) && c.cards.some((x) => x && str(x.ko)) && Array.isArray(c.words) && c.words.length >= 4 &&
    Array.isArray(c.questions) && c.questions.length;
}
function tidy(c) {
  c.cards = c.cards.slice(0, 8).map((x) => ({ ko: str(x.ko), en: str(x.en), roman: str(x.roman) })).filter((x) => x.ko);
  c.words = c.words.slice(0, 10).map((x) => ({ ko: str(x.ko), en: str(x.en), roman: str(x.roman), emoji: str(x.emoji).slice(0, 8) })).filter((x) => x.ko && x.en);
  c.questions = c.questions.slice(0, 5).map((q) => ({
    ko: str(q.ko), en: str(q.en),
    choices: (Array.isArray(q.choices) ? q.choices : []).slice(0, 3).map((x) => ({ ko: str(x && x.ko), en: str(x && x.en) })).filter((x) => x.ko),
  })).filter((q) => q.ko);
  c.title_en = str(c.title_en);
  return c;
}
const preparing = new Map();
function loadPack(n) {
  if (!preparing.has(n)) {
    const p = makeOrGet(n);
    preparing.set(n, p);
    p.catch(() => preparing.delete(n));
  }
  return preparing.get(n);
}
async function makeOrGet(n) {
  const day = api.KO_DAY0 + n;
  const old = await api.getPack(day);
  if (old && validPack(old.content)) return old;
  const p = state.profile;
  const notes = await api.recentNotes(30).catch(() => []);
  const content = await api.ai('kopack', { day: n, level: p.ko_level || 1, name: p.name, notes });
  if (!validPack(content)) throw new api.AIError('ai_error');
  return await api.savePack(day, content.level || p.ko_level || 1, `ko:${content.topic || 'me'}`, tidy(content));
}
// 홈에서 미리 만들어 둬요 (누르면 바로 시작)
export function prepareKoDay() {
  const p = state.profile;
  if (!p || !p.ko_level) return;
  loadPack(p.ko_day || 1).catch(() => {});
}

// 진행 상황 (중간에 나가도 이어서) --------------------------------------------------------
const PKEY = 'wt-ko-progress';
function saveProgress(S) { try { localStorage.setItem(PKEY, JSON.stringify({ n: S.n, i: S.i, sub: S.sub || 0, score: S.score })); } catch (e) { /* 무시 */ } }
function readProgress() { try { return JSON.parse(localStorage.getItem(PKEY) || 'null'); } catch (e) { return null; } }
function clearProgress() { try { localStorage.removeItem(PKEY); } catch (e) { /* 무시 */ } }

// 처음 한 번: 한국어를 얼마나 아는지 ----------------------------------------------------------
register('ko-level', () => {
  mount(`<section class="screen fit" lang="en">
    ${topBar('Korean lessons', 0, 'Back')}
    <div class="emma-row">${avatar('sm')}<div class="bubble"><p class="ko-line">Before your first lesson: <b>how much Korean do you know?</b> You can change this later in Settings.</p></div></div>
    <div class="stack level-pick">
      ${[1, 2, 3].map((l) => `<button class="big plain level-btn" type="button" data-l="${l}"><b>${esc(LEVEL_TEXT[l][0])}</b><small>${esc(LEVEL_TEXT[l][1])}</small></button>`).join('')}
    </div>
  </section>`);
  on('quit', () => go('ko-home'));
  document.querySelectorAll('.level-btn').forEach((b) => b.addEventListener('click', async () => {
    document.querySelectorAll('.level-btn').forEach((x) => { x.disabled = true; });
    try {
      state.profile = await api.updateProfile(state.user.id, { ko_level: Number(b.dataset.l) });
      go('ko-day');
    } catch (e) {
      errorScreen('Could not save. Please check your internet.', () => go('ko-level'), () => go('ko-home'), true);
    }
  }));
});

// 하루 레슨 ---------------------------------------------------------------------------
register('ko-day', async (opts = {}) => {
  const p = state.profile;
  if (!p.ko_level) return go('ko-level');
  const n = p.ko_day || 1;
  const review = !!opts.review;
  loading('Klaudia is preparing today’s lesson…');
  const slow = setTimeout(() => { const el = document.querySelector('.screen .lead'); if (el) el.textContent = 'Almost there. A new lesson takes about 30 seconds…'; }, 12000);
  let pack;
  const letterP = api.pendingLetter(state.user.id).catch(() => null);
  try { pack = await loadPack(n); }
  catch (e) {
    clearTimeout(slow);
    return errorScreen('Could not load the lesson. Please check your internet and try again.', () => go('ko-day', opts), () => go('ko-home'), true);
  }
  clearTimeout(slow);
  const letter = await letterP;
  const S = {
    n, pack, c: pack.content, letter, review, steps: ['cards', 'words', 'qa'], i: 0,
    level: pack.level || p.ko_level || 1, score: { words: [0, 0], qa: [0, 0] },
  };
  S.rate = RATE[S.level] || 0.8;
  if (S.c.cards[0]) prefetch(S.c.cards[0].ko);
  const saved = readProgress();
  if (saved && saved.n === n && (saved.i > 0 || saved.sub > 0)) { S.i = Math.min(saved.i, 2); S.resume = saved.sub || 0; if (saved.score) S.score = saved.score; }
  runStep(S);
});

function runStep(S) {
  if (S.i >= S.steps.length) return finish(S);
  S.sub = 0;
  saveProgress(S);
  ({ cards: cardsStep, words: wordsStep, qa: qaStep })[S.steps[S.i]](S);
}
function nextStep(S) { S.i++; S.resume = 0; runStep(S); }
function startAt(S, len) { const k = Math.min(Math.max(0, S.resume || 0), Math.max(0, len - 1)); S.resume = 0; return k; }
function mark(S, k) { S.sub = k; saveProgress(S); }
function header(S, part = 0) {
  return topBar(`${S.i + 1}/${S.steps.length} · ${STEP_NAMES[S.steps[S.i]]}`, (S.i + part) / S.steps.length, 'Exit');
}
function bindQuit(S) { on('quit', () => { saveProgress(S); go('ko-home'); }); }
const say = (text, S, btn = 'play', slowly = false) => speak(text, { rate: slowly ? 0.55 : S.rate, button: $(btn), restart: slowly });
const romanFirst = (S) => S.level <= 1;

// 따라 말하기: 잘하면 작은 팡파레
async function repeatAfter(target) {
  const mic = $('mic'), hint = $('hint');
  if (!mic || !hint) return;
  const alts = await hear(mic, hint, { lang: 'ko', ui: 'en', listening: 'Listening… say it in Korean' });
  if (!alts || !hint.isConnected) return;
  const s = bestKo(target, alts);
  if (s >= 0.8) { hint.innerHTML = '<span class="cheer">🎉 Great pronunciation! 🎉</span>'; celebrate(hint); }
  else hint.innerHTML = `${s >= 0.5 ? 'Good try!' : 'Let’s try once more.'} I heard: <span lang="ko">“${esc(alts[0] || '')}”</span>`;
}

// 1. 문장 카드 ---------------------------------------------------------------------------
function cardsStep(S) {
  const cards = S.c.cards;
  let k = startAt(S, cards.length);
  function render() {
    const it = cards[k];
    mark(S, k);
    mount(`<section class="screen fit ko-lesson" lang="en">
      ${header(S, k / cards.length)}
      <div class="sentence">
        <p class="count">${k + 1} <span>/ ${cards.length}</span></p>
        <p class="ko ko-big" lang="ko">${esc(it.ko)}</p>
        ${it.roman ? `<p class="say ${romanFirst(S) ? '' : 'later'}" id="roman">${esc(it.roman)}</p>` : ''}
        <p class="en">${esc(it.en)}</p>
        ${it.roman && !romanFirst(S) ? '<button class="link-btn small" id="showRoman" type="button">Show romanization</button>' : ''}
      </div>
      <div class="listen-row">
        <button class="listen" id="play" type="button">${ICON.sound} Listen</button>
        <button class="slow" id="slow" type="button">Slowly</button>
      </div>
      ${canListen ? `<button class="mic" id="mic" type="button">${ICON.mic} Say it</button>` : ''}
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="nav">
        <button class="prev" id="prev" type="button" ${k === 0 ? 'disabled' : ''}>Back</button>
        <button class="next" id="next" type="button">${k === cards.length - 1 ? 'Done' : 'Next'}</button>
      </div>
    </section>`);
    bindQuit(S);
    on('showRoman', () => { $('roman').classList.remove('later'); $('showRoman').remove(); });
    on('play', () => say(it.ko, S));
    on('slow', () => say(it.ko, S, 'play', true));
    on('mic', () => repeatAfter(it.ko));
    on('prev', () => { if (k > 0) { k--; render(); } });
    on('next', () => { if (k < cards.length - 1) { k++; render(); } else nextStep(S); });
    if (cards[k + 1]) prefetch(cards[k + 1].ko);
    setTimeout(() => { if ($('play')) say(it.ko, S); }, 350);   // 새 문장이 나오면 한 번 읽어 줘요
  }
  render();
}

// 2. 낱말: 한글을 읽고 뜻 고르기, 그다음 소리만 듣고 고르기 --------------------------------------
function wordsStep(S) {
  const words = S.c.words;
  const listenQs = shuffle(words).slice(0, Math.min(5, words.length));
  const total = words.length + listenQs.length;
  const states = { read: words.map(() => null), listen: listenQs.map(() => null) };
  const k0 = startAt(S, words.length);
  function question(part, qi) {
    const list = part === 'read' ? words : listenQs;
    if (qi >= list.length) return part === 'read' ? question('listen', 0) : nextStep(S);
    if (part === 'read') mark(S, qi);
    const q = list[qi];
    const st = states[part][qi] || (states[part][qi] = { opts: shuffle([q, ...shuffle(words.filter((w) => w.en !== q.en)).slice(0, 2)]), picked: null });
    const done = (part === 'read' ? qi : words.length + qi) / total;
    const last = part === 'listen' && qi === list.length - 1;
    mount(`<section class="screen fit words-q ko-lesson" lang="en">
      ${header(S, done)}
      <p class="lead" id="hint" aria-live="polite">${part === 'read' ? 'Read the Korean and pick <b>the meaning</b>.' : '<b>Just listen</b> and pick the meaning.'}
        <span class="muted">(${qi + 1}/${list.length})</span></p>
      ${part === 'read'
        ? `<div class="word-show">
             <p class="en ko-big" lang="ko">${esc(q.ko)}</p>
             <p class="say ${romanFirst(S) ? '' : 'later'}" id="say">${esc(q.roman || '')}&nbsp;</p>
             <div class="word-actions">
               <button class="ghost small-listen" id="play" type="button">${ICON.sound} Listen</button>
               ${canListen ? `<button class="ghost small-listen" id="mic" type="button">${ICON.mic} Say it</button>` : ''}
             </div>
           </div>`
        : `<div class="word-actions wide">
             <button class="listen" id="play" type="button">${ICON.sound} Listen again</button>
           </div>`}
      <div class="choices">${st.opts.map((o, j) => `<button class="choice" type="button" data-j="${j}"><span class="emoji" aria-hidden="true">${esc(o.emoji || '')}</span>${esc(o.en)}</button>`).join('')}</div>
      <div class="nav">
        <button class="prev" id="qprev" type="button" ${part === 'read' && qi === 0 ? 'disabled' : ''}>Back</button>
        <button class="next" id="qnext" type="button" ${st.picked == null ? 'disabled' : ''}>${last ? 'Done' : 'Next'}</button>
      </div>
    </section>`);
    bindQuit(S);
    const buttons = document.querySelectorAll('.choice');
    function showResult(fresh) {
      const right = st.opts[st.picked].en === q.en;
      buttons.forEach((x) => {
        x.disabled = true;
        const o = st.opts[Number(x.dataset.j)];
        if (o.en === q.en) x.classList.add('right');
        else if (Number(x.dataset.j) === st.picked) x.classList.add('wrong');
      });
      if ($('say')) $('say').classList.remove('later');
      $('hint').innerHTML = `${right ? 'Right! 👏 ' : 'The answer is '}<b lang="ko">${esc(q.ko)}</b> ${q.roman ? `<span class="muted">(${esc(q.roman)})</span> ` : ''}= ${esc(q.en)}`;
      $('qnext').disabled = false;
      if (fresh) { if (right) celebrate($('hint')); if (part === 'listen') say(q.ko, S); }
      spotlight($('qnext'), $('hint'), document.querySelector('.word-actions'), document.querySelector('.choices'));
    }
    on('play', () => say(q.ko, S));
    on('mic', () => repeatAfter(q.ko));
    on('qprev', () => { if (qi > 0) question(part, qi - 1); else if (part === 'listen') question('read', words.length - 1); });
    on('qnext', () => { clearSpotlight(); if (st.picked != null) question(part, qi + 1); });
    buttons.forEach((b) => b.addEventListener('click', () => {
      if (st.picked != null) return;
      st.picked = Number(b.dataset.j);
      S.score.words[1]++;
      if (st.opts[st.picked].en === q.en) S.score.words[0]++;
      showResult(true);
    }));
    if (st.picked != null) showResult(false);
    else setTimeout(() => { if ($('play')) say(q.ko, S); }, 300);
  }
  question('read', k0);
}

// 3. 묻고 답하기: 클라우디아가 한국어로 묻고, 예시를 고르거나 말하거나 적어요 ----------------------------
function qaStep(S) {
  const qs = S.c.questions;
  const answers = [];
  let k = startAt(S, qs.length);
  let pre = null;   // 바로 앞 대답에 대한 클라우디아의 반응 {ko, en}
  function ask() {
    const q = qs[k];
    if (!q) return nextStep(S);
    mark(S, k);
    mount(`<section class="screen fit qa ko-lesson" lang="en">
      ${header(S, k / qs.length)}
      <div class="emma-row">
        ${avatar()}
        <div class="bubble" id="bubble">
          <p class="en" lang="ko">${pre ? `<span class="pre">${esc(pre.ko)}</span> ` : ''}${esc(q.ko)}</p>
          <p class="ko">${pre && pre.en ? `${esc(pre.en)} ` : ''}${esc(q.en)}</p>
        </div>
      </div>
      <button class="ghost again" id="again" type="button">${ICON.sound} Listen again</button>
      <div id="area">
        <p class="pick-tip">Pick an example, or answer in your own words</p>
        <div class="sugg-list" id="qaChoices"></div>
        <p class="hint say-tip" id="hint" aria-live="polite"></p>
        ${canListen ? `<button class="mic" id="mic" type="button">${ICON.mic} Answer in Korean</button>` : ''}
        <form id="typed" class="typed"><input id="typedIn" type="text" lang="ko" autocomplete="off" placeholder="Or type in Korean" aria-label="Type your answer in Korean"><button class="primary" type="submit">Send</button></form>
      </div>
    </section>`);
    bindQuit(S);
    const play = () => say(`${pre ? `${pre.ko} ` : ''}${q.ko}`, S, 'again');
    on('again', play);
    setTimeout(() => { if ($('again')) play(); }, 350);
    carousel($('qaChoices'), q.choices.map((c) => ({ en: c.ko, ko: c.en })), {
      action: 'Use this answer', soft: true,
      onListen: (c) => speak(c.en, { rate: S.rate }),
      onPick: (c) => answered(q, c.en, true),
    });
    on('mic', async () => {
      const alts = await hear($('mic'), $('hint'), { lang: 'ko', ui: 'en', listening: 'Listening… answer in Korean' });
      if (alts && alts[0] && $('area')) answered(q, alts[0], false);
    });
    $('typed').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('typedIn').value.trim();
      if (v) answered(q, v, false);
    });
  }

  async function answered(q, text, tapped) {
    const last = k === qs.length - 1;
    answers[k] = text;
    $('area').innerHTML = `<div class="feedback"><p class="label">You said</p><p class="en" lang="ko">${esc(text)}</p><p class="muted">Klaudia is listening…</p></div>`;
    let r = null;
    if (tapped) {
      const c = q.choices.find((x) => x.ko === text) || { en: '' };
      r = { good: true, better_ko: text, better_en: c.en, tip_en: '', reply_ko: '좋아요!', reply_en: 'Great!' };
      api.ai('kocheck', { question: q.ko, answer: text, tapped: true, level: S.level, last }).then((x) => { if (x && x.facts && x.facts.length) api.addNotes(x.facts, S.pack.topic).catch(() => {}); }).catch(() => {});
    } else {
      try {
        r = await api.ai('kocheck', {
          question: q.ko, answer: text, level: S.level, last,
          history: qs.slice(0, k).map((x, i) => ({ q: x.ko, a: answers[i] || '' })),
        });
        if (r && Array.isArray(r.facts) && r.facts.length) api.addNotes(r.facts, S.pack.topic).catch(() => {});
      } catch (e) { r = null; }
    }
    if (!$('area')) return;
    S.score.qa[1]++;
    if (!r || r.good !== false) S.score.qa[0]++;
    const same = r && r.better_ko && r.better_ko.replace(/[\s.!?]/g, '') === text.replace(/[\s.!?]/g, '');
    $('area').innerHTML = `<div class="feedback">
        <p class="label">You said</p><p class="en" lang="ko">${esc(text)}</p>
        ${r && r.better_ko && !same ? `<p class="label">Klaudia’s version</p><p class="en better" lang="ko">${esc(r.better_ko)}</p>
          ${r.better_roman ? `<p class="say">${esc(r.better_roman)}</p>` : ''}` : ''}
        ${r && r.better_en ? `<p class="muted">${esc(r.better_en)}</p>` : ''}
        ${r && r.tip_en ? `<p class="tip">💡 ${esc(r.tip_en)}</p>` : ''}
        ${!r ? '<p class="muted">Klaudia could not check this one, but let’s keep going.</p>' : ''}
        ${r && r.better_ko && !same ? `<button class="ghost small-listen" id="hearBetter" type="button">${ICON.sound} Listen</button>` : ''}
      </div>
      <div class="nav">
        <button class="prev" id="retry" type="button">Try again</button>
        <button class="next" id="qaNext" type="button">${last ? 'Done' : 'Next'}</button>
      </div>`;
    if (r && r.good !== false && tapped !== true) celebrate($('area').querySelector('.feedback'));
    on('hearBetter', () => say(r.better_ko, S, 'hearBetter'));
    on('retry', () => { S.score.qa[1]--; if (!r || r.good !== false) S.score.qa[0]--; ask(); });
    on('qaNext', () => {
      pre = r && r.reply_ko ? { ko: r.reply_ko, en: r.reply_en || '' } : null;
      k++;
      if (k < qs.length) ask();
      else nextStep(S);
    });
  }
  ask();
}

// 마치기 --------------------------------------------------------------------------------
async function finish(S) {
  clearProgress();
  const ratio = ([a, b]) => (b ? a / b : null);
  const parts = [ratio(S.score.words), ratio(S.score.qa)].filter((x) => x !== null);
  const total = parts.length ? Math.round((parts.reduce((x, y) => x + y, 0) / parts.length) * 100) / 100 : null;
  if (!S.review) {
    loading('Saving today’s lesson…');
    const already = !!S.pack.done_at;   // 이미 마친 레슨을 다시 했으면 날짜는 그대로
    try {
      await api.finishPack(S.pack.id, { words: ratio(S.score.words), qa: ratio(S.score.qa), total });
      if (!already) state.profile = await api.updateProfile(state.user.id, { ko_day: S.n + 1, ko_last_done: today() });
      prepareKoDay();   // 다음 레슨을 미리 만들어 둬요
    } catch (e) {
      return errorScreen('Could not save. Please check your internet and try again.', () => finish(S), () => go('ko-home'), true);
    }
  }
  let from = null;
  if (S.letter) {
    try { const cs = await api.myContacts(); from = cs.find((c) => c.id === S.letter.from_id) || null; } catch (e) { /* 없이 */ }
  }
  mount(`<section class="screen center" lang="en">
    <div class="big-emoji" aria-hidden="true">🎉</div>
    <h1>Well done!</h1>
    <ul class="summary">
      <li>📖 ${S.c.cards.length} sentences</li>
      <li>🔤 ${S.c.words.length} words · ${S.score.words[0]}/${S.score.words[1]} right</li>
      <li>💬 ${S.score.qa[1]} answers to Klaudia</li>
    </ul>
    ${S.letter && from ? `<p class="lead">${esc(from.name || 'Your family')} sent you a message. Reply in Korean now?</p>
      <button class="big primary" id="reply" type="button">✉️ Reply in Korean</button>
      <button class="big plain" id="home" type="button">Later</button>`
      : '<button class="big primary" id="home" type="button">Back home</button>'}
  </section>`);
  on('home', () => go('ko-home'));
  on('reply', () => go('message', { to: from, topic: 'reply', replyTo: S.letter, from: 'ko-day' }));
}
