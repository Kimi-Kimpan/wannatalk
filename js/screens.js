// 로그인, 처음 설정, 홈, 설정 화면
import { state, register, go, mount, on, $, esc, today, loading, errorScreen, avatar, phoneGuide, bindPhoneGuide } from './ui.js';
import { prepareDay } from './learn.js';
import { readable } from './message.js';
import * as api from './api.js';
import { TOPICS, topicForDay, cycleForDay, LEVEL_NAMES, personalizeTopics } from './content.js';
import { TOTAL_DAYS } from './config.js';

// 로그인 화면의 말: 한국어를 배우는 사람(영어 화면)에게는 영어로
const EN = () => (state.profile && state.profile.learn_lang ? state.profile.learn_lang === 'ko' : learnChoice() === 'ko');
const L = (ko, en) => (EN() ? en : ko);

// 첫 화면과 로그인 ---------------------------------------------------------------------
register('login', () => {
  let email = '';
  let admin = false;
  try { email = localStorage.getItem('wt-email') || ''; } catch (e) { /* 무시 */ }

  function landing() {
    const learn = learnChoice();
    const en = learn === 'ko';   // 한국어를 배우는 사람에게는 영어 화면
    document.documentElement.lang = en ? 'en' : 'ko';
    const linkErr = window.__wtAuthErr;
    window.__wtAuthErr = '';
    mount(`<section class="screen landing">
      ${linkErr ? `<div class="panel link-error" role="alert">
        <p class="lead"><b>${L('이 로그인 링크는 쓸 수 없어요.', 'This sign-in link cannot be used.')}</b></p>
        <p>${L('이미 한 번 쓴 링크이거나, 시간이 지났거나, 새 메일을 받아서 예전 링크가 된 경우예요. <b>가장 최근에 받은 메일</b>의 링크만 돼요.', 'It was already used, it has expired, or a newer email replaced it. Only the link in the <b>newest email</b> works.')}</p>
        <button class="big primary" id="resend" type="button">${L('로그인 메일 다시 받기', 'Get a new sign-in email')}</button>
      </div>` : ''}
      <div class="bar">
        <div class="brand">WannaTalk</div>
        <button class="ghost" id="toAdmin" type="button">${en ? 'Admin' : '관리자'}</button>
      </div>
      <div class="hero">
        ${avatar('lg')}
        <h1>${en ? '15 minutes a day to learn' : '하루 15분으로 배우는'}</h1>
        <div class="lang-switch" role="radiogroup" aria-label="${en ? 'Language to learn' : '배울 언어'}">
          <button type="button" role="radio" id="pickEn" aria-checked="${learn === 'en'}" class="${learn === 'en' ? 'on' : ''}">${en ? 'English' : '영어'}</button>
          <button type="button" role="radio" id="pickKo" aria-checked="${learn === 'ko'}" class="${learn === 'ko' ? 'on' : ''}">${en ? 'Korean' : '한국어'}</button>
        </div>
      </div>
      <div class="spacer"></div>
      <button class="big primary huge" id="start" type="button">${en ? 'Sign in' : '로그인'}</button>
      <button class="big plain" id="pasteLogin" type="button">${en ? 'Move sign-in' : '로그인 옮기기'}</button>
      <p class="msg" id="msg" role="alert"></p>
      <button class="link-btn" id="toAdmin2" type="button">${en ? 'Admin sign-in' : '관리자로 로그인하기'}</button>
    </section>`);
    // 배울 언어를 바꾸면 화면 언어도 바뀌어요 (한국어를 배우면 영어 화면)
    const pick = (l) => { if (l === learn) return; setLearnChoice(l); landing(); };
    on('pickEn', () => pick('en'));
    on('pickKo', () => pick('ko'));
    on('pasteLogin', () => pasteLogin(false));
    on('start', () => { admin = false; stepId(); });
    on('resend', () => { admin = false; stepEmail(); });
    on('toAdmin', () => { admin = true; stepId(); });
    on('toAdmin2', () => { admin = true; stepId(); });
  }

  // 클립보드의 로그인(또는 메일 링크)으로 들어가기
  async function pasteLogin(asAdmin) {
    const say = (t) => { if ($('msg')) $('msg').textContent = t; };
    let t = '';
    try { t = (await navigator.clipboard.readText() || '').trim(); } catch (err) { /* 권한 없음 */ }
    if (!t) { say(L('복사한 로그인이 없어요. 메일 속 Sign in 을 눌러 Safari에서 "앱으로 로그인 옮기기"를 먼저 해 주세요.', 'Nothing to paste yet. Tap “Sign in” in the email, then tap “Move sign-in to the app” in Safari first.')); return; }
    say(L('확인하는 중이에요…', 'Checking…'));
    try {
      const ses = await api.signInWithLink(t, asAdmin ? api.adminClient() : api.sb);
      if (asAdmin) { location.href = 'admin.html'; return; }
      state.user = ses.user;
      boot();
    } catch (err) {
      say(err.message === 'no_token' ? L('복사한 내용이 로그인이 아니에요. 다시 해 주세요.', 'What you copied is not a sign-in. Please try again.') : L('이 로그인은 만료됐어요. 메일을 다시 받아 주세요.', 'This sign-in has expired. Please get a new email.'));
    }
  }

  // 아이디·비밀번호로 로그인 (처음이면 이메일로)
  function stepId(msg = '') {
    mount(`<section class="screen">
      <div class="bar">
        <button class="ghost" id="back" type="button">${L('← 처음 화면', '← Back')}</button>
        <div class="mode-pill ${admin ? 'admin' : ''}">${admin ? L('관리자 로그인', 'Admin sign-in') : L('레슨 로그인', 'Lesson sign-in')}</div>
      </div>
      <h1>${admin ? L('관리자 로그인', 'Admin sign-in') : L('로그인', 'Sign in')}</h1>
      <form id="idf" class="form" novalidate>
        <label for="uid">${L('아이디', 'Username')}</label>
        <input id="uid" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" inputmode="text">
        <label for="pw">${L('비밀번호', 'Password')}</label>
        <input id="pw" type="password" autocomplete="current-password">
        <p class="msg" id="msg" role="alert">${esc(msg)}</p>
        <button class="big primary" type="submit" id="idBtn">${L('로그인', 'Sign in')}</button>
      </form>
      <div class="panel">
        <p class="lead">${L('처음이거나 아이디가 없으면', 'First time, or no username yet?')}</p>
        <button class="big plain" id="toEmail" type="button">${L('이메일로 로그인하기 <small>로그인 메일을 받아요</small>', 'Sign in with email <small>We send you a sign-in link</small>')}</button>
        <p class="note">${L('이메일로 들어간 뒤 <b>설정</b>에서 아이디와 비밀번호를 만들면, 다음부터는 메일 없이 들어올 수 있어요.', 'After you sign in by email, make a username and password in <b>Settings</b>. Next time you can sign in without email.')}</p>
      </div>
    </section>`);
    on('back', landing);
    on('toEmail', () => stepEmail());
    $('idf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = $('uid').value.trim(), pw = $('pw').value;
      if (!u || !pw) { $('msg').textContent = L('아이디와 비밀번호를 적어 주세요.', 'Please enter your username and password.'); return; }
      $('idBtn').disabled = true;
      $('msg').textContent = L('확인하는 중이에요…', 'Checking…');
      try {
        const ses = await api.loginWithId(u, pw, admin ? api.adminClient() : api.sb);
        if (admin) { location.href = 'admin.html'; return; }
        state.user = ses.user;
        boot();
      } catch (err) {
        $('idBtn').disabled = false;
        $('msg').textContent = err.message === 'too_many' ? L('여러 번 틀려서 잠시 막혔어요. 한 시간 뒤에 다시 해 주세요.', 'Too many tries. Please try again in an hour.')
          : err.message === 'invalid' ? L('아이디나 비밀번호가 맞지 않아요.', 'The username or password is not right.') : L('인터넷을 확인하고 다시 눌러 주세요.', 'Please check your internet and try again.');
      }
    });
  }

  function stepEmail(msg = '') {
    mount(`<section class="screen">
      <div class="bar">
        <button class="ghost" id="back" type="button">${L('← 돌아가기', '← Back')}</button>
        <div class="mode-pill ${admin ? 'admin' : ''}">${admin ? L('관리자 로그인', 'Admin sign-in') : L('레슨 로그인', 'Lesson sign-in')}</div>
      </div>
      <h1>${admin ? L('관리자 이메일을 적어 주세요', 'Enter the admin email') : L('이메일로 시작해요', 'Sign in with your email')}</h1>
      ${EN() ? '' : `<p class="sub" lang="en">${admin ? 'Admin sign-in' : 'Sign in with your email'}</p>`}
      <form id="f" class="form" novalidate>
        <label for="email">${L('이메일 주소', 'Email address')}</label>
        <input id="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" value="${esc(admin ? '' : email)}" placeholder="name@example.com">
        <p class="msg" id="msg" role="alert">${esc(msg)}</p>
        <button class="big primary" type="submit" id="send">${L('로그인 메일 받기 <small lang="en">Email me a sign-in link</small>', 'Email me a sign-in link')}</button>
      </form>
      <button class="link-btn" id="switch" type="button">${admin ? L('레슨 받는 사람으로 로그인하기', 'Sign in as a learner') : L('관리자로 로그인하기', 'Admin sign-in')}</button>
      <p class="note">${L('메일로 로그인 링크를 보내 드려요. 한 번 로그인하면 다음부터는 바로 열려요.', 'We email you a sign-in link. After that, the app opens straight away.')}</p>
    </section>`);
    on('back', () => stepId());
    on('switch', () => { admin = !admin; stepEmail(); });
    $('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = $('email').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) { $('msg').textContent = L('이메일 주소를 다시 확인해 주세요.', 'Please check the email address.'); return; }
      email = value;
      $('send').disabled = true;
      $('msg').textContent = L('보내는 중이에요…', 'Sending…');
      try {
        await api.sendCode(email, { admin });
        if (!admin) { try { localStorage.setItem('wt-email', email); } catch (e2) { /* 무시 */ } }
        stepCode();
      } catch (err) {
        $('send').disabled = false;
        $('msg').textContent = /saving new user|signup_limit|database error/i.test(err.message || '')
          ? L('지금은 가입 인원이 다 찼어요. 관리자에게 문의해 주세요. · Sign-ups are full right now.', 'Sign-ups are full right now. Please contact the admin.')
          : /rate|seconds|limit/i.test(err.message || '')
          ? L('로그인 메일을 너무 많이 보냈어요. 한 시간에 2통까지만 보낼 수 있어서, 잠시 뒤 다시 눌러 주세요.', 'Too many sign-in emails. We can send 2 an hour, so please try again a little later.')
          : admin ? L('보내지 못했어요. 관리자 이메일이 맞는지, 앱에 가입된 주소인지 확인해 주세요.', 'Could not send. Check that this is the admin email and that it has an account.')
          : L('메일을 보내지 못했어요. 주소를 확인하고 다시 눌러 주세요.', 'Could not send the email. Check the address and try again.');
      }
    });
  }

  function stepCode(msg = '') {
    mount(`<section class="screen scroll">
      <div class="brand">WannaTalk</div>
      <h1>${L('메일함을 열어 주세요', 'Check your email')}</h1>
      <p class="sub">${esc(email)}${EN() ? '' : ' <span lang="en">· Check your email</span>'}</p>

      <div class="panel">
        ${EN() ? `<p class="lead"><b>1.</b> Tap <b>Sign in</b> in the email we just sent. ${admin ? 'The admin page opens.' : 'You are in.'}</p>` : `<p class="lead"><b>1.</b> 메일 속 <b lang="en">Sign in</b>을 누르면 바로 ${admin ? '관리자 화면이 열려요' : '로그인돼요'}.</p>
        <p class="muted" lang="en">Tap “Sign in” in the email we just sent.</p>`}
      </div>

      <form id="linkForm" class="form panel" novalidate>
        <p class="lead"><b>2.</b> ${L('Safari 같은 다른 창에서 열렸다면', 'If it opened in another window, like Safari')}</p>
        <p class="muted">${L('그 창에서 <b>앱으로 로그인 옮기기</b>를 누른 뒤, 여기로 돌아와 아래 버튼을 누르세요.', 'Tap <b>Move sign-in to the app</b> there, then come back and tap the button below.')}</p>
        <button class="big primary" id="paste" type="button">${L('복사한 로그인 붙여넣기 <small lang="en">Paste sign-in</small>', 'Paste sign-in')}</button>
        <label for="link" class="muted small-label">${L('버튼이 안 되면 여기에 길게 눌러 붙여넣기', 'If the button does not work, press and hold here to paste')}</label>
        <input id="link" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…">
        <button class="plain mid" id="linkBtn" type="submit">${L('이 링크로 로그인', 'Sign in with this link')}</button>
      </form>

      <p class="msg" id="msg" role="alert">${esc(msg)}</p>
      <button class="plain mid wide" id="ok" type="button">${L('로그인했어요 · 화면 새로 보기', 'I have signed in · Refresh')}</button>

      <div class="row">
        <button class="plain mid" id="again" type="button">${L('메일 다시 받기', 'Send again')}</button>
        <button class="plain mid" id="change" type="button">${L('이메일 바꾸기', 'Change email')}</button>
      </div>
      <p class="note">${L('메일이 안 보이면 스팸함도 확인해 주세요. 메일은 몇 분에 한 번만 보낼 수 있어요.', 'No email? Check your spam folder. We can only send one every few minutes.')}</p>
    </section>`);

    const done = (session) => {
      if (admin) { location.href = 'admin.html'; return; }
      state.user = session.user;
      boot();
    };
    const say = (t) => { if ($('msg')) $('msg').textContent = t; };

    $('linkForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const link = $('link').value.trim();
      if (!link) { say(L('메일 속 Sign in 링크를 붙여넣어 주세요.', 'Please paste the Sign in link from the email.')); return; }
      $('linkBtn').disabled = true;
      say(L('확인하는 중이에요…', 'Checking…'));
      await loginWith(link);
      if ($('linkBtn')) $('linkBtn').disabled = false;
    });
    async function loginWith(link) {
      say(L('확인하는 중이에요…', 'Checking…'));
      try { done(await api.signInWithLink(link, admin ? api.adminClient() : api.sb)); }
      catch (err) {
        say(err.message === 'no_token'
          ? L('로그인 링크가 아닌 것 같아요. 메일 속 Sign in 을 길게 눌러 "링크 복사"를 골라 주세요.', 'That does not look like a sign-in link. Press and hold “Sign in” in the email and choose “Copy link”.')
          : L('이 링크는 이미 쓰였거나 만료됐어요. 메일을 다시 받아 새 링크로 해 주세요.', 'This link was already used or has expired. Get a new email and use the new link.'));
      }
    }
    on('paste', () => pasteLogin(admin));

    on('ok', async () => {
      const u = await api.currentUser();
      if (!u) { say(L('이 화면에서는 아직 로그인되지 않았어요. 2번 방법(링크 복사)으로 해 주세요.', 'You are not signed in here yet. Please use step 2 (copy the link).')); return; }
      done({ user: u });
    });
    on('again', async () => {
      try { await api.sendCode(email, { admin }); stepCode(L('새 메일을 보냈어요.', 'We sent a new email.')); }
      catch (err) { stepCode(L('잠시 뒤에 다시 눌러 주세요.', 'Please try again in a moment.')); }
    });
    on('change', () => stepEmail());
  }

  landing();
});

// 아이폰: Safari 에서 로그인됐을 때, 홈 화면 앱으로 로그인 옮기기 ---------------------------
function handoff() {
  mount(`<section class="screen center">
    ${avatar('lg')}
    <h1>${L('로그인됐어요!', 'You are signed in!')}</h1>
    <p class="lead">${L('홈 화면의 WannaTalk 앱에서 공부하시려면<br>아래 버튼을 눌러 주세요.', 'To study in the WannaTalk app on your home screen,<br>tap the button below.')}</p>
    <button class="big primary huge" id="copyLogin" type="button">${L('앱으로 로그인 옮기기 <small lang="en">Move sign-in to the app</small>', 'Move sign-in to the app')}</button>
    <button class="link-btn" id="stayHere" type="button">${L('이 창에서 그냥 공부하기', 'Just study in this window')}</button>
  </section>`);
  on('stayHere', () => boot());
  on('copyLogin', async () => {
    let r;
    try { r = await api.handoffCopy(); } catch (e) { return boot(); }
    mount(`<section class="screen center">
      <h1>${r.copied ? L('복사했어요', 'Copied') : L('한 번만 더 해 주세요', 'One more step')}</h1>
      ${r.copied ? '' : `<p class="lead">${L('아래 칸을 길게 눌러 <b>전체 선택 → 복사</b> 해 주세요.', 'Press and hold the box below, then <b>Select All → Copy</b>.')}</p>
        <input type="url" readonly value="${esc(r.link)}" id="lk" style="width:100%">`}
      <div class="panel" style="text-align:left">
        <p class="lead"><b>1.</b> ${L('이 창을 닫고 홈 화면의 <b>WannaTalk</b> 앱을 여세요.', 'Close this window and open the <b>WannaTalk</b> app on your home screen.')}</p>
        <p class="lead"><b>2.</b> ${L('<b>복사한 로그인 붙여넣기</b>를 누르면 끝이에요.', 'On the first screen, tap <b>Move sign-in</b>. That is it.')}</p>
      </div>
      <p class="note">${L('이 창(Safari)에서는 로그아웃됐어요.', 'You are now signed out in this window (Safari).')}</p>
    </section>`);
    const lk = $('lk'); if (lk) { lk.focus(); lk.select(); }
  });
}

// 로그인 뒤 어디로 갈지 정하기 ---------------------------------------------------------
export async function boot() {
  loading(L('불러오는 중이에요…', 'Loading…'));
  try {
    if (!state.user) state.user = await api.currentUser();
    if (!state.user) return go('login');
    let p = await api.getProfile(state.user.id);
    if (!p) {
      // 가입 직후 프로필이 아직 없으면 잠깐 기다렸다 다시
      await new Promise((r) => setTimeout(r, 800));
      p = await api.getProfile(state.user.id);
    }
    if (!p) throw new Error('no profile');
    if (p.deleted_at) {
      // 관리자가 삭제한 계정: 들어올 수 없어요
      await api.signOut().catch(() => {});
      state.user = null; state.profile = null;
      mount(`<section class="screen center"><h1>${L('이 계정은 사용할 수 없어요', 'This account can no longer be used')}</h1><p class="lead">${L('관리자에게 문의해 주세요.', 'Please contact the admin.')}</p><button class="big plain" id="toLogin" type="button">${L('처음으로', 'Start')}</button></section>`);
      on('toLogin', () => go('login'));
      return;
    }
    state.profile = p;
    api.touchSeen(state.user.id).catch(() => {});
    if (api.freshLogin && api.inIOSBrowser() && !state.handoffShown) { state.handoffShown = true; return handoff(); }
    if (!p.name || !p.role) return go('setup');
    if (p.role === 'friend') return go('friend');
    if (p.learn_lang === 'ko') return go('ko-home');   // 한국어를 배우는 사람 (영어 화면)
    // 처음 온 학습자에게는 몇 가지를 먼저 여쭤봐요 (배경이 비어 있을 때 한 번만)
    const noBg = !(p.background_tags && p.background_tags.length) && !p.background_note;
    if (!p.placement) return go(noBg && !state.aboutDone ? 'about' : 'placement');
    return go('home');
  } catch (e) {
    errorScreen('연결이 잘 안 돼요. 인터넷을 확인하고 다시 눌러 주세요.', boot, boot);
  }
}

// 처음 설정 ---------------------------------------------------------------------------
// 배울 언어: 첫 화면에서 고른 것, 없으면 기기 언어로 정해요 (한국어 기기 → 영어 배우기)
export function learnChoice() {
  try { const v = localStorage.getItem('wt-learn'); if (v === 'en' || v === 'ko') return v; } catch (e) { /* 무시 */ }
  const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'ko']);
  return /^ko/i.test(langs[0] || '') ? 'en' : 'ko';
}
function setLearnChoice(l) { try { localStorage.setItem('wt-learn', l); } catch (e) { /* 무시 */ } }

register('setup', () => {
  const p = state.profile;
  // 새로 시작하는 계정: 이 기기에 남은 예전 진행 기록은 지워요
  try { localStorage.removeItem('wt-progress'); localStorage.removeItem('wt-steplog'); } catch (e) { /* 무시 */ }
  mount(`<section class="screen">
    <h1>반가워요!</h1>
    <p class="sub" lang="en">Welcome!</p>
    <div class="form">
      <label for="name">이름 (영어 이름도 좋아요) <span lang="en">· Your name</span></label>
      <input id="name" type="text" autocomplete="given-name" value="${esc(p.name || '')}" placeholder="예: Kim">
      <p class="msg" id="msg" role="alert"></p>
    </div>
    <p class="label">무엇을 배우고 싶으세요? <span lang="en">· What do you want to learn?</span></p>
    <div class="stack">${learnChoice() === 'ko'
      ? `<button class="big primary" id="koLearner" type="button" lang="en">I want to learn Korean <small lang="ko">· 한국어</small></button>
      <button class="big plain" id="learner" type="button">영어를 배울래요 <small lang="en">· English</small></button>`
      : `<button class="big primary" id="learner" type="button">영어를 배울래요 <small lang="en">· English</small></button>
      <button class="big plain" id="koLearner" type="button" lang="en">I want to learn Korean <small lang="ko">· 한국어</small></button>`}
    </div>
  </section>`);
  async function choose(role, learn = 'en') {
    const name = $('name').value.trim();
    if (!name) { $('msg').textContent = '이름을 적어 주세요. · Please enter your name.'; $('name').focus(); return; }
    try {
      state.profile = await api.updateProfile(state.user.id, { name: name.slice(0, 40), role, learn_lang: learn });
      try { await api.myCode(); } catch (e2) { /* 나중에 다시 */ }
      state.profile = await api.getProfile(state.user.id);
      boot();
    } catch (e) {
      $('msg').textContent = '저장하지 못했어요. 다시 눌러 주세요.';
    }
  }
  on('learner', () => choose('learner'));
  on('koLearner', () => choose('learner', 'ko'));
});

// 홈: 오늘의 대시보드 -------------------------------------------------------------------
function gauge(done, total) {
  const pct = Math.max(0, Math.min(1, done / total));
  const r = 52, c = 2 * Math.PI * r;
  return `<svg class="gauge" viewBox="0 0 128 128" role="img" aria-label="전체 ${total}일 중 ${done}일 완료">
    <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--line)" stroke-width="14"/>
    <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--primary)" stroke-width="14" stroke-linecap="round"
      stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 64 64)"/>
    <text x="64" y="62" text-anchor="middle" class="g-num">${Math.round(pct * 100)}%</text>
    <text x="64" y="86" text-anchor="middle" class="g-sub">${done} / ${total}일</text>
  </svg>`;
}

register('home', async () => {
  const p = state.profile;
  if (p.learn_lang === 'ko') return go('ko-home');
  personalizeTopics(p);
  const doneToday = p.last_done_date === today();
  const day = p.day;
  const doneDays = Math.max(0, day - 1);
  const t = topicForDay(day);
  const cycle = cycleForDay(day);
  const inCycle = ((day - 1) % TOPICS.length) + 1;
  let resume = null;
  try { resume = JSON.parse(localStorage.getItem('wt-progress') || 'null'); } catch (e) { /* 무시 */ }
  if (!resume || resume.day !== day || doneToday) resume = null;
  const doneSteps = new Set(resume && Array.isArray(resume.done) ? resume.done : []);
  const resuming = !!resume && (doneSteps.size > 0 || resume.sub > 0);

  const STEPS = [['cards', '문장 카드'], ['words', '낱말 10개'], ['qa', '묻고 답하기'], ['letter', '편지 읽고 답장하기']];
  const nowStep = resume ? resume.step : null;
  const checklist = STEPS.map(([id, label]) => {
    const done = doneToday || doneSteps.has(id);
    const now = !done && id === nowStep;
    return `<li data-step="${id}" class="${done ? 'done' : ''} ${now ? 'now' : ''}" ${id === 'letter' && !doneSteps.has('letter') ? 'hidden' : ''}>
      ${done ? `<button class="step-redo" type="button" data-step="${id}" aria-label="${label} 결과 보기">` : ''}
      <span class="box" aria-hidden="true">${done ? '✓' : ''}</span>
      <span>${label}${now ? ' <small>· 여기서부터</small>' : ''}</span>
      <span class="sr">${done ? '완료' : '아직'}</span>
      ${done ? '</button>' : ''}
    </li>`;
  }).join('');

  const dots = TOPICS.map((x, i) =>
    `<span class="dot ${i + 1 < inCycle || (i + 1 === inCycle && doneToday) ? 'done' : ''} ${i + 1 === inCycle && !doneToday ? 'now' : ''}" title="${esc(x.ko)}"></span>`).join('');

  mount(`<section class="screen">
    <div class="bar">
      <div class="brand small">WannaTalk</div>
      <button class="ghost" id="settings" type="button">설정</button>
    </div>
    <h1>${esc(p.name)}님, 안녕하세요</h1>
    ${api.inIOSBrowser() ? `<div class="dash-card handoff-card">
      <p class="label">지금 Safari 에서 열려 있어요</p>
      <p>홈 화면의 WannaTalk 앱에서 쓰시려면 로그인을 앱으로 옮겨 주세요.</p>
      <button class="big primary" id="toApp" type="button">앱으로 로그인 옮기기</button>
    </div>` : ''}

    <div class="dash-card lesson-card">
      <p class="label">${doneToday ? '오늘 레슨을 마쳤어요 👏' : resuming ? '하던 레슨이 있어요' : '오늘의 레슨'}</p>
      <div class="today-topic"><span class="emoji" aria-hidden="true">${t.emoji}</span>${doneToday ? '다음: ' : ''}${esc(t.ko)}</div>
      <p class="muted">${day}일째 · ${esc(LEVEL_NAMES[p.level])}</p>
      <ul class="checklist" id="steps">${checklist}</ul>
    </div>
    ${doneToday
      ? `<div class="stack">
           <button class="big primary" id="ahead" type="button">다음 레슨 미리 하기</button>
           <button class="big plain" id="review" type="button">오늘 레슨 다시 하기</button>
         </div>`
      : `<button class="big primary huge" id="start" type="button">${resuming ? '레슨 이어하기' : '오늘 레슨 시작'}</button>`}

    <div class="dash-card past-card" id="pastCard" hidden></div>

    <div class="dash-card" id="msgCard">
      <p class="label">✉️ 오늘 온 편지</p>
      <p class="muted">확인하는 중…</p>
    </div>

    ${phoneGuide('ko')}

    <div class="dash-card progress-card">
      ${gauge(Math.min(doneDays, TOTAL_DAYS), TOTAL_DAYS)}
      <div class="progress-info">
        <p class="label">전체 진행</p>
        <p class="big-line">${doneDays}일 공부했어요</p>
        <p class="muted">${cycle}번째 바퀴 · ${p.level}단계</p>
        <div class="dots" aria-label="이번 바퀴 ${inCycle - (doneToday ? 0 : 1)}/10 완료">${dots}</div>
      </div>
    </div>
  </section>`);

  on('settings', () => go('settings'));
  bindPhoneGuide('settings');
  on('toApp', () => handoff());
  on('start', () => go('day', { day }));
  on('review', () => go('day', { day: day - 1, review: true }));
  on('ahead', () => go('day', { day }));
  // 다음에 할 공부를 미리 만들어 둬요 (레슨 시작을 누르면 바로 열려요)
  setTimeout(() => prepareDay(day), 1500);
  // 끝낸 단계를 누르면: 점수와 마친 시간을 보여 주고, 다시 하기
  document.querySelectorAll('.step-redo').forEach((b) => b.addEventListener('click', () => stepInfo(b.dataset.step)));
  async function stepInfo(step) {
    const label = (STEPS.find((x) => x[0] === step) || [])[1] || '';
    const theDay = doneToday ? day - 1 : day;
    let log = null;
    try { log = (JSON.parse(localStorage.getItem('wt-steplog') || '{}')[theDay] || {})[step] || null; } catch (e) { /* 무시 */ }
    let pack = null;
    if (!log) { try { pack = await api.getPack(theDay); } catch (e) { /* 무시 */ } }
    const at = log ? log.at : pack && pack.done_at;
    const sc = log ? log.score : null;
    const ps = pack && pack.score ? pack.score : {};
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
    let result = '';
    if (step === 'cards') result = `문장 ${log && log.n ? log.n + '개' : ''}를 끝까지 따라 했어요`;
    else if (step === 'words') result = sc ? `문제 ${sc.words[0]} / ${sc.words[1]} 맞힘 · ${pct(sc.words[0], sc.words[1])}점` : ps.words != null ? `${Math.round(ps.words * 100)}점` : '';
    else if (step === 'qa') result = sc ? `질문 ${sc.qa[1]}개에 대답 · ${pct(sc.qa[0], sc.qa[1])}점` : ps.qa != null ? `${Math.round(ps.qa * 100)}점` : '';
    else if (step === 'talk') result = `클라우디아와 ${sc ? sc.talk : ps.talk || 0}번 이야기했어요`;
    else if (step === 'letter') result = sc && !sc.letter ? '다음에 답장하기로 했어요' : '답장을 보냈어요';
    const when = at ? new Date(at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
    const pop = document.createElement('div');
    pop.className = 'modal';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    pop.innerHTML = `<div class="modal-card">
      <p class="label">${theDay}일째 · ${esc(label)}</p>
      <div class="big-emoji" aria-hidden="true">✅</div>
      ${result ? `<p class="modal-score">${esc(result)}</p>` : ''}
      ${when ? `<p class="muted">마친 시간 · ${esc(when)}</p>` : ''}
      ${step === 'letter' ? '' : '<button class="big primary" id="mRedo" type="button">이 단계 다시 하기</button>'}
      <button class="big plain" id="mClose" type="button">닫기</button>
    </div>`;
    document.body.appendChild(pop);
    document.body.classList.add('sheet-open');
    const close = () => { pop.remove(); document.body.classList.remove('sheet-open'); };
    pop.addEventListener('click', (e) => { if (e.target === pop) close(); });
    pop.querySelector('#mClose').addEventListener('click', close);
    const r = pop.querySelector('#mRedo');
    if (r) r.addEventListener('click', () => { close(); go('day', doneToday ? { day: theDay, review: true, startStep: step } : { day, startStep: step }); });
    pop.querySelector('#mClose').focus();
  }
  // 지난 레슨 다시 하기: 눌러서 펼치고, 길어지면 안에서 넘겨 보기
  api.donePacks(200).then((rows) => {
    const box = $('pastCard');
    const list = rows.filter((r) => r.day < day - (doneToday ? 1 : 0));
    if (!box || !list.length) return;
    const topicOf = (id) => TOPICS.find((x) => x.id === id) || { emoji: '📘', ko: '레슨' };
    box.hidden = false;
    box.innerHTML = `<button class="past-toggle" id="pastToggle" type="button" aria-expanded="false">
        <span>📚 지난 레슨 다시 하기 <small class="muted">(${list.length})</small></span><span class="arrow" aria-hidden="true">▾</span></button>
      <div class="past-list" id="pastList" hidden>${list.map((r) => `<button class="past-btn" type="button" data-day="${r.day}"><span class="emoji" aria-hidden="true">${topicOf(r.topic).emoji}</span><span>${r.day}일째 · ${esc(topicOf(r.topic).ko)}</span><span class="go" aria-hidden="true">›</span></button>`).join('')}</div>`;
    on('pastToggle', () => {
      const l = $('pastList'), t = $('pastToggle');
      l.hidden = !l.hidden;
      t.setAttribute('aria-expanded', String(!l.hidden));
      t.classList.toggle('open', !l.hidden);
    });
    box.querySelectorAll('.past-btn').forEach((b) => b.addEventListener('click', () => go('day', { day: Number(b.dataset.day), review: true })));
  }).catch(() => {});

  try {
    const [letter, n, members, recent] = await Promise.all([
      api.pendingLetter(state.user.id), api.countPending(state.user.id), api.myContacts(), api.myLetters(state.user.id, 40).catch(() => []),
    ]);
    if (letter) await api.ensureTranslations([letter], state.user.id, p.learn_lang || 'en').catch(() => {});
    const box = $('msgCard');
    if (!box) return;
    if (letter) {
      const shown = readable(letter);
      const from = (members.find((m) => m.id === letter.from_id) || {}).name || '가족';
      box.classList.add('has-letter');
      box.innerHTML = `<p class="label">✉️ 오늘 온 편지 ${n > 1 ? `<span class="count-pill">${n}통</span>` : ''}</p>
        <p class="from">${esc(from)}님이 보냈어요</p>
        <p class="snippet" lang="en" id="snippet">“${esc(shown.length > 90 ? shown.slice(0, 90) + '…' : shown)}”</p>
        ${shown.length > 90 ? '<button class="link-btn more-btn" id="moreLetter" type="button">더보기 ▾</button>' : ''}
        <div class="row msg-actions">
          <button class="big primary" id="replyMsg" type="button">답장하기</button>
          <button class="big plain" id="writeMsg" type="button">편지함</button>
        </div>`;
      on('moreLetter', () => {
        const sn = $('snippet'), mb = $('moreLetter');
        const open = mb.dataset.open === '1';
        sn.textContent = open ? `“${shown.slice(0, 90)}…”` : `“${shown}”`;
        mb.dataset.open = open ? '' : '1';
        mb.textContent = open ? '더보기 ▾' : '접기 ▴';
      });
      on('replyMsg', () => {
        const sender = members.find((m) => m.id === letter.from_id) || { id: letter.from_id, name: from };
        go('message', { to: sender, topic: 'reply', replyTo: letter });
      });
      const li = document.querySelector('#steps li[data-step="letter"]');
      if (li && !doneToday && !resuming) li.hidden = false;
    } else {
      // 내가 마지막으로 보낸 대화: "○○님의 답장을 기다리고 있어요!"
      const me = state.user.id, lastBy = {};
      recent.forEach((l) => { const other = l.from_id === me ? l.to_id : l.from_id; if (other && !lastBy[other]) lastBy[other] = l; });
      const waiting = Object.entries(lastBy).filter(([, l]) => l.from_id === me)
        .map(([id]) => (members.find((m) => m.id === id) || {}).name).filter(Boolean);
      box.innerHTML = waiting.length
        ? `<p class="label">✉️ 편지</p><p class="big-line waiting">${esc(waiting.join(', '))}님의 답장을 기다리고 있어요!</p>
           <button class="big plain" id="writeMsg" type="button">편지함</button>`
        : `<p class="label">✉️ 오늘 온 편지</p><p class="muted">아직 온 편지가 없어요.</p>
           <button class="big plain" id="writeMsg" type="button">✉️ 편지함 · 메시지 보내기</button>`;
    }
    on('writeMsg', () => go('message'));
  } catch (e) {
    if ($('msgCard')) $('msgCard').innerHTML = '<p class="label">✉️ 오늘 온 편지</p><p class="muted">편지를 불러오지 못했어요.</p>';
  }
});

// 설정 ------------------------------------------------------------------------------
const PENCIL = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13 7l4 4" stroke="currentColor" stroke-width="2"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
register('settings', async () => {
  const p = state.profile;
  mount(`<section class="screen scroll">
    <div class="bar">
      <button class="ghost" id="back" type="button">← 돌아가기</button>
      <div class="step-label">설정</div>
    </div>

    <form class="panel form" id="nameForm" novalidate>
      <h2>내 이름</h2>
      <div class="name-row">
        <span class="name-now" id="nameNow">${esc(p.name || '')}</span>
        <input id="nameIn" type="text" maxlength="40" value="${esc(p.name || '')}" aria-label="내 이름" hidden>
        <button class="ghost icon-btn" id="nameEdit" type="button" aria-label="이름 수정">${PENCIL}</button>
      </div>
      <p class="muted">편지를 받는 사람에게 이 이름으로 보여요.</p>
      <p class="msg" id="nameMsg" role="status"></p>
    </form>

    <div class="panel fold">
      <button class="past-toggle fold-toggle" type="button" aria-expanded="false" data-fold="idBody">
        <span>아이디와 비밀번호${p.username ? ` <small class="muted">· ${esc(p.username)}</small>` : ''}</span><span class="arrow" aria-hidden="true">▾</span></button>
    <form class="form fold-body" id="idForm" novalidate hidden data-body="idBody">
      <p class="muted">${p.username ? `지금 아이디: <b>${esc(p.username)}</b>. 비밀번호를 바꾸려면 새로 적어 주세요.` : '만들어 두면 다음부터 메일 없이 아이디와 비밀번호로 들어올 수 있어요. 지금까지 공부한 내용은 그대로 이어져요.'}</p>
      <label for="newId">아이디 <span class="muted">(한글·영문·숫자 2~20자)</span></label>
      <input id="newId" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="20" value="${esc(p.username || '')}">
      <label for="newPw">비밀번호 <span class="muted">(6자 이상)</span></label>
      <input id="newPw" type="password" autocomplete="new-password">
      <label for="newPw2">비밀번호 한 번 더</label>
      <input id="newPw2" type="password" autocomplete="new-password">
      <p class="msg" id="idMsg" role="status"></p>
      <button class="big primary" type="submit" id="idSave">${p.username ? '저장하기' : '아이디 만들기'}</button>
    </form>
    </div>

    <div class="panel fold">
      <button class="past-toggle fold-toggle" type="button" aria-expanded="false" data-fold="tagBody">
        <span>나에 대한 태그 <small class="muted" id="tagCount"></small></span><span class="arrow" aria-hidden="true">▾</span></button>
      <div class="fold-body" hidden data-body="tagBody">
        <p class="muted">클라우디아가 나에게 맞는 이야기를 고를 때 참고해요. 최대 10개까지 붙일 수 있어요.</p>
        <div class="my-tags" id="myTags"></div>
        <form class="tag-add" id="tagAdd" novalidate>
          <input id="tagIn" type="text" maxlength="40" autocomplete="off" placeholder="예: 손주 2명, 낚시 좋아함" aria-label="새 태그">
          <button class="plain mid" type="submit">추가</button>
        </form>
        <p class="msg" id="tagMsg" role="status"></p>
        <button class="big primary" id="tagSave" type="button">태그 저장</button>
      </div>
    </div>

    <div class="panel">
      <h2>공부 단계</h2>
      <p>지금 <b>${p.level}단계</b> · ${esc(LEVEL_NAMES[p.level])}</p>
      <p class="muted">어렵거나 쉬우면 바꿀 수 있어요. 다음 공부부터 적용돼요.</p>
      <div class="row">
        <button class="plain mid" id="down" type="button" ${p.level <= 1 ? 'disabled' : ''}>한 단계 쉽게</button>
        <button class="plain mid" id="up" type="button" ${p.level >= 5 ? 'disabled' : ''}>한 단계 어렵게</button>
      </div>
    </div>

    <div class="panel">
      <h2>내 코드</h2>
      <p class="family-code" id="myCode">${esc(p.code || p.family || '…')}</p>
      <p class="muted">가족에게 이 코드를 알려 주면 서로 메시지를 주고받을 수 있어요.</p>
    </div>

    <div class="panel">
      <h2>휴대폰 홈 화면에 추가</h2>
      ${state.installPrompt
        ? '<button class="big primary" id="install" type="button">홈 화면에 앱 추가하기</button>'
        : '<p class="muted">크롬 오른쪽 위 ⋮ 메뉴 → <b>홈 화면에 추가</b>를 누르세요. 이미 추가했다면 그대로 쓰시면 돼요.</p>'}
    </div>

    <div class="panel">
      <button class="past-toggle" id="openMail" type="button"><span>✉️ 편지함</span><span class="arrow" aria-hidden="true">›</span></button>
    </div>

    <div id="adminBox"></div>

    <div class="panel">
      <p class="muted">${esc(state.user.email || '')}</p>
      <button class="plain mid" id="logout" type="button">로그아웃</button>
    </div>
  </section>`);

  on('back', () => go('home'));
  // 접었다 펴는 칸 (눌러야 열려요)
  document.querySelectorAll('.fold-toggle').forEach((t) => t.addEventListener('click', () => {
    const body = document.querySelector(`[data-body="${t.dataset.fold}"]`);
    body.hidden = !body.hidden;
    t.classList.toggle('open', !body.hidden);
    t.setAttribute('aria-expanded', String(!body.hidden));
    if (!body.hidden) t.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }));
  on('openMail', () => go('message', { from: 'settings' }));
  // 나에 대한 태그: 눌러서 지우고, 적어서 추가하고, 저장
  let myTags = (p.background_tags || []).slice(0, 10);
  function drawTags() {
    $('tagCount').textContent = `· ${myTags.length}/10`;
    $('myTags').innerHTML = myTags.length
      ? myTags.map((t, i) => `<span class="my-tag">${esc(t)}<button type="button" data-i="${i}" aria-label="${esc(t)} 지우기">×</button></span>`).join('')
      : '<span class="muted">아직 태그가 없어요.</span>';
    $('myTags').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      myTags.splice(Number(b.dataset.i), 1); drawTags(); $('tagMsg').textContent = '저장을 눌러야 적용돼요.';
    }));
  }
  drawTags();
  $('tagAdd').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = $('tagIn').value.trim().slice(0, 40);
    if (!t) return;
    if (myTags.length >= 10) { $('tagMsg').textContent = '태그는 10개까지예요. 하나를 지우고 추가해 주세요.'; return; }
    if (!myTags.includes(t)) myTags.push(t);
    $('tagIn').value = ''; drawTags(); $('tagMsg').textContent = '저장을 눌러야 적용돼요.';
  });
  on('tagSave', async () => {
    $('tagSave').disabled = true;
    try {
      await api.setMyBackground(myTags);
      state.profile = await api.getProfile(state.user.id);
      $('tagMsg').textContent = '저장했어요. 다음 공부부터 적용돼요.';
    } catch (err) { $('tagMsg').textContent = '저장하지 못했어요. 다시 눌러 주세요.'; }
    if ($('tagSave')) $('tagSave').disabled = false;
  });
  // 이름: 연필을 누르면 고칠 수 있고, 체크를 누르면 저장돼요
  let editing = false;
  async function nameToggle() {
    if (!editing) {
      editing = true;
      $('nameNow').hidden = true; $('nameIn').hidden = false; $('nameIn').focus();
      $('nameEdit').innerHTML = CHECK; $('nameEdit').setAttribute('aria-label', '이름 저장'); $('nameEdit').classList.add('on');
      return;
    }
    const name = $('nameIn').value.trim().slice(0, 40);
    if (!name) { $('nameMsg').textContent = '이름을 적어 주세요.'; return; }
    try {
      if (name !== state.profile.name) state.profile = await api.updateProfile(state.user.id, { name });
      editing = false;
      $('nameNow').textContent = name; $('nameNow').hidden = false; $('nameIn').hidden = true;
      $('nameEdit').innerHTML = PENCIL; $('nameEdit').setAttribute('aria-label', '이름 수정'); $('nameEdit').classList.remove('on');
      $('nameMsg').textContent = '저장했어요.';
    } catch (err) { $('nameMsg').textContent = '저장하지 못했어요. 다시 눌러 주세요.'; }
  }
  on('nameEdit', nameToggle);
  $('nameForm').addEventListener('submit', (e) => { e.preventDefault(); nameToggle(); });
  $('idForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const say = (x) => { $('idMsg').textContent = x; };
    const id = $('newId').value.trim().toLowerCase(), pw = $('newPw').value, pw2 = $('newPw2').value;
    if (!/^[0-9a-z가-힣_]{2,20}$/.test(id)) return say('아이디는 한글·영문·숫자로 2~20자예요. 띄어쓰기는 안 돼요.');
    if (!p.username && !pw) return say('비밀번호를 적어 주세요.');
    if (pw && pw.length < 6) return say('비밀번호는 6자 이상이에요.');
    if (pw !== pw2) return say('비밀번호 두 칸이 서로 달라요.');
    $('idSave').disabled = true;
    say('저장하는 중이에요…');
    try {
      if (id !== p.username) await api.setUsername(id);
      if (pw) await api.setPassword(pw);
      state.profile = await api.getProfile(state.user.id);
      say(`저장했어요. 다음부터 아이디 "${id}"와 비밀번호로 들어올 수 있어요.`);
      $('newPw').value = ''; $('newPw2').value = '';
    } catch (err) {
      say(err.message === 'taken' ? '이미 쓰고 있는 아이디예요. 다른 아이디를 적어 주세요.'
        : err.message === 'invalid' ? '아이디는 한글·영문·숫자로 2~20자예요.'
        : /same|different from the old/i.test(err.message || '') ? '지금 비밀번호와 같아요. 다른 비밀번호를 적어 주세요.'
        : /weak|short|least/i.test(err.message || '') ? '비밀번호가 너무 쉬워요. 더 길게 적어 주세요.'
        : '저장하지 못했어요. 다시 눌러 주세요.');
    } finally {
      if ($('idSave')) $('idSave').disabled = false;
    }
  });
  if (!p.code) api.myCode().then((c) => { p.code = c; if ($('myCode')) $('myCode').textContent = c; }).catch(() => {});
  async function setLevel(lv) {
    try { state.profile = await api.updateProfile(state.user.id, { level: lv }); go('settings'); } catch (e) { /* 무시 */ }
  }
  on('down', () => setLevel(p.level - 1));
  on('up', () => setLevel(p.level + 1));
  on('install', async () => {
    const ev = state.installPrompt;
    state.installPrompt = null;
    try { ev.prompt(); await ev.userChoice; } catch (e) { /* 무시 */ }
    go('settings');
  });
  on('logout', async () => { await api.signOut(); state.user = null; state.profile = null; go('login'); });
  // 관리자: 한 번 연결해 두면 학습자로 로그인한 채로 바로 전환
  function adminBox(meAdmin) {
    const box = $('adminBox');
    if (!box) return;
    if (meAdmin || api.adminConnected()) {
      box.innerHTML = `<div class="panel admin-panel">
        <h2>관리자</h2>
        <p class="muted">${meAdmin ? '지금 계정이 관리자 계정이에요.' : '관리자 계정이 연결돼 있어요. 학습자 로그인은 그대로 둔 채 오갈 수 있어요.'}</p>
        <a class="big primary admin-link" href="admin.html">대시보드</a>
        ${meAdmin ? '<button class="big plain" id="toKo" type="button">한국어 학습으로 전환 <small class="muted">(영어 화면)</small></button>' : '<button class="plain mid" id="unlinkAdmin" type="button">관리자 계정 연결 끊기</button>'}
      </div>`;
      on('unlinkAdmin', () => { api.disconnectAdmin(); adminBox(false); });
      // 관리자는 영어 학습 ↔ 한국어 학습 프로그램을 오가며 확인할 수 있어요
      on('toKo', async () => {
        $('toKo').disabled = true;
        try { state.profile = await api.updateProfile(state.user.id, { learn_lang: 'ko' }); boot(); }
        catch (e) { $('toKo').disabled = false; }
      });
    } else {
      box.innerHTML = '<a class="link-btn" href="admin.html">관리자 계정 연결하기</a>';
    }
  }
  adminBox(false);
  api.isAdmin().then((yes) => { if (yes) adminBox(true); }).catch(() => {});

});
