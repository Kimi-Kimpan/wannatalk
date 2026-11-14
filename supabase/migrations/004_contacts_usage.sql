-- WannaTalk 추가: 연락처(코드로 추가)로 주고받는 메시지, AI 사용량 기록
-- SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전합니다.

-- 1. 내 코드: 모든 사람이 하나씩 가집니다. (학습자는 지금 쓰는 가족 번호를 그대로)
alter table public.profiles add column if not exists code text;
create unique index if not exists profiles_code_key on public.profiles (code);
update public.profiles set code = family
  where code is null and role = 'learner' and family is not null
    and not exists (select 1 from public.profiles q where q.code = profiles.family);

create or replace function public.my_code()
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then return null; end if;
  select code into c from public.profiles where id = auth.uid();
  if c is not null then return c; end if;
  loop
    -- 헷갈리는 글자(0 O 1 I)는 빼고 6자리
    c := upper(substr(translate(md5(random()::text || clock_timestamp()::text), '01', ''), 1, 6));
    exit when char_length(c) = 6 and not exists (select 1 from public.profiles where code = c);
  end loop;
  update public.profiles set code = c where id = auth.uid();
  return c;
end $$;

-- 2. 연락처: 코드를 한 번 넣으면 서로의 목록에 생깁니다.
create table if not exists public.contacts (
  owner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  contact_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, contact_id),
  check (owner_id <> contact_id)
);
alter table public.contacts enable row level security;
drop policy if exists "contacts own" on public.contacts;
drop policy if exists "contacts remove" on public.contacts;
create policy "contacts own"    on public.contacts for select to authenticated using (owner_id = auth.uid());
create policy "contacts remove" on public.contacts for delete to authenticated using (owner_id = auth.uid());
revoke insert, update on public.contacts from anon, authenticated;

-- 지금 같은 가족인 사람들은 서로 연락처로
insert into public.contacts (owner_id, contact_id)
  select a.id, b.id from public.profiles a join public.profiles b on a.family = b.family and a.id <> b.id
  where a.family is not null
on conflict do nothing;

-- 코드를 마구 넣어 보지 못하게: 한 시간에 10번 틀리면 잠시 막기
create table if not exists public.contact_failures (
  user_id uuid not null references auth.users on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists contact_failures_idx on public.contact_failures (user_id, at);
alter table public.contact_failures enable row level security;
revoke all on public.contact_failures from anon, authenticated;

create or replace function public.add_contact(c text)
returns table (id uuid, name text, role text)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); them public.profiles%rowtype; fails int;
begin
  if me is null then raise exception 'not signed in'; end if;
  select count(*) into fails from public.contact_failures f where f.user_id = me and f.at > now() - interval '1 hour';
  if fails >= 10 then raise exception 'too_many_tries'; end if;
  select * into them from public.profiles p where p.code = upper(trim(c)) and p.id <> me;
  if not found then
    insert into public.contact_failures (user_id) values (me);
    return;
  end if;
  insert into public.contacts (owner_id, contact_id) values (me, them.id), (them.id, me) on conflict do nothing;
  return query select them.id, them.name, them.role;
end $$;

-- 내 연락처 목록 (이름과 역할)
create or replace function public.my_contacts()
returns table (id uuid, name text, role text, level int)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.role, p.level
  from public.contacts k join public.profiles p on p.id = k.contact_id
  where k.owner_id = auth.uid()
  order by k.created_at
$$;

revoke all on function public.my_code()        from public, anon;
revoke all on function public.add_contact(text) from public, anon;
revoke all on function public.my_contacts()    from public, anon;
grant execute on function public.my_code()        to authenticated;
grant execute on function public.add_contact(text) to authenticated;
grant execute on function public.my_contacts()    to authenticated;

-- 3. 편지: 보낸 사람·받는 사람만 보고, 연락처에 있는 사람에게만 보냅니다.
alter table public.letters alter column family drop not null;
drop policy if exists "letters read mine"  on public.letters;
drop policy if exists "letters write contact" on public.letters;
create policy "letters read mine" on public.letters for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());
create policy "letters write contact" on public.letters for insert to authenticated
  with check (
    from_id = auth.uid()
    and to_id is not null
    and exists (select 1 from public.contacts k where k.owner_id = auth.uid() and k.contact_id = to_id)
  );

-- 4. AI 사용량 기록 (서버가 로그인한 사용자 이름으로 적고, 관리자만 봅니다)
create table if not exists public.ai_usage (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  action        text not null,
  provider      text,
  model         text,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  units         numeric not null default 0,      -- 목소리: 글자 수, 받아 적기: 초
  cost_usd      numeric(12, 6) not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists ai_usage_time_idx on public.ai_usage (created_at);
create index if not exists ai_usage_user_idx on public.ai_usage (user_id, created_at);
alter table public.ai_usage enable row level security;
drop policy if exists "usage insert own" on public.ai_usage;
drop policy if exists "admin read usage" on public.ai_usage;
create policy "usage insert own" on public.ai_usage for insert to authenticated with check (user_id = auth.uid());
create policy "admin read usage" on public.ai_usage for select to authenticated using (public.is_admin());
revoke update, delete on public.ai_usage from anon, authenticated;

-- 관리자: 기간별 사용량 (사람 × 기능)
create or replace function public.admin_usage(since timestamptz)
returns table (user_id uuid, name text, email text, action text, calls bigint, cost_usd numeric, input_tokens bigint, output_tokens bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  return query
    select u.user_id, p.name, a.email::text, u.action, count(*), sum(u.cost_usd), sum(u.input_tokens)::bigint, sum(u.output_tokens)::bigint
    from public.ai_usage u
    left join public.profiles p on p.id = u.user_id
    left join auth.users a on a.id = u.user_id
    where u.created_at >= since
    group by u.user_id, p.name, a.email, u.action
    order by sum(u.cost_usd) desc;
end $$;
revoke all on function public.admin_usage(timestamptz) from public, anon;
grant execute on function public.admin_usage(timestamptz) to authenticated;
