-- 011: 대표 관리자 (owner) ---------------------------------------------------------
-- 관리자 권한을 주고 빼는 일은 대표 관리자만 할 수 있어요.
alter table public.admins add column if not exists owner boolean not null default false;

-- 아이디 'hansoriktm' 학습 계정을 대표 관리자로 지정합니다 (이메일은 여기에 적지 않아요).
insert into public.admins (email, owner)
  select lower(u.email), true from auth.users u join public.profiles p on p.id = u.id
  where lower(p.username) = 'hansoriktm'
on conflict (email) do update set owner = true;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins a join auth.users u on lower(u.email) = lower(a.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null and a.owner
  )
$$;

-- 대표 관리자만: 관리자 목록
create or replace function public.admin_list()
returns table (user_id uuid, owner boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not owner'; end if;
  return query select u.id, a.owner from public.admins a join auth.users u on lower(u.email) = lower(a.email);
end $$;

-- 대표 관리자만: 가입한 사용자에게 관리자 권한 주기 / 빼기
create or replace function public.admin_grant(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not owner'; end if;
  insert into public.admins (email)
    select lower(u.email) from auth.users u where u.id = uid and u.email_confirmed_at is not null
  on conflict (email) do nothing;
end $$;

create or replace function public.admin_revoke(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not owner'; end if;
  delete from public.admins a using auth.users u
    where u.id = uid and lower(u.email) = lower(a.email) and not a.owner;
end $$;

-- 계정 삭제: 대표 관리자는 지울 수 없고, 다른 관리자 계정은 대표 관리자만 지울 수 있어요 (권한도 함께 빠져요).
create or replace function public.admin_delete_user(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target_admin boolean; target_owner boolean;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if uid = auth.uid() then raise exception 'cannot_delete_self'; end if;
  select true, a.owner into target_admin, target_owner
    from public.admins a join auth.users u on lower(u.email) = lower(a.email) where u.id = uid;
  if coalesce(target_owner, false) then raise exception 'cannot_delete_admin'; end if;
  if coalesce(target_admin, false) then
    if not public.is_owner() then raise exception 'cannot_delete_admin'; end if;
    delete from public.admins a using auth.users u where u.id = uid and lower(u.email) = lower(a.email);
  end if;
  update public.profiles set deleted_at = now() where id = uid and deleted_at is null;
  begin
    update auth.users set banned_until = now() + interval '100 years' where id = uid;
    delete from auth.sessions where user_id = uid;
  exception when others then null;
  end;
end $$;

revoke all on function public.is_owner()        from public, anon;
revoke all on function public.admin_list()      from public, anon;
revoke all on function public.admin_grant(uuid) from public, anon;
revoke all on function public.admin_revoke(uuid) from public, anon;
grant execute on function public.is_owner()        to authenticated;
grant execute on function public.admin_list()      to authenticated;
grant execute on function public.admin_grant(uuid) to authenticated;
grant execute on function public.admin_revoke(uuid) to authenticated;
