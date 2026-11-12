// 로그인, 처음 설정, 홈, 설정 화면
import { state, register, go, mount, on, $, esc, today, loading, errorScreen } from './ui.js';
import * as api from './api.js';
import { TOPICS, topicForDay, cycleForDay, LEVEL_NAMES } from './content.js';
import { TOTAL_DAYS } from './config.js';

// 로그인 ----------------------------------------------------------------------------
register('login', () => {
  let email = '';
  try { email = localStorage.getItem('wt-email') || ''; } catch (e) { /* 무시 */ }

  function stepEmail(msg = '') {
    mount(`<section class="screen">
      <div class="brand">WannaTalk</div>
      <h1>이메일로 시작해요</h1>
      <p class="sub" lang="en">Sign in with your email</p>
      <form id="f" class="form" novalidate>
        <label for="email">이메일 주소</label>
        <input id="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" value="${esc(email)}" placeholder="name@example.com">
        <p class="msg" id="msg" role="alert">${esc(msg)}</p>
        <button class="big primary" type="submit" id="send">로그인 메일 받기 <small lang="en">Email me a sign-in link</small></button>
      </form>
      <p class="note">메일로 로그인 링크를 보내 드려요. 한 번 로그인하면 다음부터는 바로 열려요.</p>
    </section>`);
    $('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      email = $('email').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $('msg').textContent = '이메일 주소를 다시 확인해 주세요.'; return; }
      $('send').disabled = true;
      $('msg').textContent = '보내는 중이에요…';
      try {
        await api.sendCode(email);
        try { localStorage.setItem('wt-email', email); } catch (e2) { /* 무시 */ }
        stepCode();
      } catch (err) {
        $('send').disabled = false;
        $('msg').textContent = /rate|seconds|limit/i.test(err.message || '')
          ? '메일을 너무 자주 보냈어요. 몇 분 뒤에 다시 눌러 주세요.'
          : '메일을 보내지 못했어요. 주소를 확인하고 다시 눌러 주세요.';
      }
    });
  }

  function stepCode(msg = '') {
    mount(`<section class="screen">
      <div class="brand">WannaTalk</div>
      <h1>메일함을 열어 주세요</h1>
      <p class="sub">${esc(email)} <span lang="en">· Check your email</span></p>
      <div class="panel">
        <p class="lead">메일 속 <b lang="en">Sign in</b> 글자를 누르면 바로 로그인돼요.</p>
        <p class="muted" lang="en">Tap “Sign in” in the email we just sent.</p>
      </div>
      <p class="msg" id="msg" role="alert">${esc(msg)}</p>
      <button class="big primary" id="ok" type="button">로그인했어요 <small lang="en">I've signed in</small></button>
      <div class="row">
        <button class="plain mid" id="again" type="button">메일 다시 받기</button>
        <button class="plain mid" id="change" type="button">이메일 바꾸기</button>
      </div>
      <p class="note">메일이 안 보이면 스팸함도 확인해 주세요. 메일은 몇 분에 한 번만 보낼 수 있어요.</p>
    </section>`);
    on('ok', async () => {
      const u = await api.currentUser();
      if (u) { state.user = u; boot(); }
      else $('msg').textContent = '아직 로그인되지 않았어요. 메일 속 Sign in 을 먼저 눌러 주세요.';
    });
    on('again', async () => {
      try { await api.sendCode(email); stepCode('새 메일을 보냈어요.'); }
      catch (err) { stepCode('잠시 뒤에 다시 눌러 주세요.'); }
    });
    on('change', () => stepEmail());
  }

  stepEmail();
});

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
      if (role === 'learner') {
        await api.ensureFamilyCode();
        state.profile = await api.getProfile(state.user.id);
      }
      boot();
    } catch (e) {
      $('msg').textContent = '저장하지 못했어요. 다시 눌러 주세요.';
    }
  }
  on('learner', () => choose('learner'));
  on('friend', () => choose('friend'));
});

// 홈 ------------------------------------------------------------------------------
register('home', async () => {
  const p = state.profile;
  const doneToday = p.last_done_date === today();
  const day = p.day;
  const t = topicForDay(day);
  const cycle = cycleForDay(day);
  const inCycle = ((day - 1) % TOPICS.length) + 1;
  let resume = null;
  try { resume = JSON.parse(localStorage.getItem('wt-progress') || 'null'); } catch (e) { /* 무시 */ }
  const resuming = resume && resume.day === day && resume.i > 0 && !doneToday;

  const dots = TOPICS.map((x, i) =>
    `<span class="dot ${i + 1 < inCycle || (i + 1 === inCycle && doneToday) ? 'done' : ''} ${i + 1 === inCycle && !doneToday ? 'now' : ''}" title="${esc(x.ko)}"></span>`).join('');

  mount(`<section class="screen">
    <div class="bar">
      <div class="brand small">WannaTalk</div>
      <button class="ghost" id="settings" type="button">설정</button>
    </div>
    <h1>${esc(p.name)}님, 안녕하세요</h1>
    <div class="today-card">
      <div class="today-top">
        <span class="daynum">${day}일째</span>
        <span class="muted">${day <= TOTAL_DAYS ? `${TOTAL_DAYS}일 중` : '100일 완주!'}</span>
      </div>
      <div class="today-topic"><span class="emoji" aria-hidden="true">${t.emoji}</span>${esc(t.ko)}</div>
      <div class="today-meta">${cycle}번째 바퀴 · ${p.level}단계 <span class="muted">(${esc(LEVEL_NAMES[p.level])})</span></div>
      <div class="dots" aria-label="이번 바퀴 ${inCycle - (doneToday ? 0 : 1)}/10 완료">${dots}</div>
    </div>
    <div id="letterBox"></div>
    <div class="spacer"></div>
    ${doneToday
      ? `<p class="done-msg">오늘 공부를 마쳤어요. 내일 또 만나요!</p>
         <div class="stack">
           <button class="big plain" id="review" type="button">오늘 공부 다시 하기</button>
           <button class="big primary" id="ahead" type="button">다음 공부 미리 하기</button>
         </div>`
      : `<button class="big primary huge" id="start" type="button">${resuming ? '이어서 하기' : '오늘 공부 시작'}</button>`}
  </section>`);

  on('settings', () => go('settings'));
  on('start', () => go('day', { day }));
  on('review', () => go('day', { day: day - 1, review: true }));
  on('ahead', () => go('day', { day }));

  try {
    const n = await api.countPending(state.user.id);
    if (n > 0 && $('letterBox')) {
      $('letterBox').innerHTML = `<div class="letter-note">✉️ 편지가 ${n}통 와 있어요. 오늘 공부 처음에 함께 읽어요.</div>`;
    }
  } catch (e) { /* 무시 */ }
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
      <h2>가족 번호</h2>
      <p class="family-code">${esc(p.family || '-')}</p>
      <p class="muted">클라라에게 이 번호를 알려 주면 편지를 주고받을 수 있어요.</p>
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

    <div class="panel">
      <p class="muted">${esc(state.user.email || '')}</p>
      <button class="plain mid" id="logout" type="button">로그아웃</button>
    </div>
  </section>`);

  on('back', () => go('home'));
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

  try {
    const [letters, members] = await Promise.all([api.familyLetters(20), api.familyMembers(p.family)]);
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
