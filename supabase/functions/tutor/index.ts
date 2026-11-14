// WannaTalk AI 선생님 (Supabase Edge Function: "tutor")
// Gemini API 키는 Supabase 비밀값 GEMINI_API_KEY 에 넣어 두고, 여기서만 사용합니다.
// 모델은 비밀값 GEMINI_MODEL 로 바꿀 수 있습니다. (OPENAI_API_KEY 가 있으면 GPT-6.1 Terra 먼저, 느리거나 안 되면 다음 모델 → Gemini)

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const LEVELS: Record<number, string> = {
  1: "Level 1 (absolute beginner): 2 to 5 words, or one very short present-tense sentence. Only the most common everyday words.",
  2: "Level 2 (beginner): one simple sentence, may join two ideas with 'and' or 'because'. Mostly present tense.",
  3: "Level 3 (elementary): one or two sentences mixing past and future (did, went, will, going to).",
  4: "Level 4 (pre-intermediate): two sentences that share feelings or opinions (I think, I feel, I hope, I wish).",
  5: "Level 5 (intermediate): two or three connected sentences that tell a small story in natural spoken English.",
};

const TOPICS: Record<string, string> = {
  me: "About me: name, age, where he lives, his home and neighbourhood.",
  family: "Family: his children, grandchildren, siblings, what each family member does now.",
  day: "Daily routine: when he wakes up, meals, commute, work shifts, evenings, weekends.",
  past: "The past: childhood, hometown, school days, first jobs, memories of his younger years.",
  work: "His work now: he helps passengers who use wheelchairs at an airport (escorting them to gates, check-in, security, baggage, boarding).",
  future: "The future: things he wants to do, places to visit, hobbies to start, hopes for his family.",
  timemachine: "Time machine: if he could travel to any time and place in the past or future, where and why.",
  likes: "Favourite things: food, music, TV, sports, walks, seasons, places.",
  sweden: "Sweden and Clara: Clara lives in northern Sweden (snow, cold winters, long dark nights, northern lights, time difference with Korea). He wants to talk with her and maybe visit.",
  heart: "Feelings and thoughts: health, what makes him happy, gratitude, advice he would give to young people.",
};

const LEARNER =
  "The learner is a Korean man in his 70s. He works at an airport, helping passengers who use wheelchairs. " +
  "His child's girlfriend, Clara, lives in northern Sweden and does not speak Korean; he wants to chat with her in English. " +
  "He is a beginner, reads Korean comfortably, and uses a phone. Be warm, patient and respectful. Never be childish.";

const SAY_RULE =
  "'say' is a Korean Hangul pronunciation guide for the English, written how a Korean speaker would read it aloud (e.g. 'Nice to meet you' -> '나이스 투 밋 츄').";

function clip(s: unknown, n = 400): string {
  return String(s ?? "").slice(0, n);
}

function levelOf(v: unknown): number {
  const n = Number(v);
  return n >= 1 && n <= 5 ? Math.round(n) : 1;
}

function notesText(notes: unknown): string {
  if (!Array.isArray(notes) || notes.length === 0) return "(nothing yet)";
  return notes.slice(0, 40).map((n) => "- " + clip(n, 200)).join("\n");
}

class GeminiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function callGemini(model: string, key: string, body: unknown, ms: number, outer?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onOuter = () => ctrl.abort();
  outer?.addEventListener("abort", onOuter);
  try {
    return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new GeminiError(504, `${model} timed out or cancelled`);
    throw e;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuter);
  }
}

// ---------------------------------------------------------------------------
// 사용량 기록: 요청마다 쓴 모델과 양을 모아 두었다가 ai_usage 표에 적습니다. 금액은 요금표로 계산한 추정치.
type Use = { provider: string; model: string; input_tokens?: number; output_tokens?: number; units?: number; cost: number };
type Meter = Use[];
// 1M 토큰당 [입력, 출력] 달러 (Gemini 는 무료 키라 0)
const PRICES: Record<string, [number, number]> = {
  "gpt-6.1-terra": [1, 5],
  "gpt-6-luna": [0.1, 0.5],
};
function textCost(model: string, inp: number, out: number): number {
  const p = PRICES[model] || (model.startsWith("gemini") ? [0, 0] : [1, 5]);
  return (inp * p[0] + out * p[1]) / 1_000_000;
}
// 목소리: 1분(약 750자)에 약 1.5센트 · 받아 적기: 1분에 0.3~0.6센트
const TTS_PER_CHAR = 0.00002;
const STT_PER_SEC: Record<string, number> = { "gpt-transcribe": 0.0045 / 60, "gpt-4o-mini-transcribe": 0.003 / 60, "whisper-1": 0.006 / 60 };

// 모델 순서. 붐비거나 느리면 다음 모델을 함께 불러 먼저 온 답을 씁니다.
// OPENAI_API_KEY 가 있으면 OpenAI(Terra → Luna)를 먼저, 그다음 Gemini.
type Choice = { provider: "openai" | "gemini"; model: string };
const OPENAI_MODELS = ["gpt-6.1-terra", "gpt-6-luna"];
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-flash-lite-latest"];
const HEDGE_MS = 8000;      // 이 시간 안에 답이 없으면 다음 모델도 함께 부름
const TOTAL_MS = 60000;     // 전체 제한

function modelOrder(): Choice[] {
  const list: Choice[] = [];
  const openaiFirst = (Deno.env.get("AI_PROVIDER") || "openai") !== "gemini";
  const oa = Deno.env.get("OPENAI_API_KEY") ? (Deno.env.get("OPENAI_MODELS") || OPENAI_MODELS.join(",")).split(",").map((m) => m.trim()).filter(Boolean) : [];
  const gFirst = Deno.env.get("GEMINI_MODEL") || FALLBACK_MODELS[0];
  const gm = Deno.env.get("GEMINI_API_KEY") ? [gFirst, ...FALLBACK_MODELS.filter((m) => m !== gFirst)] : [];
  const o = oa.map((model) => ({ provider: "openai" as const, model }));
  const g = gm.map((model) => ({ provider: "gemini" as const, model }));
  return openaiFirst ? [...o, ...g] : [...g, ...o];
}

function parseJson(text: string): any {
  return JSON.parse(String(text || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

// OpenAI 한 번 시도 (안 맞는 옵션은 빼고 다시)
async function tryOpenAI(model: string, system: string, prompt: string, temperature: number, maxTokens: number, signal: AbortSignal, meter?: Meter): Promise<any> {
  const key = Deno.env.get("OPENAI_API_KEY")!;
  // 새 OpenAI 모델은 temperature 를 기본값만 받아서 보내지 않습니다.
  let extras: Record<string, unknown> = { reasoning_effort: "low" };
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const onOuter = () => ctrl.abort();
    signal.addEventListener("abort", onOuter);
    const timer = setTimeout(() => ctrl.abort(), TOTAL_MS);
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
          response_format: { type: "json_object" },
          max_completion_tokens: maxTokens,
          ...extras,
        }),
        signal: ctrl.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new GeminiError(504, `${model} timed out or cancelled`);
      throw e;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onOuter);
    }
    console.log("openai", model, res.status, Date.now() - t0, "ms");
    if (res.ok) {
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content ?? "";
      const inp = Number(data?.usage?.prompt_tokens) || 0, out = Number(data?.usage?.completion_tokens) || 0;
      try {
        const parsed = parseJson(text);
        meter?.push({ provider: "openai", model, input_tokens: inp, output_tokens: out, cost: textCost(model, inp, out) });
        return parsed;
      } catch {
        console.error("bad json", model, String(text).slice(0, 200));
        if (attempt < 1) continue;
        throw new GeminiError(502, "AI returned invalid JSON");
      }
    }
    const t = await res.text();
    console.error("openai error", model, res.status, t.slice(0, 300));
    if (res.status === 400 && Object.keys(extras).length) {
      // 모델이 받지 않는 옵션이 있으면 빼고 다시
      extras = /reasoning/i.test(t) ? Object.fromEntries(Object.entries(extras).filter(([k]) => k !== "reasoning_effort"))
        : /temperature/i.test(t) ? Object.fromEntries(Object.entries(extras).filter(([k]) => k !== "temperature"))
        : {};
      continue;
    }
    throw new GeminiError(res.status === 429 ? 429 : res.status, t.slice(0, 500));
  }
  throw new GeminiError(502, "AI failed");
}

// Gemini 한 번 시도 (생각 설정이 안 맞으면 끄고 다시)
async function tryGemini(model: string, system: string, prompt: string, temperature: number, maxTokens: number, signal: AbortSignal, meter?: Meter): Promise<any> {
  const key = Deno.env.get("GEMINI_API_KEY")!;
  let thinking = true;
  for (let attempt = 0; attempt < 3; attempt++) {
    const generationConfig: Record<string, unknown> = { temperature, responseMimeType: "application/json", maxOutputTokens: maxTokens };
    if (thinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    const t0 = Date.now();
    const res = await callGemini(model, key, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    }, TOTAL_MS, signal);
    console.log("gemini", model, res.status, Date.now() - t0, "ms");
    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.filter((p: any) => !p.thought).map((p: any) => p.text ?? "").join("") ?? "";
      const inp = Number(data?.usageMetadata?.promptTokenCount) || 0, out = Number(data?.usageMetadata?.candidatesTokenCount) || 0;
      try {
        const parsed = parseJson(text);
        meter?.push({ provider: "gemini", model, input_tokens: inp, output_tokens: out, cost: textCost(model, inp, out) });
        return parsed;
      } catch {
        console.error("bad json", model, text.slice(0, 200));
        if (attempt < 1) continue;
        throw new GeminiError(502, "AI returned invalid JSON");
      }
    }
    const t = await res.text();
    console.error("gemini error", model, res.status, t.slice(0, 300));
    if (res.status === 400 && thinking) { thinking = false; continue; }
    throw new GeminiError(res.status, t.slice(0, 500));
  }
  throw new GeminiError(502, "AI failed");
}

async function gemini(system: string, prompt: string, temperature = 0.7, maxTokens = 4096, meter?: Meter): Promise<any> {
  const models = modelOrder();
  if (!models.length) throw new GeminiError(500, "No AI key is set");

  return await new Promise((resolve, reject) => {
    let next = 0, running = 0, done = false;
    let lastErr: GeminiError = new GeminiError(502, "AI failed");
    const ctrls: AbortController[] = [];
    const finish = () => { done = true; clearInterval(hedge); clearTimeout(limit); ctrls.forEach((c) => c.abort()); };
    const launch = () => {
      if (done || next >= models.length) return;
      const c = models[next++];
      const ctrl = new AbortController();
      ctrls.push(ctrl);
      running++;
      const run = c.provider === "openai"
        ? tryOpenAI(c.model, system, prompt, temperature, maxTokens, ctrl.signal, meter)
        : tryGemini(c.model, system, prompt, temperature, maxTokens, ctrl.signal, meter);
      run
        .then((r) => { if (done) return; console.log("answered by", c.provider, c.model); finish(); resolve(r); })
        .catch((e) => {
          running--;
          if (done) return;
          lastErr = e instanceof GeminiError ? e : new GeminiError(502, String(e));
          console.error("model fail", c.provider, c.model, lastErr.status, lastErr.message.slice(0, 120));
          if (next < models.length) launch();          // 실패하면 바로 다음 모델
          else if (running === 0) { finish(); reject(lastErr); }
        });
    };
    const hedge = setInterval(launch, HEDGE_MS);       // 느리면 다음 모델도 함께
    const limit = setTimeout(() => { if (!done) { finish(); reject(new GeminiError(504, "AI timed out")); } }, TOTAL_MS);
    launch();
  });
}

// ---------------------------------------------------------------------------
// 하루 패키지 만들기
async function makePack(b: any, m?: Meter) {
  const level = levelOf(b.level);
  const topic = TOPICS[b.topic] ? b.topic : "me";
  const system = `You are Klaudia, a friendly English conversation teacher. ${LEARNER} Reply with JSON only.`;
  const prompt = `Create today's English lesson.

Topic: ${TOPICS[topic]}
Cycle: ${Number(b.cycle) || 1} (each new cycle on the same topic should go deeper and use new questions; do not repeat earlier lessons)
${LEVELS[level]}
Learner's name: ${clip(b.name, 40) || "the learner"}

What we already know about him (use these facts to personalise sentences and questions, and ask about things we don't know yet):
${notesText(b.notes)}

Return JSON with exactly this shape:
{
  "title_ko": "short Korean title for today's lesson (max 14 characters)",
  "cards": [ {"en": "...", "ko": "...", "say": "..."} ],            // 6 useful sentences HE can say about this topic, first person, matching the level
  "words": [ {"en": "...", "ko": "...", "say": "...", "emoji": "one emoji"} ], // 10 words for this topic; pick words he will need for the questions
  "questions": [                                                         // 5 questions Klaudia asks him, from easy to slightly deeper
    {"en": "...", "ko": "...", "choices": [ {"en": "...", "ko": "..."}, {"en": "...", "ko": "..."}, {"en": "...", "ko": "..."} ]}
  ],
  "talk": {"scene_ko": "one Korean sentence describing the 3-minute chat scene", "opener_en": "Klaudia's first line", "opener_ko": "Korean meaning",
           "suggestions": [ {"en": "...", "ko": "..."} ]}                // 3 different short answers he could say to opener_en, at his level
}
Rules:
- ${SAY_RULE}
- Every English sentence must fit the level. Korean must be natural, polite (존댓말).
- choices are 3 different possible answers he could pick, each fitting the level.
- Questions are about HIS life, so the answers are personal.`;
  return await gemini(system, prompt, 0.8, 4096, m);
}

// 묻고 답하기: 대답 확인
async function checkAnswer(b: any, m?: Meter) {
  const level = levelOf(b.level);
  const system = `You are Klaudia, a kind English teacher. ${LEARNER} Reply with JSON only.`;
  const prompt = `Klaudia asked: "${clip(b.question, 300)}"
The learner answered (from speech recognition or tapping, may have errors): "${clip(b.answer, 300)}"
${LEVELS[level]}

Return JSON:
{
  "good": true or false,          // true if the meaning is understandable, even with small mistakes
  "reply_en": "Klaudia's short warm reaction (max 12 words), may include a tiny follow-up",
  "reply_ko": "Korean meaning of reply_en",
  "better_en": "a natural, correct version of what he meant, at his level",
  "better_ko": "Korean meaning",
  "tip_ko": "one short Korean tip about grammar or a word, or empty string",
  "answer_ko": "what the learner meant, written in natural Korean in his own first-person voice (저는 ...)",
  "facts": ["short English facts about the learner's life learned from this answer, e.g. 'Has a son who lives in Busan'. Empty if none."]
}`;
  return await gemini(system, prompt, 0.4, 4096, m);
}

// 3분 대화: 한 턴
async function chatTurn(b: any, m?: Meter) {
  const level = levelOf(b.level);
  const topic = TOPICS[b.topic] ? b.topic : "me";
  const history = Array.isArray(b.history) ? b.history.slice(-12) : [];
  const transcript = history
    .map((m: any) => `${m.role === "me" ? "Learner" : "Klaudia"}: ${clip(m.en, 300)}`)
    .join("\n");
  const system =
    `You are Klaudia, a warm English conversation partner in a short spoken chat. ${LEARNER} ` +
    `Speak simply. Ask one question at a time. Keep each line under 20 words. Reply with JSON only.`;
  const SUGG = `"suggestions": [ {"en": "...", "ko": "..."} ]   // 3 different short answers the learner could say next, at his level, sounding like his own life (empty if ending)`;
  if (b.suggest_only) {
    const p0 = `${LEVELS[level]}
What we know about him:
${notesText(Array.isArray(b.notes) ? b.notes.slice(0, 15) : [])}

Klaudia just said: "${clip(history.length ? history[history.length - 1].en : "", 300)}"

Return JSON:
{
  ${SUGG}
}`;
    return await gemini(system, p0, 0.7, 500, m);
  }
  const prompt = `Scene: ${clip(b.scene, 200)}
Topic: ${TOPICS[topic]}
${LEVELS[level]}
What we know about him:
${notesText(Array.isArray(b.notes) ? b.notes.slice(0, 15) : [])}

Conversation so far:
${transcript || "(none)"}

${b.ending ? "Time is up. Close the chat kindly in one or two short lines and say goodbye. Do not ask a question." : "Continue the conversation with Klaudia's next line."}

Return JSON:
{
  "en": "Klaudia's next line",
  "ko": "Korean meaning",
  "fix_en": "if the learner's LAST line had a clear mistake, a corrected natural version; otherwise empty string",
  "help_en": "a simple answer the learner could say next, at his level (empty if ending)",
  "help_ko": "Korean meaning of help_en",
  "said_ko": "what the learner meant in his LAST line, in natural Korean first person (empty if ending)",
  ${SUGG.replace("say next", "say to Klaudia's new line")},
  "facts": ["new short English facts about the learner from his last line, or empty"]
}`;
  return await gemini(system, prompt, 0.7, 1500, m);
}

// 편지 읽기 도우미
async function readLetter(b: any, m?: Meter) {
  const level = levelOf(b.level);
  const system = `You help a Korean learner read a short English message from family. ${LEARNER} Reply with JSON only.`;
  const prompt = `Message from ${clip(b.from_name, 40) || "Clara"}:
"""${clip(b.text, 1500)}"""
${LEVELS[level]}

Return JSON:
{
  "ko": "natural Korean translation of the whole message",
  "sentences": [ {"en": "one sentence of the message", "ko": "Korean", "say": "..."} ],
  "words": [ {"en": "...", "ko": "..."} ],               // up to 6 key words from the message
  "reply": {"en": "a simple warm reply he could send, at his level, answering what she said or asked", "ko": "Korean"},
  "extra": ["4 extra single English words that could be useful or tempting in a reply"]
}
Rules: ${SAY_RULE}`;
  return await gemini(system, prompt, 0.5, 4096, m);
}

// 답장 다듬기
async function polishReply(b: any, m?: Meter) {
  const level = levelOf(b.level);
  const system = `You are Klaudia, a kind English teacher helping a learner write a reply to family. ${LEARNER} Reply with JSON only.`;
  const prompt = `The message he received:
"""${clip(b.letter, 1500)}"""
His draft reply: "${clip(b.draft, 600)}"
${LEVELS[level]}

Keep his meaning and his voice. Fix grammar. Suggest at most two small improvements.
Return JSON:
{
  "fixed_en": "corrected reply, warm and natural, close to his draft",
  "fixed_ko": "Korean meaning",
  "changed": true or false,
  "tips_ko": ["short Korean explanations of what was fixed and why (max 3)"],
  "better_words": [ {"en": "a nicer word or phrase he could use", "ko": "Korean"} ]
}`;
  return await gemini(system, prompt, 0.4, 4096, m);
}


// ---------------------------------------------------------------------------
// 자연스러운 목소리: OpenAI 먼저, 안 되면 Gemini. 둘 다 안 되면 앱이 기기 목소리로 읽습니다.
const OPENAI_TTS = ["gpt-4o-mini-tts", "tts-1"];
const TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts", "gemini-3.8-flash-lite-tts"];
const PACE: Record<number, string> = {
  1: "Speak very slowly and very clearly, with small pauses between words, like a patient, kind teacher talking to an older beginner.",
  2: "Speak slowly and clearly, like a patient, kind teacher.",
  3: "Speak slowly and clearly, warm and friendly.",
  4: "Speak at a relaxed, natural pace, warm and friendly.",
  5: "Speak at a relaxed, natural pace, warm and friendly.",
};

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function timed(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    throw new GeminiError(504, `${(e as Error).name === "AbortError" ? "timed out" : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function openaiSpeech(text: string, level: number): Promise<{ audio: string; mime: string; model: string } | null> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return null;
  const voice = Deno.env.get("OPENAI_TTS_VOICE") || "coral";
  for (const model of (Deno.env.get("OPENAI_TTS_MODELS") || OPENAI_TTS.join(",")).split(",").map((m) => m.trim()).filter(Boolean)) {
    const body: Record<string, unknown> = { model, voice, input: text, response_format: "mp3" };
    if (!model.startsWith("tts-")) body.instructions = PACE[level] || PACE[2];
    try {
      const t0 = Date.now();
      const res = await timed("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      }, 15000);
      console.log("tts", model, res.status, Date.now() - t0, "ms");
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length > 200) return { audio: toBase64(bytes), mime: "audio/mpeg", model };
      } else {
        console.error("tts error", model, res.status, (await res.text()).slice(0, 200));
      }
    } catch (e) {
      console.error("tts fail", model, String(e).slice(0, 120));
    }
  }
  return null;
}

async function speech(b: any, m?: Meter) {
  const text = clip(b.text, 500).trim();
  if (!text) throw new GeminiError(400, "empty text");
  const level = levelOf(b.level);
  const oa = await openaiSpeech(text, level);
  if (oa) { m?.push({ provider: "openai", model: oa.model, units: text.length, cost: text.length * TTS_PER_CHAR }); return oa; }

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new GeminiError(502, "TTS failed");
  const voice = Deno.env.get("TTS_VOICE") || "Sulafat";
  let lastErr: GeminiError | null = null;
  for (const model of TTS_MODELS) {
    const t0 = Date.now();
    let res: Response;
    try {
      res = await callGemini(model, key, {
        // 지시문을 붙이면 그 문장까지 소리 내어 읽어서, 읽을 문장만 보냅니다.
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }, 15000);
    } catch (e) {
      lastErr = e instanceof GeminiError ? e : new GeminiError(502, String(e));
      console.error("tts timeout", model);
      continue;
    }
    console.log("tts", model, res.status, Date.now() - t0, "ms");
    if (res.ok) {
      const data = await res.json();
      const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
      if (part) { m?.push({ provider: "gemini", model, units: text.length, cost: 0 }); return { audio: part.inlineData.data, mime: part.inlineData.mimeType || "audio/L16;rate=24000", model }; }
      lastErr = new GeminiError(502, "no audio");
      continue;
    }
    const t = await res.text();
    console.error("tts error", model, res.status, t.slice(0, 200));
    lastErr = new GeminiError(res.status, t.slice(0, 300));
  }
  throw lastErr || new GeminiError(502, "TTS failed");
}

// ---------------------------------------------------------------------------
// 말 받아 적기: 앱이 녹음한 짧은 소리(WAV)를 영어 글자로. OpenAI 먼저, 안 되면 Gemini.
const OPENAI_STT = ["gpt-transcribe", "gpt-4o-mini-transcribe", "whisper-1"];
const MAX_AUDIO_B64 = 2_000_000; // 약 1.5MB (16kHz 로 40초쯤)

async function transcribe(b: any, m?: Meter) {
  const b64 = String(b.audio || "");
  if (!b64 || b64.length > MAX_AUDIO_B64) throw new GeminiError(400, "bad audio");
  let bytes: Uint8Array;
  try { bytes = fromBase64(b64); } catch { throw new GeminiError(400, "bad audio"); }
  const mime = /^audio\/[a-z0-9.+-]+$/i.test(String(b.mime || "")) ? String(b.mime) : "audio/wav";
  const ext = /wav/.test(mime) ? "wav" : /mp4|m4a|aac/.test(mime) ? "m4a" : /webm/.test(mime) ? "webm" : "wav";
  // 메시지 쓰기에서는 한국어로 말해도 되게 언어를 정하지 않습니다.
  const lang = b.lang === "auto" ? "" : "en";
  const secs = ext === "wav" ? Math.max(0, (bytes.length - 44) / 32000) : bytes.length / 16000;

  const key = Deno.env.get("OPENAI_API_KEY");
  if (key) {
    for (const model of (Deno.env.get("OPENAI_STT_MODELS") || OPENAI_STT.join(",")).split(",").map((m) => m.trim()).filter(Boolean)) {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mime }), `speech.${ext}`);
      form.append("model", model);
      if (lang) form.append("language", lang);
      form.append("response_format", "json");
      try {
        const t0 = Date.now();
        const res = await timed("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
        }, 20000);
        console.log("stt", model, res.status, Date.now() - t0, "ms");
        if (res.ok) {
          const data = await res.json();
          m?.push({ provider: "openai", model, units: Math.round(secs), cost: secs * (STT_PER_SEC[model] ?? 0.006 / 60) });
          return { text: clip(data?.text, 500).trim(), model };
        }
        console.error("stt error", model, res.status, (await res.text()).slice(0, 200));
      } catch (e) {
        console.error("stt fail", model, String(e).slice(0, 120));
      }
    }
  }

  const gkey = Deno.env.get("GEMINI_API_KEY");
  if (!gkey) throw new GeminiError(502, "STT failed");
  for (const model of FALLBACK_MODELS.slice(0, 2)) {
    try {
      const res = await callGemini(model, gkey, {
        contents: [{ role: "user", parts: [
          { inlineData: { mimeType: mime, data: b64 } },
          { text: lang ? "Write down exactly the English words spoken in this audio. Reply with the words only. If nothing is said, reply with nothing."
                       : "Write down exactly the words spoken in this audio (it may be Korean or English), in the language spoken. Reply with the words only. If nothing is said, reply with nothing." },
        ] }],
        generationConfig: { temperature: 0, maxOutputTokens: 200 },
      }, 20000);
      console.log("stt", model, res.status);
      if (!res.ok) { console.error("stt error", model, res.status, (await res.text()).slice(0, 200)); continue; }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
      m?.push({ provider: "gemini", model, units: Math.round(secs), cost: 0 });
      return { text: clip(text, 500).trim(), model };
    } catch (e) {
      console.error("stt fail", model, String(e).slice(0, 120));
    }
  }
  throw new GeminiError(502, "STT failed");
}

// ---------------------------------------------------------------------------
// 메시지 쓰기 도우미: 인사 → 하고 싶은 말 → 끝인사, 모두 합쳐 2~3문장
const COMPOSE_TOPICS: Record<string, string> = {
  day: "ask how their day was and share one small thing about your own day",
  weekend: "ask about their weekend plans",
  dinner: "talk about what to eat for dinner tonight and ask what they are having",
  kids: "ask how the children / grandchildren / nieces and nephews are doing",
  free: "whatever the writer wants to say",
  reply: "reply to the message they received",
};
const STEP_TEXT: Record<string, string> = {
  greet: "a warm greeting line that also opens the message (e.g. 'Hi Clara! I hope you are well.')",
  body: "the main sentence: what the writer wants to say or ask",
  close: "a short friendly closing line (e.g. 'Talk soon!', 'Take care.')",
};
async function compose(b: any, m?: Meter) {
  const writerLearner = b.writer_role !== "friend";
  const level = levelOf(writerLearner ? b.level : b.reader_level);
  const topic = COMPOSE_TOPICS[b.topic] ? b.topic : "free";
  const who = `Writer: ${clip(b.from_name, 40) || "the writer"}. Reader: ${clip(b.to_name, 40) || "the reader"}.`;
  const rule = writerLearner
    ? `The writer is a Korean man in his 70s learning English. Every English line must be short and easy for him to read aloud. ${LEVELS[level]}`
    : `The reader is a Korean beginner learner of English in his 70s, so every English line must be short, warm and easy to read. ${LEVELS[level]}`;
  const draft = Array.isArray(b.draft) ? b.draft.slice(0, 4).map((x: unknown) => clip(x, 200)).join(" ") : "";
  const replyTo = b.reply_to ? `\nThe message being replied to: """${clip(b.reply_to, 800)}"""` : "";
  const system = `You are Klaudia, helping someone write a very short, warm message to family. ${rule} The whole message is only 2 or 3 short sentences. Reply with JSON only.`;
  if (b.mode === "voice") {
    const step = STEP_TEXT[b.step] ? b.step : "body";
    const prompt = `${who}
Topic: ${COMPOSE_TOPICS[topic]}${replyTo}
Message so far: "${draft}"
Now writing: ${STEP_TEXT[step]}
The writer said (speech recognition, may be Korean or English, may have errors): "${clip(b.said, 400)}"

Turn what the writer meant into ONE natural English sentence for this part of the message, keeping their meaning and voice.
Return JSON: {"en": "...", "ko": "natural Korean meaning (polite)"}`;
    return await gemini(system, prompt, 0.4, 400, m);
  }
  const prompt = `${who}
Topic: ${COMPOSE_TOPICS[topic]}${replyTo}
${b.notes && Array.isArray(b.notes) && b.notes.length ? "What we know about the writer:\n" + notesText(b.notes.slice(0, 10)) : ""}

Suggest lines for each part of the message. Each line is ONE short sentence, written as the writer, using the reader's name naturally.
Return JSON:
{
  "greet": [ {"en": "...", "ko": "..."}, {"en": "...", "ko": "..."}, {"en": "...", "ko": "..."} ],
  "body":  [ {"en": "...", "ko": "..."}, {"en": "...", "ko": "..."}, {"en": "...", "ko": "..."} ],
  "close": [ {"en": "...", "ko": "..."}, {"en": "...", "ko": "..."}, {"en": "...", "ko": "..."} ]
}
"ko" is the natural Korean meaning (polite). The three options in each part should be clearly different.`;
  return await gemini(system, prompt, 0.8, 1200, m);
}

// 사용량 적기 (실패해도 앱에는 영향 없음)
async function saveUsage(url: string, key: string, token: string, action: string, meter: Meter) {
  if (!meter.length) return;
  try {
    const db = createClient(url, key, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const rows = meter.map((u) => ({
      action, provider: u.provider, model: u.model,
      input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0,
      units: u.units || 0, cost_usd: Math.round(u.cost * 1e6) / 1e6,
    }));
    const { error } = await db.from("ai_usage").insert(rows);
    if (error) console.error("usage save", error.message);
  } catch (e) {
    console.error("usage save", String(e).slice(0, 120));
  }
}

// 프로젝트 키 찾기 (예전 anon 키 / 새 publishable 키 모두 지원)
function projectKey(): string | undefined {
  const direct = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (direct) return direct;
  for (const name of ["SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_SECRET_KEYS"]) {
    const raw = Deno.env.get(name);
    if (!raw) continue;
    try {
      const obj = JSON.parse(raw);
      const first = Object.values(obj)[0];
      if (typeof first === "string") return first;
    } catch { /* 무시 */ }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || undefined;
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // 로그인한 사용자만 사용할 수 있습니다.
  const url = Deno.env.get("SUPABASE_URL");
  const key = projectKey();
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!url || !key || !token) return json({ error: "unauthorized" }, 401);
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return json({ error: "unauthorized" }, 401);

  let b: any;
  try {
    b = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const meter: Meter = [];
  const handlers: Record<string, (b: any, m: Meter) => Promise<any>> = {
    pack: makePack, check: checkAnswer, chat: chatTurn, letter: readLetter, polish: polishReply,
    tts: speech, stt: transcribe, compose,
  };
  try {
    if (b?.action === "ping") return json({ ok: true });
    const fn = handlers[b?.action];
    if (!fn) return json({ error: "unknown action" }, 400);
    const out = await fn(b, meter);
    const done = saveUsage(url, key, token, b.action, meter);
    // 응답을 먼저 보내고 기록은 뒤에서
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt && typeof rt.waitUntil === "function") rt.waitUntil(done); else await done;
    return json(out);
  } catch (e) {
    if (meter.length) await saveUsage(url, key, token, b.action, meter);
    if (e instanceof GeminiError) {
      console.error("gemini", e.status, e.message);
      return json({ error: e.status === 429 ? "busy" : "ai_error" }, e.status === 429 ? 429 : 502);
    }
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
