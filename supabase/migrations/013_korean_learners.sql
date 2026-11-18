-- 013: 한국어를 배우는 사용자 + 편지 번역 ---------------------------------------------------
-- 배우는 언어: en = 영어를 배워요(지금까지의 모든 사용자), ko = 한국어를 배워요
alter table public.profiles add column if not exists learn_lang text not null default 'en';
alter table public.profiles drop constraint if exists profiles_learn_lang_check;
alter table public.profiles add constraint profiles_learn_lang_check check (learn_lang in ('en', 'ko'));
grant update (learn_lang) on public.profiles to authenticated;

-- 편지 번역: 받는 사람이 배우는 언어로 먼저 보여 주고, 스위치로 원문을 봐요
alter table public.letters add column if not exists translation text;
alter table public.letters add column if not exists translation_lang text;

-- 번역은 편지를 보낸 사람이나 받은 사람만 저장할 수 있어요 (다른 칸은 못 바꿔요)
create or replace function public.set_letter_translation(lid bigint, lang text, txt text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if lang not in ('en', 'ko') then raise exception 'bad lang'; end if;
  update public.letters set translation = left(coalesce(txt, ''), 2400), translation_lang = lang
  where id = lid and (from_id = auth.uid() or to_id = auth.uid());
end $$;
revoke all on function public.set_letter_translation(bigint, text, text) from public, anon;
grant execute on function public.set_letter_translation(bigint, text, text) to authenticated;

-- 연락처에 상대가 배우는 언어도 보여요 (편지를 어느 언어로 번역할지 알기 위해)
drop function if exists public.my_contacts();
create function public.my_contacts()
returns table (id uuid, name text, role text, level int, learn_lang text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.role, p.level, p.learn_lang
  from public.contacts k join public.profiles p on p.id = k.contact_id
  where k.owner_id = auth.uid() and p.deleted_at is null
  order by k.created_at
$$;
revoke all on function public.my_contacts() from public, anon;
grant execute on function public.my_contacts() to authenticated;
