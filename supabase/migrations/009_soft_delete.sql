-- 009: 관리자가 계정을 삭제 → 30일 보관 뒤 완전히 삭제 (그 안에는 복원 가능) ------------------
alter table public.profiles add column if not exists deleted_at timestamptz;

-- 삭제(보관): 로그인을 막고 30일 동안 자료를 그대로 둡니다. 자기 자신과 관리자 계정은 지울 수 없어요.
create or replace function public.admin_delete_user(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if uid = auth.uid() then raise exception 'cannot_delete_self'; end if;
  if exists (select 1 from public.admins a join auth.users u on lower(u.email) = lower(a.email) where u.id = uid) then
    raise exception 'cannot_delete_admin';
  end if;
  update public.profiles set deleted_at = now() where id = uid and deleted_at is null;
  begin
    update auth.users set banned_until = now() + interval '100 years' where id = uid;
    delete from auth.sessions where user_id = uid;
  exception when others then null;  -- 로그인 차단이 안 돼도 앱과 서버에서 막습니다
  end;
end $$;

create or replace function public.admin_restore_user(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  update public.profiles set deleted_at = null where id = uid;
  begin
    update auth.users set banned_until = null where id = uid;
  exception when others then null;
  end;
end $$;

-- 보관 중인 계정을 지금 바로 완전히 삭제 (되돌릴 수 없음)
create or replace function public.admin_purge_user(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if not exists (select 1 from public.profiles p where p.id = uid and p.deleted_at is not null) then
    raise exception 'not_deleted';
  end if;
  delete from auth.users where id = uid;   -- 프로필·레슨·기록·편지는 함께 지워집니다
end $$;

-- 30일이 지난 보관 계정을 정리 (관리자 화면을 열 때마다 실행)
create or replace function public.admin_purge_deleted()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  with gone as (
    delete from auth.users u using public.profiles p
    where p.id = u.id and p.deleted_at is not null and p.deleted_at < now() - interval '30 days'
    returning u.id)
  select count(*) into n from gone;
  return n;
end $$;

create or replace function public.admin_deleted()
returns table (id uuid, deleted_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  return query select p.id, p.deleted_at from public.profiles p where p.deleted_at is not null;
end $$;

-- 삭제된 사람은 연락처에 보이지 않아요
create or replace function public.my_contacts()
returns table (id uuid, name text, role text, level int)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.role, p.level
  from public.contacts k join public.profiles p on p.id = k.contact_id
  where k.owner_id = auth.uid() and p.deleted_at is null
  order by k.created_at
$$;

revoke all on function public.admin_delete_user(uuid)  from public, anon;
revoke all on function public.admin_restore_user(uuid) from public, anon;
revoke all on function public.admin_purge_user(uuid)   from public, anon;
revoke all on function public.admin_purge_deleted()    from public, anon;
revoke all on function public.admin_deleted()          from public, anon;
grant execute on function public.admin_delete_user(uuid)  to authenticated;
grant execute on function public.admin_restore_user(uuid) to authenticated;
grant execute on function public.admin_purge_user(uuid)   to authenticated;
grant execute on function public.admin_purge_deleted()    to authenticated;
grant execute on function public.admin_deleted()          to authenticated;
