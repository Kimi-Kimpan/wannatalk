// WannaTalk 관리자 화면
import { sb, configured, signInWithLink, freshLogin, inIOSBrowser, handoffCopy, loginWithId } from './api.js';
import { TOPICS, LEVEL_NAMES } from './content.js';
import { TOTAL_DAYS } from './config.js';

const root = document.getElementById('root');
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TOPIC_KO = Object.fromEntries(TOPICS.map((t) => [t.id, `${t.emoji} ${t.ko}`]));
const KIND_KO = { qa: '묻고 답하기', talk: '3분 대화', letter: '편지 답장' };
const today = () => new Date().toLocaleDateString('sv-SE');

let users = [];
let selected = null;

// 날짜 표시 -----------------------------------------------------------------------
const rtf = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });
function ago(iso) {
  if (!iso) return '-';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return '방금';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}
function daysSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}
function seenPill(iso) {
  const d = daysSince(iso);
  if (d < 1) return '<span class="pill good">오늘</span>';
  if (d < 3) return '<span class="pill plain">최근</span>';
  if (d < 7) return '<span class="pill warn">3일+</span>';
  if (d === Infinity) return '<span class="pill plain">없음</span>';
  return '<span class="pill bad">7일+</span>';
}
function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
}
const lastSeen = (u) => u.last_seen_at || u.last_sign_in_at;

// 로그인 -------------------------------------------------------------------------
function loginView(msg = '') {
  root.innerHTML = `<div class="center">
    <div class="brand">WannaTalk</div>
    <h1>관리자 로그인</h1>
    <form id="idf" class="login" novalidate>
      <input id="uid" type="text" autocomplete="username" autocapitalize="off" placeholder="아이디" aria-label="아이디">
      <input id="pw" type="password" autocomplete="current-password" placeholder="비밀번호" aria-label="비밀번호">
      <button class="btn primary" type="submit" style="min-height:46px">아이디로 로그인</button>
    </form>
    <p class="muted" style="font-size:14px">또는 로그인 메일 받기</p>
    <form id="f" class="login" novalidate>
      <input id="email" type="email" autocomplete="email" placeholder="관리자 이메일" aria-label="관리자 이메일">
      <button class="btn primary" type="submit">로그인 메일 받기</button>
      <p class="msg" id="msg" role="alert">${esc(msg)}</p>
    </form>
    <form id="lf" class="login" novalidate>
      <label class="muted" for="link" style="font-size:14px">아이폰 앱에서는: 메일 속 Sign in 을 누르면 Safari 가 열려요. 거기서 "앱으로 로그인 옮기기"를 누른 뒤 여기로 돌아와 아래 버튼을 누르세요.</label>
      <button class="btn primary" id="pasteBtn" type="button" style="min-height:52px;font-size:17px">복사한 로그인 붙여넣기</button>
      <input id="link" type="url" inputmode="url" autocomplete="off" placeholder="https://…" aria-label="로그인 링크">
      <button class="btn" type="submit">이 링크로 로그인</button>
    </form>
    <a class="btn" href="./" style="align-self:center">앱으로 돌아가기</a>
  </div>`;
  $('pasteBtn').addEventListener('click', async () => {
    let t = '';
    try { t = (await navigator.clipboard.readText() || '').trim(); } catch (err) { /* 권한 없음 */ }
    if (!t) { $('msg').textContent = '복사한 로그인이 없어요. 아래 칸에 길게 눌러 붙여넣어 주세요.'; return; }
    $('msg').textContent = '확인하는 중…';
    try { await signInWithLink(t); start(); }
    catch (err) { $('msg').textContent = '이 로그인은 만료됐어요. 메일을 다시 받아 주세요.'; }
  });
  $('idf').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('msg').textContent = '확인하는 중…';
    try { await loginWithId($('uid').value.trim(), $('pw').value); start(); }
    catch (err) { $('msg').textContent = err.message === 'too_many' ? '여러 번 틀려서 잠시 막혔어요. 한 시간 뒤 다시 해 주세요.' : '아이디나 비밀번호가 맞지 않아요.'; }
  });
  $('lf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = $('link').value.trim();
    if (!v) return;
    $('msg').textContent = '확인하는 중…';
    try { await signInWithLink(v); start(); }
    catch (err) { $('msg').textContent = '이 링크는 이미 쓰였거나 만료됐어요. 메일을 다시 받아 주세요.'; }
  });
  $('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('email').value.trim().toLowerCase();
    if (!email.includes('@')) { $('msg').textContent = '이메일을 확인해 주세요.'; return; }
    $('msg').textContent = '보내는 중…';
    const { error } = await sb.auth.signInWithOtp({
      email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
    });
    $('msg').textContent = !error ? '메일함에서 Sign in 을 눌러 주세요.'
      : /rate|seconds|429|too many/i.test(error.message || '') || error.status === 429
        ? '로그인 메일을 너무 많이 보냈어요. 지금 설정에서는 한 시간에 2통까지만 보낼 수 있어서, 잠시 뒤 다시 해 주세요.'
        : '보내지 못했어요. 관리자 이메일이 맞는지 확인해 주세요.';
  });
}

// 첫 화면 ------------------------------------------------------------------------
async function start() {
  if (!configured) { root.innerHTML = '<p>js/config.js 설정이 필요해요.</p>'; return; }
  const { data } = await sb.auth.getSession();
  if (!data.session) return loginView(window.__wtAuthErr ? '이 로그인 링크는 이미 쓰였거나 만료됐어요. 가장 최근에 받은 메일의 링크만 돼요. 메일을 다시 받아 주세요.' : '');
  if (freshLogin && inIOSBrowser() && !window.__wtHandoffShown) return handoffView();
  await afterLogin();
}

function handoffView() {
  {
    window.__wtHandoffShown = true;
    root.innerHTML = `<div class="center">
      <div class="brand">WannaTalk</div>
      <h1>관리자로 로그인됐어요</h1>
      <p class="muted">홈 화면의 WannaTalk 앱에서 관리자 화면을 쓰려면 아래 버튼을 눌러 주세요.</p>
      <button class="btn primary" id="copyLogin" type="button" style="min-height:52px;font-size:17px">앱으로 로그인 옮기기</button>
      <button class="btn" id="stayHere" type="button">이 창에서 그냥 보기</button>
    </div>`;
    $('stayHere').addEventListener('click', afterLogin);
    $('copyLogin').addEventListener('click', async () => {
      const r = await handoffCopy(sb, 'admin.html');
      root.innerHTML = `<div class="center"><h1>${r.copied ? '복사했어요' : '아래 주소를 복사해 주세요'}</h1>
        ${r.copied ? '' : `<input class="login" readonly value="${esc(r.link)}">`}
        <p>이 창을 닫고 앱의 <b>설정 → 관리자 계정 연결하기</b>에서 <b>복사한 로그인 붙여넣기</b>를 누르세요.</p>
        <p class="muted">이 창(Safari)에서는 로그아웃됐어요.</p></div>`;
    });
  }
}

async function afterLogin() {
  const { data } = await sb.auth.getSession();
  const { data: admin } = await sb.rpc('is_admin');
  if (admin !== true) {
    root.innerHTML = `<div class="center"><h1>관리자 계정이 아니에요</h1>
      <p class="muted">${esc(data.session.user.email)} 으로 로그인되어 있어요.</p>
      <button class="btn" id="out" type="button">로그아웃</button></div>`;
    $('out').addEventListener('click', async () => { await sb.auth.signOut({ scope: 'local' }); loginView(); });
    return;
  }
  await loadUsers();
}

let removed = []; // 삭제해서 보관 중인 계정
let isOwner = false, adminIds = {}; // 대표 관리자만 권한을 주고 뺄 수 있어요
const KEEP_DAYS = 30;
async function loadUsers() {
  root.innerHTML = '<p class="muted">사용자 불러오는 중…</p>';
  await sb.rpc('admin_purge_deleted').then(() => {}, () => {});   // 30일 지난 보관 계정 정리
  const { data, error } = await sb.rpc('admin_users');
  if (error) { root.innerHTML = `<p>불러오지 못했어요: ${esc(error.message)}</p>`; return; }
  const del = await sb.rpc('admin_deleted').then((r) => r.data || [], () => []);
  const delAt = Object.fromEntries(del.map((d) => [d.id, d.deleted_at]));
  removed = (data || []).filter((u) => delAt[u.id]).map((u) => ({ ...u, deleted_at: delAt[u.id] }));
  users = (data || []).filter((u) => !delAt[u.id]);
  if (selected && !users.some((u) => u.id === selected)) selected = null;
  // 대표 관리자에게만 관리자 목록이 보여요
  const al = await sb.rpc('admin_list').then((r) => (r.error ? null : r.data || []), () => null);
  isOwner = !!al;
  adminIds = Object.fromEntries((al || []).map((a) => [a.user_id, a.owner ? 'owner' : 'admin']));
  render();
  loadSignup();
  loadUsage();
}

// AI 사용량 (이번 달, 추정 금액) ---------------------------------------------------------
const ACTION_KO = { pack: '수업 만들기', check: '대답 확인', chat: '3분 대화', letter: '편지 읽기', polish: '답장 다듬기', tts: '목소리', stt: '말 받아 적기', compose: '메시지 쓰기' };
let usageRange = 'month';
async function loadUsage() {
  const box = $('usage');
  if (!box) return;
  const now = new Date();
  const since = usageRange === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getTime() - 86400000);
  const { data, error } = await sb.rpc('admin_usage', { since: since.toISOString() });
  if (error) { box.innerHTML = '<div class="panel-head"><h2>AI 사용량</h2></div><p class="empty">불러오지 못했어요 (004_contacts_usage.sql 실행 필요)</p>'; return; }
  const rows = data || [];
  const total = rows.reduce((a, r) => a + Number(r.cost_usd || 0), 0);
  const calls = rows.reduce((a, r) => a + Number(r.calls || 0), 0);
  const byUser = {}, byAction = {};
  rows.forEach((r) => {
    const k = r.name || r.email || '(알 수 없음)';
    byUser[k] = (byUser[k] || 0) + Number(r.cost_usd || 0);
    byAction[r.action] = (byAction[r.action] || { cost: 0, calls: 0 });
    byAction[r.action].cost += Number(r.cost_usd || 0);
    byAction[r.action].calls += Number(r.calls || 0);
  });
  const usd = (x) => '$' + (x < 0.01 && x > 0 ? x.toFixed(4) : x.toFixed(2));
  const pct = (x) => (total > 0 ? Math.round((x / total) * 100) + '%' : '-');
  box.innerHTML = `<div class="panel-head"><h2>AI 사용량 <span class="muted" style="font-size:14px">(요금표로 계산한 추정치)</span></h2>
      <div class="row"><button class="btn ${usageRange === 'day' ? 'primary' : ''}" data-r="day" type="button">최근 24시간</button><button class="btn ${usageRange === 'month' ? 'primary' : ''}" data-r="month" type="button">이번 달</button></div></div>
    <div class="usage-grid">
      <div><div class="label">합계</div><div class="value">${usd(total)}</div><div class="sub">호출 ${calls}번</div></div>
      <div><div class="label">사람별</div>${Object.entries(byUser).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${usd(v)} · ${pct(v)}</b></div>`).join('') || '<p class="muted">아직 없어요</p>'}</div>
      <div><div class="label">기능별</div>${Object.entries(byAction).sort((a, b) => b[1].cost - a[1].cost).map(([k, v]) => `<div class="kv"><span>${esc(ACTION_KO[k] || k)}</span><b>${usd(v.cost)} · ${v.calls}번</b></div>`).join('') || '<p class="muted">아직 없어요</p>'}</div>
    </div>
    <p class="muted" style="padding:0 16px 14px;font-size:13px">정확한 청구 금액은 OpenAI 사이트(platform.openai.com → Usage)에서 확인하세요. Gemini 는 무료 키라 $0 으로 셉니다.</p>`;
  box.querySelectorAll('button[data-r]').forEach((b) => b.addEventListener('click', () => { usageRange = b.dataset.r; loadUsage(); }));
}

// 가입 인원 제한 ---------------------------------------------------------------------
async function loadSignup() {
  const box = $('signup');
  if (!box) return;
  const { data, error } = await sb.rpc('admin_signup_settings');
  if (error || !data || !data[0]) { box.innerHTML = '<div class="label">가입 제한</div><div class="sub">불러오지 못했어요 (003_signup_limit.sql 실행 필요)</div>'; return; }
  const { users: n, max_users: max } = data[0];
  const full = max != null && Number(n) >= max;
  box.innerHTML = `<div class="label">가입 제한</div>
    <div class="value">${Number(n)}<span class="muted" style="font-size:18px"> / ${max == null ? '제한 없음' : max + '명'}</span></div>
    <div class="sub">${full ? '<b class="bad-text">가득 찼어요 · 새 가입이 막혀 있어요</b>' : max == null ? '누구나 가입할 수 있어요' : `${max - Number(n)}명 더 가입할 수 있어요`}</div>
    <div class="row" style="margin-top:8px">
      <button class="btn" data-n="${max == null ? Number(n) : max + 5}" type="button">${max == null ? '지금 인원으로 막기' : '+5명'}</button>
      <button class="btn" data-n="10" type="button">10명</button>
      ${max == null ? '' : '<button class="btn" data-n="" type="button">제한 풀기</button>'}
    </div>`;
  box.querySelectorAll('button[data-n]').forEach((b) => b.addEventListener('click', async () => {
    const v = b.dataset.n === '' ? null : Number(b.dataset.n);
    if (v === null && !confirm('제한을 풀면 주소를 아는 누구나 가입하고 AI 크레딧을 쓸 수 있어요. 풀까요?')) return;
    b.disabled = true;
    const { error: e2 } = await sb.rpc('admin_set_max_users', { n: v });
    if (e2) alert('바꾸지 못했어요: ' + e2.message);
    loadSignup();
  }));
}

function render() {
  const learners = users.filter((u) => u.role === 'learner');
  const seenToday = users.filter((u) => daysSince(lastSeen(u)) < 1).length;
  const doneToday = learners.filter((u) => u.last_done_date === today()).length;
  const entries = users.reduce((s, u) => s + Number(u.entries || 0), 0);

  root.innerHTML = `
    <div class="head">
      <div><div class="brand">WannaTalk</div><h1>관리자 대시보드</h1></div>
      <div class="row">
        <button class="btn" id="refresh" type="button">새로고침</button>
        ${inIOSBrowser() ? '<button class="btn primary" id="toApp" type="button">앱으로 로그인 옮기기</button>' : ''}
        <a class="btn" href="./">학습 화면</a>
        <button class="btn" id="out" type="button">로그아웃</button>
      </div>
    </div>

    <div class="tiles">
      <div class="tile"><div class="label">전체 사용자</div><div class="value">${users.length}</div><div class="sub">학습자 ${learners.length} · 가족 ${users.length - learners.length}</div></div>
      <div class="tile"><div class="label">오늘 접속</div><div class="value">${seenToday}</div><div class="sub">지난 24시간</div></div>
      <div class="tile"><div class="label">오늘 공부 완료</div><div class="value">${doneToday}<span class="muted" style="font-size:18px"> / ${learners.length}</span></div><div class="sub">학습자 기준</div></div>
      <div class="tile" id="signup"><div class="label">가입 제한</div><div class="sub">불러오는 중…</div></div>
      <div class="tile"><div class="label">자서전 기록</div><div class="value">${entries}</div><div class="sub">모인 대답 수</div></div>
    </div>

    <section class="panel" id="usage"><div class="panel-head"><h2>AI 사용량</h2></div><p class="empty">불러오는 중…</p></section>

    <section class="panel">
      <div class="panel-head"><h2>사용자</h2><span class="muted">줄을 누르면 자세히 보여요</span></div>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>이름</th><th>역할</th><th>단계</th><th>진도</th><th>공부한 날</th><th>평균 점수</th><th>마지막 공부</th><th>마지막 접속</th><th>안 읽은 편지</th>
          </tr></thead>
          <tbody>${users.map((u) => row(u)).join('') || '<tr><td colspan="9" class="empty">아직 사용자가 없어요.</td></tr>'}</tbody>
        </table>
      </div>
    </section>

    ${removed.length ? `<section class="panel">
      <div class="panel-head"><h2>삭제된 계정</h2><span class="muted">${KEEP_DAYS}일 동안 보관한 뒤 완전히 지워져요. 그 전에는 복원할 수 있어요.</span></div>
      <div class="list">${removed.map((u) => {
        const left = Math.max(0, Math.ceil(KEEP_DAYS - daysSince(u.deleted_at)));
        return `<div class="removed-row" data-id="${esc(u.id)}">
          <div class="who"><b>${esc(u.name || '(이름 없음)')}</b> <small>${esc(u.email)}</small><br><span class="muted">${fmtDate(u.deleted_at)} 삭제 · ${left}일 뒤 완전히 삭제</span></div>
          <div class="row"><button class="btn primary act-restore" type="button">복원</button><button class="btn danger act-purge" type="button">지금 완전히 삭제</button></div>
        </div>`; }).join('')}</div>
      <p class="muted" id="removedMsg" role="status"></p>
    </section>` : ''}

    <section id="detail"></section>`;

  $('refresh').addEventListener('click', loadUsers);
  root.querySelectorAll('.removed-row').forEach((r) => {
    const id = r.dataset.id;
    r.querySelector('.act-restore').addEventListener('click', async () => {
      const { error } = await sb.rpc('admin_restore_user', { uid: id });
      if (error) { $('removedMsg').textContent = '복원하지 못했어요. 다시 눌러 주세요.'; return; }
      loadUsers();
    });
    const purge = r.querySelector('.act-purge');
    purge.addEventListener('click', async () => {
      if (!purge.dataset.sure) { purge.dataset.sure = '1'; purge.textContent = '되돌릴 수 없어요 · 한 번 더 누르면 삭제'; return; }
      purge.disabled = true;
      const { error } = await sb.rpc('admin_purge_user', { uid: id });
      if (error) { purge.disabled = false; $('removedMsg').textContent = '삭제하지 못했어요. 다시 눌러 주세요.'; return; }
      loadUsers();
    });
  });
  if ($('toApp')) $('toApp').addEventListener('click', handoffView);
  $('out').addEventListener('click', async () => { await sb.auth.signOut({ scope: 'local' }); loginView(); });
  root.querySelectorAll('tbody tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openUser(tr.dataset.id)));
  if (selected) openUser(selected);
}

function row(u) {
  const learner = u.role === 'learner';
  const done = Math.max(0, (u.day || 1) - 1);
  const pct = Math.min(100, Math.round((done / TOTAL_DAYS) * 100));
  const score = u.avg_score == null ? '-' : Math.round(Number(u.avg_score) * 100) + '점';
  return `<tr data-id="${esc(u.id)}" class="${u.id === selected ? 'sel' : ''}">
    <td class="who"><b>${esc(u.name || '(이름 없음)')}</b>${adminIds[u.id] ? ` <span class="pill">${adminIds[u.id] === 'owner' ? '대표 관리자' : '관리자'}</span>` : ''}<small>${esc(u.email)}</small></td>
    <td>${learner ? '학습자' : u.role === 'friend' ? '가족' : '-'}</td>
    <td class="num">${learner ? u.level + '단계' : '-'}</td>
    <td>${learner ? `<span class="bar"><span style="width:${pct}%"></span></span><span class="num">${done}/${TOTAL_DAYS}</span>` : '-'}</td>
    <td class="num">${learner ? u.packs_done + '일' : '-'}</td>
    <td class="num">${learner ? score : '-'}</td>
    <td class="num">${u.last_done_date || '-'}</td>
    <td>${seenPill(lastSeen(u))} <span class="muted">${ago(lastSeen(u))}</span></td>
    <td class="num">${learner ? (Number(u.letters_pending) ? `<span class="pill warn">${u.letters_pending}통</span>` : '0') : '-'}</td>
  </tr>`;
}

// 사용자 자세히 ----------------------------------------------------------------------
async function openUser(id) {
  selected = id;
  root.querySelectorAll('tbody tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.id === id));
  const u = users.find((x) => x.id === id);
  const box = $('detail');
  if (!u || !box) return;
  box.innerHTML = '<section class="panel"><p class="empty">불러오는 중…</p></section>';

  const [packs, entries, notes, letters] = await Promise.all([
    sb.from('daily_packs').select('day,topic,level,score,done_at').eq('user_id', id).order('day', { ascending: true }),
    sb.from('story_entries').select('*').eq('user_id', id).order('created_at', { ascending: true }),
    sb.from('story_notes').select('fact,topic,created_at').eq('user_id', id).order('created_at', { ascending: true }),
    u.family ? sb.from('letters').select('*').eq('family', u.family).order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
  ]);
  if (selected !== id) return;
  const P = packs.data || [], E = entries.data || [], N = notes.data || [], L = letters.data || [];
  const pl = u.placement || {};
  const names = Object.fromEntries(users.map((x) => [x.id, x.name || x.email]));

  box.innerHTML = `<section class="panel">
    <div class="panel-head">
      <div><h2>${esc(u.name || u.email)}</h2><span class="muted">${esc(u.email)} · 가입 ${fmtDate(u.created_at)}</span></div>
      <div class="row">
        <button class="btn" id="copyMemoir" type="button">자서전 자료 복사</button>
        <button class="btn primary" id="dlMemoir" type="button">자서전 자료 내려받기 (.md)</button>
        ${isOwner && adminIds[id] !== 'owner' ? `<button class="btn" id="adminToggle" type="button">${adminIds[id] ? '관리자 권한 빼기' : '관리자 권한 주기'}</button>` : ''}
        <button class="btn" id="resetUser" type="button">처음 상태로 되돌리기</button>
        <button class="btn danger" id="delUser" type="button">계정 삭제</button>
      </div>
    </div>
    <div class="del-confirm" id="resetConfirm" hidden>
      <span><b>${esc(u.name || u.email)}</b> 계정을 방금 가입한 상태로 되돌릴까요? 이름·태그·실력 테스트·진도와 레슨, 이야기 노트, 자서전 기록이 <b>모두 지워지고 되돌릴 수 없어요.</b> 로그인 정보와 편지는 그대로예요. 다음에 앱을 열면 이름 입력과 처음 질문부터 다시 시작해요.</span>
      <span class="row"><button class="btn danger" id="resetYes" type="button">되돌리기</button><button class="btn" id="resetNo" type="button">취소</button></span>
      <span class="muted" id="resetMsg" role="alert"></span>
    </div>
    <div class="del-confirm" id="delConfirm" hidden>
      <span><b>${esc(u.name || u.email)}</b> 계정을 삭제할까요? 바로 들어올 수 없게 되고, 자료는 ${KEEP_DAYS}일 동안 보관돼서 그 안에는 복원할 수 있어요.</span>
      <span class="row"><button class="btn danger" id="delYes" type="button">삭제</button><button class="btn" id="delNo" type="button">취소</button></span>
      <span class="muted" id="delMsg" role="alert"></span>
    </div>
    <div class="detail">
      <div class="facts">
        <div class="fact"><div class="label">지금 단계</div><div class="value">${u.level}단계 · ${esc(LEVEL_NAMES[u.level] || '')}</div></div>
        <div class="fact"><div class="label">첫 테스트</div><div class="value num">${pl.total != null ? Math.round(pl.total * 100) + '점 → ' + pl.level + '단계' : '-'}</div></div>
        <div class="fact"><div class="label">진도</div><div class="value num">${Math.max(0, u.day - 1)}일 완료 / ${TOTAL_DAYS}</div></div>
        <div class="fact"><div class="label">마지막 접속</div><div class="value">${fmtDate(lastSeen(u))}</div></div>
        <div class="fact"><div class="label">이야기 노트</div><div class="value num">${N.length}개</div></div>
        <div class="fact"><div class="label">자서전 기록</div><div class="value num">${E.length}개</div></div>
      </div>
      <div class="bg-box" id="bgBox"><h3>배경</h3><p class="muted">불러오는 중…</p></div>
      <div class="chart"><h3>하루 점수 추이</h3>${scoreChart(P)}</div>
      <div class="tabs" role="tablist">
        <button class="tab" role="tab" aria-selected="true" data-tab="memoir" type="button">자서전 자료</button>
        <button class="tab" role="tab" aria-selected="false" data-tab="notes" type="button">이야기 노트</button>
        <button class="tab" role="tab" aria-selected="false" data-tab="letters" type="button">편지</button>
      </div>
      <div id="tabBody"></div>
    </div>
  </section>`;

  backgroundBox(id);
  if ($('adminToggle')) $('adminToggle').addEventListener('click', async () => {
    const b = $('adminToggle');
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = adminIds[id] ? '한 번 더 누르면 권한을 빼요' : '한 번 더 누르면 관리자가 돼요'; return; }
    b.disabled = true;
    const { error } = await sb.rpc(adminIds[id] ? 'admin_revoke' : 'admin_grant', { uid: id });
    if (error) { b.disabled = false; b.textContent = '안 됐어요. 다시 눌러 주세요'; delete b.dataset.sure; return; }
    loadUsers();
  });
  $('resetUser').addEventListener('click', () => { $('resetConfirm').hidden = false; $('delConfirm').hidden = true; });
  $('resetNo').addEventListener('click', () => { $('resetConfirm').hidden = true; });
  $('resetYes').addEventListener('click', async () => {
    const b = $('resetYes');
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '정말요? 한 번 더 누르면 지워져요'; return; }
    b.disabled = true;
    const { error } = await sb.rpc('admin_reset_user', { uid: id });
    if (error) { b.disabled = false; $('resetMsg').textContent = '되돌리지 못했어요. 다시 눌러 주세요.'; return; }
    loadUsers();
  });
  $('delUser').addEventListener('click', () => { $('delConfirm').hidden = false; $('resetConfirm').hidden = true; });
  $('delNo').addEventListener('click', () => { $('delConfirm').hidden = true; });
  $('delYes').addEventListener('click', async () => {
    $('delYes').disabled = true;
    const { error } = await sb.rpc('admin_delete_user', { uid: id });
    if (error) {
      $('delYes').disabled = false;
      $('delMsg').textContent = /self/.test(error.message) ? '지금 로그인한 내 계정은 삭제할 수 없어요.'
        : /cannot_delete_admin/.test(error.message) ? '관리자 계정은 대표 관리자만 삭제할 수 있어요. (대표 관리자 계정은 삭제할 수 없어요)' : '삭제하지 못했어요. 다시 눌러 주세요.';
      return;
    }
    selected = null;
    loadUsers();
  });

  const bodies = {
    memoir: () => memoirHtml(E),
    notes: () => N.length
      ? `<ul class="list">${N.map((n) => `<li><span class="muted">${esc(TOPIC_KO[n.topic] || '')}</span> <span lang="en">${esc(n.fact)}</span></li>`).join('')}</ul>`
      : '<p class="empty">아직 없어요.</p>',
    letters: () => L.length
      ? `<div class="list">${L.map((l) => `<div class="entry ${l.from_id === id ? 'qa' : 'letter'}">
          <div class="meta">${esc(names[l.from_id] || '가족')} → ${esc(names[l.to_id] || '가족')} · ${fmtDate(l.created_at)}</div>
          <div lang="en">${esc(l.body)}</div></div>`).join('')}</div>`
      : '<p class="empty">아직 없어요.</p>',
  };
  const show = (k) => {
    box.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === k)));
    $('tabBody').innerHTML = bodies[k]();
  };
  box.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));
  show('memoir');

  const md = memoirMarkdown(u, E, N);
  $('copyMemoir').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(md); $('copyMemoir').textContent = '복사했어요'; }
    catch (e) { $('copyMemoir').textContent = '복사가 안 돼요'; }
  });
  $('dlMemoir').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    a.download = `${(u.name || 'story').replace(/[^\w가-힣-]+/g, '_')}_자서전자료_${today()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}

// 배경: 클라우디아가 이 사용자에게 맞는 주제를 고르도록 붙이는 태그와 메모 ------------------
const BG_IDEAS = ['60대', '70대', '남성', '여성', '직장인', '은퇴', '주부', '손주 있음', '혼자 삶', '여행 좋아함', '요리 좋아함', '등산 좋아함', '해외에 가족 있음'];
async function backgroundBox(id) {
  const box = $('bgBox');
  if (!box) return;
  const { data, error } = await sb.from('profiles').select('background_tags,background_note').eq('id', id).maybeSingle();
  if (selected !== id || !$('bgBox')) return;
  if (error) { box.innerHTML = '<h3>배경</h3><p class="empty">아직 쓸 수 없어요. (데이터베이스 준비가 필요해요)</p>'; return; }
  let tags = (data && data.background_tags) || [];
  const note = (data && data.background_note) || '';
  box.innerHTML = `<h3>배경 <span class="muted">· 클라우디아가 이 사용자에게 맞는 대화 주제를 고를 때 참고해요 (태그 최대 10개)</span></h3>
    <div class="bg-tags" id="bgTags"></div>
    <form class="bg-add" id="bgAdd"><input id="bgIn" type="text" maxlength="40" placeholder="태그 적기 (예: 병원 근무, 손주 2명)" aria-label="새 태그"><button class="btn" type="submit">추가</button></form>
    <div class="bg-ideas" id="bgIdeas"></div>
    <label class="label" for="bgNote">메모 (자유롭게, 한국어나 영어)</label>
    <textarea id="bgNote" rows="3" maxlength="300" placeholder="예: 딸이 캐나다에 살아서 손주와 영어로 이야기하고 싶어 해요.">${esc(note)}</textarea>
    <div class="row"><button class="btn primary" id="bgSave" type="button">배경 저장</button><span class="muted" id="bgMsg" role="status"></span></div>`;
  const draw = () => {
    $('bgTags').innerHTML = tags.length
      ? tags.map((t, i) => `<span class="bg-tag">${esc(t)}<button type="button" data-i="${i}" aria-label="${esc(t)} 지우기">×</button></span>`).join('')
      : '<span class="muted">아직 태그가 없어요. 비어 있으면 클라우디아는 직업·가족을 짐작하지 않고 일반적인 질문만 해요.</span>';
    $('bgTags').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { tags.splice(Number(b.dataset.i), 1); draw(); dirty(); }));
    $('bgIdeas').innerHTML = BG_IDEAS.filter((t) => !tags.includes(t)).map((t) => `<button class="bg-idea" type="button">+ ${esc(t)}</button>`).join('');
    $('bgIdeas').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => add(b.textContent.slice(2))));
  };
  const dirty = () => { $('bgMsg').textContent = '저장하지 않은 변경이 있어요'; };
  const add = (t) => {
    t = String(t || '').trim().slice(0, 40);
    if (!t || tags.includes(t) || tags.length >= 10) return;
    tags = tags.concat(t); draw(); dirty();
  };
  draw();
  $('bgAdd').addEventListener('submit', (e) => { e.preventDefault(); add($('bgIn').value); $('bgIn').value = ''; });
  $('bgNote').addEventListener('input', dirty);
  $('bgSave').addEventListener('click', async () => {
    $('bgSave').disabled = true;
    const { error: err } = await sb.rpc('admin_set_background', { uid: id, tags, note: $('bgNote').value.trim() });
    if (!$('bgSave')) return;
    $('bgSave').disabled = false;
    $('bgMsg').textContent = err ? '저장하지 못했어요. 다시 눌러 주세요.' : '저장했어요. 다음 레슨·대화부터 적용돼요.';
  });
}

// 점수 막대 (하루 1칸, 0~100점)
function scoreChart(P) {
  const done = P.filter((p) => p.score && typeof p.score.total === 'number');
  if (!done.length) return '<p class="empty">아직 마친 공부가 없어요.</p>';
  const last = done.slice(-40);
  const W = 800, H = 140, padL = 34, padB = 22, padT = 8;
  const bw = (W - padL - 8) / Math.max(last.length, 10);
  const y = (v) => padT + (1 - v) * (H - padT - padB);
  const grid = [0, 0.5, 1].map((v) => `<line x1="${padL}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v * 100}</text>`).join('');
  const bars = last.map((p, i) => {
    const v = Math.max(0, Math.min(1, p.score.total));
    const x = padL + i * bw + 2;
    const isLast = i === last.length - 1;
    return `<rect x="${x}" y="${y(v)}" width="${Math.max(2, bw - 4)}" height="${H - padB - y(v)}" rx="2" fill="var(--primary)" opacity="${isLast ? 1 : 0.55}"><title>${p.day}일째 ${Math.round(v * 100)}점</title></rect>`;
  }).join('');
  const labels = [last[0], last[last.length - 1]].map((p, i) => {
    const idx = i === 0 ? 0 : last.length - 1;
    return `<text x="${padL + idx * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${p.day}일</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="하루 점수 막대 그래프">${grid}${bars}${labels}</svg>`;
}

// 자서전 자료: 주제별로 묶기
function groupByTopic(E) {
  const order = TOPICS.map((t) => t.id);
  const groups = {};
  E.forEach((e) => { (groups[e.topic || 'etc'] = groups[e.topic || 'etc'] || []).push(e); });
  return Object.keys(groups).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)).map((k) => [k, groups[k]]);
}
function memoirHtml(E) {
  if (!E.length) return '<p class="empty">아직 모인 대답이 없어요. 묻고 답하기에서 말로 대답하거나, 3분 대화를 하면 여기에 쌓여요.</p>';
  return groupByTopic(E).map(([topic, list]) => `<div class="chapter">
    <h3>${esc(TOPIC_KO[topic] || '기타')} <span class="muted num">${list.length}개</span></h3>
    ${list.map((e) => `<div class="entry ${esc(e.kind)}">
      <div class="meta">${new Date(e.created_at).toLocaleDateString('ko-KR')} · ${esc(KIND_KO[e.kind] || e.kind)}${e.day ? ` · ${e.day}일째` : ''}</div>
      ${e.prompt_en ? `<div class="q" lang="en">Q. ${esc(e.prompt_en)}</div>` : ''}
      <div class="a" lang="en">${esc(e.answer_en)}</div>
      ${e.answer_ko ? `<div class="ko">${esc(e.answer_ko)}</div>` : ''}
      ${e.better_en && e.better_en !== e.answer_en ? `<div class="better" lang="en">다듬은 영어: ${esc(e.better_en)}</div>` : ''}
    </div>`).join('')}
  </div>`).join('');
}
function memoirMarkdown(u, E, N) {
  const lines = [`# ${u.name || u.email}님의 이야기`, '', `WannaTalk 영어 인터뷰에서 모은 대답입니다. (${today()} 기준, ${E.length}개)`, ''];
  groupByTopic(E).forEach(([topic, list]) => {
    lines.push(`## ${TOPIC_KO[topic] || '기타'}`, '');
    list.forEach((e) => {
      lines.push(`### ${new Date(e.created_at).toLocaleDateString('ko-KR')} · ${KIND_KO[e.kind] || e.kind}`);
      if (e.prompt_en) lines.push(`- 질문: ${e.prompt_en}`);
      lines.push(`- 대답: ${e.answer_en}`);
      if (e.answer_ko) lines.push(`- 뜻: ${e.answer_ko}`);
      if (e.better_en && e.better_en !== e.answer_en) lines.push(`- 다듬은 영어: ${e.better_en}`);
      lines.push('');
    });
  });
  if (N.length) {
    lines.push('## 이야기 노트 (알게 된 사실)', '');
    N.forEach((n) => lines.push(`- ${n.fact}`));
    lines.push('');
  }
  return lines.join('\n');
}

sb && sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' && !users.length) setTimeout(start, 0);
});
start().catch((e) => { root.innerHTML = `<p>오류: ${esc(e.message)}</p>`; });
