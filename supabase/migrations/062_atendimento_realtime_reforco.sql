-- ============================================================
-- Reforco da publicacao supabase_realtime para o novo motor de
-- atendimento.
--
-- A 056 ja' tentou adicionar as 4 tabelas novas mas:
--   (a) pode nao ter sido aplicada;
--   (b) quando uma tabela e' alterada apos ser adicionada na
--       publicacao, alguns provedores re-emitem o schema cache
--       e o realtime perde a inscricao temporariamente.
--
-- Esta migration garante de novo, de forma idempotente:
--  - REPLICA IDENTITY FULL nas tabelas
--  - mensagens_atendimento, planos_atendimento, plano_itens_atendimento,
--    cobrancas_atendimento e atendimento_eventos na publicacao
-- ============================================================

alter table public.mensagens_atendimento       replica identity full;
alter table public.planos_atendimento          replica identity full;
alter table public.plano_itens_atendimento     replica identity full;
alter table public.cobrancas_atendimento       replica identity full;
alter table public.atendimento_eventos         replica identity full;

do $$
begin
  -- Cria publicacao se nao existir (caso seja banco novo)
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  begin
    alter publication supabase_realtime add table public.mensagens_atendimento;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.planos_atendimento;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.plano_itens_atendimento;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.cobrancas_atendimento;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.atendimento_eventos;
  exception when duplicate_object then null;
  end;
end $$;
