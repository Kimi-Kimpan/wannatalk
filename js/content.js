// 고정 콘텐츠: 주제, 단계 설명, 첫 테스트 문제

export const TOPICS = [
  { id: 'me',          ko: '내 소개',           emoji: '🙋' },
  { id: 'family',      ko: '가족 이야기',       emoji: '👨‍👩‍👧' },
  { id: 'day',         ko: '나의 하루',         emoji: '⏰' },
  { id: 'past',        ko: '젊은 시절',         emoji: '📷' },
  { id: 'work',        ko: '지금 하는 일',      emoji: '🧑‍🦽' },
  { id: 'future',      ko: '앞으로 하고 싶은 것', emoji: '🌱' },
  { id: 'timemachine', ko: '타임머신',          emoji: '🕰️' },
  { id: 'likes',       ko: '좋아하는 것',       emoji: '❤️' },
  { id: 'sweden',      ko: '스웨덴과 클라라',   emoji: '❄️' },
  { id: 'heart',       ko: '마음과 생각',       emoji: '💭' },
];

export function topicForDay(day) {
  return TOPICS[(day - 1) % TOPICS.length];
}
export function cycleForDay(day) {
  return Math.ceil(day / TOPICS.length);
}

export const LEVEL_NAMES = {
  1: '낱말과 짧은 말',
  2: '이유 붙여 말하기',
  3: '지난 일과 앞으로 할 일',
  4: '느낌과 생각 말하기',
  5: '짧은 이야기 들려주기',
};

// 말하는 속도 (단계가 오를수록 자연스러운 속도)
export const SPEECH_RATE = { 1: 0.72, 2: 0.8, 3: 0.88, 4: 0.95, 5: 1.0 };

// 첫 로그인 테스트 ---------------------------------------------------------------
export const PLACEMENT = {
  listen: [
    { en: 'Water, please.', options: [{ e: '💧', ko: '물 주세요' }, { e: '🍞', ko: '빵 주세요' }], answer: 0 },
    { en: 'Good night.', options: [{ e: '☀️', ko: '좋은 아침' }, { e: '🌙', ko: '안녕히 주무세요' }], answer: 1 },
    { en: 'I have two sons.', options: [{ e: '👦👦', ko: '아들이 둘 있어요' }, { e: '👧', ko: '딸이 하나 있어요' }], answer: 0 },
    { en: 'It was very cold yesterday.', options: [{ e: '🥵', ko: '오늘은 더워요' }, { e: '🥶', ko: '어제 많이 추웠어요' }], answer: 1 },
    { en: 'I will visit my friend in Sweden next year.', options: [{ e: '✈️', ko: '내년에 스웨덴에 있는 친구를 만나러 가요' }, { e: '🏠', ko: '작년에 친구가 우리 집에 왔어요' }], answer: 0 },
  ],
  speak: [
    { en: 'Nice to meet you.', ko: '만나서 반가워요.' },
    { en: 'I work at the airport.', ko: '저는 공항에서 일해요.' },
    { en: 'I would like to visit Sweden someday.', ko: '언젠가 스웨덴에 가 보고 싶어요.' },
  ],
  write: [
    { ko: '저는 공항에서 일해요.', en: 'I work at the airport.', extra: ['is', 'you'] },
    { ko: '어제 아들을 만났어요.', en: 'I met my son yesterday.', extra: ['meet', 'today'] },
  ],
};

// 결과 점수(0~1)로 시작 단계 정하기
export function levelFromScore(s) {
  if (s < 0.45) return 1;
  if (s < 0.75) return 2;
  return 3;
}
