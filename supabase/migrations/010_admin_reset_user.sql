-- 010: 관리자가 계정을 '처음 가입한 상태'로 되돌리기 (온보딩을 다시 테스트할 때) -------------
-- 이름·태그·실력 테스트·진도와 레슨·이야기 기록을 지웁니다. 로그인 정보, 연락처, 편지는 그대로 둡니다.
create or replace function public.admin_reset_user(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  delete from public.daily_packs   where user_id = uid;
  delete from public.story_notes   where user_id = uid;
  delete from public.story_entries where user_id = uid;
  update public.profiles set
    name = null, role = null, level = 1, day = 1, last_done_date = null, placement = null,
    background_tags = '{}', background_note = ''
  where id = uid;
end $$;
revoke all on function public.admin_reset_user(uuid) from public, anon;
grant execute on function public.admin_reset_user(uuid) to authenticated;
