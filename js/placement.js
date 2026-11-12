// 첫 로그인 실력 알아보기 (듣기 5 · 따라 말하기 3 · 낱말 조합 2)
import { state, register, go, mount, on, $, esc, topBar, shuffle, tileBuilder, toTiles, ICON } from './ui.js';
import { speak, listen, canListen, bestSimilarity, sameSentence, LISTEN_ERRORS } from './speech.js';
import { PLACEMENT, levelFromScore, LEVEL_NAMES } from './content.js';
import * as api from './api.js';

register('placement', () => {
  const items = [
    ...PLACEMENT.listen.map((q) => ({ kind: 'listen', q })),
    ...(canListen ? PLACEMENT.speak.map((q) => ({ kind: 'speak', q })) : []),
    ...PLACEMENT.write.map((q) => ({ kind: 'write', q })),
  ];
  const score = { listen: [], speak: [], write: [] };
  let i = 0;

  function intro() {
    mount(`<section class="screen center">
      <h1>처음 오셨네요!</h1>
      <p class="lead">5분 동안 영어 실력을 알아볼게요.<br>틀려도 괜찮아요. 아는 만큼만 하시면 돼요.</p>
      <ul class="plain-list">
        <li>🔊 듣고 고르기 5문제</li>
        ${canListen ? '<li>🎤 따라 말하기 3문제</li>' : ''}
        <li>🧩 낱말 맞추기 2문제</li>
      </ul>
      <div class="stack">
        <button class="big primary" id="go" type="button">시작하기</button>
        <button class="big plain" id="skip" type="button">건너뛰고 1단계부터</button>
      </div>
    </section>`);
    on('go', next);
    on('skip', () => finish(true));
  }

  function header(label) {
    return topBar(`${i + 1} / ${items.length} · ${label}`, i / items.length, '그만하기');
  }

  function next() {
    if (i >= items.length) return finish(false);
    const it = items[i];
    if (it.kind === 'listen') return listenItem(it.q);
    if (it.kind === 'speak') return speakItem(it.q);
    return writeItem(it.q);
  }
  function advance() { i++; next(); }

  function listenItem(q) {
    mount(`<section class="screen">
      ${header('듣고 고르기')}
      <p class="lead">잘 듣고 맞는 뜻을 골라 주세요.</p>
      <button class="listen" id="play" type="button">${ICON.sound} 다시 듣기</button>
      <div class="choices">${q.options.map((o, k) => `<button class="choice" type="button" data-k="${k}"><span class="emoji" aria-hidden="true">${o.e}</span>${esc(o.ko)}</button>`).join('')}</div>
    </section>`);
    on('quit', () => finish(true));
    const play = () => speak(q.en, { rate: 0.8, button: $('play') });
    on('play', play);
    setTimeout(play, 300);
    document.querySelectorAll('.choice').forEach((b) =>
      b.addEventListener('click', () => {
        score.listen.push(Number(b.dataset.k) === q.answer ? 1 : 0);
        advance();
      }));
  }

  function speakItem(q) {
    mount(`<section class="screen">
      ${header('따라 말하기')}
      <div class="card">
        <p class="ko">${esc(q.ko)}</p>
        <p class="en" lang="en">${esc(q.en)}</p>
      </div>
      <button class="listen" id="play" type="button">${ICON.sound} 듣기</button>
      <button class="mic" id="mic" type="button">${ICON.mic} 눌러서 따라 말하기</button>
      <p class="hint" id="hint" aria-live="polite">듣고 나서 마이크 버튼을 누르고 말씀해 주세요.</p>
      <button class="plain mid" id="pass" type="button">잘 모르겠어요</button>
    </section>`);
    on('quit', () => finish(true));
    on('play', () => speak(q.en, { rate: 0.8, button: $('play') }));
    on('pass', () => { score.speak.push(0); advance(); });
    on('mic', async () => {
      $('mic').classList.add('recording');
      $('hint').textContent = '듣고 있어요… 말씀하세요';
      try {
        const alts = await listen();
        const s = bestSimilarity(q.en, alts);
        score.speak.push(s);
        $('hint').textContent = s >= 0.6 ? '좋아요!' : '잘 들었어요.';
        setTimeout(advance, 700);
      } catch (err) {
        $('mic').classList.remove('recording');
        $('hint').textContent = LISTEN_ERRORS[err] || '다시 눌러 주세요.';
      }
    });
  }

  function writeItem(q) {
    mount(`<section class="screen">
      ${header('낱말 맞추기')}
      <p class="lead">이 뜻이 되도록 낱말을 차례로 눌러 주세요.</p>
      <div class="card small"><p class="ko big">${esc(q.ko)}</p></div>
      <div id="tiles" class="tiles"></div>
      <div class="row">
        <button class="plain mid" id="clear" type="button">다시 하기</button>
        <button class="primary mid" id="done" type="button">다 했어요</button>
      </div>
    </section>`);
    on('quit', () => finish(true));
    const tb = tileBuilder($('tiles'), shuffle([...toTiles(q.en), ...q.extra]));
    on('clear', () => tb.clear());
    on('done', () => { score.write.push(sameSentence(tb.text(), q.en) ? 1 : 0); advance(); });
  }

  async function finish(skipped) {
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const parts = [
      [avg(score.listen), 0.4],
      [avg(score.speak), 0.3],
      [avg(score.write), 0.3],
    ].filter(([v]) => v !== null);
    const weight = parts.reduce((s, [, w]) => s + w, 0);
    const total = skipped && i === 0 ? 0 : weight ? parts.reduce((s, [v, w]) => s + v * w, 0) / weight : 0;
    const level = skipped && i < items.length ? 1 : levelFromScore(total);
    const placement = {
      listen: avg(score.listen), speak: avg(score.speak), write: avg(score.write),
      total: Math.round(total * 100) / 100, level, skipped: !!skipped, at: new Date().toISOString(),
    };
    try {
      state.profile = await api.updateProfile(state.user.id, { placement, level });
    } catch (e) { /* 저장 실패해도 진행 */ }
    mount(`<section class="screen center">
      <h1>수고하셨어요!</h1>
      <p class="lead">${skipped && i < items.length ? '1단계부터 차근차근 시작해요.' : `<b>${level}단계</b>부터 시작해요.`}</p>
      <p class="muted">${esc(LEVEL_NAMES[level])}</p>
      <p>매일 클라우디아 선생님이 묻는 말에 대답하면서 배워요.<br>10일마다 실력을 보고 단계를 올려 드려요.</p>
      <button class="big primary" id="home" type="button">시작하기</button>
    </section>`);
    on('home', () => go('home'));
  }

  intro();
});
