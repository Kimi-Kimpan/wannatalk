-- WannaTalk 추가: 자서전 자료, 마지막 접속, 관리자
-- SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전합니다.

-- 1. 마지막 접속 시간 ------------------------------------------------------------
alter table public.profiles add column if not exists last_seen_at timestamptz;
grant update (name, role, level, day, last_done_date, placement, last_seen_at) on public.profiles to authenticated;

-- 2. 자서전 자료: 인터뷰 대답 원문 ---------------------------------------------------
create table if not exists public.story_entries (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  day        int,
  topic      text,
  kind       text not null check (kind in ('qa', 'talk', 'letter')),
  prompt_en  text,            -- Emma의 질문 (또는 받은 편지)
  answer_en  text not null,   -- 내가 한 말 그대로
  better_en  text,            -- 다듬은 영어
  answer_ko  text,            -- 내가 한 말의 한국어 뜻
  created_at timestamptz not null default now()
);
create index if not exists story_entries_user_idx on public.story_entries (user_id, created_at);
alter table public.story_entries enable row level security;
drop policy if exists "entries own" on public.story_entries;
create policy "entries own" on public.story_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3. 관리자 -----------------------------------------------------------------------
create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security;  -- 정책이 없으니 앱에서는 읽을 수 없음
insert into public.admins (email) values ('관리자@이메일') on conflict do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins a
    join auth.users u on lower(u.email) = lower(a.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  )
$$;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "admin read profiles" on public.profiles;
drop policy if exists "admin read packs"    on public.daily_packs;
drop policy if exists "admin read notes"    on public.story_notes;
drop policy if exists "admin read entries"  on public.story_entries;
drop policy if exists "admin read letters"  on public.letters;
create policy "admin read profiles" on public.profiles      for select to authenticated using (public.is_admin());
create policy "admin read packs"    on public.daily_packs   for select to authenticated using (public.is_admin());
create policy "admin read notes"    on public.story_notes   for select to authenticated using (public.is_admin());
create policy "admin read entries"  on public.story_entries for select to authenticated using (public.is_admin());
create policy "admin read letters"  on public.letters       for select to authenticated using (public.is_admin());

-- 관리자용 사용자 목록 (이메일과 마지막 로그인은 auth 쪽에만 있어서 함수로 가져옵니다)
drop function if exists public.admin_users();
create function public.admin_users()
returns table (
  id uuid, email text, name text, role text, level int, day int,
  last_done_date date, last_seen_at timestamptz, last_sign_in_at timestamptz, created_at timestamptz,
  placement jsonb, family text,
  packs_done bigint, avg_score numeric, entries bigint, letters_pending bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not admin';
  end if;
  return query
    select p.id, u.email::text, p.name, p.role, p.level, p.day,
           p.last_done_date, p.last_seen_at, u.last_sign_in_at, p.created_at,
           p.placement, p.family,
           (select count(*) from public.daily_packs d where d.user_id = p.id and d.done_at is not null),
           (select round(avg((d.score->>'total')::numeric), 2) from public.daily_packs d where d.user_id = p.id and d.score ? 'total'),
           (select count(*) from public.story_entries s where s.user_id = p.id),
           (select count(*) from public.letters l where l.to_id = p.id and l.handled_at is null)
    from public.profiles p
    join auth.users u on u.id = p.id
    order by coalesce(p.last_seen_at, u.last_sign_in_at) desc nulls last;
end $$;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;
