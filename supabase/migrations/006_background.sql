-- 006: 사용자마다의 배경 (관리자가 붙이는 태그와 메모) --------------------------------
-- 클라우디아가 레슨·질문·편지 도움을 만들 때 이 배경만 참고합니다.
alter table public.profiles add column if not exists background_tags text[] not null default '{}';
alter table public.profiles add column if not exists background_note text   not null default '';

create or replace function public.admin_set_background(uid uuid, tags text[], note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  update public.profiles set
    background_tags = coalesce((select array_agg(x) from (
      select left(btrim(t), 40) as x from unnest(coalesce(tags, '{}')) as t where btrim(t) <> '' limit 20) s), '{}'),
    background_note = left(coalesce(note, ''), 600)
  where id = uid;
end $$;
revoke execute on function public.admin_set_background(uuid, text[], text) from public, anon;
grant  execute on function public.admin_set_background(uuid, text[], text) to authenticated;

-- 지금까지 고정으로 들어 있던 내용을 첫 학습자(용호 님)에게 옮깁니다. 이미 채워져 있으면 건드리지 않아요.
update public.profiles set
  background_tags = array['70대 남성', '공항 근무 (휠체어 승객 돕는 일)', '스웨덴에 사는 Clara와 영어로 대화하고 싶음'],
  background_note = 'His child''s girlfriend, Clara, lives in northern Sweden and does not speak Korean; he wants to chat with her in English.'
where role = 'learner' and (name ilike 'yongho%' or name like '%용호%')
  and background_tags = '{}' and background_note = '';
