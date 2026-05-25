-- ============================================================
-- Admin Fase 1.6 - permite SELECT admin em todas as tabelas
-- transacionais para que o dashboard, tela de usuarios e
-- monitoramento de conversas mostrem dados reais.
--
-- Politicas ja existentes (cliente ve o seu, prestador ve o seu)
-- continuam ativas. Adicionamos uma policy ADICIONAL "*_select_admin"
-- que e' true sempre que is_administrator(). RLS no Postgres faz OR
-- das policies de mesma acao - basta uma autorizar para liberar.
-- ============================================================

-- solicitacoes
drop policy if exists "solicitacoes_select_admin" on public.solicitacoes;
create policy "solicitacoes_select_admin" on public.solicitacoes
  for select to authenticated using (public.is_administrator());

-- documentos_validacao ja tem dono_ou_admin pela 039; garantimos idempotente
drop policy if exists "documentos_select_admin" on public.documentos_validacao;
create policy "documentos_select_admin" on public.documentos_validacao
  for select to authenticated using (public.is_administrator());

-- demandas
drop policy if exists "demandas_select_admin" on public.demandas;
create policy "demandas_select_admin" on public.demandas
  for select to authenticated using (public.is_administrator());

-- propostas
drop policy if exists "propostas_select_admin" on public.propostas;
create policy "propostas_select_admin" on public.propostas
  for select to authenticated using (public.is_administrator());

-- avaliacoes (ja sao publicas por SELECT, mas idempotente)
drop policy if exists "avaliacoes_select_admin" on public.avaliacoes;
create policy "avaliacoes_select_admin" on public.avaliacoes
  for select to authenticated using (public.is_administrator());

-- pagamentos
drop policy if exists "pagamentos_select_admin_global" on public.pagamentos;
create policy "pagamentos_select_admin_global" on public.pagamentos
  for select to authenticated using (public.is_administrator());

-- pagamentos_plano
drop policy if exists "pp_select_admin" on public.pagamentos_plano;
create policy "pp_select_admin" on public.pagamentos_plano
  for select to authenticated using (public.is_administrator());

-- wallets e wallet_transactions
drop policy if exists "wallets_select_admin" on public.wallets;
create policy "wallets_select_admin" on public.wallets
  for select to authenticated using (public.is_administrator());

drop policy if exists "wallet_tx_select_admin" on public.wallet_transactions;
create policy "wallet_tx_select_admin" on public.wallet_transactions
  for select to authenticated using (public.is_administrator());

-- saques
drop policy if exists "saques_select_admin" on public.saques;
create policy "saques_select_admin" on public.saques
  for select to authenticated using (public.is_administrator());

-- denuncias (admin via politica existente "denuncias_select_proprio_ou_admin" - ja cobre)
-- bloqueios
drop policy if exists "bloqueios_select_admin" on public.bloqueios;
create policy "bloqueios_select_admin" on public.bloqueios
  for select to authenticated using (public.is_administrator());

-- etapas e agendamento
drop policy if exists "etapas_select_admin" on public.etapas_atendimento;
create policy "etapas_select_admin" on public.etapas_atendimento
  for select to authenticated using (public.is_administrator());

drop policy if exists "agendamento_select_admin" on public.agendamento_propostas;
create policy "agendamento_select_admin" on public.agendamento_propostas
  for select to authenticated using (public.is_administrator());

-- profissional_categorias
drop policy if exists "prest_cat_select_admin" on public.profissional_categorias;
create policy "prest_cat_select_admin" on public.profissional_categorias
  for select to authenticated using (public.is_administrator());

-- servicos
drop policy if exists "servicos_select_admin" on public.servicos;
create policy "servicos_select_admin" on public.servicos
  for select to authenticated using (public.is_administrator());

-- Backfill final: garante que docs com status legado 'enviado' viraram 'pendente'
update public.documentos_validacao
set status = 'pendente'
where status = 'enviado';
