-- WannaTalk 데이터베이스
-- Supabase 대시보드 > SQL Editor > New query 에 전부 붙여넣고 Run 을 누르세요.
-- 여러 번 실행해도 안전하게 만들었습니다.

-- 1. 사용자 정보 -------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users on delete cascade,
  name           text,
  role           text check (role in ('learner', 'friend')),
  level          int  not null default 1 check (level between 1 and 5),
  day            int  not null default 1 check (day >= 1),
  last_done_date date,
  placement      jsonb,
  family         text,
  created_at     timestamptz not null default now()
);

-- 2. 이야기 노트: 대화에서 알게 된 사용자의 사실들 -----------------------------
create table if not exists public.story_notes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  topic      text,
  fact       text not null check (char_length(fact) <= 300),
  created_at timestamptz not null default now()
);

-- 3. 하루 패키지: AI가 만든 그날의 학습 내용과 점수 ------------------------------
create table if not exists public.daily_packs (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  day        int  not null,
  level      int  not null,
  topic      text not null,
  content    jsonb not null,
  score      jsonb,
  done_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

-- 4. 편지: 가족끼리 주고받는 메시지 ---------------------------------------------
create table if not exists public.letters (
  id         bigint generated always as identity primary key,
  family     text not null,
  from_id    uuid not null default auth.uid() references auth.users on delete cascade,
  to_id      uuid references auth.users on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  reply_to   bigint references public.letters on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists story_notes_user_idx on public.story_notes (user_id, created_at desc);
create index if not exists letters_family_idx   on public.letters (family, created_at desc);
create index if not exists letters_to_idx       on public.letters (to_id) where handled_at is null;

-- 5. 도우미 함수 ----------------------------------------------------------------
create or replace function public.my_family()
returns text language sql stable security definer set search_path = public as $$
  select family from public.profiles where id = auth.uid()
$$;

-- 새 사용자가 가입하면 빈 프로필을 만듭니다.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 학습자의 가족 번호(6자리)를 만들어 돌려줍니다. 이미 있으면 그대로 돌려줍니다.
create or replace function public.ensure_family_code()
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then return null; end if;
  select family into c from public.profiles where id = auth.uid();
  if c is not null then return c; end if;
  loop
    c := upper(substr(translate(md5(random()::text || clock_timestamp()::text), '01', ''), 1, 6));
    exit when char_length(c) = 6 and not exists (select 1 from public.profiles where family = c);
  end loop;
  update public.profiles set family = c where id = auth.uid();
  return c;
end $$;

-- 클라라 같은 가족이 학습자의 가족 번호로 들어옵니다.
create or replace function public.join_family(code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare c text := upper(trim(code));
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.profiles where family = c and role = 'learner') then
    update public.profiles set family = c where id = auth.uid();
    return true;
  end if;
  return false;
end $$;

revoke all on function public.ensure_family_code() from public, anon;
revoke all on function public.join_family(text)    from public, anon;
grant execute on function public.ensure_family_code() to authenticated;
grant execute on function public.join_family(text)    to authenticated;
grant execute on function public.my_family()          to authenticated;

-- 6. 권한: 본인 것만, 편지는 같은 가족끼리만 ------------------------------------
alter table public.profiles    enable row level security;
alter table public.story_notes enable row level security;
alter table public.daily_packs enable row level security;
alter table public.letters     enable row level security;

-- 가족 번호(family)는 위 함수로만 바꿀 수 있습니다.
revoke update on public.profiles from authenticated, anon;
grant  update (name, role, level, day, last_done_date, placement) on public.profiles to authenticated;
-- 편지는 '읽음 처리'만 바꿀 수 있습니다.
revoke update on public.letters from authenticated, anon;
grant  update (handled_at) on public.letters to authenticated;

drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles update" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or (family is not null and family = public.my_family()));
create policy "profiles update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "notes own" on public.story_notes;
create policy "notes own" on public.story_notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "packs own" on public.daily_packs;
create policy "packs own" on public.daily_packs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "letters read"   on public.letters;
drop policy if exists "letters write"  on public.letters;
drop policy if exists "letters handle" on public.letters;
create policy "letters read" on public.letters for select to authenticated
  using (family = public.my_family());
create policy "letters write" on public.letters for insert to authenticated
  with check (
    from_id = auth.uid()
    and family = public.my_family()
    and (to_id is null or exists (select 1 from public.profiles p where p.id = to_id and p.family = public.my_family()))
  );
create policy "letters handle" on public.letters for update to authenticated
  using (to_id = auth.uid()) with check (to_id = auth.uid());
