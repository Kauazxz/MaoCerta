-- ============================================================
-- Realtime setup completo (consolida 044 + 045)
--
-- Esta migration garante que TODAS as tabelas alvo de Realtime
-- estao:
--   1) com REPLICA IDENTITY FULL (para Realtime emitir payload
--      completo e filtros eq./neq. funcionarem)
--   2) adicionadas a publication supabase_realtime
--
-- Tambem fornece queries de auditoria no fim que voce pode rodar
-- para CONFIRMAR que tudo esta no ar. Se algo nao aparecer no
-- resultado dessas queries, e' porque o painel Database -> Replication
-- pode estar com a tabela desligada (override manual). Nesse caso
-- voce precisa ligar manualmente no painel.
--
-- IMPORTANTE: este script NAO toca em mensagens_atendimento na
-- parte logica. Apenas garante que a publication tenha a tabela
-- (ja' estava desde a migration 014).
-- ============================================================

do $$
declare
  t text;
  tabelas text[] := array[
    'demandas',
    'propostas',
    'solicitacoes',
    'notificacoes_financeiras',
    'documentos_validacao',
    'etapas_atendimento',
    'agendamento_propostas',
    'pagamentos',
    'pagamentos_plano',
    'avaliacoes',
    'denuncias',
    'bloqueios',
    'termos_conclusao_atendimento',
    'wallets',
    'wallet_transactions',
    'saques',
    'profiles',
    'servicos',
    'profissional_categorias',
    'disputas',
    'acordos_chat_sugeridos',
    'acordos_chat_confirmacoes',
    'mensagens_atendimento'    -- ja existia, mantido para idempotencia
  ];
begin
  foreach t in array tabelas loop
    -- 1) Replica identity full
    begin
      execute format('alter table public.%I replica identity full', t);
    exception when others then
      raise notice 'replica identity em %: %', t, sqlerrm;
    end;

    -- 2) Adicionar a publication
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when others then raise notice 'publication add %: %', t, sqlerrm;
    end;
  end loop;
end $$;

-- ============================================================
-- QUERIES DE AUDITORIA (rodar manualmente apos a migration)
-- ============================================================
-- Lista das tabelas que estao na publication supabase_realtime:
-- select schemaname, tablename
-- from pg_publication_tables
-- where pubname = 'supabase_realtime'
-- order by schemaname, tablename;
--
-- Lista de tabelas com REPLICA IDENTITY FULL:
-- select c.relname as tabela,
--        case c.relreplident
--          when 'd' then 'default (so PK)'
--          when 'n' then 'nothing'
--          when 'f' then 'full'
--          when 'i' then 'using index'
--        end as identidade
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relkind = 'r'
-- order by c.relname;
