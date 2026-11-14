// Screen for family members (e.g. Clara). English UI. Same messaging as the learner.
import { state, register, go, mount, on, $, esc, loading } from './ui.js';
import * as api from './api.js';

register('friend', async () => {
  const p = state.profile;
  loading('Loading…');
  let contacts = [], letters = [], code = p.code || '';
  try {
    [contacts, letters, code] = await Promise.all([api.myContacts(), api.myLetters(state.user.id, 30), code || api.myCode()]);
  } catch (e) { /* show what we can */ }
  p.code = code || p.code;
  const names = Object.fromEntries(contacts.map((c) => [c.id, c.name]));
  const byId = Object.fromEntries(contacts.map((c) => [c.id, c]));

  mount(`<section class="screen scroll" lang="en">
    <div class="bar">
      <div class="brand small">WannaTalk</div>
      <button class="ghost" id="logout" type="button">Sign out</button>
    </div>
    <h1>Hi ${esc(p.name)}!</h1>
    <p class="sub">Messages you send become part of their English practice. Klaudia helps you keep them short and simple.</p>
    <button class="big primary huge" id="write" type="button">Send a message</button>

    <div class="panel">
      <div class="bar"><h2>Messages</h2><button class="ghost" id="refresh" type="button">Refresh</button></div>
      <div class="letters">${letters.length
        ? letters.map((l, i) => {
            const mine = l.from_id === state.user.id;
            return `<div class="letter-item ${mine ? 'mine' : ''}">
              <div class="from">${mine ? 'You → ' + esc(names[l.to_id] || '') : esc(names[l.from_id] || 'Family')} · <span class="muted">${new Date(l.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>${mine && l.handled_at ? ' · <span class="muted">read</span>' : ''}</div>
              <div>${esc(l.body)}</div>
              ${!mine && byId[l.from_id] ? `<button class="ghost reply-btn" type="button" data-i="${i}">Reply</button>` : ''}
            </div>`;
          }).join('')
        : '<p class="muted">No messages yet.</p>'}</div>
    </div>

    ${code ? `<div class="panel"><p class="label">Your code</p><p class="family-code">${esc(code)}</p>
      <p class="muted">Share it so others can add you and write to you.</p></div>` : ''}
  </section>`);

  on('logout', async () => { await api.signOut(); state.user = null; state.profile = null; go('login'); });
  on('refresh', () => go('friend'));
  on('write', () => go('message'));
  document.querySelectorAll('.reply-btn').forEach((b) => b.addEventListener('click', () => {
    const l = letters[Number(b.dataset.i)];
    go('message', { to: byId[l.from_id], topic: 'reply', replyTo: l });
  }));
});
