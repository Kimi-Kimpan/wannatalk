// 로그인, 처음 설정, 홈, 설정 화면
import { state, register, go, mount, on, $, esc, today, loading, errorScreen, avatar } from './ui.js';
import * as api from './api.js';
import { TOPICS, topicForDay, cycleForDay, LEVEL_NAMES } from './content.js';
import { TOTAL_DAYS } from './config.js';

// 첫 화면과 로그인 ---------------------------------------------------------------------
register('login', () => {
  let email = '';
  let admin = false;
  try { email = localStorage.getItem('wt-email') || ''; } catch (e) { /* 무시 */ }

  function landing() {
    mount(`<section class="screen landing">
      <div class="bar">
        <div class="brand">WannaTalk</div>
        <button class="ghost" id="toAdmin" type="button">관리자</button>
      </div>
      <div class="hero">
        ${avatar('lg')}
        <h1>하루 15분,<br>클라우디아와 영어로 이야기해요</h1>
        <p class="lead">듣고, 따라 말하고, 대답하면서 배워요.</p>
      </div>
      <ul class="feature-list">
        <li><span aria-hidden="true">📖</span>문장 카드</li>
        <li><span aria-hidden="true">🔤</span>낱말 10개</li>
        <li><span aria-hidden="true">💬</span>묻고 답하기</li>
        <li><span aria-hidden="true">🗣️</span>3분 대화</li>
      </ul>
      <div class="spacer"></div>
      <button class="big primary huge" id="start" type="button">레슨 시작하기 <small>로그인 · <span lang="en">Sign in</span></small></button>
      <button class="big plain" id="pasteLogin" type="button">복사한 로그인 붙여넣기 <small>Safari에서 옮겨 온 로그인</small></button>
      <p class="msg" id="msg" role="alert"></p>
      <button class="link-btn" id="toAdmin2" type="button">관리자로 로그인하기</button>
    </section>`);
    on('pasteLogin', () => pasteLogin(false));
    on('start', () => { admin = false; stepEmail(); });
    on('toAdmin', () => { admin = true; stepEmail(); });
    on('toAdmin2', () => { admin = true; stepEmail(); });
  }

  // 클립보드의 로그인(또는 메일 링크)으로 들어가기
  async function pasteLogin(asAdmin) {
    const say = (t) => { if ($('msg')) $('msg').textContent = t; };
    let t = '';
    try { t = (await navigator.clipboard.readText() || '').trim(); } catch (err) { /* 권한 없음 */ }
    if (!t) { say('복사한 로그인이 없어요. 메일 속 Sign in 을 눌러 Safari에서 "앱으로 로그인 옮기기"를 먼저 해 주세요.'); return; }
    say('확인하는 중이에요…');
    try {
      const ses = await api.signInWithLink(t, asAdmin ? api.adminClient() : api.sb);
      if (asAdmin) { location.href = 'admin.html'; return; }
      state.user = ses.user;
      boot();
    } catch (err) {
      say(err.message === 'no_token' ? '복사한 내용이 로그인이 아니에요. 다시 해 주세요.' : '이 로그인은 만료됐어요. 메일을 다시 받아 주세요.');
    }
  }

  function stepEmail(msg = '') {
    mount(`<section class="screen">
      <div class="bar">
        <button class="ghost" id="back" type="button">← 처음 화면</button>
        <div class="mode-pill ${admin ? 'admin' : ''}">${admin ? '관리자 로그인' : '레슨 로그인'}</div>
      </div>
      <h1>${admin ? '관리자 이메일을 적어 주세요' : '이메일로 시작해요'}</h1>
      <p class="sub" lang="en">${admin ? 'Admin sign-in' : 'Sign in with your email'}</p>
      <form id="f" class="form" novalidate>
        <label for="email">이메일 주소</label>
        <input id="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" value="${esc(admin ? '' : email)}" placeholder="name@example.com">
        <p class="msg" id="msg" role="alert">${esc(msg)}</p>
        <button class="big primary" type="submit" id="send">로그인 메일 받기 <small lang="en">Email me a sign-in link</small></button>
      </form>
      <button class="link-btn" id="switch" type="button">${admin ? '레슨 받는 사람으로 로그인하기' : '관리자로 로그인하기'}</button>
      <p class="note">메일로 로그인 링크를 보내 드려요. 한 번 로그인하면 다음부터는 바로 열려요.</p>
    </section>`);
    on('back', landing);
    on('switch', () => { admin = !admin; stepEmail(); });
    $('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = $('email').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) { $('msg').textContent = '이메일 주소를 다시 확인해 주세요.'; return; }
      email = value;
      $('send').disabled = true;
      $('msg').textContent = '보내는 중이에요…';
      try {
        await api.sendCode(email, { admin });
        if (!admin) { try { localStorage.setItem('wt-email', email); } catch (e2) { /* 무시 */ } }
        stepCode();
      } catch (err) {
        $('send').disabled = false;
        $('msg').textContent = /saving new user|signup_limit|database error/i.test(err.message || '')
          ? '지금은 가입 인원이 다 찼어요. 관리자에게 문의해 주세요. · Sign-ups are full right now.'
          : /rate|seconds|limit/i.test(err.message || '')
          ? '로그인 메일을 너무 많이 보냈어요. 한 시간에 2통까지만 보낼 수 있어서, 잠시 뒤 다시 눌러 주세요.'
          : admin ? '보내지 못했어요. 관리자 이메일이 맞는지, 앱에 가입된 주소인지 확인해 주세요.'
          : '메일을 보내지 못했어요. 주소를 확인하고 다시 눌러 주세요.';
      }
    });
  }

  function stepCode(msg = '') {
    mount(`<section class="screen scroll">
      <div class="brand">WannaTalk</div>
      <h1>메일함을 열어 주세요</h1>
      <p class="sub">${esc(email)} <span lang="en">· Check your email</span></p>

      <div class="panel">
        <p class="lead"><b>1.</b> 메일 속 <b lang="en">Sign in</b>을 누르면 바로 ${admin ? '관리자 화면이 열려요' : '로그인돼요'}.</p>
        <p class="muted" lang="en">Tap “Sign in” in the email we just sent.</p>
      </div>

      <form id="linkForm" class="form panel" novalidate>
        <p class="lead"><b>2.</b> Safari 같은 다른 창에서 열렸다면</p>
        <p class="muted">그 창에서 <b>앱으로 로그인 옮기기</b>를 누른 뒤, 여기로 돌아와 아래 버튼을 누르세요.</p>
        <button class="big primary" id="paste" type="button">복사한 로그인 붙여넣기 <small lang="en">Paste sign-in</small></button>
        <label for="link" class="muted small-label">버튼이 안 되면 여기에 길게 눌러 붙여넣기</label>
        <input id="link" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…">
        <button class="plain mid" id="linkBtn" type="submit">이 링크로 로그인</button>
      </form>

      <p class="msg" id="msg" role="alert">${esc(msg)}</p>
      <button class="plain mid wide" id="ok" type="button">로그인했어요 · 화면 새로 보기</button>

      <div class="row">
        <button class="plain mid" id="again" type="button">메일 다시 받기</button>
        <button class="plain mid" id="change" type="button">이메일 바꾸기</button>
      </div>
      <p class="note">메일이 안 보이면 스팸함도 확인해 주세요. 메일은 몇 분에 한 번만 보낼 수 있어요.</p>
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
      if (!link) { say('메일 속 Sign in 링크를 붙여넣어 주세요.'); return; }
      $('linkBtn').disabled = true;
      say('확인하는 중이에요…');
      await loginWith(link);
      if ($('linkBtn')) $('linkBtn').disabled = false;
    });
    async function loginWith(link) {
      say('확인하는 중이에요…');
      try { done(await api.signInWithLink(link, admin ? api.adminClient() : api.sb)); }
      catch (err) {
        say(err.message === 'no_token'
          ? '로그인 링크가 아닌 것 같아요. 메일 속 Sign in 을 길게 눌러 "링크 복사"를 골라 주세요.'
          : '이 링크는 이미 쓰였거나 만료됐어요. 메일을 다시 받아 새 링크로 해 주세요.');
      }
    }
    on('paste', () => pasteLogin(admin));

    on('ok', async () => {
      const u = await api.currentUser();
      if (!u) { say('이 화면에서는 아직 로그인되지 않았어요. 2번 방법(링크 복사)으로 해 주세요.'); return; }
      done({ user: u });
    });
    on('again', async () => {
      try { await api.sendCode(email, { admin }); stepCode('새 메일을 보냈어요.'); }
      catch (err) { stepCode('잠시 뒤에 다시 눌러 주세요.'); }
    });
    on('change', () => stepEmail());
  }

  landing();
});

// 아이폰: Safari 에서 로그인됐을 때, 홈 화면 앱으로 로그인 옮기기 ---------------------------
function handoff() {
  mount(`<section class="screen center">
    ${avatar('lg')}
    <h1>로그인됐어요!</h1>
    <p class="lead">홈 화면의 WannaTalk 앱에서 공부하시려면<br>아래 버튼을 눌러 주세요.</p>
    <button class="big primary huge" id="copyLogin" type="button">앱으로 로그인 옮기기 <small lang="en">Move sign-in to the app</small></button>
    <button class="link-btn" id="stayHere" type="button">이 창에서 그냥 공부하기</button>
  </section>`);
  on('stayHere', () => boot());
  on('copyLogin', async () => {
    let r;
    try { r = await api.handoffCopy(); } catch (e) { return boot(); }
    mount(`<section class="screen center">
      <h1>${r.copied ? '복사했어요' : '한 번만 더 해 주세요'}</h1>
      ${r.copied ? '' : `<p class="lead">아래 칸을 길게 눌러 <b>전체 선택 → 복사</b> 해 주세요.</p>
        <input type="url" readonly value="${esc(r.link)}" id="lk" style="width:100%">`}
      <div class="panel" style="text-align:left">
        <p class="lead"><b>1.</b> 이 창을 닫고 홈 화면의 <b>WannaTalk</b> 앱을 여세요.</p>
        <p class="lead"><b>2.</b> <b>복사한 로그인 붙여넣기</b>를 누르면 끝이에요.</p>
      </div>
      <p class="note">이 창(Safari)에서는 로그아웃됐어요.</p>
    </section>`);
    const lk = $('lk'); if (lk) { lk.focus(); lk.select(); }
  });
}

// 로그인 뒤 어디로 갈지 정하기 ---------------------------------------------------------
export async function boot() {
  loading('불러오는 중이에요…');
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
    state.profile = p;
    api.touchSeen(state.user.id).catch(() => {});
    if (api.freshLogin && api.inIOSBrowser() && !state.handoffShown) { state.handoffShown = true; return handoff(); }
    if (!p.name || !p.role) return go('setup');
    if (p.role === 'friend') return go('friend');
    if (!p.placement) return go('placement');
    return go('home');
  } catch (e) {
    errorScreen('연결이 잘 안 돼요. 인터넷을 확인하고 다시 눌러 주세요.', boot, boot);
  }
}

// 처음 설정 ---------------------------------------------------------------------------
register('setup', () => {
  const p = state.profile;
  mount(`<section class="screen">
    <h1>반가워요!</h1>
    <p class="sub" lang="en">Welcome!</p>
    <div class="form">
      <label for="name">이름 (영어 이름도 좋아요) <span lang="en">· Your name</span></label>
      <input id="name" type="text" autocomplete="given-name" value="${esc(p.name || '')}" placeholder="예: Kim">
      <p class="msg" id="msg" role="alert"></p>
    </div>
    <div class="stack">
      <button class="big primary" id="learner" type="button">영어를 배우러 왔어요</button>
      <button class="big plain" id="friend" type="button" lang="en">I'm here to write to a learner</button>
    </div>
  </section>`);
  async function choose(role) {
    const name = $('name').value.trim();
    if (!name) { $('msg').textContent = '이름을 적어 주세요. · Please enter your name.'; $('name').focus(); return; }
    try {
      state.profile = await api.updateProfile(state.user.id, { name: name.slice(0, 40), role });
      try { await api.myCode(); } catch (e2) { /* 나중에 다시 */ }
      state.profile = await api.getProfile(state.user.id);
      boot();
    } catch (e) {
      $('msg').textContent = '저장하지 못했어요. 다시 눌러 주세요.';
    }
  }
  on('learner', () => choose('learner'));
  on('friend', () => choose('friend'));
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

  const STEPS = [['letter', '편지 읽고 답장하기'], ['cards', '문장 카드'], ['words', '낱말 10개'], ['qa', '묻고 답하기'], ['talk', '3분 대화']];
  const nowStep = resume ? resume.step : null;
  const checklist = STEPS.map(([id, label]) => {
    const done = doneToday || doneSteps.has(id);
    const now = !done && id === nowStep;
    return `<li data-step="${id}" class="${done ? 'done' : ''} ${now ? 'now' : ''}" ${id === 'letter' && !doneSteps.has('letter') ? 'hidden' : ''}>
      <span class="box" aria-hidden="true">${done ? '✓' : ''}</span>
      <span>${label}${now ? ' <small>· 여기서부터</small>' : ''}</span>
      <span class="sr">${done ? '완료' : '아직'}</span>
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

    <div class="dash-card" id="msgCard">
      <p class="label">✉️ 오늘 온 편지</p>
      <p class="muted">확인하는 중…</p>
    </div>

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
  on('toApp', () => handoff());
  on('start', () => go('day', { day }));
  on('review', () => go('day', { day: day - 1, review: true }));
  on('ahead', () => go('day', { day }));

  try {
    const [letter, n, members] = await Promise.all([
      api.pendingLetter(state.user.id), api.countPending(state.user.id), api.myContacts(),
    ]);
    const box = $('msgCard');
    if (!box) return;
    if (letter) {
      const from = (members.find((m) => m.id === letter.from_id) || {}).name || '가족';
      box.classList.add('has-letter');
      box.innerHTML = `<p class="label">✉️ 오늘 온 편지 ${n > 1 ? `<span class="count-pill">${n}통</span>` : ''}</p>
        <p class="from">${esc(from)}님이 보냈어요</p>
        <p class="snippet" lang="en">“${esc(letter.body.length > 90 ? letter.body.slice(0, 90) + '…' : letter.body)}”</p>
        <p class="muted">레슨 처음에 함께 읽고 답장해요.</p>
        <button class="big plain" id="writeMsg" type="button">✉️ 메시지 보내기</button>`;
      const li = document.querySelector('#steps li[data-step="letter"]');
      if (li && !doneToday && !resuming) li.hidden = false;
    } else {
      box.innerHTML = `<p class="label">✉️ 오늘 온 편지</p><p class="muted">아직 온 편지가 없어요.</p>
        <button class="big plain" id="writeMsg" type="button">✉️ 메시지 보내기</button>`;
    }
    on('writeMsg', () => go('message'));
  } catch (e) {
    if ($('msgCard')) $('msgCard').innerHTML = '<p class="label">✉️ 오늘 온 편지</p><p class="muted">편지를 불러오지 못했어요.</p>';
  }
});

// 설정 ------------------------------------------------------------------------------
register('settings', async () => {
  const p = state.profile;
  mount(`<section class="screen scroll">
    <div class="bar">
      <button class="ghost" id="back" type="button">← 돌아가기</button>
      <div class="step-label">설정</div>
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
      <h2>주고받은 편지</h2>
      <div id="letters" class="letters"><p class="muted">불러오는 중…</p></div>
    </div>

    <div id="adminBox"></div>

    <div class="panel">
      <p class="muted">${esc(state.user.email || '')}</p>
      <button class="plain mid" id="logout" type="button">로그아웃</button>
    </div>
  </section>`);

  on('back', () => go('home'));
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
        <a class="big primary admin-link" href="admin.html">관리자 화면으로 전환</a>
        ${meAdmin ? '' : '<button class="plain mid" id="unlinkAdmin" type="button">관리자 계정 연결 끊기</button>'}
      </div>`;
      on('unlinkAdmin', () => { api.disconnectAdmin(); adminBox(false); });
    } else {
      box.innerHTML = '<a class="link-btn" href="admin.html">관리자 계정 연결하기</a>';
    }
  }
  adminBox(false);
  api.isAdmin().then((yes) => { if (yes) adminBox(true); }).catch(() => {});

  try {
    const [letters, members] = await Promise.all([api.myLetters(state.user.id, 20), api.myContacts()]);
    const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
    const box = $('letters');
    if (!box) return;
    box.innerHTML = letters.length
      ? letters.map((l) => `<div class="letter-item ${l.from_id === state.user.id ? 'mine' : ''}">
          <div class="from">${l.from_id === state.user.id ? '내가 보냄' : esc(names[l.from_id] || '가족') + '님이 보냄'} · <span class="muted">${new Date(l.created_at).toLocaleDateString('ko-KR')}</span></div>
          <div lang="en">${esc(l.body)}</div></div>`).join('')
      : '<p class="muted">아직 편지가 없어요.</p>';
  } catch (e) { /* 무시 */ }
});
