-- ============================================================
-- Fase 1.1 - dedupe e contraproposta de acordos
--
-- Mudancas:
-- 1) Colunas extras em acordos_chat_sugeridos para rastrear quantas
--    revisoes o acordo ja sofreu e quando foi a ultima alteracao.
-- 2) Policy de DELETE em acordos_chat_confirmacoes para permitir
--    que o servico reset os aceites quando o acordo for editado
--    (parte da regra de contraproposta).
--
-- A logica de dedupe roda no client (service) porque precisa
-- comparar valores/datas com tolerancia semantica. A tabela so'
-- ganha colunas de apoio.
-- ============================================================

alter table public.acordos_chat_sugeridos
  add column if not exists revisao smallint not null default 0,
  add column if not exists ultima_alteracao_em timestamptz not null default now();

-- Policy: participantes do atendimento podem apagar confirmacoes
-- quando o acordo e' editado (necessario para "resetar aceite" em
-- contraproposta). Ainda assim o INSERT exige que user_id = auth.uid()
-- mantendo a integridade de quem confirma o que.
drop policy if exists "acordos_conf_delete_participantes" on public.acordos_chat_confirmacoes;
create policy "acordos_conf_delete_participantes" on public.acordos_chat_confirmacoes
  for delete to authenticated
  using (
    exists (
      select 1 from public.acordos_chat_sugeridos a
      join public.solicitacoes s on s.id = a.solicitacao_id
      where a.id = acordo_id
        and (s.cliente_id = auth.uid() or s.profissional_id = auth.uid())
    )
  );
