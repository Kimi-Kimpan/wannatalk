// 한국어를 배우는 사람의 화면 (영어 화면). 지금은 편지 주고받기 + 휴대폰 설치 안내 + 설정.
// 한글 키보드 레슨과 하루 레슨은 다음 단계에서 이 화면에 붙어요.
import { state, register, go, mount, on, $, esc, ICON, phoneGuide, bindPhoneGuide } from './ui.js';
import { speak } from './speech.js';
import { letterBody, bindLetterToggles, readable } from './message.js';
import * as api from './api.js';
import { keysDone, KEY_UNITS } from './kokeys.js';

// 한글 키보드 과정: 하루 한 단원, 마친 단원은 다시 할 수 있어요
function keysCard() {
  const n = keysDone(), total = KEY_UNITS.length, all = n >= total;
  const cur = KEY_UNITS[Math.min(n, total - 1)];
  return `<div class="panel keys-card">
    <p class="label">⌨️ Hangul keyboard · ${Math.min(n, total)} of ${total} units done</p>
    <h2>${all ? 'Course complete!' : `Unit ${n + 1}: <span lang="ko">${esc(cur.title)}</span>`}</h2>
    <div class="unit-dots">${KEY_UNITS.map((x, i) => `<button class="unit-dot ${i < n ? 'done' : i === n ? 'now' : ''}" type="button" data-u="${i}" ${i > n ? 'disabled' : ''} aria-label="Unit ${i + 1}">${i + 1}</button>`).join('')}</div>
    <button class="big primary" id="keysGo" type="button">${all ? 'Practice again' : n ? 'Continue' : 'Start learning Hangul'}</button>
    <p class="muted">${all ? 'Daily Korean lessons with Klaudia are coming next.' : 'About 10 minutes a unit. Type on the screen keyboard, or on your computer keyboard.'}</p>
  </div>`;
}

register('ko-home', async () => {
  const p = state.profile;
  mount(`<section class="screen scroll ko-home" lang="en">
    <div class="bar">
      <div class="brand small">WannaTalk</div>
      <button class="ghost" id="settings" type="button">Settings</button>
    </div>
    <h1 lang="ko">안녕하세요, ${esc(p.name || '')}!</h1>
    <p class="sub">Hello! You are learning Korean with Klaudia.</p>
    ${keysCard()}
    <div class="panel msg-card" id="msgCard"><p class="muted">Loading your messages…</p></div>
    ${phoneGuide('en')}
  </section>`);
  on('settings', () => go('ko-settings'));
  document.querySelectorAll('.unit-dot').forEach((b) => b.addEventListener('click', () => go('ko-keys', { unit: Number(b.dataset.u) })));
  on('keysGo', () => go('ko-keys', { unit: Math.min(keysDone(), KEY_UNITS.length - 1) }));
  bindPhoneGuide('ko-settings');

  try {
    const [letter, n, members] = await Promise.all([
      api.pendingLetter(state.user.id), api.countPending(state.user.id), api.myContacts(),
    ]);
    if (letter) await api.ensureTranslations([letter], state.user.id, 'ko').catch(() => {});
    const box = $('msgCard');
    if (!box) return;
    if (letter) {
      const sender = members.find((m) => m.id === letter.from_id) || { id: letter.from_id, name: 'Family' };
      box.classList.add('has-letter');
      box.innerHTML = `<p class="label">✉️ New message ${n > 1 ? `<span class="count-pill">${n}</span>` : ''}</p>
        <p class="from">From ${esc(sender.name || 'Family')}</p>
        <div class="snippet-box">${letterBody(letter, 'snippet')}</div>
        <button class="ghost small" id="hearLetter" type="button">${ICON.sound} Listen</button>
        <div class="row msg-actions">
          <button class="big primary" id="replyMsg" type="button">Reply in Korean</button>
          <button class="big plain" id="mailbox" type="button">Messages</button>
        </div>`;
      bindLetterToggles(box);
      on('hearLetter', (e) => speak(readable(letter), { rate: 0.85, button: $('hearLetter') }));
      on('replyMsg', () => go('message', { to: sender, topic: 'reply', replyTo: letter }));
      on('mailbox', () => go('message'));
    } else {
      box.innerHTML = `<p class="label">✉️ Messages</p>
        <p class="muted">No new messages. Write a short note in Korean. Klaudia will help.</p>
        <div class="row msg-actions">
          <button class="big primary" id="writeMsg" type="button">Write in Korean</button>
          <button class="big plain" id="mailbox" type="button">Messages</button>
        </div>`;
      on('writeMsg', () => go('message'));
      on('mailbox', () => go('message'));
    }
  } catch (e) {
    if ($('msgCard')) $('msgCard').innerHTML = '<p class="muted">Could not load messages. Please check your connection.</p>';
  }
});

register('ko-settings', async () => {
  const p = state.profile;
  mount(`<section class="screen scroll" lang="en">
    <div class="bar">
      <button class="ghost" id="back" type="button">← Back</button>
      <div class="step-label">Settings</div>
    </div>
    <form class="panel form" id="nameForm" novalidate>
      <h2>Your name</h2>
      <input id="nameIn" type="text" maxlength="40" value="${esc(p.name || '')}" aria-label="Your name">
      <p class="msg" id="nameMsg" role="status"></p>
      <button class="big plain" type="submit">Save name</button>
    </form>
    <form class="panel form" id="idForm" novalidate>
      <h2>ID and password</h2>
      <p class="muted">${p.username ? `Your ID: <b>${esc(p.username)}</b>. To change the password, type a new one.` : 'Create them once, then sign in on your phone without email.'}</p>
      <label for="newId">ID <span class="muted">(letters and numbers, 2–20)</span></label>
      <input id="newId" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="20" value="${esc(p.username || '')}">
      <label for="newPw">Password <span class="muted">(6 or more)</span></label>
      <input id="newPw" type="password" autocomplete="new-password">
      <label for="newPw2">Password again</label>
      <input id="newPw2" type="password" autocomplete="new-password">
      <p class="msg" id="idMsg" role="status"></p>
      <button class="big primary" type="submit" id="idSave">${p.username ? 'Save' : 'Create ID'}</button>
    </form>
    <div class="panel">
      <p class="label">Your code</p>
      <p class="family-code" id="myCode">${esc(p.code || '…')}</p>
      <p class="muted">Share it so family can add you and write to you.</p>
    </div>
    <div class="panel">
      <p class="muted">Learning: <b>Korean</b></p>
      <button class="big plain" id="logout" type="button">Sign out</button>
    </div>
  </section>`);
  on('back', () => go('ko-home'));
  on('logout', async () => { await api.signOut(); state.user = null; state.profile = null; go('login'); });
  if (!p.code) api.myCode().then((c) => { p.code = c; if ($('myCode')) $('myCode').textContent = c; }).catch(() => {});
  $('nameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('nameIn').value.trim().slice(0, 40);
    if (!name) { $('nameMsg').textContent = 'Please enter your name.'; return; }
    try { state.profile = await api.updateProfile(state.user.id, { name }); $('nameMsg').textContent = 'Saved.'; }
    catch (err) { $('nameMsg').textContent = 'Could not save. Please try again.'; }
  });
  $('idForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const say = (x) => { $('idMsg').textContent = x; };
    const id = $('newId').value.trim().toLowerCase(), pw = $('newPw').value, pw2 = $('newPw2').value;
    if (!/^[0-9a-z가-힣_]{2,20}$/.test(id)) return say('Use 2–20 letters or numbers, no spaces.');
    if (!state.profile.username && !pw) return say('Please enter a password.');
    if (pw && pw.length < 6) return say('The password needs at least 6 characters.');
    if (pw !== pw2) return say('The two passwords are different.');
    $('idSave').disabled = true;
    say('Saving…');
    try {
      if (id !== state.profile.username) await api.setUsername(id);
      if (pw) await api.setPassword(pw);
      state.profile = await api.getProfile(state.user.id);
      say(`Saved. You can now sign in with the ID “${id}” and your password.`);
      $('newPw').value = ''; $('newPw2').value = '';
    } catch (err) {
      say(err.message === 'taken' ? 'That ID is taken. Please choose another.'
        : err.message === 'invalid' ? 'Use 2–20 letters or numbers, no spaces.'
        : /same|different from the old/i.test(err.message || '') ? 'That is your current password. Please choose a new one.'
        : /weak|short|least/i.test(err.message || '') ? 'That password is too easy. Please make it longer.'
        : 'Could not save. Please try again.');
    } finally {
      if ($('idSave')) $('idSave').disabled = false;
    }
  });
});
