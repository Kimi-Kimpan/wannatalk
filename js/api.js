// Supabase 연결과 데이터 읽기/쓰기
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = /^https:\/\/.+\.supabase\.co\/?$/.test(SUPABASE_URL) && !SUPABASE_ANON_KEY.startsWith('YOUR');

// 관리자 화면은 로그인을 따로 저장합니다. 그래서 학습자로 로그인한 채로 관리자 화면을 오갈 수 있어요.
export const ADMIN_STORAGE_KEY = 'wt-admin-auth';
const onAdminPage = /admin\.html$/.test(location.pathname);
export const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, ...(onAdminPage ? { storageKey: ADMIN_STORAGE_KEY } : {}) },
    })
  : null;
// 앱 화면에서 관리자 로그인을 받을 때만 쓰는 두 번째 연결
let adminSb = null;
export function adminClient() {
  if (onAdminPage) return sb;
  if (!adminSb && configured) {
    adminSb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: ADMIN_STORAGE_KEY },
    });
  }
  return adminSb;
}
// 관리자 계정이 이 기기에 연결돼 있는지
export function adminConnected() {
  try { return !!localStorage.getItem(ADMIN_STORAGE_KEY); } catch (e) { return false; }
}
export function disconnectAdmin() {
  try { localStorage.removeItem(ADMIN_STORAGE_KEY); } catch (e) { /* 무시 */ }
}

export class AIError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// AI 선생님 호출
export async function ai(action, payload = {}, ms = 100000) {
  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new AIError('timeout')), ms); });
  let data, error;
  try {
    ({ data, error } = await Promise.race([sb.functions.invoke('tutor', { body: { action, ...payload } }), timeout]));
  } finally {
    clearTimeout(timer);
  }
  if (error) {
    let code = 'ai_error';
    try {
      const res = error.context;
      if (res && res.status === 429) code = 'busy';
      else if (res && res.status === 401) code = 'auth';
    } catch (e) { /* 무시 */ }
    if (String(error.name || '').includes('FetchError')) code = 'network';
    throw new AIError(code);
  }
  if (!data || data.error) throw new AIError(data && data.error === 'busy' ? 'busy' : 'ai_error');
  return data;
}

export function aiMessage(e) {
  const code = e && e.code;
  if (code === 'busy') return '클라우디아가 잠깐 쉬는 중이에요. 1분 뒤에 다시 눌러 주세요.';
  if (code === 'network') return '인터넷 연결을 확인하고 다시 눌러 주세요.';
  if (code === 'auth') return '다시 로그인해 주세요.';
  if (code === 'timeout') return '클라우디아 대답이 너무 늦어요. 잠시 뒤 다시 눌러 주세요.';
  return '클라우디아와 연결이 잘 안 돼요. 잠시 뒤 다시 눌러 주세요.';
}

// 로그인 -------------------------------------------------------------------------
export async function sendCode(email, { admin = false } = {}) {
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  const back = admin ? base + 'admin.html' : base;
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: !admin, emailRedirectTo: back } });
  if (error) throw error;
}
export async function verifyCode(email, token) {
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return data.session;
}
// 메일 속 로그인 링크를 붙여넣어 로그인 (아이폰 홈 화면 앱용)
export async function signInWithLink(raw, client = sb) {
  let text = String(raw || '').trim();
  for (let i = 0; i < 3; i++) { try { const d = decodeURIComponent(text); if (d === text) break; text = d; } catch (e) { break; } }
  const access = /[#&?]access_token=([^&#\s]+)/.exec(text);
  const refresh = /[#&?]refresh_token=([^&#\s]+)/.exec(text);
  if (access && refresh) {
    const { data, error } = await client.auth.setSession({ access_token: access[1], refresh_token: refresh[1] });
    if (error) throw error;
    return data.session;
  }
  const m = /[?&]token=([^&#\s]+)/.exec(text);
  if (!m) throw new Error('no_token');
  const typeM = /[?&]type=([a-z_]+)/.exec(text);
  const types = [...new Set([typeM ? typeM[1] : 'magiclink', 'magiclink', 'email', 'signup'])];
  let lastErr = null;
  for (const type of types) {
    const { data, error } = await client.auth.verifyOtp({ token_hash: m[1], type });
    if (!error && data && data.session) return data.session;
    lastErr = error;
  }
  throw lastErr || new Error('verify_failed');
}

export async function currentUser() {
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}
export async function signOut() {
  seenFacts.clear();
  factsLoaded = false;
  await sb.auth.signOut({ scope: 'local' });
}

// 프로필 -------------------------------------------------------------------------
export async function getProfile(uid) {
  const { data, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  return data;
}
export async function updateProfile(uid, fields) {
  const { data, error } = await sb.from('profiles').update(fields).eq('id', uid).select('*').single();
  if (error) throw error;
  return data;
}
export async function ensureFamilyCode() {
  const { data, error } = await sb.rpc('ensure_family_code');
  if (error) throw error;
  return data;
}
export async function joinFamily(code) {
  const { data, error } = await sb.rpc('join_family', { code });
  if (error) throw error;
  return data === true;
}
export async function familyMembers(family) {
  if (!family) return [];
  const { data, error } = await sb.from('profiles').select('id,name,role').eq('family', family);
  if (error) throw error;
  return data || [];
}

// 이야기 노트 ---------------------------------------------------------------------
export async function recentNotes(limit = 40) {
  const { data, error } = await sb.from('story_notes').select('fact').order('created_at', { ascending: false }).limit(limit);
  if (error) return [];
  return (data || []).map((r) => r.fact);
}
// 이미 적어 둔 사실은 다시 적지 않습니다.
const seenFacts = new Set();
let factsLoaded = false;
const factKey = (f) => String(f).toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim();
export async function addNotes(facts, topic) {
  if (!factsLoaded) { factsLoaded = true; (await recentNotes(200)).forEach((f) => seenFacts.add(factKey(f))); }
  const rows = [];
  for (const f of facts || []) {
    if (typeof f !== 'string' || !f.trim()) continue;
    const k = factKey(f);
    if (!k || seenFacts.has(k)) continue;
    seenFacts.add(k);
    rows.push({ fact: f.trim().slice(0, 300), topic });
    if (rows.length >= 5) break;
  }
  if (!rows.length) return;
  await sb.from('story_notes').insert(rows);
}

// 하루 패키지 ---------------------------------------------------------------------
export async function getPack(day) {
  const { data, error } = await sb.from('daily_packs').select('*').eq('day', day).maybeSingle();
  if (error) throw error;
  return data;
}
export async function savePack(day, level, topic, content) {
  const { data, error } = await sb
    .from('daily_packs')
    .upsert({ day, level, topic, content }, { onConflict: 'user_id,day' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
export async function finishPack(id, score) {
  await sb.from('daily_packs').update({ score, done_at: new Date().toISOString() }).eq('id', id);
}
export async function cycleScores(fromDay, toDay) {
  const { data } = await sb.from('daily_packs').select('day,score').gte('day', fromDay).lte('day', toDay);
  return (data || []).map((r) => r.score && typeof r.score.total === 'number' ? r.score.total : null).filter((x) => x !== null);
}

// 편지 ---------------------------------------------------------------------------
export async function pendingLetter(uid) {
  const { data } = await sb
    .from('letters')
    .select('*')
    .eq('to_id', uid)
    .is('handled_at', null)
    .order('created_at', { ascending: true })
    .limit(1);
  return data && data[0] ? data[0] : null;
}
export async function countPending(uid) {
  const { count } = await sb.from('letters').select('id', { count: 'exact', head: true }).eq('to_id', uid).is('handled_at', null);
  return count || 0;
}
export async function markLetter(id) {
  await sb.from('letters').update({ handled_at: new Date().toISOString() }).eq('id', id);
}
export async function sendLetter({ family, to_id, body, reply_to = null }) {
  const { error } = await sb.from('letters').insert({ family, to_id, body, reply_to });
  if (error) throw error;
}
export async function familyLetters(limit = 30) {
  const { data, error } = await sb.from('letters').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

// 자서전 자료 (인터뷰 대답 원문) ----------------------------------------------------
export async function addEntry(row) {
  if (!row || !row.answer_en) return;
  const clean = {
    day: row.day ?? null,
    topic: row.topic ?? null,
    kind: row.kind,
    prompt_en: row.prompt_en ? String(row.prompt_en).slice(0, 2000) : null,
    answer_en: String(row.answer_en).slice(0, 2000),
    better_en: row.better_en ? String(row.better_en).slice(0, 2000) : null,
    answer_ko: row.answer_ko ? String(row.answer_ko).slice(0, 2000) : null,
  };
  await sb.from('story_entries').insert(clean);
}

// 마지막 접속 시간, 관리자 확인 -------------------------------------------------------
export async function touchSeen(uid) {
  await sb.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', uid);
}
export async function isAdmin() {
  const { data } = await sb.rpc('is_admin');
  return data === true;
}
