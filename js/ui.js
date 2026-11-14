// 화면 도우미: 화면 전환, 글자 보호, 아바타, 낱말 카드 조립
import { stopSpeaking, stopListening, cancelListening, listen, LISTEN_ERRORS } from './speech.js';

export const state = { user: null, profile: null, installPrompt: null };

const screens = {};
export function register(name, fn) { screens[name] = fn; }
export function go(name, arg) {
  stopSpeaking();
  cancelListening();
  document.querySelectorAll('.sheet').forEach((x) => x.remove());
  document.body.classList.remove('sheet-open');
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
  window.scrollTo(0, 0);
  state.screen = name;
  return screens[name](arg);
}

export const $ = (id) => document.getElementById(id);
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function mount(html, cls = '') {
  const root = $('app');
  root.className = 'app ' + cls;
  root.innerHTML = html;
}
export function on(id, fn) {
  const el = $(id);
  if (el) el.addEventListener('click', fn);
  return el;
}
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function today() {
  return new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (내 기기 날짜)
}
export function loading(text) {
  mount(`<section class="screen center">
    <div class="spinner" aria-hidden="true"></div>
    <p class="lead">${esc(text)}</p>
  </section>`);
}
export function errorScreen(text, retry, back) {
  mount(`<section class="screen center">
    <p class="lead">${esc(text)}</p>
    <div class="stack">
      ${retry ? '<button class="big primary" id="retry" type="button">다시 해 보기</button>' : ''}
      <button class="big plain" id="back" type="button">처음으로</button>
    </div>
  </section>`);
  if (retry) on('retry', retry);
  on('back', back || (() => go('home')));
}

// 버튼 안 아이콘
export const ICON = {
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

// 진행 막대가 있는 윗부분
export function topBar(label, ratio, quitText = '처음으로') {
  return `<div class="bar">
    <button class="ghost" id="quit" type="button">${esc(quitText)}</button>
    <div class="step-label">${esc(label)}</div>
  </div>
  <div class="progress" aria-hidden="true"><span style="width:${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%"></span></div>`;
}

// 클라우디아 그림 (직접 그린 단순한 캐릭터)
export function avatar(size = 'md') {
  return `<div class="avatar ${size}" aria-hidden="true">
  <svg viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="58" fill="var(--avatar-bg)"/>
    <path d="M22 120c2-22 18-34 38-34s36 12 38 34z" fill="#3D7A6E"/>
    <path d="M50 84h20v10a10 10 0 0 1-20 0z" fill="#F2C7A5"/>
    <path d="M28 58c0-24 14-38 32-38s32 14 32 38c0 10-2 22-6 30H34c-4-8-6-20-6-30z" fill="#8A5A3B"/>
    <ellipse cx="60" cy="58" rx="23" ry="27" fill="#F6D2B4"/>
    <path d="M36 50c6-14 18-20 30-18 8 2 14 8 18 18-10-6-26-8-48 0z" fill="#8A5A3B"/>
    <ellipse cx="51" cy="58" rx="2.8" ry="3.4" fill="#2B2B2B"/>
    <ellipse cx="69" cy="58" rx="2.8" ry="3.4" fill="#2B2B2B"/>
    <path d="M46 51q5-3 10 0M64 51q5-3 10 0" stroke="#6B4429" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="45" cy="67" r="4" fill="#F0A9A0" opacity=".6"/>
    <circle cx="75" cy="67" r="4" fill="#F0A9A0" opacity=".6"/>
    <path class="mouth-closed" d="M53 71q7 6 14 0" stroke="#B5534A" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <ellipse class="mouth-open" cx="60" cy="72" rx="5.5" ry="4" fill="#B5534A"/>
  </svg>
</div>`;
}

// 낱말 카드를 눌러 문장 만들기
export function tileBuilder(container, words, onChange) {
  const pool = words.map((w, i) => ({ w, i, used: false }));
  let built = [];
  const text = () => built.map((t) => t.w).join(' ');
  function render() {
    container.innerHTML = `
      <div class="built" aria-live="polite">${
        built.length
          ? built.map((t, k) => `<button class="tile on" type="button" data-k="${k}">${esc(t.w)}</button>`).join('')
          : '<span class="placeholder">아래 낱말을 차례로 눌러 주세요</span>'
      }</div>
      <div class="pool">${pool
        .map((t) => `<button class="tile" type="button" data-i="${t.i}" ${t.used ? 'disabled' : ''}>${esc(t.w)}</button>`)
        .join('')}</div>`;
    container.querySelectorAll('.built .tile').forEach((b) =>
      b.addEventListener('click', () => {
        const k = Number(b.dataset.k);
        const t = built[k];
        built.splice(k, 1);
        pool.find((p) => p.i === t.i).used = false;
        render();
      }));
    container.querySelectorAll('.pool .tile').forEach((b) =>
      b.addEventListener('click', () => {
        const t = pool.find((p) => p.i === Number(b.dataset.i));
        t.used = true;
        built.push(t);
        render();
      }));
    if (onChange) onChange(text());
  }
  render();
  return {
    text,
    clear() { built = []; pool.forEach((p) => (p.used = false)); render(); },
  };
}

// 문장을 낱말 카드로 쪼개기
export function toTiles(sentence) {
  return String(sentence || '').split(/\s+/).filter(Boolean);
}

// 지금 할 일만 밝게: 나머지 화면은 흐리게 --------------------------------------------
function currentScreen() { return document.querySelector('#app > .screen'); }
export function clearSpotlight() {
  const screen = currentScreen();
  if (!screen) return;
  screen.classList.remove('focus');
  screen.querySelectorAll('.spot, .has-spot').forEach((el) => el.classList.remove('spot', 'has-spot'));
}
export function spotlight(...els) {
  const screen = currentScreen();
  clearSpotlight();
  const spots = els.filter((el) => el && screen && screen.contains(el));
  if (!spots.length) return;
  screen.classList.add('focus');
  spots.forEach((el) => {
    el.classList.add('spot');
    for (let p = el.parentElement; p && p !== screen; p = p.parentElement) p.classList.add('has-spot');
  });
  try { spots[spots.length - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* 무시 */ }
}

// 마이크 버튼 -------------------------------------------------------------------------
// 누르면 '정지'로 바뀌고, 말이 끝나면 '알아듣는 중'을 거쳐 원래대로 돌아옵니다.
function micLabel(btn, icon, text) {
  btn.innerHTML = btn.classList.contains('mic-round') ? `${icon}<span>${text}</span>` : `${icon} ${text}`;
}
function micOn(btn) {
  if (btn.dataset.label == null) btn.dataset.label = btn.innerHTML;
  micLabel(btn, ICON.stop, '정지');
  btn.classList.add('recording');
}
function micOff(btn) {
  if (btn.dataset.label != null) { btn.innerHTML = btn.dataset.label; delete btn.dataset.label; }
  btn.classList.remove('recording', 'thinking');
  btn.style.removeProperty('--lvl');
}
// 마이크로 한 번 듣기. 알아들은 문장 후보를 돌려주고, 못 들었으면 null (이유는 hintEl 에 적음).
// 듣는 중에 같은 버튼을 다시 누르면 거기까지 들은 말로 진행합니다.
export async function hear(mic, hintEl, { listening = '듣고 있어요… 말씀하세요', ...opts } = {}) {
  if (!mic) return null;
  if (mic.classList.contains('recording')) { stopListening(); return null; }
  if (mic.classList.contains('thinking')) return null;
  const say = (t) => { if (hintEl && hintEl.isConnected) hintEl.textContent = t; };
  micOn(mic);
  say(listening);
  try {
    return await listen({
      ...opts,
      onLevel: (v) => mic.style.setProperty('--lvl', v.toFixed(2)),
      onState: (s) => {
        if (s !== 'thinking') return;
        mic.classList.remove('recording');
        mic.classList.add('thinking');
        micLabel(mic, ICON.mic, '알아듣는 중…');
        say('알아듣고 있어요…');
      },
    });
  } catch (err) {
    if (err !== 'aborted') say(LISTEN_ERRORS[err] || '다시 눌러 주세요.');
    return null;
  } finally {
    micOff(mic);
  }
}

// 작은 팡파레: el 둘레로 색종이가 터집니다.
export function celebrate(el) {
  if (!el || !el.isConnected) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = el.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = 'confetti';
  box.setAttribute('aria-hidden', 'true');
  box.style.left = `${r.left + r.width / 2}px`;
  box.style.top = `${r.top + r.height / 2}px`;
  const colors = ['#FFC935', '#0B4F9E', '#1B7A45', '#E4572E', '#8E5BD9', '#19A7CE'];
  const N = 20;
  for (let i = 0; i < N; i++) {
    const p = document.createElement('i');
    const angle = (Math.PI * 2 * i) / N + Math.random() * 0.5;
    const dist = 70 + Math.random() * 80;
    p.style.setProperty('--dx', `${Math.round(Math.cos(angle) * dist)}px`);
    p.style.setProperty('--dy', `${Math.round(Math.sin(angle) * dist * 0.8 - 40)}px`);
    p.style.setProperty('--rot', `${Math.round(Math.random() * 720 - 360)}deg`);
    p.style.background = colors[i % colors.length];
    if (i % 3 === 0) p.style.borderRadius = '50%';
    p.style.animationDelay = `${Math.round(Math.random() * 90)}ms`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1600);
}

// 예시 카드: 한 장씩 보여 주고 양옆 화살표(또는 손가락으로 밀기)로 넘겨요.
// items: [{en, ko}] · action: 아래 버튼 글자 · onPick(item): 버튼을 눌렀을 때 · onListen(item): 카드를 눌렀을 때
export function carousel(box, items, { action = '이 문장으로 대답하기', onPick, onListen, start = 0 } = {}) {
  const list = (items || []).filter((x) => x && x.en);
  let i = Math.max(0, Math.min(start, list.length - 1));
  const CL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function render() {
    if (!box || !box.isConnected) return;
    const x = list[i];
    if (!x) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="sugg-row">
        <button class="sugg-arrow" data-go="-1" type="button" aria-label="이전 예시" ${i === 0 ? 'disabled' : ''}>${CL}</button>
        <div class="sugg-card">
          <button class="sugg-main" type="button">
            <span class="en" lang="en">${esc(x.en)}</span>
            ${x.ko ? `<small>${esc(x.ko)}</small>` : ''}
            <span class="sugg-listen">${ICON.sound} 들어 보기</span>
          </button>
          <button class="sugg-send" type="button">${esc(action)}</button>
        </div>
        <button class="sugg-arrow" data-go="1" type="button" aria-label="다음 예시" ${i >= list.length - 1 ? 'disabled' : ''}>${CR}</button>
      </div>
      ${list.length > 1 ? `<div class="slide-dots sugg-dots">${list.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}<small>${i + 1} / ${list.length}</small></div>` : ''}`;
    box.querySelector('.sugg-main').addEventListener('click', () => { if (onListen) onListen(x, i); });
    box.querySelector('.sugg-send').addEventListener('click', () => { if (onPick) onPick(x, i); });
    box.querySelectorAll('.sugg-arrow').forEach((b) => b.addEventListener('click', () => move(Number(b.dataset.go))));
    const card = box.querySelector('.sugg-card');
    let sx = null;
    card.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    card.addEventListener('touchend', (e) => {
      if (sx == null) return;
      const dx = e.changedTouches[0].clientX - sx;
      sx = null;
      if (Math.abs(dx) >= 40) move(dx < 0 ? 1 : -1);
    });
  }
  function move(d) {
    const n = i + d;
    if (n < 0 || n >= list.length) return;
    i = n;
    render();
  }
  render();
  return { index: () => i };
}
