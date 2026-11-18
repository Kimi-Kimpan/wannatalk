-- 015: 한국어 하루 레슨 진도 (영어 레슨의 day/level과 따로)
alter table public.profiles add column if not exists ko_day smallint not null default 1;
alter table public.profiles add column if not exists ko_level smallint;          -- 처음 레슨 전에 한 번 물어봐요 (1~3)
alter table public.profiles add column if not exists ko_last_done date;
grant update (ko_day, ko_level, ko_last_done) on public.profiles to authenticated;
