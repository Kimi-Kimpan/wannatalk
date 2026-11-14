// 소리 내기와 말 알아듣기
// - 소리: 오디오 플레이어 하나를 첫 터치 때 깨워 두고 계속 다시 씁니다.
//   (아이폰은 손가락으로 누른 적 없는 소리를 막아서, 매번 새 플레이어를 만들면 소리가 나지 않습니다.)
// - Klaudia 목소리: 서버에서 만든 자연스러운 목소리. 안 되면 기기 목소리로 대신 읽습니다.
// - 말 알아듣기: 마이크로 직접 녹음해서 서버가 받아 적습니다.
//   (아이폰 홈 화면 앱에서는 브라우저 내장 음성 인식이 동작하지 않습니다.)
//   녹음이 안 되는 기기에서만 브라우저 내장 음성 인식을 씁니다.
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

// 아이폰: 소리는 '재생', 녹음할 때는 '재생+녹음'으로 알려 주면 무음 스위치와 상관없이 스피커로 나옵니다.
function audioSession(type) {
  try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) { /* 지원 안 함 */ }
}

// ---- 오디오 플레이어 (하나만 만들어 계속 사용) -----------------------------------
function silentWav() {
  const n = 800; // 0.1초 (8kHz, 8bit)
  const b = new Uint8Array(44 + n);
  const v = new DataView(b.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  b.fill(128, 44);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return 'data:audio/wav;base64,' + btoa(s);
}

const player = typeof Audio !== 'undefined' ? new Audio() : null;
if (player) { player.preload = 'auto'; player.setAttribute('playsinline', ''); }
let unlocked = false;   // 손가락으로 한 번 깨웠는지
let unlocking = false;
let active = null;      // 지금 나오는 소리 { cancel() }
let playId = 0;

function unlock() {
  if (unlocked || unlocking || active || !player) return;
  unlocking = true;
  try {
    player.muted = false;
    player.src = silentWav();
    const p = player.play();
    const done = (ok) => { unlocking = false; if (ok) setUnlocked(); };
    if (p && p.then) p.then(() => done(true), () => done(false)); else done(true);
  } catch (e) { unlocking = false; }
}
const UNLOCK_EVENTS = ['touchend', 'click', 'keydown'];
function setUnlocked() {
  if (unlocked) return;
  unlocked = true;
  UNLOCK_EVENTS.forEach((t) => document.removeEventListener(t, unlock, true));
}
UNLOCK_EVENTS.forEach((t) => document.addEventListener(t, unlock, true));

let talkingEl = null;
let token = 0;
const STOP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';
function setTalking(on) {
  document.querySelectorAll('.avatar').forEach((a) => a.classList.toggle('talking', on));
}
// 듣기 버튼을 누르면 '멈추기'로, 끝나면 원래대로
function markButton(btn, on) {
  if (!btn) return;
  if (on) {
    if (btn.dataset.busy === '1') return;
    btn.dataset.busy = '1';
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = `${STOP_ICON} 멈추기`;
    btn.classList.add('playing');
  } else {
    if (btn.dataset.busy !== '1') return;
    btn.dataset.busy = '';
    if (btn.dataset.label != null) btn.innerHTML = btn.dataset.label;
    btn.classList.remove('playing', 'loading');
  }
}

export function stopSpeaking() {
  token++;
  try { if (synth) synth.cancel(); } catch (e) { /* 무시 */ }
  if (active) { const a = active; active = null; a.cancel(); }
  setTalking(false);
  markButton(talkingEl, false);
  talkingEl = null;
}

// 기기 목소리. 끝나면 true
function deviceSpeak(text, { rate = 0.85 } = {}) {
  return new Promise((resolve) => {
    if (!canSpeak || !text) return resolve(false);
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      if (voice) u.voice = voice;
      u.rate = rate;
      u.pitch = 1;
      let done = false;
      const finish = () => { if (done) return; done = true; setTalking(false); resolve(true); };
      u.onstart = () => setTalking(true);
      u.onend = finish;
      u.onerror = finish;
      synth.speak(u);
      // 일부 기기에서 onend 가 오지 않는 경우 대비
      setTimeout(() => { if (!synth.speaking) finish(); }, 400 + text.length * 140 / rate);
      setTimeout(finish, 4000 + text.length * 220 / rate);
    } catch (e) {
      setTalking(false);
      resolve(false);
    }
  });
}

// ---- 자연스러운 목소리 --------------------------------------------------------------
let voiceLevel = 1;
export function setVoiceLevel(l) { voiceLevel = Number(l) || 1; }
let failures = 0;
let pauseUntil = 0;         // 계속 안 되면 1분 동안은 기기 목소리로
const naturalReady = () => Date.now() >= pauseUntil;
const pending = new Map();  // 받고 있는 소리
const urls = new Map();     // 받은 소리 (최근 40개)
const TTS_CACHE = 'wt-tts-3';

function toBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (/wav|mpeg|mp3|ogg|aac|mp4/i.test(mime || '')) return new Blob([bytes], { type: /mp3/i.test(mime) ? 'audio/mpeg' : mime.split(';')[0] });
  // 날것의 PCM(16bit)은 WAV 머리말을 붙여야 재생됩니다.
  const rate = Number((/rate=(\d+)/.exec(mime || '') || [])[1]) || 24000;
  const h = new DataView(new ArrayBuffer(44));
  const w = (o, str) => { for (let i = 0; i < str.length; i++) h.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); h.setUint32(4, 36 + bytes.length, true); w(8, 'WAVE');
  w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
  w(36, 'data'); h.setUint32(40, bytes.length, true);
  return new Blob([h, bytes], { type: 'audio/wav' });
}

function cacheKey(text) {
  return location.origin + '/__tts/v3/' + (voiceLevel <= 1 ? 1 : voiceLevel <= 3 ? 2 : 4) + '/' + encodeURIComponent(text.slice(0, 300));
}
function remember(key, url) {
  urls.set(key, url);
  if (urls.size > 40) {
    const oldest = urls.keys().next().value;
    try { URL.revokeObjectURL(urls.get(oldest)); } catch (e) { /* 무시 */ }
    urls.delete(oldest);
  }
}

// 소리 파일 주소를 돌려줍니다. 한 번 받은 소리는 기기에 저장해 두고 다시 받지 않습니다.
function naturalAudio(text) {
  const key = cacheKey(text);
  if (urls.has(key)) return Promise.resolve(urls.get(key));
  if (pending.has(key)) return pending.get(key);
  const p = (async () => {
    let blob = null;
    try { const c = await caches.open(TTS_CACHE); const r = await c.match(key); if (r) blob = await r.blob(); } catch (e) { /* 저장소 없음 */ }
    if (!blob) {
      const r = await ai('tts', { text, level: voiceLevel }, 25000);
      if (!r || !r.audio) throw new Error('no audio');
      blob = toBlob(r.audio, r.mime);
      try { const c = await caches.open(TTS_CACHE); await c.put(key, new Response(blob, { headers: { 'Content-Type': blob.type } })); } catch (e) { /* 무시 */ }
    }
    failures = 0;
    const url = URL.createObjectURL(blob);
    remember(key, url);
    return url;
  })();
  pending.set(key, p);
  p.then(() => pending.delete(key), () => {
    pending.delete(key);
    if (++failures >= 3) { failures = 0; pauseUntil = Date.now() + 60000; }
  });
  return p;
}

// 다음에 읽을 문장을 미리 받아 둡니다.
export function prefetch(text) {
  if (text && naturalReady()) naturalAudio(text).catch(() => {});
}

// 저장해 둔 소리가 너무 많아지면 오래된 것부터 지웁니다.
async function pruneCache() {
  try {
    const c = await caches.open(TTS_CACHE);
    const keys = await c.keys();
    for (const k of keys.slice(0, Math.max(0, keys.length - 400))) await c.delete(k);
    await caches.delete('wt-tts'); // 예전 저장소
  } catch (e) { /* 무시 */ }
}
setTimeout(pruneCache, 8000);

// 한 번 재생. 'ok' 끝까지 들음 · 'stopped' 중간에 멈춤 · 'failed' 재생 못 함
function playUrl(url, { rate = 0.85 } = {}, my) {
  return new Promise((resolve) => {
    if (my !== token || !player) return resolve(my !== token ? 'stopped' : 'failed');
    const id = ++playId;
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      if (active === handle) active = null;
      setTalking(false);
      resolve(result);
    };
    const handle = { cancel() { try { player.pause(); } catch (e) { /* 무시 */ } finish('stopped'); } };
    active = handle;
    // 천천히 듣기는 더 느리게, 1~2단계는 조금 느리게
    const speed = rate <= 0.6 ? 0.75 : voiceLevel <= 2 ? 0.9 : 1;
    player.onplaying = () => { if (id === playId && !done) { setUnlocked(); setTalking(true); } };
    player.onended = () => { if (id === playId) finish('ok'); };
    player.onerror = () => { if (id === playId) finish('failed'); };
    try {
      audioSession('playback');
      player.muted = false;
      player.src = url;
      player.defaultPlaybackRate = speed;
      player.playbackRate = speed;
      const p = player.play();
      if (p && p.catch) p.catch(() => { if (id === playId) finish(my !== token ? 'stopped' : 'failed'); });
    } catch (e) {
      finish('failed');
    }
  });
}

// 영어 문장을 읽어 줍니다.
// 돌려주는 값: true = 끝까지 읽음(또는 소리를 낼 수 없었음), false = 중간에 멈춤(다른 버튼을 눌렀거나 화면이 바뀜)
export async function speak(text, opts = {}) {
  if (!text) return true;
  // 읽는 중에 같은 버튼을 다시 누르면 멈추기 (천천히 듣기처럼 restart 면 처음부터 다시)
  if (opts.button && opts.button.dataset.busy === '1' && !opts.restart) { stopSpeaking(); return false; }
  cancelListening();
  stopSpeaking();
  const my = token;
  const btn = opts.button || null;
  if (btn) { talkingEl = btn; markButton(btn, true); }
  let result = 'failed';
  if (opts.natural !== false && player && naturalReady()) {
    if (btn) btn.classList.add('loading');
    try {
      const url = await naturalAudio(text);
      if (btn) btn.classList.remove('loading');
      if (my !== token) return false;
      result = await playUrl(url, opts, my);
    } catch (e) {
      if (btn) btn.classList.remove('loading');
    }
    if (my !== token) return false;
  }
  if (result !== 'ok') {
    await deviceSpeak(text, opts);
    if (my !== token) return false;
  }
  if (talkingEl === btn) { markButton(btn, false); talkingEl = null; }
  return true;
}

// ---- 말 알아듣기 ---------------------------------------------------------------------
const AC = window.AudioContext || window.webkitAudioContext || null;
const canRecord = !!(AC && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// 아이폰의 내장 음성 인식은 홈 화면 앱에서 동작하지 않아서 쓰지 않습니다.
const webSpeechOK = !!SR && !iOS;
export const canListen = canRecord || webSpeechOK;

export const LISTEN_ERRORS = {
  'not-allowed': '마이크 사용을 허락해 주세요. "허용"을 누르면 말할 수 있어요.',
  'service-not-allowed': '마이크 사용을 허락해 주세요.',
  'no-speech': '잘 들리지 않았어요. 다시 누르고 조금 크게 말씀해 주세요.',
  'audio-capture': '마이크를 쓸 수 없어요. 다른 앱이 마이크를 쓰고 있는지 확인해 주세요.',
  'network': '인터넷 연결을 확인해 주세요.',
  'stt-failed': '말을 알아듣지 못했어요. 한 번 더 눌러서 말씀해 주세요.',
  'unsupported': '이 기기에서는 말하기를 쓸 수 없어요.',
};

let rec = null;        // 지금 하고 있는 녹음 { stop(), cancel() }
let ctx = null;        // 녹음용 오디오 (하나만 만들어 다시 사용)
let serverFails = 0;   // 서버가 계속 못 받아 적으면 내장 음성 인식으로

// 16kHz 로 줄이기 (말소리에는 충분하고, 보낼 양이 1/3 로 줄어듭니다)
function resample(data, from, to = 16000) {
  if (from <= to) return { data, rate: from };
  const ratio = from / to;
  const n = Math.floor(data.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.min(data.length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += data[j];
    out[i] = s / Math.max(1, b - a);
  }
  return { data: out, rate: to };
}
function wavBase64(samples, rate) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// 마이크로 녹음 → 말이 끝나면(조용해지면) 저절로 멈춤 → 서버가 받아 적기
function recordAndTranscribe({ silenceMs = 1800, maxMs = 25000, waitMs = 9000, onLevel = null, onState = null, lang = 'en' } = {}) {
  return new Promise((resolve, reject) => {
    let stream = null, source = null, proc = null, sink = null, cap = null;
    let ended = false;
    const chunks = [];
    let total = 0, rate = 48000;
    let started = false, loud = 0, firstVoice = 0, lastVoiceEnd = 0, lastVoiceAt = 0, t0 = 0;
    let floor = 0, peak = 0, level = 0;

    // 아이폰은 누른 바로 그 순간에 깨워야 합니다.
    try {
      if (!ctx || ctx.state === 'closed') ctx = new AC();
      if (ctx.state !== 'running') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
    } catch (e) { return reject('audio-capture'); }
    audioSession('play-and-record');

    const cleanup = () => {
      clearTimeout(cap);
      try { if (proc) { proc.onaudioprocess = null; proc.disconnect(); } } catch (e) { /* 무시 */ }
      try { if (source) source.disconnect(); } catch (e) { /* 무시 */ }
      try { if (sink) sink.disconnect(); } catch (e) { /* 무시 */ }
      // 마이크를 꼭 놓아 줘야 아이폰에서 소리가 다시 스피커로 크게 나옵니다.
      try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* 무시 */ }
      try { if (ctx && ctx.state === 'running') { const p = ctx.suspend(); if (p && p.catch) p.catch(() => {}); } } catch (e) { /* 무시 */ }
      audioSession('playback');
      if (onLevel) { try { onLevel(0); } catch (e) { /* 무시 */ } }
      if (rec === handle) rec = null;
    };

    const finish = async (why) => {
      if (ended) return;
      ended = true;
      cleanup();
      if (why === 'cancel') return reject('aborted');
      if (why === 'error') return reject('audio-capture');
      // 말소리가 없었으면 보내지 않습니다. ('정지'를 직접 누른 경우는 작은 소리라도 있으면 보냅니다.)
      const some = why === 'manual' && peak > 0.008 && total > rate * 0.5;
      if (!started && !some) return reject('no-speech');
      if (onState) { try { onState('thinking'); } catch (e) { /* 무시 */ } }
      try {
        const all = new Float32Array(total);
        let o = 0;
        for (const c of chunks) { all.set(c, o); o += c.length; }
        // 앞뒤의 조용한 부분은 잘라 냅니다.
        const from = started ? Math.max(0, firstVoice - Math.round(rate * 0.35)) : 0;
        const to = started ? Math.min(total, lastVoiceEnd + Math.round(rate * 0.45)) : total;
        const cut = resample(all.subarray(from, to), rate);
        const r = await ai('stt', { audio: wavBase64(cut.data, cut.rate), mime: 'audio/wav', lang: lang || 'en' }, 30000);
        serverFails = 0;
        const text = String((r && r.text) || '').replace(/\s+/g, ' ').trim();
        if (!text) return reject('no-speech');
        resolve([text]);
      } catch (e) {
        serverFails++;
        reject(e && e.code === 'network' ? 'network' : 'stt-failed');
      }
    };
    const handle = { stop: () => finish('manual'), cancel: () => finish('cancel') };
    rec = handle;

    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
      .then((s) => {
        stream = s;
        if (ended) { s.getTracks().forEach((t) => t.stop()); return; }
        source = ctx.createMediaStreamSource(s);
        proc = ctx.createScriptProcessor(4096, 1, 1);
        sink = ctx.createGain();
        sink.gain.value = 0; // 내 목소리가 스피커로 되돌아 나오지 않게
        t0 = performance.now();
        lastVoiceAt = t0;
        proc.onaudioprocess = (e) => {
          if (ended) return;
          const input = e.inputBuffer.getChannelData(0);
          rate = e.inputBuffer.sampleRate || ctx.sampleRate;
          chunks.push(new Float32Array(input));
          let sum = 0;
          for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
          const rms = Math.sqrt(sum / input.length);
          const now = performance.now();
          // 주변 소음 크기를 따라가며, 그보다 뚜렷하게 큰 소리를 말소리로 봅니다.
          floor = floor === 0 ? Math.min(rms, 0.004) : Math.min(rms, floor * 1.04 + 0.00002);
          const threshold = Math.min(0.06, Math.max(0.012, floor * 3));
          if (rms > peak) peak = rms;
          if (rms > threshold) {
            loud++;
            lastVoiceAt = now;
            lastVoiceEnd = total + input.length;
            if (!started && loud >= 2) { started = true; firstVoice = Math.max(0, total - input.length); }
          } else {
            loud = 0;
          }
          total += input.length;
          if (onLevel) {
            level = Math.max(Math.min(1, rms / 0.15), level * 0.7);
            try { onLevel(level); } catch (err) { /* 무시 */ }
          }
          if (started && now - lastVoiceAt > silenceMs) finish('silence');
          else if (!started && now - t0 > waitMs) finish('timeout');
        };
        source.connect(proc);
        proc.connect(sink);
        sink.connect(ctx.destination);
        cap = setTimeout(() => finish('max'), maxMs);
        if (ctx.state !== 'running') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
      })
      .catch((e) => {
        if (ended) return;
        ended = true;
        cleanup();
        const name = (e && e.name) || '';
        reject(name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError' ? 'not-allowed' : 'audio-capture');
      });
  });
}

// 브라우저 내장 음성 인식 (녹음이 안 되는 기기용)
let srCurrent = null;
function listenWebSpeech({ silenceMs = 1800, maxMs = 25000, lang = 'en' } = {}) {
  return new Promise((resolve, reject) => {
    let done = false, cancelled = false;
    let finals = [], lastAlts = [], interim = '';
    let silence = null;
    const r = new SR();
    r.lang = lang === 'auto' ? 'ko-KR' : 'en-US';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 3;
    const stopSoon = (ms) => { clearTimeout(silence); silence = setTimeout(() => { try { r.stop(); } catch (e) { /* 무시 */ } }, ms); };
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(silence);
      clearTimeout(cap);
      if (srCurrent === handle) srCurrent = null;
      if (cancelled) return reject('aborted');
      const text = (finals.join(' ') || interim).replace(/\s+/g, ' ').trim();
      if (!text) return reject('no-speech');
      resolve(finals.length === 1 && lastAlts.length ? lastAlts : [text]);
    };
    r.onresult = (e) => {
      finals = []; interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          finals.push(res[0].transcript.trim());
          lastAlts = [];
          for (let j = 0; j < res.length; j++) lastAlts.push(res[j].transcript.trim());
          lastAlts = lastAlts.filter(Boolean);
        } else {
          interim += res[0].transcript + ' ';
        }
      }
      stopSoon(silenceMs);
    };
    r.onspeechend = () => stopSoon(600);
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // onend 에서 정리
      if (!done) { done = true; clearTimeout(silence); clearTimeout(cap); if (srCurrent === handle) srCurrent = null; reject(e.error || 'error'); }
    };
    r.onend = finish;
    const cap = setTimeout(() => { try { r.stop(); } catch (e) { /* 무시 */ } }, maxMs);
    const handle = {
      stop() { try { r.stop(); } catch (e) { /* 무시 */ } },
      cancel() { cancelled = true; try { r.abort(); } catch (e) { finish(); } },
    };
    srCurrent = handle;
    try { r.start(); } catch (e) { done = true; clearTimeout(cap); srCurrent = null; reject('error'); }
  });
}

// 영어로 한 번 듣고, 알아들은 문장 후보들을 돌려줍니다. 반드시 버튼을 누른 그 자리에서 불러야 합니다.
// onLevel(0~1): 지금 들리는 소리 크기 · onState('thinking'): 녹음이 끝나고 받아 적는 중
export function listen(opts = {}) {
  stopSpeaking();
  cancelListening();
  if (canRecord && (serverFails < 1 || !webSpeechOK)) return recordAndTranscribe(opts);
  if (webSpeechOK) return listenWebSpeech(opts);
  return Promise.reject('unsupported');
}

// 그만 듣고, 지금까지 들은 말로 진행
export function stopListening() {
  if (rec) rec.stop();
  if (srCurrent) srCurrent.stop();
}
// 듣던 것을 버리기 (화면이 바뀔 때)
export function cancelListening() {
  if (rec) rec.cancel();
  if (srCurrent) srCurrent.cancel();
}

// 목표 문장과 들은 문장이 얼마나 같은지 (0~1)
function words(s) {
  return String(s || '').toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
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
