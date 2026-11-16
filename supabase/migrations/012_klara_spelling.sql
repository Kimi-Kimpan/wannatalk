-- 012: 이름 철자 바로잡기 (Clara → Klara) — 배경 태그와 메모
update public.profiles set
  background_tags = (select coalesce(array_agg(replace(t, 'Clara', 'Klara')), '{}') from unnest(background_tags) t),
  background_note = replace(background_note, 'Clara', 'Klara')
where array_to_string(background_tags, ' ') like '%Clara%' or background_note like '%Clara%';
