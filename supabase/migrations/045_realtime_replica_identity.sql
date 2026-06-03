-- ============================================================
-- Realtime - garantir REPLICA IDENTITY FULL nas tabelas que entram
-- na publication supabase_realtime.
--
-- Sintoma observado: tabelas adicionadas na publication (migration
-- 044) nao estavam emitindo eventos de INSERT/UPDATE para clientes
-- conectados. O usuario precisava dar F5 para ver mudancas.
--
-- Causa: por padrao o Postgres usa REPLICA IDENTITY = DEFAULT
-- (apenas chave primaria). O Supabase Realtime precisa de FULL
-- para emitir corretamente todos os campos no payload e para que
-- os filtros (=eq.) funcionem com seguranca.
--
-- Idempotente.
-- ============================================================

do $$
declare
  t text;
  tabelas text[] := array[
    'demandas',
    'propostas',
    'solicitacoes',
    'notificacoes_financeiras',
    'acordos_chat_sugeridos',
    'acordos_chat_confirmacoes',
    'documentos_validacao',
    'etapas_atendimento',
    'agendamento_propostas',
    'pagamentos',
    'avaliacoes',
    'denuncias',
    'termos_conclusao_atendimento',
    'mensagens_atendimento'
  ];
begin
  foreach t in array tabelas loop
    begin
      execute format('alter table public.%I replica identity full', t);
    exception
      when others then
        raise notice 'Falha ao setar replica identity em %: %', t, sqlerrm;
    end;
  end loop;
end $$;

-- Garante de novo que estao na publication (a 044 pode nao ter
-- rodado se o usuario aplicou parcialmente).
do $$
declare
  t text;
  tabelas text[] := array[
    'demandas',
    'propostas',
    'solicitacoes',
    'notificacoes_financeiras',
    'acordos_chat_sugeridos',
    'acordos_chat_confirmacoes',
    'documentos_validacao',
    'etapas_atendimento',
    'agendamento_propostas',
    'pagamentos',
    'avaliacoes',
    'denuncias',
    'termos_conclusao_atendimento'
  ];
begin
  foreach t in array tabelas loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when others then raise notice 'Falha %: %', t, sqlerrm;
    end;
  end loop;
end $$;
