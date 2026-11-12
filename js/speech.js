// 소리 내기(TTS)와 말 알아듣기(STT) — 크롬 내장 기능 사용

const synth = window.speechSynthesis || null;
let voice = null;

function pickVoice() {
  if (!synth) return;
  const vs = synth.getVoices() || [];
  const en = vs.filter((v) => /^en[-_]/i.test(v.lang));
  voice =
    en.find((v) => /en[-_]US/i.test(v.lang) && /google|samantha|female|aria|jenny/i.test(v.name)) ||
    en.find((v) => /en[-_]US/i.test(v.lang)) ||
    en[0] ||
    null;
}
if (synth) {
  pickVoice();
  try { synth.addEventListener('voiceschanged', pickVoice); } catch (e) { /* 일부 브라우저 */ }
}

export const canSpeak = !!(synth && window.SpeechSynthesisUtterance);

let talkingEl = null;
function setTalking(on) {
  document.querySelectorAll('.avatar').forEach((a) => a.classList.toggle('talking', on));
  if (talkingEl) talkingEl.classList.toggle('playing', on);
}

export function stopSpeaking() {
  try { if (synth) synth.cancel(); } catch (e) { /* 무시 */ }
  setTalking(false);
  talkingEl = null;
}

// 영어 문장을 읽어 줍니다. 끝나면 resolve.
export function speak(text, { rate = 0.85, button = null } = {}) {
  return new Promise((resolve) => {
    if (!canSpeak || !text) return resolve(false);
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      if (voice) u.voice = voice;
      u.rate = rate;
      u.pitch = 1;
      talkingEl = button;
      const finish = () => { setTalking(false); talkingEl = null; resolve(true); };
      u.onstart = () => setTalking(true);
      u.onend = finish;
      u.onerror = finish;
      synth.speak(u);
      // 일부 안드로이드에서 onend 가 오지 않는 경우 대비
      setTimeout(() => { if (!synth.speaking) finish(); }, 400 + text.length * 140 / rate);
    } catch (e) {
      setTalking(false);
      resolve(false);
    }
  });
}

// ---------------------------------------------------------------------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
export const canListen = !!SR;
let current = null;

export const LISTEN_ERRORS = {
  'not-allowed': '마이크 사용을 허락해 주세요. 주소창 옆 자물쇠를 눌러 마이크를 켜면 됩니다.',
  'service-not-allowed': '마이크 사용을 허락해 주세요.',
  'no-speech': '소리가 들리지 않았어요. 버튼을 누르고 말씀해 주세요.',
  'audio-capture': '마이크를 찾을 수 없어요.',
  'network': '인터넷 연결을 확인해 주세요.',
};

// 영어로 한 번 듣고, 알아들은 문장 후보들을 돌려줍니다.
export function listen() {
  return new Promise((resolve, reject) => {
    if (!SR) return reject('unsupported');
    stopSpeaking();
    let done = false;
    const r = new SR();
    r.lang = 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 3;
    r.onresult = (e) => {
      if (done) return;
      done = true;
      const alts = [];
      for (let i = 0; i < e.results[0].length; i++) alts.push(e.results[0][i].transcript.trim());
      resolve(alts.filter(Boolean));
    };
    r.onerror = (e) => { if (!done) { done = true; reject(e.error || 'error'); } };
    r.onend = () => { if (!done) { done = true; reject('no-speech'); } current = null; };
    current = r;
    try { r.start(); } catch (e) { done = true; reject('error'); }
  });
}

export function stopListening() {
  try { if (current) current.stop(); } catch (e) { /* 무시 */ }
}

// 목표 문장과 들은 문장이 얼마나 같은지 (0~1)
function words(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
}
export function similarity(target, heard) {
  const t = words(target), h = words(heard);
  if (!t.length) return 0;
  const dp = Array.from({ length: t.length + 1 }, () => new Array(h.length + 1).fill(0));
  for (let i = 1; i <= t.length; i++)
    for (let j = 1; j <= h.length; j++)
      dp[i][j] = t[i - 1] === h[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[t.length][h.length] / t.length;
}
export function bestSimilarity(target, alts) {
  return Math.max(0, ...(alts || []).map((a) => similarity(target, a)));
}
export function sameSentence(a, b) {
  return words(a).join(' ') === words(b).join(' ');
}
