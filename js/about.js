// 처음 시작할 때 묻는 몇 가지 질문 → 배경 태그 (클라우디아가 사람에 맞는 주제를 고르는 데 써요)
import { state, register, mount, on, $, esc, avatar } from './ui.js';
import * as api from './api.js';
import { boot } from './screens.js';

// kind: one(하나 고르면 바로 다음) · many(여러 개 고르고 다음) · text(짧게 적기)
const QUESTIONS = [
  { id: 'age', kind: 'one', q: '나이대가 어떻게 되세요?', options: ['40대 이하', '50대', '60대', '70대', '80대 이상'], tag: (v) => v },
  { id: 'sex', kind: 'one', q: '어떻게 불러 드릴까요?', options: ['남성', '여성'], tag: (v) => v },
  { id: 'work', kind: 'one', q: '요즘 주로 무엇을 하며 지내세요?', options: ['직장에 다녀요', '가게나 사업을 해요', '은퇴했어요', '집안일을 해요'],
    tag: (v) => ({ '직장에 다녀요': '직장인', '가게나 사업을 해요': '자영업', '은퇴했어요': '은퇴', '집안일을 해요': '주부' })[v] },
  { id: 'job', kind: 'text', q: '어떤 일을 하세요?', help: '짧게 적어 주세요. 예: 택시 운전, 병원 근무, 식당 운영',
    when: (a) => a.work === '직장에 다녀요' || a.work === '가게나 사업을 해요', tag: (v) => `하는 일: ${v}` },
  { id: 'family', kind: 'many', q: '함께하는 가족이 있으세요?', help: '해당하는 것을 모두 눌러 주세요.', options: ['배우자', '자녀', '손주', '반려동물', '혼자 살아요'],
    tag: (v) => `가족: ${v.join(', ')}` },
  { id: 'why', kind: 'many', q: '영어를 왜 배우고 싶으세요?', help: '해당하는 것을 모두 눌러 주세요.',
    options: ['해외에 사는 가족·친구와 이야기', '여행 가서 쓰려고', '일할 때 필요해서', '손주와 이야기하려고', '취미로, 머리 쓰려고'],
    tag: (v) => `배우는 이유: ${v.join(', ')}` },
  { id: 'likes', kind: 'many', q: '좋아하는 것을 골라 주세요.', help: '여러 개 골라도 돼요.', grid: true,
    options: ['여행', '요리', '산책·등산', '운동', '음악', 'TV·영화', '책 읽기', '꽃·텃밭', '낚시', '종교 활동'],
    tag: (v) => `좋아하는 것: ${v.join(', ')}` },
];

register('about', () => {
  const answers = {};
  let i = -1;
  const list = () => QUESTIONS.filter((x) => !x.when || x.when(answers));

  function intro() {
    mount(`<section class="screen fit about">
      <div class="emma-row">${avatar()}<div class="bubble"><p class="ko-line"><b>${esc(state.profile.name || '')}님, 반가워요!</b><br>저는 영어 대화 친구 클라우디아예요.<br>공부를 시작하기 전에 몇 가지만 여쭤볼게요. 알려 주시는 만큼 더 잘 맞는 이야기를 준비할 수 있어요.</p></div></div>
      <div class="stack bottom">
        <button class="big primary" id="go" type="button">좋아요, 시작해요</button>
        <button class="big plain" id="skipAll" type="button">나중에 할게요</button>
      </div>
    </section>`);
    on('go', () => { i = 0; ask(); });
    on('skipAll', finish);
  }

  function ask() {
    const qs = list();
    if (i >= qs.length) return finish();
    const x = qs[i];
    const picked = new Set(Array.isArray(answers[x.id]) ? answers[x.id] : []);
    const body = x.kind === 'text'
      ? `<form id="textForm" class="form"><input id="textIn" type="text" maxlength="30" autocomplete="off" value="${esc(answers[x.id] || '')}" aria-label="${esc(x.q)}"></form>`
      : `<div class="about-opts ${x.grid ? 'grid' : ''}">${x.options.map((o, k) => `<button class="big plain about-opt ${picked.has(o) || answers[x.id] === o ? 'on' : ''}" type="button" data-k="${k}">${esc(o)}</button>`).join('')}</div>`;
    mount(`<section class="screen fit about">
      <div class="bar"><button class="ghost" id="back" type="button">← 이전</button><div class="step-label">${i + 1} / ${qs.length}</div></div>
      <div class="progress" aria-hidden="true"><span style="width:${Math.round((i / qs.length) * 100)}%"></span></div>
      <h1>${esc(x.q)}</h1>
      ${x.help ? `<p class="muted">${esc(x.help)}</p>` : ''}
      ${body}
      <div class="nav bottom">
        <button class="prev" id="skip" type="button">건너뛰기</button>
        ${x.kind === 'one' ? '' : '<button class="next" id="next" type="button">다음</button>'}
      </div>
    </section>`);
    const next = () => { i++; ask(); };
    on('back', () => { if (i === 0) intro(); else { i--; ask(); } });
    on('skip', () => { delete answers[x.id]; next(); });
    document.querySelectorAll('.about-opt').forEach((b) => b.addEventListener('click', () => {
      const o = x.options[Number(b.dataset.k)];
      if (x.kind === 'one') { answers[x.id] = o; return next(); }
      if (picked.has(o)) picked.delete(o); else picked.add(o);
      b.classList.toggle('on', picked.has(o));
      b.setAttribute('aria-pressed', String(picked.has(o)));
    }));
    const save = () => {
      if (x.kind === 'text') { const v = $('textIn').value.trim(); if (v) answers[x.id] = v; else delete answers[x.id]; }
      else if (picked.size) answers[x.id] = x.options.filter((o) => picked.has(o)); else delete answers[x.id];
      next();
    };
    on('next', save);
    if ($('textForm')) { $('textForm').addEventListener('submit', (e) => { e.preventDefault(); save(); }); $('textIn').focus(); }
  }

  async function finish() {
    const tags = QUESTIONS.filter((x) => answers[x.id] != null && (!x.when || x.when(answers))).map((x) => x.tag(answers[x.id])).filter(Boolean);
    state.aboutDone = true;
    if (tags.length) {
      try {
        await api.setMyBackground(tags);
        state.profile = await api.getProfile(state.user.id);
      } catch (e) { /* 저장이 안 돼도 공부는 시작할 수 있어요 */ }
    }
    boot();
  }

  intro();
});
