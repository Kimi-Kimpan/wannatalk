// Screen for family members who write to the learner (e.g. Clara). English UI.
import { state, register, go, mount, on, $, esc, loading } from './ui.js';
import * as api from './api.js';

register('friend', async () => {
  const p = state.profile;
  if (!p.family) return joinScreen();

  loading('Loading…');
  let members = [], letters = [];
  try {
    [members, letters] = await Promise.all([api.familyMembers(p.family), api.familyLetters(30)]);
  } catch (e) { /* show what we can */ }
  const learner = members.find((m) => m.role === 'learner');
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const learnerName = learner ? learner.name : 'your learner';

  mount(`<section class="screen scroll" lang="en">
    <div class="bar">
      <div class="brand small">WannaTalk</div>
      <button class="ghost" id="logout" type="button">Sign out</button>
    </div>
    <h1>Hi ${esc(p.name)}!</h1>
    <p class="sub">Write a short message to ${esc(learnerName)}. It becomes the start of his English lesson that day, and he will practise replying to you.</p>

    <form id="f" class="form">
      <label for="body">Your message</label>
      <textarea id="body" rows="4" maxlength="600" placeholder="Hello! It snowed a lot here today. How was your day?"></textarea>
      <p class="note">Tip: short sentences and everyday words work best. Asking one simple question helps him reply.</p>
      <p class="msg" id="msg" role="alert"></p>
      <button class="big primary" type="submit" id="send" ${learner ? '' : 'disabled'}>Send</button>
    </form>

    <div class="panel">
      <div class="bar"><h2>Messages</h2><button class="ghost" id="refresh" type="button">Refresh</button></div>
      <div class="letters">${letters.length
        ? letters.map((l) => `<div class="letter-item ${l.from_id === state.user.id ? 'mine' : ''}">
            <div class="from">${l.from_id === state.user.id ? 'You' : esc(names[l.from_id] || 'Family')} · <span class="muted">${new Date(l.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>${l.to_id === learner?.id && l.handled_at ? ' · <span class="muted">read</span>' : ''}</div>
            <div>${esc(l.body)}</div></div>`).join('')
        : '<p class="muted">No messages yet.</p>'}</div>
    </div>
  </section>`);

  on('logout', async () => { await api.signOut(); state.user = null; state.profile = null; go('login'); });
  on('refresh', () => go('friend'));
  $('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = $('body').value.trim();
    if (!body) { $('msg').textContent = 'Please write a message first.'; return; }
    $('send').disabled = true;
    $('msg').textContent = 'Sending…';
    try {
      await api.sendLetter({ family: p.family, to_id: learner.id, body });
      go('friend');
    } catch (err) {
      $('send').disabled = false;
      $('msg').textContent = 'Could not send. Please check your connection and try again.';
    }
  });
});

function joinScreen(msg = '') {
  mount(`<section class="screen" lang="en">
    <h1>Join the family</h1>
    <p class="sub">Ask the learner for the 6-character family code. He can find it in 설정 (Settings) in his app.</p>
    <form id="f" class="form">
      <label for="code">Family code</label>
      <input id="code" class="code" type="text" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="AB12CD">
      <p class="msg" id="msg" role="alert">${esc(msg)}</p>
      <button class="big primary" type="submit" id="join">Join</button>
    </form>
    <button class="ghost" id="logout" type="button">Sign out</button>
  </section>`);
  on('logout', async () => { await api.signOut(); state.user = null; state.profile = null; go('login'); });
  $('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('code').value.trim().toUpperCase();
    if (code.length !== 6) { $('msg').textContent = 'The code has 6 characters.'; return; }
    $('join').disabled = true;
    try {
      const ok = await api.joinFamily(code);
      if (!ok) return joinScreen('That code was not found. Please check it.');
      state.profile = await api.getProfile(state.user.id);
      go('friend');
    } catch (err) {
      joinScreen('Something went wrong. Please try again.');
    }
  });
}
