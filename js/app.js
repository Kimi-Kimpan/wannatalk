// 시작점
import { state, go, mount, register } from './ui.js';
import { configured, sb } from './api.js';
import { boot } from './screens.js';
import './placement.js';
import './learn.js';
import './friend.js';
import './message.js';

// 홈 화면 설치 안내를 위해 저장
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.installPrompt = e;
});

// 오프라인/설치용 서비스 워커
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

register('notConfigured', () => {
  mount(`<section class="screen center">
    <h1>설정이 아직 안 됐어요</h1>
    <p class="lead">js/config.js 에 Supabase 주소와 키를 넣어 주세요.</p>
  </section>`);
});

if (!configured) {
  go('notConfigured');
} else {
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') { state.user = null; state.profile = null; go('login'); }
    if (event === 'SIGNED_IN' && state.screen === 'login') { state.screen = null; setTimeout(boot, 0); }
  });
  boot();
}
