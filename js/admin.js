// WannaTalk 관리자 화면
import { sb, configured, signInWithLink, freshLogin, inIOSBrowser, handoffCopy } from './api.js';
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
    $('msg').textContent = error ? '보내지 못했어요. 잠시 뒤 다시 해 주세요.' : '메일함에서 Sign in 을 눌러 주세요.';
  });
}

// 첫 화면 ------------------------------------------------------------------------
async function start() {
  if (!configured) { root.innerHTML = '<p>js/config.js 설정이 필요해요.</p>'; return; }
  const { data } = await sb.auth.getSession();
  if (!data.session) return loginView();
  if (freshLogin && inIOSBrowser() && !window.__wtHandoffShown) {
    window.__wtHandoffShown = true;
    root.innerHTML = `<div class="center">
      <div class="brand">WannaTalk</div>
      <h1>관리자로 로그인됐어요</h1>
      <p class="muted">홈 화면의 WannaTalk 앱에서 관리자 화면을 쓰려면 아래 버튼을 눌러 주세요.</p>
      <button class="btn primary" id="copyLogin" type="button" style="min-height:52px;font-size:17px">앱으로 로그인 옮기기</button>
      <button class="btn" id="stayHere" type="button">이 창에서 그냥 보기</button>
    </div>`;
    $('stayHere').addEventListener('click', start);
    $('copyLogin').addEventListener('click', async () => {
      const r = await handoffCopy(sb, 'admin.html');
      root.innerHTML = `<div class="center"><h1>${r.copied ? '복사했어요' : '아래 주소를 복사해 주세요'}</h1>
        ${r.copied ? '' : `<input class="login" readonly value="${esc(r.link)}">`}
        <p>이 창을 닫고 앱의 <b>설정 → 관리자 계정 연결하기</b>에서 <b>복사한 로그인 붙여넣기</b>를 누르세요.</p>
        <p class="muted">이 창(Safari)에서는 로그아웃됐어요.</p></div>`;
    });
    return;
  }
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

async function loadUsers() {
  root.innerHTML = '<p class="muted">사용자 불러오는 중…</p>';
  const { data, error } = await sb.rpc('admin_users');
  if (error) { root.innerHTML = `<p>불러오지 못했어요: ${esc(error.message)}</p>`; return; }
  users = data || [];
  render();
  loadSignup();
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
        <a class="btn" href="./">앱으로</a>
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

    <section id="detail"></section>`;

  $('refresh').addEventListener('click', loadUsers);
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
    <td class="who"><b>${esc(u.name || '(이름 없음)')}</b><small>${esc(u.email)}</small></td>
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
      </div>
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
      <div class="chart"><h3>하루 점수 추이</h3>${scoreChart(P)}</div>
      <div class="tabs" role="tablist">
        <button class="tab" role="tab" aria-selected="true" data-tab="memoir" type="button">자서전 자료</button>
        <button class="tab" role="tab" aria-selected="false" data-tab="notes" type="button">이야기 노트</button>
        <button class="tab" role="tab" aria-selected="false" data-tab="letters" type="button">편지</button>
      </div>
      <div id="tabBody"></div>
    </div>
  </section>`;

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
