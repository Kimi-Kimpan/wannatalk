-- 007: 처음 시작할 때 본인이 고른 답으로 배경 태그를 만듭니다 ---------------------------
-- 본인은 배경이 비어 있을 때만 채울 수 있어요. 그 뒤로는 관리자만 고칩니다.
create or replace function public.set_my_background(tags text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.profiles set
    background_tags = coalesce((select array_agg(x) from (
      select left(btrim(t), 40) as x from unnest(coalesce(tags, '{}')) as t where btrim(t) <> '' limit 12) s), '{}')
  where id = auth.uid() and background_tags = '{}' and background_note = '';
end $$;
revoke execute on function public.set_my_background(text[]) from public, anon;
grant  execute on function public.set_my_background(text[]) to authenticated;
