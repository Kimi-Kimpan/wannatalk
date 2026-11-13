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
        <p class="lead">듣고, 따라 말하고, 대답하면서 배워요.<br>버튼만 누르면 돼요.</p>
      </div>
      <ul class="feature-list">
        <li><span aria-hidden="true">📖</span>문장 카드</li>
        <li><span aria-hidden="true">🔤</span>낱말 10개</li>
        <li><span aria-hidden="true">💬</span>묻고 답하기</li>
        <li><span aria-hidden="true">🗣️</span>3분 대화</li>
      </ul>
      <div class="spacer"></div>
      <button class="big primary huge" id="start" type="button">레슨 시작하기 <small>로그인 · <span lang="en">Sign in</span></small></button>
      <button class="link-btn" id="toAdmin2" type="button">관리자로 로그인하기</button>
    </section>`);
    on('start', () => { admin = false; stepEmail(); });
    on('toAdmin', () => { admin = true; stepEmail(); });
    on('toAdmin2', () => { admin = true; stepEmail(); });
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
        $('msg').textContent = /rate|seconds|limit/i.test(err.message || '')
          ? '메일을 너무 자주 보냈어요. 몇 분 뒤에 다시 눌러 주세요.'
          : admin ? '보내지 못했어요. 관리자 이메일이 맞는지, 앱에 가입된 주소인지 확인해 주세요.'
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
        <p class="lead">메일 속 <b lang="en">Sign in</b> 글자를 누르면 바로 ${admin ? '관리자 화면이 열려요' : '로그인돼요'}.</p>
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
      if (!u) { $('msg').textContent = '아직 로그인되지 않았어요. 메일 속 Sign in 을 먼저 눌러 주세요.'; return; }
      if (admin) { location.href = 'admin.html'; return; }
      state.user = u;
      boot();
    });
    on('again', async () => {
      try { await api.sendCode(email, { admin }); stepCode('새 메일을 보냈어요.'); }
      catch (err) { stepCode('잠시 뒤에 다시 눌러 주세요.'); }
    });
    on('change', () => stepEmail());
  }

  landing();
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
    api.touchSeen(state.user.id).catch(() => {});
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
  const resuming = resume && resume.day === day && resume.i > 0 && !doneToday;
  const nextT = topicForDay(day);

  const dots = TOPICS.map((x, i) =>
    `<span class="dot ${i + 1 < inCycle || (i + 1 === inCycle && doneToday) ? 'done' : ''} ${i + 1 === inCycle && !doneToday ? 'now' : ''}" title="${esc(x.ko)}"></span>`).join('');

  mount(`<section class="screen">
    <div class="bar">
      <div class="brand small">WannaTalk</div>
      <button class="ghost" id="settings" type="button">설정</button>
    </div>
    <h1>${esc(p.name)}님, 안녕하세요</h1>

    <div class="dash-card progress-card">
      ${gauge(Math.min(doneDays, TOTAL_DAYS), TOTAL_DAYS)}
      <div class="progress-info">
        <p class="label">전체 진행</p>
        <p class="big-line">${doneDays}일 공부했어요</p>
        <p class="muted">${cycle}번째 바퀴 · ${p.level}단계</p>
        <div class="dots" aria-label="이번 바퀴 ${inCycle - (doneToday ? 0 : 1)}/10 완료">${dots}</div>
      </div>
    </div>

    <div class="dash-card" id="msgCard">
      <p class="label">✉️ 오늘 온 편지</p>
      <p class="muted">확인하는 중…</p>
    </div>

    <div class="dash-card lesson-card">
      <p class="label">${doneToday ? '✅ 오늘 레슨을 마쳤어요' : '📚 오늘의 레슨'}</p>
      <div class="today-topic"><span class="emoji" aria-hidden="true">${nextT.emoji}</span>${doneToday ? '다음: ' : ''}${esc(nextT.ko)}</div>
      <p class="muted">${day}일째 · ${esc(LEVEL_NAMES[p.level])}</p>
      <ol class="steps" id="steps">
        <li id="stepLetter" hidden>✉️ 편지 읽고 답장</li>
        <li>📖 문장 카드</li>
        <li>🔤 낱말 10개</li>
        <li>💬 묻고 답하기</li>
        <li>🗣️ 3분 대화</li>
      </ol>
    </div>

    <div class="spacer"></div>
    ${doneToday
      ? `<div class="stack">
           <button class="big primary" id="ahead" type="button">다음 레슨 미리 하기</button>
           <button class="big plain" id="review" type="button">오늘 레슨 다시 하기</button>
         </div>`
      : `<button class="big primary huge" id="start" type="button">${resuming ? '이어서 하기' : '오늘 레슨 시작'}</button>`}
  </section>`);

  on('settings', () => go('settings'));
  on('start', () => go('day', { day }));
  on('review', () => go('day', { day: day - 1, review: true }));
  on('ahead', () => go('day', { day }));

  try {
    const [letter, n, members] = await Promise.all([
      api.pendingLetter(state.user.id), api.countPending(state.user.id), api.familyMembers(p.family),
    ]);
    const box = $('msgCard');
    if (!box) return;
    if (letter) {
      const from = (members.find((m) => m.id === letter.from_id) || {}).name || '가족';
      box.classList.add('has-letter');
      box.innerHTML = `<p class="label">✉️ 오늘 온 편지 ${n > 1 ? `<span class="count-pill">${n}통</span>` : ''}</p>
        <p class="from">${esc(from)}님이 보냈어요</p>
        <p class="snippet" lang="en">“${esc(letter.body.length > 90 ? letter.body.slice(0, 90) + '…' : letter.body)}”</p>
        <p class="muted">레슨 처음에 함께 읽고 답장해요.</p>`;
      if ($('stepLetter')) $('stepLetter').hidden = false;
    } else {
      box.innerHTML = `<p class="label">✉️ 오늘 온 편지</p><p class="muted">아직 온 편지가 없어요.</p>`;
    }
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
      <div id="adminLink"></div>
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
  api.isAdmin().then((yes) => {
    if (yes && $('adminLink')) $('adminLink').innerHTML = '<a class="big plain admin-link" href="admin.html">관리자 화면 열기</a>';
  }).catch(() => {});

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
