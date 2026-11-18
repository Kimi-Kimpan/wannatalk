// 한글 키보드 레슨 (한국어를 배우는 사람, 영어 화면). AI 없이 앱 안에서만 동작해요.
// 한 단원 = 새 글자 만나기 → 글자 조립 → 듣고 치기
import { state, register, go, mount, on, $, esc, ICON, topBar, celebrate } from './ui.js';
import { speak } from './speech.js';
import * as api from './api.js';
import { ROWS, QWERTY, SHIFTED, BASE_OF, compose, keysFor, nextKey, parts, SOUND, sayable, UNITS, isVowel } from './hangul.js';
// 자음은 주황, 모음은 파랑 (키보드·글자 칩·조립 칸 모두 같은 색)
const cv = (j) => (isVowel(j) ? 'v' : 'c');
// 글쇠 아래에 적는 짧은 소리 (ㅇ은 끝소리일 때의 ng)
const roman = (j) => (j === 'ㅇ' ? 'ng' : (SOUND[j] ? SOUND[j][0].replace(/ /g, '') : ''));

// 지금까지 마친 단원 수 (서버에 저장, 안 되면 이 기기에)
export function keysDone() {
  const p = state.profile || {};
  let local = 0;
  try { local = Number(localStorage.getItem('wt-ko-keys') || 0); } catch (e) { /* 무시 */ }
  return Math.max(Number(p.ko_keys || 0), local);
}
async function saveDone(n) {
  try { localStorage.setItem('wt-ko-keys', String(n)); } catch (e) { /* 무시 */ }
  try { state.profile = await api.updateProfile(state.user.id, { ko_keys: n }); } catch (e) { /* 이 기기에만 */ }
}
export const KEY_UNITS = UNITS;

// 화면 키보드 (두벌식). 컴퓨터 자판으로 쳐도 같아요.
function keyboardHtml() {
  const key = ([k, a, b]) => `<button class="kb-key kb-${cv(a)}" type="button" data-k="${a}" ${b ? `data-s="${b}"` : ''} aria-label="${a}"><span class="kb-j">${a}</span><small lang="en">${roman(a)}</small></button>`;
  return `<div class="kb" id="kb" lang="ko">
    <div class="kb-row">${ROWS[0].map(key).join('')}</div>
    <div class="kb-row r2">${ROWS[1].map(key).join('')}</div>
    <div class="kb-row"><button class="kb-key kb-wide" id="kbShift" type="button" aria-label="Shift">⇧</button>${ROWS[2].map(key).join('')}<button class="kb-key kb-wide" id="kbBack" type="button" aria-label="Delete">⌫</button></div>
  </div>`;
}
function bindKeyboard(onKey) {
  let shift = false;
  const paint = () => {
    $('kbShift').classList.toggle('on', shift);
    document.querySelectorAll('.kb-key[data-s]').forEach((b) => { const j = shift ? b.dataset.s : b.dataset.k; b.querySelector('.kb-j').textContent = j; b.querySelector('small').textContent = roman(j); });
  };
  const press = (j) => { onKey(j); if (shift) { shift = false; paint(); } };
  document.querySelectorAll('.kb-key[data-k]').forEach((b) => b.addEventListener('click', () => press(shift && b.dataset.s ? b.dataset.s : b.dataset.k)));
  on('kbShift', () => { shift = !shift; paint(); });
  on('kbBack', () => onKey('BACK'));
  // 컴퓨터 자판
  if (window.__kbKeys) window.removeEventListener('keydown', window.__kbKeys);
  window.__kbKeys = (e) => {
    if (!$('kb') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Backspace') { e.preventDefault(); onKey('BACK'); return; }
    const j = QWERTY[e.key];
    if (j) { e.preventDefault(); onKey(j); }
  };
  window.addEventListener('keydown', window.__kbKeys);
  return {
    // 다음에 누를 글쇠를 빛나게 (Shift가 필요하면 Shift 먼저)
    glow(j) {
      document.querySelectorAll('.kb .glow').forEach((x) => x.classList.remove('glow'));
      if (!j) return;
      if (j === 'BACK') { $('kbBack').classList.add('glow'); return; }
      if (SHIFTED.has(j) && !shift) { $('kbShift').classList.add('glow'); return; }
      const b = document.querySelector(`.kb-key[data-k="${BASE_OF[j] || j}"]`);
      if (b) b.classList.add('glow');
    },
  };
}

register('ko-keys', (arg) => {
  const u = Math.max(0, Math.min(UNITS.length - 1, Number((arg && arg.unit) ?? keysDone())));
  const U = UNITS[u];
  // 단원 안의 차례: 새 글자들 → 조립 글자들 → 낱말들
  const tasks = [
    ...U.letters.map((x) => ({ kind: 'meet', target: x })),
    ...U.syll.map((x) => ({ kind: 'build', target: x })),
    ...U.words.map(([w, meaning, roman]) => ({ kind: 'word', target: w, meaning, roman })),
  ];
  let i = -1;
  let typed = [];

  const quit = () => { if (window.__kbKeys) window.removeEventListener('keydown', window.__kbKeys); go('ko-home'); };

  // 처음 배우는 사람에게: 한국어는 음절(블록)로 써요
  function howTo() {
    const tile = (j, area) => `<span class="sy-t sy-${cv(j)}" style="grid-area:${area}">${j}</span>`;
    const ex = (word, cls, tiles) => `<div class="sy-ex"><div class="sy-block ${cls}">${tiles}</div><b lang="ko">${word}</b></div>`;
    mount(`<section class="screen fit kk howto" lang="en">
      ${topBar('Hangul · Before we start', 0, 'Exit')}
      <h1>Korean is written in syllables</h1>
      <ol class="sy-rules">
        <li>Letters are grouped into blocks. One block = one syllable.</li>
        <li>A block starts with a <b class="c-txt">consonant</b> and has a <b class="v-txt">vowel</b>.</li>
        <li>Sometimes a second consonant sits at the bottom.</li>
      </ol>
      <div class="sy-examples" lang="ko">
        ${ex('가', 'side', tile('ㄱ', 'a') + tile('ㅏ', 'b'))}
        ${ex('고', 'stack', tile('ㄱ', 'a') + tile('ㅗ', 'b'))}
        ${ex('간', 'side3', tile('ㄱ', 'a') + tile('ㅏ', 'b') + tile('ㄴ', 'c'))}
        ${ex('곤', 'stack3', tile('ㄱ', 'a') + tile('ㅗ', 'b') + tile('ㄴ', 'c'))}
      </div>
      <p class="muted sy-tip">Tall vowels go on the right. Flat vowels go underneath. The keyboard puts consonants on the left and vowels on the right.</p>
      <div class="nav bottom"><button class="next" id="go" type="button">Got it</button></div>
    </section>`);
    on('quit', quit);
    on('go', () => intro());
  }

  function intro() {
    mount(`<section class="screen fit kk" lang="en">
      ${topBar(`Hangul · Unit ${u + 1} of ${UNITS.length}`, 0, 'Exit')}
      <h1>${esc(U.title)}</h1>
      ${U.letters.length ? `<p class="lead">New letters today</p>
        <div class="kk-letters" lang="ko">${U.letters.map((x) => `<span class="kk-chip kk-${cv(x)}"><b>${x}</b><small lang="en">${esc(SOUND[x][0])}</small></span>`).join('')}</div>` : ''}
      ${U.note ? `<p class="lead">${esc(U.note)}</p>` : ''}
      <p class="muted">You will meet each letter, build ${U.syll.length} syllables and type ${U.words.length} words.</p>
      <div class="nav bottom"><button class="next" id="go" type="button">Start</button></div>
    </section>`);
    on('quit', quit);
    on('go', () => next());
  }

  function next() {
    i += 1;
    typed = [];
    if (i >= tasks.length) return finish();
    show();
  }

  function show() {
    const t = tasks[i];
    const p0 = t.kind === 'build' ? parts(t.target) : null;
    const showRoman = t.kind === 'word' && u < 5;
    const body = t.kind === 'meet'
      ? `<p class="label">New letter</p>
         <div class="kk-big kk-${cv(t.target)}" lang="ko">${t.target}</div>
         <p class="kk-sound"><b>${esc(SOUND[t.target][0])}</b> · ${esc(SOUND[t.target][1])}</p>
         <p class="muted">${t.target.length && keysFor(t.target).length > 1 ? `Type ${keysFor(t.target).join(' then ')}.` : SHIFTED.has(t.target) ? `Press ⇧ Shift, then ${BASE_OF[t.target]}.` : `Find ${t.target} on the keyboard and press it.`}</p>`
      : t.kind === 'build'
      ? `<p class="label">Build this syllable</p>
         <div class="kk-big" lang="ko">${t.target}</div>
         <p class="kk-sound" lang="ko">${[p0.cho, p0.jung, p0.jong].filter(Boolean).join(' + ')}</p>`
      : `<p class="label">Listen and type</p>
         <p class="kk-meaning">“${esc(t.meaning)}”</p>
         <p class="kk-sound" id="roman">${showRoman ? esc(t.roman) : `<button class="link-btn" id="showRoman" type="button">Show how it sounds</button>`}</p>`;
    mount(`<section class="screen fit kk" lang="en">
      ${topBar(`Hangul · Unit ${u + 1}`, (i + 1) / (tasks.length + 1), 'Exit')}
      <div class="kk-body">${body}
        <button class="ghost small" id="hear" type="button">${ICON.sound} Listen</button>
      </div>
      <div class="kk-typed" id="typed" lang="ko" aria-live="polite"></div>
      <p class="hint" id="hint" aria-live="polite"></p>
      <div class="nav kk-nav">
        <button class="prev hint-btn" id="helpKey" type="button" aria-pressed="false">Hint</button>
        <button class="next" id="next" type="button">Skip</button>
      </div>
      ${keyboardHtml()}
    </section>`);
    on('quit', quit);
    on('next', () => next());
    on('hear', () => speak(t.kind === 'meet' ? sayable(t.target) : t.target, { rate: 0.8, button: $('hear') }));
    on('showRoman', () => { $('roman').textContent = t.roman; });
    // 조립·글자 단계는 다음 글쇠를 처음부터 알려 주고, 낱말 단계는 'Show me'를 누르면 알려 줘요
    let guide = t.kind !== 'word';
    // Hint: 누를 글쇠를 빛나게 / 다시 누르면 숨겨요
    const paintHint = () => { $('helpKey').classList.toggle('on', guide); $('helpKey').setAttribute('aria-pressed', String(guide)); };
    on('helpKey', () => { guide = !guide; paintHint(); refresh(); });
    const kb = bindKeyboard((j) => {
      if (j === 'BACK') typed.pop(); else if (!done) typed.push(j);
      refresh();
    });
    let done = false;
    function refresh() {
      const out = compose(typed);
      $('typed').innerHTML = out ? esc(out) : '<span class="muted">…</span>';
      const nk = nextKey(typed, t.target);
      if (out === t.target) {
        done = true;
        kb.glow(null);
        $('hint').innerHTML = '<span class="cheer">✓ Great!</span>';
        celebrate($('hint'));
        if (t.kind !== 'meet') speak(t.target, { rate: 0.8 });
        $('next').textContent = 'Next';
        $('next').classList.add('ready');
        if (t.kind === 'meet') setTimeout(() => { if ($('next') && tasks[i] === t) next(); }, 1400);
        return;
      }
      done = false;
      $('next').textContent = 'Skip';
      $('next').classList.remove('ready');
      if (nk === 'BACK') $('hint').textContent = 'Not quite. Press ⌫ to delete.';
      else $('hint').textContent = '';
      kb.glow(guide || nk === 'BACK' ? nk : null);
    }
    paintHint();
    refresh();
    if (t.kind === 'meet') setTimeout(() => { if ($('hear') && tasks[i] === t) speak(sayable(t.target), { rate: 0.8, button: $('hear') }); }, 300);
    if (t.kind === 'word') setTimeout(() => { if ($('hear') && tasks[i] === t) speak(t.target, { rate: 0.8, button: $('hear') }); }, 300);
  }

  async function finish() {
    if (window.__kbKeys) window.removeEventListener('keydown', window.__kbKeys);
    if (u + 1 > keysDone()) await saveDone(u + 1);
    const more = u + 1 < UNITS.length;
    mount(`<section class="screen center kk" lang="en">
      <div class="big-emoji" aria-hidden="true">🎉</div>
      <h1>Unit ${u + 1} done!</h1>
      <p class="lead" lang="ko">${U.words.map((w) => esc(w[0])).join(' · ')}</p>
      <p class="muted">${more ? `Next: ${esc(UNITS[u + 1].title)}` : 'You finished the Hangul keyboard course.'}</p>
      <div class="stack">
        ${more ? '<button class="big primary" id="nextUnit" type="button">Next unit</button>' : ''}
        <button class="big plain" id="home" type="button">Back home</button>
      </div>
    </section>`);
    on('nextUnit', () => go('ko-keys', { unit: u + 1 }));
    on('home', () => go('ko-home'));
  }

  if (u === 0) howTo(); else intro();
});
