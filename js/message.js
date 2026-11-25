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
    steps: { greet: '인사', body: '하고 싶은 말', ask: '질문하기', close: '끝인사' },
    say: {
      greet: '먼저 인사부터 해 볼까요?<br>아래에서 고르거나, 마이크를 누르고 말씀해 주세요. <b>한국어로 말해도 영어로 바꿔 드려요.</b>',
      body: '이제 하고 싶은 말을 한 문장으로 해 볼까요?',
      ask: '',
      close: '마지막으로 끝인사를 해요.',
    },
    pick: '이 문장 사용하기', mic: '말하기', skip: '건너뛰기', undo: '한 문장 지우기', prevStep: '이전 단계',
    freeGo: '편지를 한 번에 말로 써 보세요', freeLabel: '한 번에 말하기',
    freeSay: (n) => `${n}님에게 하고 싶은 말을 <b>한 번에 쭉</b> 말해 주세요. 클라우디아가 들은 내용을 다듬어 편지로 보여 드려요. <b>한국어로 말해도 영어로 바꿔 드려요.</b>`,
    freeWorking: '클라우디아가 편지로 다듬고 있어요…', freeTitle: '클라우디아가 다듬은 편지', freeAgain: '다시 말하기', freeUse: '이대로 쓰기',
    freeFail: '편지로 다듬지 못했어요. 다시 말해 주세요.',
    draft: '지금까지 쓴 글', draftEmpty: '아직 비어 있어요',
    listening: '듣고 있어요… 한국어로 말해도 돼요', converting: '영어로 바꾸고 있어요…',
    converted: '클라우디아가 고쳐 봤어요. 비교해 보고 골라 주세요.',
    me: '나', waiting: '답장 기다리는 중', seeAll: '전체 대화 보기', close: '닫기',
    mailbox: '편지함', sendTo: (n) => `${n}님에게 보내기`, history: '주고받은 메시지', noLetters: '아직 주고받은 메시지가 없어요.',
    toWho: (n) => `내가 ${n}님에게`, fromWho: (n) => `${n}님이 보냄`, newMark: '새 편지', reply: '답장하기',
    readingLetter: '클라우디아가 편지를 읽고 있어요…', theirLetter: (n) => `${n}님 편지 보기`,
    replyHint: (ps) => ps.length ? `<b>이런 이야기를 써 볼까요?</b><br>${ps.slice(0, 2).map((x) => '· ' + esc(x)).join('<br>')}` : '<b>편지에 대한 답을 한 문장으로 해 볼까요?</b>',
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
    steps: { greet: 'Greeting', body: 'Main message', ask: 'Ask a question', close: 'Closing' },
    say: {
      greet: "Let's start with a greeting.<br>Pick one below, or tap the mic and say it.",
      body: 'Now say what you want to tell them, in one short sentence.',
      close: 'Finally, a short goodbye.',
    },
    pick: 'Use this line', mic: 'Speak', skip: 'Skip', undo: 'Remove last line', prevStep: 'Back',
    freeGo: 'Or say the whole message at once', freeLabel: 'Whole message',
    freeSay: (n) => `Say everything you want to tell ${n} <b>in one go</b>. Klaudia will tidy it into a message for you to check.`,
    freeWorking: 'Klaudia is turning it into a message…', freeTitle: "Klaudia's message", freeAgain: 'Say it again', freeUse: 'Use this',
    freeFail: 'That did not work. Please say it again.',
    draft: 'Your message so far', draftEmpty: 'Nothing yet',
    listening: 'Listening…', converting: 'Writing it down…',
    converted: 'Klaudia tidied it up. Compare and choose.',
    me: 'You', waiting: 'waiting for a reply', seeAll: 'See all', close: 'Close',
    mailbox: 'Messages', sendTo: (n) => `Write to ${n}`, history: 'All messages', noLetters: 'No messages yet.',
    toWho: (n) => `You → ${n}`, fromWho: (n) => `From ${n}`, newMark: 'New', reply: 'Reply',
    readingLetter: 'Klaudia is reading the message…', theirLetter: (n) => `${n}'s message`,
    replyHint: (ps) => ps.length ? `<b>You could write about:</b><br>${ps.slice(0, 2).map((x) => '· ' + esc(x)).join('<br>')}` : '<b>Answer their message in one short sentence.</b>',
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
// 한국어를 배우는 사람: 화면은 영어, 편지는 한국어로
T.enk = {
  ...T.en,
  say: {
    greet: "Let's start with a greeting in Korean.<br>Pick one below, or tap the mic and say it. <b>You can say it in English; Klaudia will put it into Korean.</b>",
    body: 'Now say what you want to tell them, in one short sentence.',
    close: 'Finally, a short goodbye in Korean.',
  },
  converting: 'Putting it into Korean…',
  converted: 'Klaudia kept your words and fixed only the mistakes. Compare and choose.',
  planFail: 'Could not get suggestions. Tap the mic and say it; Klaudia will write it in Korean.',
  freeSay: (n) => `Say everything you want to tell ${n} <b>in one go</b>. <b>English is fine</b>: Klaudia will turn it into a short Korean message for you to check.`,
  freeWorking: 'Klaudia is writing it in Korean…',
  replyHint: (ps) => ps.length ? `<b>You could answer:</b><br>${ps.slice(0, 2).map((x) => '· ' + esc(x)).join('<br>')}` : '<b>Answer their message in one short Korean sentence.</b>',
};
const tt = () => (writesKorean() ? T.enk : T[lang()]);
const STEPS = ['greet', 'body', 'close'];

// 낱말 비교: 내가 한 말에서 빠지거나 바뀐 낱말은 줄을 긋고, 클라우디아 문장에서 새로 들어간 낱말은 색을 칠합니다.
const norm = (w) => w.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9'\uAC00-\uD7A3]/g, '');
export function wordDiff(a, b) {
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
export const hasHangul = (x) => /[\u3131-\uD79D]/.test(String(x || ''));

// 받은 편지: 내가 배우는 언어 번역이 먼저, 스위치를 누르면 상대가 쓴 원문 ---------------------
const learnLang = () => (state.profile && state.profile.learn_lang) || 'en';
function translated(l) {
  const me = state.user && state.user.id;
  const learn = learnLang();
  return l && l.to_id === me && l.translation && l.translation_lang === learn && api.letterLang(l.body) !== learn;
}
// 먼저 보여 줄 글 (읽어 줄 때도 이 글을 읽어요)
export function readable(l) { return translated(l) ? l.translation : (l && l.body) || ''; }
export function letterBody(l, cls = '') {
  if (!translated(l)) return `<p class="${cls}" lang="${api.letterLang(l.body)}">${esc(l.body)}</p>`;
  const learn = learnLang();
  const L = learn === 'ko' ? { a: 'Show original', b: 'Show Korean' } : { a: '원문 보기', b: '영어로 보기' };
  return `<div class="tr-wrap">
    <p class="${cls} tr-first" lang="${learn}">${esc(l.translation)}</p>
    <p class="${cls} tr-orig" lang="${api.letterLang(l.body)}" hidden>${esc(l.body)}</p>
    <button class="tr-toggle" type="button" data-a="${L.a}" data-b="${L.b}" aria-pressed="false">⇄ ${L.a}</button>
  </div>`;
}
export function bindLetterToggles(root = document) {
  root.querySelectorAll('.tr-toggle').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const w = b.closest('.tr-wrap');
      const orig = w.querySelector('.tr-orig'), first = w.querySelector('.tr-first');
      const showOrig = orig.hidden;
      orig.hidden = !showOrig; first.hidden = showOrig;
      b.textContent = `⇄ ${showOrig ? b.dataset.b : b.dataset.a}`;
      b.setAttribute('aria-pressed', String(showOrig));
    });
  });
}

let origin = null; // 설정에서 열었으면 돌아갈 때 설정으로
register('message', (opts) => { origin = (opts && opts.from) || null; start(opts || {}); });

function lang() { return state.profile && (state.profile.role === 'friend' || state.profile.learn_lang === 'ko') ? 'en' : 'ko'; }
const writesKorean = () => !!(state.profile && state.profile.learn_lang === 'ko');
function home() { go(state.profile && state.profile.role === 'friend' ? 'friend' : writesKorean() ? 'ko-home' : 'home'); }

async function start({ to = null, topic = null, replyTo = null } = {}) {
  if (!to) return pickRecipient();
  if (!topic) return pickTopic(to);
  return writeMessage(to, topic, replyTo);
}

// 1. 편지함: 보낼 사람 고르기 + 주고받은 메시지 -------------------------------------------------
async function pickRecipient(msg = '') {
  const t = tt();
  loading('…');
  let contacts = [], letters = [], code = state.profile.code || '';
  try {
    [contacts, letters, code] = await Promise.all([api.myContacts(), api.myLetters(state.user.id, 40), code || api.myCode()]);
    await api.ensureTranslations(letters, state.user.id, learnLang());
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
      <div class="chat-body">${letterBody(l)}</div>
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
  // 메신저처럼: 사람마다 한 줄, 누르면 그 사람과의 대화가 열려요
  const rows = threads.concat(contacts.filter((c) => !tmap[c.id]).map((c) => ({ id: c.id, name: c.name || '?', contact: c, msgs: [] })));
  const day = (d) => {
    const x = new Date(d), now = new Date();
    return x.toDateString() === now.toDateString()
      ? x.toLocaleTimeString(lang() === 'ko' ? 'ko-KR' : 'en-GB', { hour: 'numeric', minute: '2-digit' })
      : x.toLocaleDateString(lang() === 'ko' ? 'ko-KR' : 'en-GB', { month: 'short', day: 'numeric' });
  };
  mount(`<section class="screen scroll mailbox" lang="${lang()}">
    <div class="bar">
      <button class="ghost" id="quit" type="button">${t.back}</button>
      <div class="step-label">${t.mailbox}</div>
    </div>
    ${rows.length ? `<div class="conv-list">${rows.map((th, ti) => {
      const last = th.msgs[th.msgs.length - 1];
      const fresh = last && last.from_id !== me && !last.handled_at;
      return `<button class="conv-row" type="button" data-t="${ti}">
        <span class="conv-face" aria-hidden="true">${esc(String(th.name).trim().charAt(0).toUpperCase() || '?')}</span>
        <span class="conv-main"><b>${esc(th.name)}</b>
          <span class="conv-last ${fresh ? 'fresh' : ''}" ${last ? 'lang="en"' : ''}>${last ? (last.from_id === me ? `${t.me}: ` : '') + esc(readable(last)) : esc(t.noLetters)}</span></span>
        <span class="conv-side">${last ? `<span class="conv-date">${day(last.created_at)}</span>` : ''}${fresh ? `<span class="count-pill">${t.newMark}</span>` : ''}</span>
      </button>`;
    }).join('')}</div>
    <details class="add-more" ${msg ? 'open' : ''}><summary>${t.addTitle}</summary>${addForm}</details>`
      : `<p class="muted">${t.noContacts}</p><div class="panel"><h2>${t.addTitle}</h2>${addForm}</div>`}
    ${code ? `<div class="panel"><p class="label">${t.myCode}</p><p class="family-code">${esc(code)}</p><p class="muted">${t.myCodeHelp}</p></div>` : ''}
  </section>`);
  on('quit', () => (origin === 'settings' ? go('settings') : home()));
  document.querySelectorAll('.conv-row').forEach((b) => b.addEventListener('click', () => openThread(rows[Number(b.dataset.t)])));

  // 한 사람과의 대화 화면: 대화만 위아래로 넘기고, 버튼은 아래에 고정
  function openThread(th) {
    const last = th.msgs[th.msgs.length - 1];
    const canReply = last && last.from_id !== me && th.contact;
    mount(`<section class="screen fit thread-page" lang="${lang()}">
      <div class="bar">
        <button class="ghost" id="quit" type="button">${t.back}</button>
        <div class="step-label">${esc(th.name)}</div>
      </div>
      <div class="chat-list" id="chatList">${th.msgs.length ? th.msgs.map((l) => bubble(l)).join('') : `<p class="muted">${t.noLetters}</p>`}</div>
      ${th.contact ? `<button class="big primary" id="threadGo" type="button">✉️ ${canReply ? t.reply : esc(t.sendTo(th.name))}</button>` : ''}
    </section>`);
    on('quit', () => pickRecipient());
    document.querySelectorAll('.hear-btn').forEach((b) => b.addEventListener('click', () => speak(readable(letters[Number(b.dataset.i)]), { rate: 0.85, button: b })));
    on('threadGo', () => (canReply ? writeMessage(th.contact, 'reply', last) : pickTopic(th.contact)));
    bindLetterToggles($('chatList'));
    const list = $('chatList');
    list.scrollTop = list.scrollHeight;
  }
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
  const t = tt();
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
  const t = tt();
  const p = state.profile;
  const writerRole = p.role === 'friend' ? 'friend' : 'learner';
  const base = {
    writer_role: writerRole, level: p.level, reader_level: (to && to.level) || 1,
    from_name: p.name, to_name: to.name, topic, reply_to: replyTo ? replyTo.body : '',
    write_lang: writesKorean() ? 'ko' : 'en',
  };
  loading(replyTo ? t.readingLetter : t.preparing);
  let plan = null;
  try {
    let notes = [];
    if (writerRole === 'learner') { try { notes = await api.recentNotes(10); } catch (e) { /* 없이 */ } }
    plan = await api.ai('compose', { ...base, mode: 'plan', notes });
  } catch (e) { /* 예시 없이 말로만 */ }
  const points = plan && Array.isArray(plan.points) ? plan.points.filter((x) => x && x.ko).slice(0, 3) : [];
  const lines = [];     // [{en, ko, step}]
  let si = 0;
  // 답장에서는 레슨과 똑같이 상대에게 하나 물어보는 단계가 있어요 (영어를 배우는 사람, 내 태그에 맞는 질문들)
  const okq = (x) => x && typeof x.en === 'string' && x.en.trim();
  const asks = replyTo && (lang() === 'ko' || writesKorean()) && plan && Array.isArray(plan.ask)
    ? plan.ask.filter(okq).slice(0, 5).map((q) => ({ en: q.en.trim(), ko: `${q.label ? `[${String(q.label).trim()}] ` : ''}${q.ko || ''}`, plainKo: q.ko || '' })) : [];
  const FLOW = asks.length ? ['greet', 'body', 'ask', 'close'] : STEPS;

  function optionsFor(step) {
    const ok = (x) => x && x.en;
    if (step === 'ask') return asks;
    if (step === 'body' && points.length) {
      const fromPoints = points.map((p0) => (Array.isArray(p0.body) ? p0.body.find(ok) : null)).filter(Boolean);
      const rest = (plan && Array.isArray(plan.body) ? plan.body : []).filter(ok);
      return [...fromPoints, ...rest].slice(0, 4);
    }
    return (plan && Array.isArray(plan[step]) ? plan[step] : []).filter(ok).slice(0, 3);
  }
  // 클라우디아가 하는 말 (답장일 때는 편지를 기억하고 어느 부분에 답할지 물어봐요)
  function klaudiaLine(step) {
    if (step === 'ask') return writesKorean()
      ? `Now ask ${esc(to.name || 'them')} one question in Korean. <b>What would you like to ask?</b> You can say it in English.`
      : `이번에는 ${esc(to.name || '')}님에게 궁금한 것을 하나 물어봐요. <b>뭐라고 물어볼까요?</b>`;
    if (step === 'body' && replyTo) return t.replyHint(lang() === 'ko' || writesKorean() ? points.map((x) => x.ko) : []);
    return t.say[step];
  }
  function letterLink() {
    if (!replyTo) return '';
    return `<button class="letter-link" id="seeLetter" type="button">${esc(t.theirLetter(to.name || ''))} <span aria-hidden="true">▾</span></button>`;
  }
  function openLetter() {
    const ko = plan && plan.letter_ko;
    const pop = document.createElement('div');
    pop.className = 'sheet letter-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    pop.innerHTML = `<div class="sheet-inner" lang="${lang()}">
      <div class="bar"><b class="sheet-title">${esc(t.theirLetter(to.name || ''))}</b><button class="ghost" id="letterClose" type="button">${t.close}</button></div>
      <div class="sheet-list">
        ${letterBody(replyTo, 'en big-letter')}
        ${ko && lang() === 'ko' && api.letterLang(replyTo.body) === 'en' ? `<p class="muted big-letter-ko">${esc(ko)}</p>` : ''}
        <button class="ghost" id="letterHear" type="button">${ICON.sound} ${t.listen}</button>
      </div>
    </div>`;
    document.body.appendChild(pop);
    document.body.classList.add('sheet-open');
    const close = () => { pop.remove(); document.body.classList.remove('sheet-open'); };
    pop.querySelector('#letterClose').addEventListener('click', close);
    pop.querySelector('#letterHear').addEventListener('click', (e) => speak(readable(replyTo), { rate: 0.85, button: e.currentTarget }));
    bindLetterToggles(pop);
    pop.querySelector('#letterClose').focus();
  }
  function frame(inner, { compact = false, noDraft = false } = {}) {
    const step = FLOW[si];
    mount(`<section class="screen fit compose ${compact ? 'compact' : ''}" lang="${lang()}">
      <div class="bar">
        <button class="ghost" id="quit" type="button">${t.exit}</button>
        <div class="step-label">${si + 1}/${FLOW.length} · ${t.steps[step]}</div>
      </div>
      <div class="progress" aria-hidden="true"><span style="width:${Math.round((si / FLOW.length) * 100)}%"></span></div>
      ${letterLink()}
      ${compact ? '' : `<div class="emma-row">${avatar('sm')}<div class="bubble" id="bubble"><p class="ko-line">${klaudiaLine(step)}</p></div></div>`}
      ${noDraft ? '' : `<div class="draft-box" id="draftBox">
        <p class="label">${t.draft}${lines.length ? ` <button class="link-btn small" id="undo" type="button">${t.undo}</button>` : ''}</p>
        ${lines.length ? `<p class="en" lang="en">${esc(lines.map((x) => x.en).join(' '))}</p>` : `<p class="muted">${t.draftEmpty}</p>
          ${canListen ? `<button class="link-btn free-go" id="freeGo" type="button">${t.freeGo} <span class="free-ico">${ICON.mic}</span> ›</button>` : ''}`}
      </div>`}
      ${inner}
    </section>`);
    on('quit', home);
    on('seeLetter', openLetter);
    on('undo', () => { const last = lines.pop(); if (last) si = last.step; stepScreen(); });
    on('freeGo', () => freeTalk());
  }

  // 단계 없이 한 번에: 쭉 말하면 클라우디아가 다듬어 편지로 → 미리보기 → 고치고 보내기
  function freeTalk() {
    clearSpotlight();
    mount(`<section class="screen fit compose" lang="${lang()}">
      <div class="bar">
        <button class="ghost" id="back" type="button">${t.back}</button>
        <div class="step-label">${esc(t.freeLabel)}</div>
      </div>
      ${letterLink()}
      <div class="emma-row">${avatar('sm')}<div class="bubble"><p class="ko-line">${t.freeSay(esc(to.name || ''))}</p></div></div>
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="compose-dock bottom"><span></span>
        <button class="mic-round" id="mic" type="button" aria-label="${t.mic}">${ICON.mic}<span>${t.mic}</span></button>
      <span></span></div>
    </section>`);
    on('back', () => stepScreen());
    on('seeLetter', openLetter);
    on('mic', async () => {
      const said = await hear($('mic'), $('hint'), { listening: t.listening, lang: 'auto', silenceMs: 3500, maxMs: 90000 });
      if (!said || !said[0] || !$('hint')) return;
      $('hint').textContent = t.freeWorking;
      $('mic').disabled = true;
      try {
        const r = await api.ai('compose', { ...base, mode: 'free', said: said[0] });
        if (!r || !r.en) throw new Error('empty');
        freePreview({ en: r.en, ko: r.ko || '', roman: r.roman || '', said: said[0] });
      } catch (e) {
        if ($('hint')) { $('hint').textContent = t.freeFail; $('mic').disabled = false; }
      }
    });
  }
  function freePreview(x) {
    const sameLang = hasHangul(x.said) === hasHangul(x.en);
    const d = sameLang ? wordDiff(x.said, x.en) : { mine: esc(x.said), fixed: esc(x.en), changed: true };
    mount(`<section class="screen fit compose" lang="${lang()}">
      <div class="bar">
        <button class="ghost" id="quit" type="button">${t.exit}</button>
        <div class="step-label">${esc(t.freeTitle)}</div>
      </div>
      <div class="compare free-compare" id="compare">
        <p class="label">${t.mine}</p>
        <p class="mine-line">${d.mine}</p>
        <p class="label">${t.freeTitle}</p>
        <p class="fixed-line" lang="en">${d.fixed}</p>
        ${writesKorean() && hasHangul(x.en) ? `<button class="ghost small-listen how-read" id="howRead" type="button">${ICON.sound} How to read it</button>
          <p class="say roman-line hidden" id="romanRead">${esc(x.roman || '')}</p>` : `<button class="ghost small-listen" id="howRead" type="button">${ICON.sound} ${t.listen}</button>`}
        ${x.ko ? `<p class="label">${t.meaning}</p><p class="muted">${esc(x.ko)}</p>` : ''}
      </div>
      <div class="compare-actions">
        <button class="mic plain mid" id="again" type="button">${ICON.mic} ${t.freeAgain}</button>
        <button class="primary mid" id="useFree" type="button">${t.freeUse}</button>
      </div>
    </section>`);
    on('quit', home);
    on('howRead', () => { speak(x.en, { rate: 0.8, button: $('howRead') }); if ($('romanRead') && x.roman) $('romanRead').classList.remove('hidden'); });
    on('again', () => freeTalk());
    on('useFree', () => review(to, [{ en: x.en, ko: x.ko || '', step: 0 }], replyTo, voiceFix));
  }

  async function speakNow(step, opts) {
    const said = await hear($('mic'), $('hint'), { listening: t.listening, lang: 'auto', silenceMs: 2200 });
    if (!said || !said[0] || !$('hint')) return;
    $('hint').textContent = t.converting;
    try {
      const r = await api.ai('compose', { ...base, mode: 'voice', step: step === 'ask' ? 'body' : step, said: said[0], draft: lines.map((x) => x.en) });
      if (!r || !r.en) throw new Error('empty');
      compareScreen({ en: r.en, ko: r.ko || '', roman: r.roman || '', said: said[0] });
    } catch (e) {
      if ($('hint')) $('hint').textContent = t.convertFail;
    }
  }

  function stepScreen() {
    const step = FLOW[si];
    const options = optionsFor(step);
    frame(`<p class="hint" id="hint" aria-live="polite">${esc(plan ? '' : t.planFail)}</p>
      <div class="sugg-list bottom" id="opts"></div>
      <div class="compose-dock">
        ${si > 0 ? `<button class="round-ghost" id="prevStep" type="button">${t.prevStep}</button>` : '<span></span>'}
        ${canListen ? `<button class="mic-round" id="mic" type="button" aria-label="${t.mic}">${ICON.mic}<span>${t.mic}</span></button>` : '<span></span>'}
        <button class="round-ghost" id="skip" type="button">${t.skip}</button>
      </div>`);
    on('skip', () => next());
    // 이전 단계로: 그 단계에서 쓴 줄부터 다시 써요
    on('prevStep', () => { si = Math.max(0, si - 1); while (lines.length && lines[lines.length - 1].step >= si) lines.pop(); stepScreen(); });
    if (options.length) {
      carousel($('opts'), options, {
        action: t.pick,
        soft: true,   // 마이크가 주인공으로 보이게, 예시 버튼은 차분하게
        onListen: (x) => speak(x.en, { rate: 0.85 }),
        onPick: (x) => { lines.push({ en: x.en, ko: x.plainKo != null ? x.plainKo : (x.ko || ''), step: si }); next(); },
      });
    }
    on('mic', () => speakNow(step));
  }

  // 말한 뒤: 내가 한 말 ↔ 클라우디아가 고친 문장. 버튼은 화면 맨 아래에 항상 보이게.
  function compareScreen(x) {
    const step = FLOW[si];
    // 같은 언어로 말했으면 낱말 비교, 다른 언어로 말했으면(번역) 그대로 나란히
    const sameLang = hasHangul(x.said) === hasHangul(x.en);
    const korean = !sameLang;
    const d = sameLang ? wordDiff(x.said, x.en) : { mine: esc(x.said), fixed: esc(x.en), changed: true };
    frame(`<div class="compare" id="compare">
        <p class="label">${t.mine}</p>
        <p class="mine-line" ${korean ? '' : 'lang="en"'}>${d.mine}</p>
        <p class="label">${t.fixed}</p>
        <p class="fixed-line" lang="en">${d.fixed}</p>
        ${writesKorean() && hasHangul(x.en) ? `<button class="ghost small-listen how-read" id="howRead" type="button">${ICON.sound} How to read it</button>
          <p class="say roman-line hidden" id="romanRead">${esc(x.roman || '')}</p>` : ''}
        ${x.ko ? `${writesKorean() ? '<p class="label">Meaning</p>' : ''}<p class="muted">${esc(x.ko)}</p>` : ''}
        ${!d.changed ? `<p class="praise">${t.same}</p>` : ''}
      </div>
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="compare-actions">
        <button class="mic plain mid" id="mic" type="button">${ICON.mic} ${t.sayAgain}</button>
        <button class="primary mid" id="useFixed" type="button">${t.useFixed}</button>
      </div>
      ${optionsFor(step).length ? `<button class="link-btn small" id="examples" type="button">${t.seeExamples}</button>` : ''}`, { compact: true });
    // 클라우디아가 한국어로 바꿔 준 문장: 읽어 주고, 로마자로 읽는 법을 보여 줘요
    on('howRead', () => { speak(x.en, { rate: 0.75, button: $('howRead') }); if (x.roman) $('romanRead').classList.remove('hidden'); });
    on('useFixed', () => { lines.push({ en: x.en, ko: x.ko || '', step: si }); next(); });
    on('examples', () => stepScreen());
    on('mic', () => speakNow(step));
  }

  const voiceFix = (said, draft) => api.ai('compose', { ...base, mode: 'voice', step: 'body', said, draft });
  function next() {
    clearSpotlight();
    si++;
    if (si >= FLOW.length) return review(to, lines, replyTo, voiceFix);
    stepScreen();
  }
  stepScreen();
}

// 4. 고치고 보내기: 문장마다 🎤(다시 말하기) · 수정(글 고치기, 순서 바꾸기) · 삭제, 아래에 '내용 추가하기'
// (레슨 끝 답장의 요약 화면과 같은 모양이에요)
const MAX_ROWS = 5;
const SUM_T = {
  ko: { title: '이렇게 보낼게요', speak: '다시 말하기', edit: '수정', del: '삭제', up: '▲ 위로', down: '▼ 아래로', save: '저장', cancel: '취소',
    add: '＋ 내용 추가하기', full: (n) => `편지는 ${n}문장까지예요. 더 넣으려면 하나를 지워 주세요.`, empty: '비어 있어요 · 🎤를 누르거나 글로 적어 주세요',
    type: '영어로 적어 주세요', use: '이 문장 쓰기', hearAll: '전체 듣기', listening: '듣고 있어요… 한국어로 말해도 돼요',
    working: '고치고 있어요…', fail: '바꾸지 못했어요. 다시 말해 주세요.', newLine: '새 문장', heard: '들은 말', noLines: '보낼 문장이 없어요.' },
  en: { title: 'Ready to send', speak: 'Say again', edit: 'Edit', del: 'Delete', up: '▲ Up', down: '▼ Down', save: 'Save', cancel: 'Cancel',
    add: '＋ Add a line', full: (n) => `A message has up to ${n} lines. Delete one to add more.`, empty: 'Empty · tap 🎤 or type it',
    type: 'Type in English', use: 'Use this', hearAll: 'Listen', listening: 'Listening…',
    working: 'Fixing it…', fail: 'That did not work. Please say it again.', newLine: 'New line', heard: 'You said', noLines: 'There is nothing to send.' },
};
SUM_T.enk = { ...SUM_T.en, type: 'Type in Korean', listening: 'Listening… English is fine', working: 'Putting it into Korean…' };
// 한 덩어리 글을 문장으로 나눠요
function splitSentences(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?。？！])\s+/).map((x) => x.trim()).filter(Boolean);
}
function review(to, lines, replyTo, voice = null) {
  const t = tt();
  const st = writesKorean() ? SUM_T.enk : SUM_T[lang()];
  const learner = lang() === 'ko';
  // 줄 만들기: 한 번에 말한 편지는 문장별로 나눠요 (뜻도 문장 수가 같으면 함께 나눠요)
  const rows = [];
  for (const x of lines) {
    const ens = splitSentences(x.en);
    const kos = splitSentences(x.ko);
    ens.forEach((en, i) => rows.push({ en, ko: kos.length === ens.length ? kos[i] : (ens.length === 1 ? x.ko || '' : '') }));
  }
  rows.splice(MAX_ROWS);
  const body = () => rows.map((r) => r.en.trim()).filter(Boolean).join(' ');

  function render(editAt = -1, pending = null) {
    clearSpotlight();
    const full = rows.length >= MAX_ROWS;
    mount(`<section class="screen fit letter-summary inbox-summary" lang="${lang()}">
      <div class="bar">
        <button class="ghost" id="quit" type="button">${t.exit}</button>
        <div class="step-label">→ ${esc(to.name || '')}</div>
      </div>
      <h2>${st.title}</h2>
      <div class="sum-list">${rows.map((r, i) => `<div class="sum-part ${i === editAt ? 'editing' : ''}">
        <div class="sum-head"><span class="label">${i + 1}.</span>
          <span class="sum-btns">
            ${canListen ? `<button class="ghost sum-mic" type="button" data-i="${i}" aria-label="${i + 1}. ${st.speak}">${ICON.mic}</button>` : ''}
            <button class="ghost sum-edit" type="button" data-i="${i}">${st.edit}</button>
            <button class="ghost sum-del" type="button" data-i="${i}">${st.del}</button>
          </span></div>
        <div class="sum-text" id="sum${i}">${r.en ? `<p lang="en">${esc(r.en)}</p>${r.ko ? `<p class="muted sum-ko">${esc(r.ko)}</p>` : ''}` : `<p class="muted">${st.empty}</p>`}</div>
        <p class="hint sum-hint" id="hint${i}" aria-live="polite"></p>
      </div>`).join('')}
        <button class="ghost sum-more" id="addLine" type="button" ${full ? 'disabled' : ''}>${st.add}</button>
      </div>
      <p class="msg" id="msg" role="alert">${full ? st.full(MAX_ROWS) : ''}</p>
      <div class="nav bottom">
        <button class="prev" id="hearAll" type="button">${ICON.sound} ${st.hearAll}</button>
        <button class="next" id="send" type="button">${t.send}</button>
      </div>
    </section>`);
    on('quit', home);
    on('hearAll', () => speak(body(), { rate: 0.85, button: $('hearAll') }));
    on('addLine', () => { if (rows.length < MAX_ROWS) { rows.push({ en: '', ko: '' }); render(rows.length - 1); } });
    document.querySelectorAll('.sum-del').forEach((x) => x.addEventListener('click', () => { rows.splice(Number(x.dataset.i), 1); render(); }));
    document.querySelectorAll('.sum-edit').forEach((x) => x.addEventListener('click', () => render(Number(x.dataset.i))));
    document.querySelectorAll('.sum-mic').forEach((x) => x.addEventListener('click', () => speakRow(Number(x.dataset.i), x)));
    if (pending) showPending(pending.i, pending.r);
    else if (editAt >= 0 && rows[editAt]) editRow(editAt);
    on('send', send);
  }

  // 🎤 그 문장을 다시 말하면 클라우디아가 고쳐서 보여 줘요 → '이 문장 쓰기'
  async function speakRow(i, btn) {
    if (!voice) return;
    const said = await hear(btn, $(`hint${i}`), { listening: st.listening, lang: 'auto', silenceMs: 2200, ui: lang() === 'ko' && !writesKorean() ? 'ko' : 'en' });
    if (!said || !said[0] || !$(`hint${i}`)) return;
    $(`hint${i}`).textContent = st.working;
    try {
      const r = await voice(said[0], rows.filter((_, j) => j !== i).map((x) => x.en));
      if (!r || !r.en) throw new Error('empty');
      render(-1, { i, r: { ...r, said: said[0] } });
    } catch (e) { if ($(`hint${i}`)) $(`hint${i}`).textContent = st.fail; }
  }
  function showPending(i, r) {
    const korean = writesKorean() && hasHangul(r.en);
    $(`sum${i}`).innerHTML = `<p class="label">${st.heard}</p><p class="muted">${esc(r.said)}</p>
      <p class="label">${t.fixed}</p><p lang="en" class="fixed-line">${esc(r.en)}</p>
      ${korean && r.roman ? `<p class="say roman-line">${esc(r.roman)}</p>` : ''}
      ${r.ko ? `<p class="muted sum-ko">${esc(r.ko)}</p>` : ''}
      <div class="sum-edit-row">
        <button class="ghost" id="pHear" type="button">${ICON.sound}</button>
        <button class="ghost" id="pCancel" type="button">${st.cancel}</button>
        <button class="primary mid" id="pUse" type="button">${st.use}</button>
      </div>`;
    $(`sum${i}`).closest('.sum-part').classList.add('editing');
    on('pHear', () => speak(r.en, { rate: 0.8, button: $('pHear') }));
    on('pCancel', () => { if (!rows[i].en) rows.splice(i, 1); render(); });
    on('pUse', () => { rows[i] = { en: r.en, ko: r.ko || '' }; render(); });
    try { $(`sum${i}`).scrollIntoView({ block: 'nearest' }); } catch (e) { /* 무시 */ }
  }
  // 수정: 글로 고치고, ▲▼로 순서를 바꿔요
  function editRow(i) {
    $(`sum${i}`).innerHTML = `<textarea rows="2" lang="${writesKorean() ? 'ko' : 'en'}" id="ed${i}" placeholder="${esc(st.type)}">${esc(rows[i].en)}</textarea>
      <div class="sum-edit-row">
        <button class="ghost" id="up${i}" type="button" ${i === 0 ? 'disabled' : ''}>${st.up}</button>
        <button class="ghost" id="down${i}" type="button" ${i === rows.length - 1 ? 'disabled' : ''}>${st.down}</button>
        <button class="primary mid" id="ok${i}" type="button">${st.save}</button>
      </div>`;
    const keep = () => {
      const v = $(`ed${i}`).value.replace(/\s+/g, ' ').trim();
      rows[i] = { en: v, ko: rows[i].en === v ? rows[i].ko : '' };
    };
    const move = (d) => { keep(); const j = i + d; [rows[i], rows[j]] = [rows[j], rows[i]]; render(j); };
    on(`up${i}`, () => move(-1));
    on(`down${i}`, () => move(1));
    on(`ok${i}`, () => { keep(); if (!rows[i].en) rows.splice(i, 1); render(); });
    try { $(`sum${i}`).scrollIntoView({ block: 'nearest' }); $(`ed${i}`).focus(); } catch (e) { /* 무시 */ }
  }

  async function send() {
    const text = body().slice(0, 2000);
    if (!text) { $('msg').textContent = st.noLines; return; }
    $('send').disabled = true;
    $('msg').textContent = t.sending;
    try {
      await api.sendLetter({ to_id: to.id, body: text, reply_to: replyTo ? replyTo.id : null, translateTo: to.learn_lang || 'en' });
      api.markAllFrom(state.user.id, to.id).catch(() => {});
      if (learner) api.addEntry({ kind: 'letter', prompt_en: replyTo ? replyTo.body : null, answer_en: text, answer_ko: rows.map((x) => x.ko).filter(Boolean).join(' ') }).catch(() => {});
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
  }
  render();
}
