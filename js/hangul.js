// 한글 자판(두벌식)과 글자 조립. 화면 키보드 레슨에서 써요. 서버나 AI 없이 앱 안에서만 동작해요.

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const VCOMB = { 'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ' };
const JCOMB = { 'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ', 'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ' };
const VSPLIT = Object.fromEntries(Object.entries(VCOMB).map(([k, v]) => [v, [...k]]));
const JSPLIT = Object.fromEntries(Object.entries(JCOMB).map(([k, v]) => [v, [...k]]));
const isVowel = (j) => JUNG.includes(j);

// 두벌식 자판: 한 줄씩, [영문 자리, 글자, Shift 글자]
export const ROWS = [
  [['q', 'ㅂ', 'ㅃ'], ['w', 'ㅈ', 'ㅉ'], ['e', 'ㄷ', 'ㄸ'], ['r', 'ㄱ', 'ㄲ'], ['t', 'ㅅ', 'ㅆ'], ['y', 'ㅛ'], ['u', 'ㅕ'], ['i', 'ㅑ'], ['o', 'ㅐ', 'ㅒ'], ['p', 'ㅔ', 'ㅖ']],
  [['a', 'ㅁ'], ['s', 'ㄴ'], ['d', 'ㅇ'], ['f', 'ㄹ'], ['g', 'ㅎ'], ['h', 'ㅗ'], ['j', 'ㅓ'], ['k', 'ㅏ'], ['l', 'ㅣ']],
  [['z', 'ㅋ'], ['x', 'ㅌ'], ['c', 'ㅊ'], ['v', 'ㅍ'], ['b', 'ㅠ'], ['n', 'ㅜ'], ['m', 'ㅡ']],
];
// 컴퓨터 자판으로 칠 때: 영문 글쇠 → 글자
export const QWERTY = Object.fromEntries(ROWS.flat().flatMap(([k, a, b]) => [[k, a], ...(b ? [[k.toUpperCase(), b]] : [])]));
// 이 글자를 치려면 Shift가 필요해요
export const SHIFTED = new Set(ROWS.flat().filter((x) => x[2]).map((x) => x[2]));
// 글자가 있는 글쇠 (Shift 글자는 같은 자리의 기본 글자)
export const BASE_OF = Object.fromEntries(ROWS.flat().flatMap(([, a, b]) => [[a, a], ...(b ? [[b, a]] : [])]));

// 눌린 글자들 → 완성된 글 (예: ㅎ ㅏ ㄴ ㄱ ㅜ ㄱ → 한국)
export function compose(keys) {
  const out = [];
  let cur = null; // {cho, jung, vp(모음 조각 수), jong, jp(받침 조각)}
  const flush = () => { if (cur) out.push(cur); cur = null; };
  for (const k of keys) {
    if (k === ' ') { flush(); out.push({ raw: ' ' }); continue; }
    if (!isVowel(k)) {
      if (cur && cur.cho && cur.jung && !cur.jong && JONG.includes(k)) { cur.jong = k; cur.jp = [k]; continue; }
      if (cur && cur.cho && cur.jung && cur.jong && cur.jp.length === 1 && JCOMB[cur.jong + k]) { cur.jp = [cur.jong, k]; cur.jong = JCOMB[cur.jong + k]; continue; }
      flush(); cur = { cho: k }; continue;
    }
    if (cur && cur.jung && !cur.jong && cur.vp === 1 && VCOMB[cur.jung + k]) { cur.jung = VCOMB[cur.jung + k]; cur.vp = 2; continue; }
    if (cur && cur.cho && !cur.jung) { cur.jung = k; cur.vp = 1; continue; }
    if (cur && cur.jong) {
      // 받침 뒤에 모음이 오면 받침(의 끝 조각)이 다음 글자의 첫소리로 넘어가요: 한 + ㅇ… / 감 + ㅏ → 가마
      const moved = cur.jp.pop();
      cur.jong = cur.jp.length ? cur.jp[0] : '';
      flush(); cur = { cho: moved, jung: k, vp: 1 }; continue;
    }
    flush(); cur = { jung: k, vp: 1 };
  }
  flush();
  return out.map((b) => {
    if (b.raw) return b.raw;
    if (b.cho && b.jung && CHO.includes(b.cho)) {
      return String.fromCharCode(0xAC00 + (CHO.indexOf(b.cho) * 21 + JUNG.indexOf(b.jung)) * 28 + JONG.indexOf(b.jong || ''));
    }
    return b.cho || b.jung || '';
  }).join('');
}

// 글 → 쳐야 할 글자 순서 (예: 와 → ㅇ ㅗ ㅏ). 겹받침과 겹모음은 조각으로 나눠요.
export function keysFor(text) {
  const keys = [];
  for (const ch of String(text)) {
    const c = ch.charCodeAt(0) - 0xAC00;
    if (c >= 0 && c < 11172) {
      const cho = CHO[Math.floor(c / 588)], jung = JUNG[Math.floor((c % 588) / 28)], jong = JONG[c % 28];
      keys.push(cho, ...(VSPLIT[jung] || [jung]));
      if (jong) keys.push(...(JSPLIT[jong] || [jong]));
    } else if (VSPLIT[ch]) keys.push(...VSPLIT[ch]);
    else if (ch === ' ') keys.push(' ');
    else keys.push(ch);
  }
  return keys;
}

// 한 글자를 첫소리 · 가운데소리 · 끝소리로 (글자 조립 칸에 보여 줘요)
export function parts(syllable) {
  const c = String(syllable).charCodeAt(0) - 0xAC00;
  if (c < 0 || c >= 11172) return { cho: '', jung: '', jong: '' };
  return { cho: CHO[Math.floor(c / 588)], jung: JUNG[Math.floor((c % 588) / 28)], jong: JONG[c % 28] };
}

// 지금까지 친 것을 보고 다음에 누를 글쇠 (틀렸으면 지우기)
export function nextKey(typed, target) {
  const t = keysFor(target);
  for (let i = 0; i < typed.length; i += 1) if (typed[i] !== t[i]) return 'BACK';
  return typed.length < t.length ? t[typed.length] : null;
}

// 글자 소리와 영어 설명
export const SOUND = {
  'ㄱ': ['g / k', 'like g in “go”'], 'ㄴ': ['n', 'like n in “no”'], 'ㄷ': ['d / t', 'like d in “do”'], 'ㄹ': ['r / l', 'between r and l'],
  'ㅁ': ['m', 'like m in “me”'], 'ㅂ': ['b / p', 'like b in “boy”'], 'ㅅ': ['s', 'like s in “sun”'], 'ㅇ': ['silent / ng', 'silent at the start, “ng” at the end'],
  'ㅈ': ['j', 'like j in “jam”'], 'ㅊ': ['ch', 'like ch in “church”, with a puff of air'], 'ㅋ': ['k', 'like k in “kite”, with a puff of air'],
  'ㅌ': ['t', 'like t in “top”, with a puff of air'], 'ㅍ': ['p', 'like p in “pie”, with a puff of air'], 'ㅎ': ['h', 'like h in “hat”'],
  'ㄲ': ['kk', 'a tense k, no puff of air'], 'ㄸ': ['tt', 'a tense t'], 'ㅃ': ['pp', 'a tense p'], 'ㅆ': ['ss', 'a strong s'], 'ㅉ': ['jj', 'a tense j'],
  'ㅏ': ['a', 'like a in “father”'], 'ㅓ': ['eo', 'like u in “up”'], 'ㅗ': ['o', 'like o in “go”'], 'ㅜ': ['u', 'like oo in “moon”'],
  'ㅡ': ['eu', 'like oo in “good”, lips flat'], 'ㅣ': ['i', 'like ee in “see”'], 'ㅑ': ['ya', 'y + ㅏ'], 'ㅕ': ['yeo', 'y + ㅓ'],
  'ㅛ': ['yo', 'y + ㅗ'], 'ㅠ': ['yu', 'y + ㅜ'], 'ㅐ': ['ae', 'like e in “bed”'], 'ㅔ': ['e', 'like e in “bed” (almost the same as ㅐ)'],
  'ㅒ': ['yae', 'y + ㅐ'], 'ㅖ': ['ye', 'y + ㅔ'], 'ㅘ': ['wa', 'ㅗ + ㅏ'], 'ㅝ': ['wo', 'ㅜ + ㅓ'], 'ㅚ': ['oe', 'ㅗ + ㅣ, sounds like “we”'],
  'ㅟ': ['wi', 'ㅜ + ㅣ'], 'ㅢ': ['ui', 'ㅡ + ㅣ'], 'ㅙ': ['wae', 'ㅗ + ㅐ'], 'ㅞ': ['we', 'ㅜ + ㅔ'],
};
// 글자 하나를 소리 내어 읽을 때 쓰는 글자 (자음은 + ㅏ, 모음은 ㅇ + )
export function sayable(j) {
  if (isVowel(j)) return compose(['ㅇ', ...(VSPLIT[j] || [j])]);
  if (j === 'ㅇ') return '앙';
  return compose([j, 'ㅏ']);
}

// 2주 과정: 하루 한 단원. letters = 새로 배우는 글자, syll = 조립 연습, words = [낱말, 뜻, 로마자]
export const UNITS = [
  { title: 'Simple vowels', letters: ['ㅇ', 'ㅏ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ'], syll: ['아', '어', '오', '우', '이'],
    words: [['아이', 'child', 'a-i'], ['오이', 'cucumber', 'o-i'], ['이', 'two', 'i'], ['아우', 'younger brother', 'a-u']] },
  { title: 'ㄴ ㅁ ㄹ', letters: ['ㄴ', 'ㅁ', 'ㄹ'], syll: ['나', '머', '로', '누', '미'],
    words: [['나무', 'tree', 'na-mu'], ['머리', 'head', 'meo-ri'], ['나라', 'country', 'na-ra'], ['어머니', 'mother', 'eo-meo-ni']] },
  { title: 'ㄱ ㄷ ㅂ ㅅ ㅈ', letters: ['ㄱ', 'ㄷ', 'ㅂ', 'ㅅ', 'ㅈ'], syll: ['가', '도', '부', '서', '지'],
    words: [['바다', 'sea', 'ba-da'], ['사자', 'lion', 'sa-ja'], ['지도', 'map', 'ji-do'], ['아버지', 'father', 'a-beo-ji']] },
  { title: 'ㅎ ㅊ ㅋ ㅌ ㅍ', letters: ['ㅎ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ'], syll: ['하', '초', '커', '투', '피'],
    words: [['하나', 'one', 'ha-na'], ['커피', 'coffee', 'keo-pi'], ['토마토', 'tomato', 'to-ma-to'], ['피자', 'pizza', 'pi-ja']] },
  { title: 'ㅑ ㅕ ㅛ ㅠ ㅐ ㅔ', letters: ['ㅑ', 'ㅕ', 'ㅛ', 'ㅠ', 'ㅐ', 'ㅔ'], syll: ['야', '여', '요', '유', '배'],
    words: [['우유', 'milk', 'u-yu'], ['여자', 'woman', 'yeo-ja'], ['요리', 'cooking', 'yo-ri'], ['네', 'yes', 'ne']] },
  { title: 'Final sounds 1', letters: [], note: 'A consonant under a syllable is its final sound (받침).', syll: ['안', '강', '밤', '물', '국'],
    words: [['사랑', 'love', 'sa-rang'], ['한국', 'Korea', 'han-guk'], ['이름', 'name', 'i-reum'], ['물', 'water', 'mul']] },
  { title: 'Final sounds 2', letters: [], note: 'ㅂ ㅅ ㅈ ㅊ at the end sound short: p, t, t, t.', syll: ['밥', '옷', '집', '맛', '낮'],
    words: [['밥', 'rice, a meal', 'bap'], ['집', 'house', 'jip'], ['옷', 'clothes', 'ot'], ['맛', 'taste', 'mat']] },
  { title: 'Double consonants (Shift)', letters: ['ㄲ', 'ㄸ', 'ㅃ', 'ㅆ', 'ㅉ'], syll: ['까', '또', '빠', '씨', '짜'],
    words: [['아빠', 'dad', 'a-ppa'], ['꼬리', 'tail', 'kko-ri'], ['쓰다', 'to write', 'sseu-da'], ['짜다', 'salty', 'jja-da']] },
  { title: 'Combined vowels', letters: ['ㅘ', 'ㅝ', 'ㅚ', 'ㅟ', 'ㅢ', 'ㅖ'], syll: ['와', '워', '외', '위', '의'],
    words: [['사과', 'apple', 'sa-gwa'], ['회사', 'company', 'hoe-sa'], ['의사', 'doctor', 'ui-sa'], ['시계', 'clock', 'si-gye']] },
  { title: 'Everyday words', letters: [], note: 'Now type whole words you will use in letters.', syll: ['안', '녕', '감', '좋', '해'],
    words: [['안녕하세요', 'hello', 'an-nyeong-ha-se-yo'], ['감사합니다', 'thank you', 'gam-sa-ham-ni-da'], ['좋아요', 'good, I like it', 'jo-a-yo'], ['사랑해요', 'I love you', 'sa-rang-hae-yo']] },
];
