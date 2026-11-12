// 화면 도우미: 화면 전환, 글자 보호, 아바타, 낱말 카드 조립
import { stopSpeaking, stopListening } from './speech.js';

export const state = { user: null, profile: null, installPrompt: null };

const screens = {};
export function register(name, fn) { screens[name] = fn; }
export function go(name, arg) {
  stopSpeaking();
  stopListening();
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

// Emma 선생님 그림 (직접 그린 단순한 캐릭터)
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
