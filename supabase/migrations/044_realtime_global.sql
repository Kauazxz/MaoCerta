-- ============================================================
-- Realtime global: habilita Supabase Realtime nas tabelas que
-- alimentam as listas dinamicas do app (demandas, propostas,
-- atendimentos, notificacoes etc.) para que o usuario veja as
-- mudancas sem precisar dar F5.
--
-- mensagens_atendimento ja tinha sido habilitada na migration 014.
-- Aqui adicionamos as demais. Idempotente: tenta add e ignora erro
-- "already member of publication".
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
    'termos_conclusao_atendimento'
  ];
begin
  foreach t in array tabelas loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then
        -- ja' estava na publicacao
        null;
      when others then
        raise notice 'Falha ao adicionar % a supabase_realtime: %', t, sqlerrm;
    end;
  end loop;
end $$;
