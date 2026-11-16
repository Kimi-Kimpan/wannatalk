-- 008: 태그는 최대 10개. 본인도 설정에서 자기 태그를 고칠 수 있어요 (메모는 관리자만) ----------
create or replace function public.set_my_background(tags text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.profiles set
    background_tags = coalesce((select array_agg(x) from (
      select left(btrim(t), 40) as x from unnest(coalesce(tags, '{}')) as t where btrim(t) <> '' limit 10) s), '{}')
  where id = auth.uid();
end $$;

create or replace function public.admin_set_background(uid uuid, tags text[], note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  update public.profiles set
    background_tags = coalesce((select array_agg(x) from (
      select left(btrim(t), 40) as x from unnest(coalesce(tags, '{}')) as t where btrim(t) <> '' limit 10) s), '{}'),
    background_note = left(coalesce(note, ''), 300)
  where id = uid;
end $$;
