-- 016: "다음에 답장"으로 읽음 처리됐지만 아직 답장하지 않은 최근 편지를 다시 '답장 안 함'으로 (지난 7일)
update public.letters l set handled_at = null
where l.handled_at is not null
  and l.created_at > now() - interval '7 days'
  and not exists (
    select 1 from public.letters r
    where r.from_id = l.to_id and r.to_id = l.from_id and r.created_at > l.created_at
  );
