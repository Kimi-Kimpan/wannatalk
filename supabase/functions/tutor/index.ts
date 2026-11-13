// WannaTalk AI 선생님 (Supabase Edge Function: "tutor")
// Gemini API 키는 Supabase 비밀값 GEMINI_API_KEY 에 넣어 두고, 여기서만 사용합니다.
// 모델은 비밀값 GEMINI_MODEL 로 바꿀 수 있습니다. (기본값: gemini-3.5-flash, 붐비면 다른 Flash 모델로 넘어감)

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

// 모델 순서. 붐비거나 느리면 다음 모델을 함께 불러 먼저 온 답을 씁니다.
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-flash-lite-latest"];
const HEDGE_MS = 8000;      // 이 시간 안에 답이 없으면 다음 모델도 함께 부름
const TOTAL_MS = 60000;     // 전체 제한

// 모델 하나로 한 번 시도 (생각 설정이 안 맞으면 끄고 다시)
async function tryModel(model: string, key: string, system: string, prompt: string, temperature: number, maxTokens: number, signal: AbortSignal): Promise<any> {
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
      try {
        return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
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

async function gemini(system: string, prompt: string, temperature = 0.7, maxTokens = 4096): Promise<any> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new GeminiError(500, "GEMINI_API_KEY is not set");
  const first = Deno.env.get("GEMINI_MODEL") || FALLBACK_MODELS[0];
  const models = [first, ...FALLBACK_MODELS.filter((m) => m !== first)];

  return await new Promise((resolve, reject) => {
    let next = 0, running = 0, done = false;
    let lastErr: GeminiError = new GeminiError(502, "AI failed");
    const ctrls: AbortController[] = [];
    const finish = () => { done = true; clearInterval(hedge); clearTimeout(limit); ctrls.forEach((c) => c.abort()); };
    const launch = () => {
      if (done || next >= models.length) return;
      const model = models[next++];
      const ctrl = new AbortController();
      ctrls.push(ctrl);
      running++;
      tryModel(model, key, system, prompt, temperature, maxTokens, ctrl.signal)
        .then((r) => { if (done) return; finish(); resolve(r); })
        .catch((e) => {
          running--;
          if (done) return;
          lastErr = e instanceof GeminiError ? e : new GeminiError(502, String(e));
          console.error("gemini fail", model, lastErr.status, lastErr.message.slice(0, 120));
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
async function makePack(b: any) {
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
  "talk": {"scene_ko": "one Korean sentence describing the 3-minute chat scene", "opener_en": "Klaudia's first line", "opener_ko": "Korean meaning"}
}
Rules:
- ${SAY_RULE}
- Every English sentence must fit the level. Korean must be natural, polite (존댓말).
- choices are 3 different possible answers he could pick, each fitting the level.
- Questions are about HIS life, so the answers are personal.`;
  return await gemini(system, prompt, 0.8);
}

// 묻고 답하기: 대답 확인
async function checkAnswer(b: any) {
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
  return await gemini(system, prompt, 0.4);
}

// 3분 대화: 한 턴
async function chatTurn(b: any) {
  const level = levelOf(b.level);
  const topic = TOPICS[b.topic] ? b.topic : "me";
  const history = Array.isArray(b.history) ? b.history.slice(-12) : [];
  const transcript = history
    .map((m: any) => `${m.role === "me" ? "Learner" : "Klaudia"}: ${clip(m.en, 300)}`)
    .join("\n");
  const system =
    `You are Klaudia, a warm English conversation partner in a short spoken chat. ${LEARNER} ` +
    `Speak simply. Ask one question at a time. Keep each line under 20 words. Reply with JSON only.`;
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
  "facts": ["new short English facts about the learner from his last line, or empty"]
}`;
  return await gemini(system, prompt, 0.7, 1200);
}

// 편지 읽기 도우미
async function readLetter(b: any) {
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
  return await gemini(system, prompt, 0.5);
}

// 답장 다듬기
async function polishReply(b: any) {
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
  return await gemini(system, prompt, 0.4);
}


// ---------------------------------------------------------------------------
// 자연스러운 목소리 (Gemini TTS). 실패하면 앱이 기기 목소리로 대신 읽습니다.
const TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts", "gemini-3.8-flash-lite-tts"];
const PACE: Record<number, string> = {
  1: "very slowly and very clearly, with small pauses between words",
  2: "slowly and clearly",
  3: "slowly and clearly",
  4: "at a relaxed, natural pace",
  5: "at a relaxed, natural pace",
};

async function speech(b: any) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new GeminiError(500, "GEMINI_API_KEY is not set");
  const text = clip(b.text, 500).trim();
  if (!text) throw new GeminiError(400, "empty text");
  const voice = Deno.env.get("TTS_VOICE") || "Sulafat";
  const pace = PACE[levelOf(b.level)];
  let lastErr: GeminiError | null = null;
  for (const model of TTS_MODELS) {
    const t0 = Date.now();
    let res: Response;
    try {
      res = await callGemini(model, key, {
        contents: [{ role: "user", parts: [{ text: `Read this aloud in a warm, kind, friendly female voice, like a patient English teacher speaking to an older beginner, ${pace}:\n${text}` }] }],
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
      if (part) return { audio: part.inlineData.data, mime: part.inlineData.mimeType || "audio/L16;rate=24000", model };
      lastErr = new GeminiError(502, "no audio");
      continue;
    }
    const t = await res.text();
    console.error("tts error", model, res.status, t.slice(0, 200));
    lastErr = new GeminiError(res.status, t.slice(0, 300));
  }
  throw lastErr || new GeminiError(502, "TTS failed");
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

  try {
    switch (b?.action) {
      case "pack":   return json(await makePack(b));
      case "check":  return json(await checkAnswer(b));
      case "chat":   return json(await chatTurn(b));
      case "letter": return json(await readLetter(b));
      case "polish": return json(await polishReply(b));
      case "tts":    return json(await speech(b));
      case "ping":   return json({ ok: true, model: Deno.env.get("GEMINI_MODEL") || FALLBACK_MODELS[0] });
      default:       return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    if (e instanceof GeminiError) {
      console.error("gemini", e.status, e.message);
      return json({ error: e.status === 429 ? "busy" : "ai_error", detail: e.message.slice(0, 200) }, e.status === 429 ? 429 : 502);
    }
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
