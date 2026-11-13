-- WannaTalk 추가: 가입 인원 제한 (기본 10명)
-- SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전합니다.
-- 제한은 관리자 대시보드에서 바꿀 수 있습니다. (빈 값 = 제한 없음)

create table if not exists public.app_settings (
  id        int primary key default 1 check (id = 1),
  max_users int check (max_users is null or max_users >= 0)
);
insert into public.app_settings (id, max_users) values (1, 10) on conflict (id) do nothing;
alter table public.app_settings enable row level security;  -- 정책이 없으니 앱에서는 직접 읽거나 바꿀 수 없음

-- 새 사용자가 만들어지기 전에 인원을 확인합니다. 관리자 이메일은 언제나 가입할 수 있습니다.
create or replace function public.check_signup_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim int; n int;
begin
  select max_users into lim from public.app_settings where id = 1;
  if lim is null then return new; end if;
  if exists (select 1 from public.admins a where lower(a.email) = lower(new.email)) then return new; end if;
  perform pg_advisory_xact_lock(4242);  -- 동시에 여러 명이 가입해도 정확히 세기
  select count(*) into n from auth.users;
  if n >= lim then
    raise exception 'signup_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_limit on auth.users;
create trigger on_auth_user_limit
  before insert on auth.users
  for each row execute function public.check_signup_limit();

-- 관리자: 지금 인원과 제한 보기
create or replace function public.admin_signup_settings()
returns table (users bigint, max_users int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  return query select (select count(*) from auth.users), (select s.max_users from public.app_settings s where s.id = 1);
end $$;

-- 관리자: 제한 바꾸기 (null 이면 제한 없음)
create or replace function public.admin_set_max_users(n int)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if n is not null and n < 0 then raise exception 'bad value'; end if;
  update public.app_settings set max_users = n where id = 1;
  return n;
end $$;

revoke all on function public.check_signup_limit()     from public, anon, authenticated;
revoke all on function public.admin_signup_settings()  from public, anon;
revoke all on function public.admin_set_max_users(int) from public, anon;
grant execute on function public.admin_signup_settings()  to authenticated;
grant execute on function public.admin_set_max_users(int) to authenticated;
