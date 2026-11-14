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
    pick: '이 문장 넣기', mic: '말로 쓰기', skip: '건너뛰기', undo: '한 문장 지우기',
    draft: '지금까지 쓴 글', draftEmpty: '아직 비어 있어요',
    listening: '듣고 있어요… 한국어로 말해도 돼요', converting: '영어로 바꾸고 있어요…',
    converted: '이렇게 바꿨어요. 마음에 들면 "이 문장 넣기"를 누르세요.',
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
    converted: 'Here it is in simple English. Tap "Use this line" if you like it.',
    convertFail: 'That did not work. Please try again.',
    reviewTitle: 'Ready to send', reviewHelp: 'Tap the text to edit it.', meaning: 'Meaning',
    listen: 'Listen', restart: 'Start over', send: 'Send', sending: 'Sending…',
    sendFail: 'Could not send. Please check your connection.', empty: 'The message is empty.',
    sent: 'Sent!', sentHelp: (n) => `${n} will see it next time they open the app.`, home: 'Done',
    planFail: 'Could not get suggestions. Tap the mic and say it; Klaudia will write it in English.',
  },
};
const STEPS = ['greet', 'body', 'close'];

register('message', (opts) => start(opts || {}));

function lang() { return state.profile && state.profile.role === 'friend' ? 'en' : 'ko'; }
function home() { go(state.profile && state.profile.role === 'friend' ? 'friend' : 'home'); }

async function start({ to = null, topic = null, replyTo = null } = {}) {
  if (!to) return pickRecipient();
  if (!topic) return pickTopic(to);
  return writeMessage(to, topic, replyTo);
}

// 1. 받는 사람 -----------------------------------------------------------------------
async function pickRecipient(msg = '') {
  const t = T[lang()];
  loading('…');
  let contacts = [], code = state.profile.code || '';
  try { [contacts, code] = await Promise.all([api.myContacts(), code || api.myCode()]); } catch (e) { /* 아래에서 안내 */ }
  if (code && state.profile) state.profile.code = code;
  mount(`<section class="screen scroll" lang="${lang()}">
    <div class="bar">
      <button class="ghost" id="quit" type="button">${t.back}</button>
    </div>
    <h1>${t.who}</h1>
    <div class="stack" id="contacts">${contacts.length
      ? contacts.map((c, i) => `<button class="big plain contact-btn" type="button" data-i="${i}">${esc(c.name || '?')}</button>`).join('')
      : `<p class="muted">${t.noContacts}</p>`}</div>
    <form id="addForm" class="form panel" novalidate>
      <h2>${t.addTitle}</h2>
      <p class="muted">${t.addHelp}</p>
      <label for="code">${t.codeLabel}</label>
      <input id="code" class="code" type="text" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="AB12CD">
      <p class="msg" id="msg" role="alert">${esc(msg)}</p>
      <button class="big primary" id="addBtn" type="submit">${t.add}</button>
    </form>
    ${code ? `<div class="panel"><p class="label">${t.myCode}</p><p class="family-code">${esc(code)}</p><p class="muted">${t.myCodeHelp}</p></div>` : ''}
  </section>`);
  on('quit', home);
  document.querySelectorAll('.contact-btn').forEach((b) => b.addEventListener('click', () => pickTopic(contacts[Number(b.dataset.i)])));
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
    writer_role: writerRole, level: p.level, reader_level: to.level || 1,
    from_name: p.name, to_name: to.name, topic, reply_to: replyTo ? replyTo.body : '',
  };
  loading(t.preparing);
  let plan = null;
  try {
    let notes = [];
    if (writerRole === 'learner') { try { notes = await api.recentNotes(10); } catch (e) { /* 없이 */ } }
    plan = await api.ai('compose', { ...base, mode: 'plan', notes });
  } catch (e) { /* 예시 없이 말로만 */ }
  const lines = []; // [{en, ko}]
  let si = 0;

  function stepScreen(extra = null, note = '') {
    const step = STEPS[si];
    const options = [...(extra ? [extra] : []), ...((plan && Array.isArray(plan[step]) ? plan[step] : []).filter((x) => x && x.en))].slice(0, 4);
    mount(`<section class="screen fit compose" lang="${lang()}">
      <div class="bar">
        <button class="ghost" id="quit" type="button">${t.exit}</button>
        <div class="step-label">${si + 1}/3 · ${t.steps[step]}</div>
      </div>
      <div class="progress" aria-hidden="true"><span style="width:${Math.round((si / 3) * 100)}%"></span></div>
      <div class="emma-row">${avatar('sm')}<div class="bubble" id="bubble"><p class="ko-line">${t.say[step]}</p></div></div>
      <div class="draft-box" id="draftBox">
        <p class="label">${t.draft}${lines.length ? ` <button class="link-btn small" id="undo" type="button">${t.undo}</button>` : ''}</p>
        ${lines.length ? `<p class="en" lang="en">${esc(lines.map((x) => x.en).join(' '))}</p>` : `<p class="muted">${t.draftEmpty}</p>`}
      </div>
      <p class="hint" id="hint" aria-live="polite">${esc(note || (plan ? '' : t.planFail))}</p>
      <div class="sugg-list bottom" id="opts"></div>
      <div class="compose-dock">
        ${step === 'body' ? '<span></span>' : `<button class="round-ghost" id="skip" type="button">${t.skip}</button>`}
        ${canListen ? `<button class="mic-round" id="mic" type="button" aria-label="${t.mic}">${ICON.mic}<span>${t.mic}</span></button>` : '<span></span>'}
        <span></span>
      </div>
    </section>`);
    on('quit', home);
    on('undo', () => { const last = lines.pop(); if (last) si = last.step; stepScreen(); });
    on('skip', () => next());
    if (options.length) {
      carousel($('opts'), options, {
        action: t.pick,
        onListen: (x) => speak(x.en, { rate: 0.85 }),
        onPick: (x) => { lines.push({ en: x.en, ko: x.ko || '', step: si }); next(); },
      });
    }
    on('mic', async () => {
      const said = await hear($('mic'), $('hint'), { listening: t.listening, lang: 'auto', silenceMs: 2200 });
      if (!said || !said[0] || !$('hint')) return;
      $('hint').textContent = t.converting;
      try {
        const r = await api.ai('compose', { ...base, mode: 'voice', step, said: said[0], draft: lines.map((x) => x.en) });
        if (!r || !r.en) throw new Error('empty');
        stepScreen({ en: r.en, ko: r.ko || '' }, t.converted);
        spotlight($('opts'), $('hint'));
      } catch (e) {
        if ($('hint')) $('hint').textContent = t.convertFail;
      }
    });
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
      if (replyTo && replyTo.to_id === state.user.id) api.markLetter(replyTo.id).catch(() => {});
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
