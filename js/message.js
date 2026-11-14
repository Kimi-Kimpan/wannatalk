// 메시지 보내기: 받는 사람 고르기(코드로 추가) → 무엇을 쓸지 고르기 → 클라우디아와 말로 쓰기(인사·하고 싶은 말·끝인사) → 고치고 보내기
// 학습자(한국어 화면)와 가족(영어 화면)이 똑같이 씁니다.
import { state, register, go, mount, on, $, esc, loading, avatar, ICON, hear, carousel, spotlight, clearSpotlight } from './ui.js';
import { speak, canListen } from './speech.js';
import * as api from './api.js';

const T = {
  ko: {
    exit: '나가기', back: '← 돌아가기', who: '누구에게 보낼까요?', addTitle: '새 사람 추가',
    addHelp: '받을 사람의 코드 6자리를 넣어 주세요. 한 번 넣으면 다음부터는 위 목록에서 바로 고를 수 있어요.',
    codeLabel: '코드', add: '추가하기', notFound: '그 코드를 찾지 못했어요. 다시 확인해 주세요.',
    tooMany: '코드를 너무 많이 틀렸어요. 한 시간 뒤에 다시 해 주세요.', needSix: '코드는 6자리예요.',
    myCode: '내 코드', myCodeHelp: '상대방이 이 코드를 넣으면 서로 메시지를 주고받을 수 있어요.',
    noContacts: '아직 연락처가 없어요. 아래에서 코드로 추가해 주세요.',
    what: (n) => `${n}님에게 무엇을 쓸까요?`,
    topics: [['day', '☀️', '오늘 하루 안부 묻기'], ['weekend', '🗓️', '주말 계획 묻기'], ['dinner', '🍲', '오늘 저녁 메뉴 이야기'], ['kids', '👶', '손주·조카 안부 묻기'], ['free', '✏️', '자유롭게 쓰기']],
    preparing: '클라우디아가 글 쓸 준비를 하고 있어요…',
    steps: { greet: '인사', body: '하고 싶은 말', close: '끝인사' },
    say: {
      greet: '먼저 인사부터 해 볼까요?<br>아래에서 고르거나, 마이크를 누르고 말씀해 주세요. <b>한국어로 말해도 영어로 바꿔 드려요.</b>',
      body: '이제 하고 싶은 말을 한 문장으로 해 볼까요?',
      close: '마지막으로 끝인사를 해요.',
    },
    pick: '이 문장 사용하기', mic: '말하기', skip: '건너뛰기', undo: '한 문장 지우기',
    draft: '지금까지 쓴 글', draftEmpty: '아직 비어 있어요',
    listening: '듣고 있어요… 한국어로 말해도 돼요', converting: '영어로 바꾸고 있어요…',
    converted: '클라우디아가 고쳐 봤어요. 비교해 보고 골라 주세요.',
    me: '나', waiting: '답장 기다리는 중', seeAll: '전체 대화 보기', close: '닫기',
    mailbox: '편지함', sendTo: (n) => `${n}님에게 보내기`, history: '주고받은 메시지', noLetters: '아직 주고받은 메시지가 없어요.',
    toWho: (n) => `내가 ${n}님에게`, fromWho: (n) => `${n}님이 보냄`, newMark: '새 편지', reply: '답장하기',
    readingLetter: '클라우디아가 편지를 읽고 있어요…', theirLetter: (n) => `${n}님이 보낸 편지 보기`,
    whichPart: (n) => `${esc(n)}님 편지에서 <b>어떤 부분에 답할까요?</b> 아래에서 골라 주세요.`,
    answerPoint: (x) => `<b>"${esc(x)}"</b>에 답해 볼까요? 예시를 고르거나 말씀해 주세요.`,
    ownWay: '내 마음대로 답하기', ownPoint: '하고 싶은 말',
    mine: '내가 한 말', fixed: '클라우디아가 고친 문장', same: '고칠 곳이 없어요. 잘 말했어요!',
    useFixed: '이 문장 사용하기', sayAgain: '다시 말하기', seeExamples: '예시 보기',
    convertFail: '바꾸지 못했어요. 한 번 더 말씀해 주세요.',
    reviewTitle: '이렇게 보낼게요', reviewHelp: '글을 눌러서 직접 고칠 수 있어요.', meaning: '뜻',
    listen: '듣기', restart: '처음부터 다시', send: '보내기', sending: '보내는 중이에요…',
    sendFail: '보내지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.', empty: '보낼 글이 비어 있어요.',
    sent: '보냈어요!', sentHelp: (n) => `${n}님이 앱을 열면 볼 수 있어요.`, home: '처음으로',
    planFail: '예시를 만들지 못했어요. 마이크로 말씀하시면 클라우디아가 영어로 바꿔 드려요.',
  },
  en: {
    exit: 'Close', back: '← Back', who: 'Who is this message for?', addTitle: 'Add someone new',
    addHelp: 'Enter their 6-character code. After that they stay in the list above.',
    codeLabel: 'Code', add: 'Add', notFound: 'That code was not found. Please check it.',
    tooMany: 'Too many wrong codes. Please try again in an hour.', needSix: 'The code has 6 characters.',
    myCode: 'Your code', myCodeHelp: 'Share it so others can add you and write to you.',
    noContacts: 'No contacts yet. Add someone with their code below.',
    what: (n) => `What would you like to tell ${n}?`,
    topics: [['day', '☀️', 'Ask about the day'], ['weekend', '🗓️', 'Weekend plans'], ['dinner', '🍲', "What's for dinner?"], ['kids', '👶', 'Ask about the grandkids'], ['free', '✏️', 'Write freely']],
    preparing: 'Klaudia is getting ready to help…',
    steps: { greet: 'Greeting', body: 'Main message', close: 'Closing' },
    say: {
      greet: "Let's start with a greeting.<br>Pick one below, or tap the mic and say it.",
      body: 'Now say what you want to tell them, in one short sentence.',
      close: 'Finally, a short goodbye.',
    },
    pick: 'Use this line', mic: 'Speak', skip: 'Skip', undo: 'Remove last line',
    draft: 'Your message so far', draftEmpty: 'Nothing yet',
    listening: 'Listening…', converting: 'Writing it down…',
    converted: 'Klaudia tidied it up. Compare and choose.',
    me: 'You', waiting: 'waiting for a reply', seeAll: 'See all', close: 'Close',
    mailbox: 'Messages', sendTo: (n) => `Write to ${n}`, history: 'All messages', noLetters: 'No messages yet.',
    toWho: (n) => `You → ${n}`, fromWho: (n) => `From ${n}`, newMark: 'New', reply: 'Reply',
    readingLetter: 'Klaudia is reading the message…', theirLetter: (n) => `${n}'s message`,
    whichPart: (n) => `Which part of ${esc(n)}'s message would you like to answer?`,
    answerPoint: (x) => `Let's answer: <b>"${esc(x)}"</b>. Pick a line or say it.`,
    ownWay: 'Answer my own way', ownPoint: 'What I want to say',
    mine: 'What you said', fixed: "Klaudia's version", same: 'Nothing to fix. Well said!',
    useFixed: 'Use this line', sayAgain: 'Say it again', seeExamples: 'See examples',
    convertFail: 'That did not work. Please try again.',
    reviewTitle: 'Ready to send', reviewHelp: 'Tap the text to edit it.', meaning: 'Meaning',
    listen: 'Listen', restart: 'Start over', send: 'Send', sending: 'Sending…',
    sendFail: 'Could not send. Please check your connection.', empty: 'The message is empty.',
    sent: 'Sent!', sentHelp: (n) => `${n} will see it next time they open the app.`, home: 'Done',
    planFail: 'Could not get suggestions. Tap the mic and say it; Klaudia will write it in English.',
  },
};
const STEPS = ['greet', 'body', 'close'];

// 낱말 비교: 내가 한 말에서 빠지거나 바뀐 낱말은 줄을 긋고, 클라우디아 문장에서 새로 들어간 낱말은 색을 칠합니다.
const norm = (w) => w.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9']/g, '');
function wordDiff(a, b) {
  const A = String(a || '').split(/\s+/).filter(Boolean), B = String(b || '').split(/\s+/).filter(Boolean);
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = norm(A[i]) && norm(A[i]) === norm(B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keepA = new Array(n).fill(false), keepB = new Array(m).fill(false);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (norm(A[i]) && norm(A[i]) === norm(B[j])) { keepA[i] = keepB[j] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  const mine = A.map((w, i) => (keepA[i] ? esc(w) : `<del>${esc(w)}</del>`)).join(' ');
  const fixed = B.map((w, j) => (keepB[j] ? esc(w) : `<ins>${esc(w)}</ins>`)).join(' ');
  return { mine, fixed, changed: keepA.includes(false) || keepB.includes(false) };
}
const hasHangul = (x) => /[\u3131-\uD79D]/.test(String(x || ''));

register('message', (opts) => start(opts || {}));

function lang() { return state.profile && state.profile.role === 'friend' ? 'en' : 'ko'; }
function home() { go(state.profile && state.profile.role === 'friend' ? 'friend' : 'home'); }

async function start({ to = null, topic = null, replyTo = null } = {}) {
  if (!to) return pickRecipient();
  if (!topic) return pickTopic(to);
  return writeMessage(to, topic, replyTo);
}

// 1. 편지함: 보낼 사람 고르기 + 주고받은 메시지 -------------------------------------------------
async function pickRecipient(msg = '') {
  const t = T[lang()];
  loading('…');
  let contacts = [], letters = [], code = state.profile.code || '';
  try {
    [contacts, letters, code] = await Promise.all([api.myContacts(), api.myLetters(state.user.id, 40), code || api.myCode()]);
  } catch (e) { /* 보이는 만큼 */ }
  if (code && state.profile) state.profile.code = code;
  const byId = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const me = state.user.id;
  const fmt = (d) => new Date(d).toLocaleString(lang() === 'ko' ? 'ko-KR' : 'en-GB', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  // 사람별 대화 (오래된 것 → 최근)
  const tmap = {};
  letters.slice().reverse().forEach((l) => {
    const other = l.from_id === me ? l.to_id : l.from_id;
    if (!other) return;
    (tmap[other] = tmap[other] || { id: other, name: (byId[other] && byId[other].name) || '?', contact: byId[other], msgs: [] }).msgs.push(l);
  });
  const threads = Object.values(tmap).sort((x, y) => new Date(y.msgs[y.msgs.length - 1].created_at) - new Date(x.msgs[x.msgs.length - 1].created_at));
  const allLetters = letters;
  function bubble(l) {
    const mine = l.from_id === me;
    const i = allLetters.indexOf(l);
    return `<div class="chat ${mine ? 'me' : 'them'}">
      <div class="chat-meta">${mine ? t.me : esc((byId[l.from_id] && byId[l.from_id].name) || '?')} · ${fmt(l.created_at)}</div>
      <div class="chat-body" lang="en">${esc(l.body)}</div>
      <button class="ghost hear-btn" type="button" data-i="${i}">${ICON.sound} ${t.listen}</button>
    </div>`;
  }
  const addForm = `<form id="addForm" class="form" novalidate>
      <p class="muted">${t.addHelp}</p>
      <label for="code">${t.codeLabel}</label>
      <input id="code" class="code" type="text" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="AB12CD">
      <p class="msg" id="msg" role="alert">${esc(msg)}</p>
      <button class="big primary" id="addBtn" type="submit">${t.add}</button>
    </form>`;
  mount(`<section class="screen scroll mailbox" lang="${lang()}">
    <div class="bar">
      <button class="ghost" id="quit" type="button">${t.back}</button>
      <div class="step-label">${t.mailbox}</div>
    </div>
    <h1>${t.who}</h1>
    ${contacts.length
      ? `<div class="stack">${contacts.map((c, i) => `<button class="big primary contact-btn" type="button" data-i="${i}">✉️ ${esc(t.sendTo(c.name || '?'))}</button>`).join('')}</div>
         <details class="add-more" ${msg ? 'open' : ''}><summary>${t.addTitle}</summary>${addForm}</details>`
      : `<p class="muted">${t.noContacts}</p><div class="panel"><h2>${t.addTitle}</h2>${addForm}</div>`}

    <h2 class="list-title">${t.history}</h2>
    <div class="threads">${threads.length ? threads.map((th, ti) => {
      const last = th.msgs[th.msgs.length - 1];
      const prev = th.msgs[th.msgs.length - 2];
      const shown = last.from_id === me && prev && prev.from_id !== me ? [prev, last] : [last];
      const more = th.msgs.length - shown.length;
      return `<div class="thread">
        <div class="thread-head"><b>${esc(th.name)}</b>${last.from_id !== me ? (last.handled_at ? '' : ` <span class="count-pill">${t.newMark}</span>`) : ` <span class="muted">· ${esc(t.waiting)}</span>`}</div>
        ${shown.map((l) => bubble(l)).join('')}
        <div class="row">
          ${last.from_id !== me && th.contact ? `<button class="big primary thread-reply" type="button" data-t="${ti}">${t.reply}</button>` : ''}
          ${more > 0 ? `<button class="big plain thread-all" type="button" data-t="${ti}">${t.seeAll} (${th.msgs.length})</button>` : ''}
        </div>
      </div>`;
    }).join('') : `<p class="muted">${t.noLetters}</p>`}</div>

    ${code ? `<div class="panel"><p class="label">${t.myCode}</p><p class="family-code">${esc(code)}</p><p class="muted">${t.myCodeHelp}</p></div>` : ''}
  </section>`);
  on('quit', home);
  document.querySelectorAll('.contact-btn').forEach((b) => b.addEventListener('click', () => pickTopic(contacts[Number(b.dataset.i)])));
  const bindHear = (root) => root.querySelectorAll('.hear-btn').forEach((b) => b.addEventListener('click', () => speak(letters[Number(b.dataset.i)].body, { rate: 0.85, button: b })));
  bindHear(document);
  document.querySelectorAll('.thread-reply').forEach((b) => b.addEventListener('click', () => {
    const th = threads[Number(b.dataset.t)];
    writeMessage(th.contact, 'reply', th.msgs[th.msgs.length - 1]);
  }));
  // 전체 대화: 화면 전체를 덮는 창에서 위아래로 넘겨 보기
  document.querySelectorAll('.thread-all').forEach((b) => b.addEventListener('click', () => {
    const th = threads[Number(b.dataset.t)];
    const last = th.msgs[th.msgs.length - 1];
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.innerHTML = `<div class="sheet-inner" lang="${lang()}">
      <div class="bar"><b class="sheet-title">${esc(th.name)}</b><button class="ghost" id="sheetClose" type="button">${t.close}</button></div>
      <div class="sheet-list">${th.msgs.map((l) => bubble(l)).join('')}</div>
      ${last.from_id !== me && th.contact ? `<button class="big primary" id="sheetReply" type="button">${t.reply}</button>` : ''}
    </div>`;
    document.body.appendChild(sheet);
    document.body.classList.add('sheet-open');
    bindHear(sheet);
    const close = () => { sheet.remove(); document.body.classList.remove('sheet-open'); };
    sheet.querySelector('#sheetClose').addEventListener('click', close);
    const r = sheet.querySelector('#sheetReply');
    if (r) r.addEventListener('click', () => { close(); writeMessage(th.contact, 'reply', last); });
    const list = sheet.querySelector('.sheet-list');
    list.scrollTop = list.scrollHeight;
    sheet.querySelector('#sheetClose').focus();
  }));
  $('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = $('code').value.trim().toUpperCase();
    if (c.length !== 6) { $('msg').textContent = t.needSix; return; }
    $('addBtn').disabled = true;
    try {
      const who = await api.addContact(c);
      if (!who) { $('addBtn').disabled = false; $('msg').textContent = t.notFound; return; }
      pickTopic(who);
    } catch (err) {
      $('addBtn').disabled = false;
      $('msg').textContent = err.message === 'too_many_tries' ? t.tooMany : t.sendFail;
    }
  });
}

// 2. 무엇을 쓸지 ----------------------------------------------------------------------
function pickTopic(to) {
  const t = T[lang()];
  mount(`<section class="screen fit" lang="${lang()}">
    <div class="bar">
      <button class="ghost" id="quit" type="button">${t.back}</button>
    </div>
    <div class="emma-row">${avatar('sm')}<div class="bubble"><p class="ko-line">${esc(t.what(to.name || ''))}</p></div></div>
    <div class="stack topics">${t.topics.map(([id, icon, label]) => `<button class="big plain topic-btn" type="button" data-id="${id}"><span aria-hidden="true">${icon}</span> ${esc(label)}</button>`).join('')}</div>
  </section>`);
  on('quit', () => pickRecipient());
  document.querySelectorAll('.topic-btn').forEach((b) => b.addEventListener('click', () => writeMessage(to, b.dataset.id, null)));
}

// 3. 클라우디아와 한 줄씩 쓰기 ---------------------------------------------------------------
async function writeMessage(to, topic, replyTo) {
  const t = T[lang()];
  const p = state.profile;
  const writerRole = p.role === 'friend' ? 'friend' : 'learner';
  const base = {
    writer_role: writerRole, level: p.level, reader_level: (to && to.level) || 1,
    from_name: p.name, to_name: to.name, topic, reply_to: replyTo ? replyTo.body : '',
  };
  loading(replyTo ? t.readingLetter : t.preparing);
  let plan = null;
  try {
    let notes = [];
    if (writerRole === 'learner') { try { notes = await api.recentNotes(10); } catch (e) { /* 없이 */ } }
    plan = await api.ai('compose', { ...base, mode: 'plan', notes });
  } catch (e) { /* 예시 없이 말로만 */ }
  const points = plan && Array.isArray(plan.points) ? plan.points.filter((x) => x && x.ko).slice(0, 3) : [];
  let point = null;     // 답장할 때 고른 부분
  const lines = [];     // [{en, ko, step}]
  let si = 0;

  function optionsFor(step) {
    if (step === 'body' && point && Array.isArray(point.body)) return point.body.filter((x) => x && x.en).slice(0, 3);
    return (plan && Array.isArray(plan[step]) ? plan[step] : []).filter((x) => x && x.en).slice(0, 3);
  }
  // 클라우디아가 하는 말 (답장일 때는 편지를 기억하고 어느 부분에 답할지 물어봐요)
  function klaudiaLine(step) {
    if (step === 'body' && replyTo) {
      if (point) return t.answerPoint(point.ko);
      return t.whichPart(to.name || '');
    }
    return t.say[step];
  }
  function letterBox() {
    if (!replyTo) return '';
    const ko = plan && plan.letter_ko;
    return `<details class="orig-letter" ${STEPS[si] === 'body' && !point ? 'open' : ''}>
      <summary>${esc(t.theirLetter(to.name || ''))}</summary>
      <p class="en" lang="en">${esc(replyTo.body)}</p>${ko ? `<p class="muted">${esc(ko)}</p>` : ''}
    </details>`;
  }
  function frame(inner, { compact = false, noDraft = false } = {}) {
    const step = STEPS[si];
    mount(`<section class="screen fit compose ${compact ? 'compact' : ''}" lang="${lang()}">
      <div class="bar">
        <button class="ghost" id="quit" type="button">${t.exit}</button>
        <div class="step-label">${si + 1}/3 · ${t.steps[step]}</div>
      </div>
      <div class="progress" aria-hidden="true"><span style="width:${Math.round((si / 3) * 100)}%"></span></div>
      ${compact ? '' : `<div class="emma-row">${avatar('sm')}<div class="bubble" id="bubble"><p class="ko-line">${klaudiaLine(step)}</p></div></div>`}
      ${compact ? '' : letterBox()}
      ${noDraft ? '' : `<div class="draft-box" id="draftBox">
        <p class="label">${t.draft}${lines.length ? ` <button class="link-btn small" id="undo" type="button">${t.undo}</button>` : ''}</p>
        ${lines.length ? `<p class="en" lang="en">${esc(lines.map((x) => x.en).join(' '))}</p>` : `<p class="muted">${t.draftEmpty}</p>`}
      </div>`}
      ${inner}
    </section>`);
    on('quit', home);
    on('undo', () => { const last = lines.pop(); if (last) { si = last.step; if (STEPS[si] === 'body') point = null; } stepScreen(); });
  }

  async function speakNow(step, opts) {
    const said = await hear($('mic'), $('hint'), { listening: t.listening, lang: 'auto', silenceMs: 2200 });
    if (!said || !said[0] || !$('hint')) return;
    $('hint').textContent = t.converting;
    try {
      const r = await api.ai('compose', { ...base, mode: 'voice', step, said: said[0], point: point ? point.ko : '', draft: lines.map((x) => x.en) });
      if (!r || !r.en) throw new Error('empty');
      compareScreen({ en: r.en, ko: r.ko || '', said: said[0] });
    } catch (e) {
      if ($('hint')) $('hint').textContent = t.convertFail;
    }
  }

  // 답장: 편지의 어느 부분에 답할지 고르기
  function pointScreen() {
    frame(`<p class="hint" id="hint" aria-live="polite"></p>
      <div class="stack bottom points">${points.map((x, i) => `<button class="big plain point-btn" type="button" data-i="${i}">${esc(x.ko)}</button>`).join('')}
        <button class="link-btn" id="ownWay" type="button">${t.ownWay}</button></div>`, { noDraft: true });
    document.querySelectorAll('.point-btn').forEach((b) => b.addEventListener('click', () => { point = points[Number(b.dataset.i)]; stepScreen(); }));
    on('ownWay', () => { point = { ko: t.ownPoint, body: plan && plan.body }; stepScreen(); });
  }

  function stepScreen() {
    const step = STEPS[si];
    if (step === 'body' && replyTo && !point && points.length) return pointScreen();
    const options = optionsFor(step);
    frame(`<p class="hint" id="hint" aria-live="polite">${esc(plan ? '' : t.planFail)}</p>
      <div class="sugg-list bottom" id="opts"></div>
      <div class="compose-dock">
        ${step === 'body' ? '<span></span>' : `<button class="round-ghost" id="skip" type="button">${t.skip}</button>`}
        ${canListen ? `<button class="mic-round" id="mic" type="button" aria-label="${t.mic}">${ICON.mic}<span>${t.mic}</span></button>` : '<span></span>'}
        <span></span>
      </div>`);
    on('skip', () => next());
    if (options.length) {
      carousel($('opts'), options, {
        action: t.pick,
        onListen: (x) => speak(x.en, { rate: 0.85 }),
        onPick: (x) => { lines.push({ en: x.en, ko: x.ko || '', step: si }); next(); },
      });
    }
    on('mic', () => speakNow(step));
  }

  // 말한 뒤: 내가 한 말 ↔ 클라우디아가 고친 문장. 버튼은 화면 맨 아래에 항상 보이게.
  function compareScreen(x) {
    const step = STEPS[si];
    const korean = hasHangul(x.said);
    const d = korean ? { mine: esc(x.said), fixed: esc(x.en), changed: true } : wordDiff(x.said, x.en);
    frame(`<div class="compare" id="compare">
        <p class="label">${t.mine}</p>
        <p class="mine-line" ${korean ? '' : 'lang="en"'}>${d.mine}</p>
        <p class="label">${t.fixed}</p>
        <p class="fixed-line" lang="en">${d.fixed}</p>
        ${x.ko ? `<p class="muted">${esc(x.ko)}</p>` : ''}
        ${!d.changed ? `<p class="praise">${t.same}</p>` : ''}
      </div>
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="compare-actions">
        <button class="mic plain mid" id="mic" type="button">${ICON.mic} ${t.sayAgain}</button>
        <button class="primary mid" id="useFixed" type="button">${t.useFixed}</button>
      </div>
      ${optionsFor(step).length ? `<button class="link-btn small" id="examples" type="button">${t.seeExamples}</button>` : ''}`, { compact: true });
    on('useFixed', () => { lines.push({ en: x.en, ko: x.ko || '', step: si }); next(); });
    on('examples', () => stepScreen());
    on('mic', () => speakNow(step));
  }

  function next() {
    clearSpotlight();
    si++;
    if (si >= STEPS.length) return review(to, lines, replyTo);
    stepScreen();
  }
  stepScreen();
}

// 4. 고치고 보내기 ---------------------------------------------------------------------
function review(to, lines, replyTo) {
  const t = T[lang()];
  const learner = lang() === 'ko';
  mount(`<section class="screen fit" lang="${lang()}">
    <div class="bar">
      <button class="ghost" id="quit" type="button">${t.exit}</button>
      <div class="step-label">→ ${esc(to.name || '')}</div>
    </div>
    <h2>${t.reviewTitle}</h2>
    <p class="muted">${t.reviewHelp}</p>
    <textarea id="body" rows="5" lang="en" class="review-text" autocapitalize="sentences">${esc(lines.map((x) => x.en).join(' '))}</textarea>
    ${learner && lines.some((x) => x.ko) ? `<p class="meaning"><span class="label">${t.meaning}</span> ${esc(lines.map((x) => x.ko).filter(Boolean).join(' '))}</p>` : ''}
    <div class="row">
      <button class="plain mid" id="play" type="button">${ICON.sound} ${t.listen}</button>
      <button class="plain mid" id="again" type="button">${t.restart}</button>
    </div>
    <p class="msg" id="msg" role="alert"></p>
    <button class="big primary bottom" id="send" type="button">${t.send}</button>
  </section>`);
  on('quit', home);
  on('play', () => speak($('body').value, { rate: 0.85, button: $('play') }));
  on('again', () => pickTopic(to));
  on('send', async () => {
    const body = $('body').value.replace(/\s+/g, ' ').trim().slice(0, 2000);
    if (!body) { $('msg').textContent = t.empty; return; }
    $('send').disabled = true;
    $('msg').textContent = t.sending;
    try {
      await api.sendLetter({ to_id: to.id, body, reply_to: replyTo ? replyTo.id : null });
      api.markAllFrom(state.user.id, to.id).catch(() => {});
      if (learner) api.addEntry({ kind: 'letter', prompt_en: replyTo ? replyTo.body : null, answer_en: body, answer_ko: lines.map((x) => x.ko).filter(Boolean).join(' ') }).catch(() => {});
      mount(`<section class="screen center" lang="${lang()}">
        <div class="big-emoji" aria-hidden="true">✉️</div>
        <h1>${t.sent}</h1>
        <p class="lead">${esc(t.sentHelp(to.name || ''))}</p>
        <button class="big primary" id="done" type="button">${t.home}</button>
      </section>`);
      on('done', home);
    } catch (e) {
      $('send').disabled = false;
      $('msg').textContent = t.sendFail;
    }
  });
}
