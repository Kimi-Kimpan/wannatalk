// Supabase 연결과 데이터 읽기/쓰기
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = /^https:\/\/.+\.supabase\.co\/?$/.test(SUPABASE_URL) && !SUPABASE_ANON_KEY.startsWith('YOUR');

export const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export class AIError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// AI 선생님 호출
export async function ai(action, payload = {}) {
  const { data, error } = await sb.functions.invoke('tutor', { body: { action, ...payload } });
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
  if (code === 'busy') return 'Emma 선생님이 잠깐 쉬는 중이에요. 1분 뒤에 다시 눌러 주세요.';
  if (code === 'network') return '인터넷 연결을 확인하고 다시 눌러 주세요.';
  if (code === 'auth') return '다시 로그인해 주세요.';
  return 'Emma 선생님과 연결이 잘 안 돼요. 잠시 뒤 다시 눌러 주세요.';
}

// 로그인 -------------------------------------------------------------------------
export async function sendCode(email) {
  const back = location.origin + location.pathname;
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: back } });
  if (error) throw error;
}
export async function verifyCode(email, token) {
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return data.session;
}
export async function currentUser() {
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}
export async function signOut() {
  await sb.auth.signOut();
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
export async function addNotes(facts, topic) {
  const rows = (facts || [])
    .filter((f) => typeof f === 'string' && f.trim())
    .slice(0, 5)
    .map((f) => ({ fact: f.trim().slice(0, 300), topic }));
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
