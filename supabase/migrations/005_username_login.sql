-- WannaTalk 추가: 아이디·비밀번호 로그인
-- 이메일로 가입한 계정에 아이디를 붙이고, 비밀번호는 Supabase 로그인(auth)에 저장합니다.
-- SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전합니다.

alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_key on public.profiles (lower(username));

-- 내 아이디 정하기 (한글·영문 소문자·숫자·밑줄, 2~20자)
create or replace function public.set_username(u text)
returns text language plpgsql security definer set search_path = public as $$
declare v text := lower(trim(u));
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if v !~ '^[0-9a-z가-힣_]{2,20}$' then raise exception 'invalid'; end if;
  if exists (select 1 from public.profiles where lower(username) = v and id <> auth.uid()) then raise exception 'taken'; end if;
  update public.profiles set username = v where id = auth.uid();
  return v;
end $$;
revoke all on function public.set_username(text) from public, anon;
grant execute on function public.set_username(text) to authenticated;

-- 서버(로그인 도우미)만 쓰는 함수: 아이디 → 로그인 이메일. 앱에서는 부를 수 없습니다.
create or replace function public.email_for_login(u text)
returns text language sql stable security definer set search_path = public as $$
  select a.email::text from public.profiles p join auth.users a on a.id = p.id
  where lower(p.username) = lower(trim(u)) limit 1
$$;
revoke all on function public.email_for_login(text) from public, anon, authenticated;
grant execute on function public.email_for_login(text) to service_role;

-- 비밀번호를 마구 넣어 보지 못하게: 아이디마다 한 시간에 10번 틀리면 잠시 막기
create table if not exists public.login_failures (
  username text not null,
  at       timestamptz not null default now()
);
create index if not exists login_failures_idx on public.login_failures (username, at);
alter table public.login_failures enable row level security;
revoke all on public.login_failures from anon, authenticated;
