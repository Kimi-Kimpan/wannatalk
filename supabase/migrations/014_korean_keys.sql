-- 014: 한글 키보드 과정 진도 (마친 단원 수)
alter table public.profiles add column if not exists ko_keys smallint not null default 0;
grant update (ko_keys) on public.profiles to authenticated;
