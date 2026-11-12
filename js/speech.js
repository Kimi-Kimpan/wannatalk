// 소리 내기와 말 알아듣기
// - Emma 목소리: Gemini 음성(자연스러움). 안 되면 기기 목소리로 대신 읽습니다.
// - 말 알아듣기: 크롬 내장 기능
import { ai } from './api.js';

const synth = window.speechSynthesis || null;
let voice = null;

function pickVoice() {
  if (!synth) return;
  const vs = synth.getVoices() || [];
  const en = vs.filter((v) => /^en[-_]/i.test(v.lang));
  const good = /natural|premium|enhanced|neural|online|google us english|samantha|ava|allison|aria|jenny|zira/i;
  voice =
    en.find((v) => /en[-_]US/i.test(v.lang) && good.test(v.name)) ||
    en.find((v) => good.test(v.name)) ||
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
let audioEl = null;
let token = 0;
function setTalking(on) {
  document.querySelectorAll('.avatar').forEach((a) => a.classList.toggle('talking', on));
  if (talkingEl) talkingEl.classList.toggle('playing', on);
}

export function stopSpeaking() {
  token++;
  try { if (synth) synth.cancel(); } catch (e) { /* 무시 */ }
  try { if (audioEl) { audioEl.pause(); audioEl = null; } } catch (e) { /* 무시 */ }
  setTalking(false);
  talkingEl = null;
}

// 기기 목소리
function deviceSpeak(text, { rate = 0.85, button = null } = {}) {
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
      let done = false;
      const finish = () => { if (done) return; done = true; setTalking(false); talkingEl = null; resolve(true); };
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

// ---- Gemini 목소리 ---------------------------------------------------------------
let voiceLevel = 1;
export function setVoiceLevel(l) { voiceLevel = Number(l) || 1; }
let naturalOK = true;
let failures = 0;
const pending = new Map();

function pcmToWav(b64, mime) {
  const rate = Number((/rate=(\d+)/.exec(mime || '') || [])[1]) || 24000;
  const bin = atob(b64);
  const pcm = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
  if (/wav|mpeg|mp3|ogg/i.test(mime || '')) return new Blob([pcm], { type: mime });
  const h = new DataView(new ArrayBuffer(44));
  const w = (o, str) => { for (let i = 0; i < str.length; i++) h.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE');
  w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
  w(36, 'data'); h.setUint32(40, pcm.length, true);
  return new Blob([h, pcm], { type: 'audio/wav' });
}

function cacheKey(text) {
  return location.origin + '/__tts/v1/' + (voiceLevel <= 1 ? 1 : voiceLevel <= 3 ? 2 : 4) + '/' + encodeURIComponent(text.slice(0, 300));
}

// 소리 파일 주소를 돌려줍니다. 한 번 받은 소리는 기기에 저장해 다시 쓰지 않습니다.
function naturalAudio(text) {
  const key = cacheKey(text);
  if (pending.has(key)) return pending.get(key);
  const p = (async () => {
    let blob = null;
    try { const c = await caches.open('wt-tts'); const r = await c.match(key); if (r) blob = await r.blob(); } catch (e) { /* 저장소 없음 */ }
    if (!blob) {
      const r = await ai('tts', { text, level: voiceLevel });
      if (!r || !r.audio) throw new Error('no audio');
      blob = pcmToWav(r.audio, r.mime);
      try { const c = await caches.open('wt-tts'); await c.put(key, new Response(blob)); } catch (e) { /* 무시 */ }
    }
    failures = 0;
    return URL.createObjectURL(blob);
  })();
  pending.set(key, p);
  p.catch(() => {
    pending.delete(key);
    failures++;
    if (failures >= 3) naturalOK = false; // 계속 안 되면 오늘은 기기 목소리로
  });
  return p;
}

// 다음에 읽을 문장을 미리 받아 둡니다.
export function prefetch(text) {
  if (naturalOK && text) naturalAudio(text).catch(() => {});
}

function playUrl(url, { rate = 0.85, button = null } = {}, my) {
  return new Promise((resolve) => {
    if (my !== token) return resolve(false);
    const a = new Audio(url);
    audioEl = a;
    a.playbackRate = rate <= 0.6 ? 0.78 : 1;
    talkingEl = button;
    let done = false;
    const finish = (ok) => { if (done) return; done = true; if (audioEl === a) audioEl = null; setTalking(false); talkingEl = null; resolve(ok); };
    a.onplay = () => setTalking(true);
    a.onended = () => finish(true);
    a.onerror = () => finish(false);
    a.onpause = () => finish(true);
    a.play().catch(() => finish(false));
  });
}

// 영어 문장을 읽어 줍니다. natural:true 면 Gemini 목소리. 끝나면 resolve.
export async function speak(text, opts = {}) {
  if (!text) return false;
  stopSpeaking();
  const my = token;
  if (opts.natural && naturalOK) {
    if (opts.button) opts.button.classList.add('loading');
    try {
      const url = await naturalAudio(text);
      if (opts.button) opts.button.classList.remove('loading');
      if (my !== token) return false;
      const ok = await playUrl(url, opts, my);
      if (ok || my !== token) return ok;
    } catch (e) {
      if (opts.button) opts.button.classList.remove('loading');
      if (my !== token) return false;
    }
  }
  return deviceSpeak(text, opts);
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
