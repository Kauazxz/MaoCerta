-- ============================================================
-- Correcoes apontadas pelo Supabase Security Advisor.
--
-- 1) Critico: 3 tabelas em public sem RLS habilitado.
--    Estavam expostas pela API REST sem nenhuma protecao.
--    - webhook_idempotency_keys: so service_role deve ler/escrever
--      (controle de idempotencia do webhook MP)
--    - pix_generation_ratelimit: usuario le proprio, escrita apenas
--      por service_role / RPC SECURITY DEFINER (controle anti-abuso)
--    - wallet_balance_snapshots: usuario le proprio, escrita apenas
--      por service_role / RPC (snapshots diarios de saldo)
--
-- 2) Performance (Auth RLS Initialization Plan): policies de
--    disputas e wallet_withdrawals chamavam auth.uid() /
--    is_administrator() reavaliando linha a linha. Trocamos para
--    (select auth.uid()) / (select public.is_administrator()) para
--    que o Postgres avalie uma vez por query.
-- ============================================================

-- ============================================================
-- 1) webhook_idempotency_keys
-- ============================================================
alter table public.webhook_idempotency_keys enable row level security;

drop policy if exists "webhook_idempotency_keys_select_admin" on public.webhook_idempotency_keys;
create policy "webhook_idempotency_keys_select_admin" on public.webhook_idempotency_keys
  for select to authenticated
  using ((select public.is_administrator()));

-- Nenhuma policy para insert/update/delete em authenticated.
-- Quem escreve aqui e' o webhook usando service_role, que ignora RLS.

-- ============================================================
-- 2) pix_generation_ratelimit
-- ============================================================
alter table public.pix_generation_ratelimit enable row level security;

drop policy if exists "pix_rl_select_own" on public.pix_generation_ratelimit;
create policy "pix_rl_select_own" on public.pix_generation_ratelimit
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_administrator()));

-- Sem policy de insert: a tabela so' e' alimentada pela RPC
-- fn_financeiro_criar_pagamento_pix (SECURITY DEFINER), nunca
-- diretamente pelo client.

-- ============================================================
-- 3) wallet_balance_snapshots
-- ============================================================
alter table public.wallet_balance_snapshots enable row level security;

drop policy if exists "wallet_balance_snapshots_select_own" on public.wallet_balance_snapshots;
create policy "wallet_balance_snapshots_select_own" on public.wallet_balance_snapshots
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_administrator()));

-- Sem policy de escrita: alimentado por fn_financeiro_snapshot_saldos
-- (SECURITY DEFINER) ou por service_role.

-- ============================================================
-- 4) disputas: troca auth.uid()/is_administrator() por (select ...)
-- ============================================================
drop policy if exists "disputas_select_participantes" on public.disputas;
create policy "disputas_select_participantes" on public.disputas
  for select to authenticated
  using (
    exists (
      select 1 from public.solicitacoes s
      where s.id = solicitacao_id
        and (
          s.cliente_id = (select auth.uid())
          or s.profissional_id = (select auth.uid())
          or (select public.is_administrator())
        )
    )
  );

drop policy if exists "disputas_select_admin" on public.disputas;
create policy "disputas_select_admin" on public.disputas
  for select to authenticated
  using ((select public.is_administrator()));

drop policy if exists "disputas_update_admin" on public.disputas;
create policy "disputas_update_admin" on public.disputas
  for update to authenticated
  using ((select public.is_administrator()));

-- ============================================================
-- 5) wallet_withdrawals: mesmo padrao
-- ============================================================
drop policy if exists "wallet_withdrawals_select_own" on public.wallet_withdrawals;
create policy "wallet_withdrawals_select_own" on public.wallet_withdrawals
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_administrator()));

drop policy if exists "wallet_withdrawals_select_admin" on public.wallet_withdrawals;
create policy "wallet_withdrawals_select_admin" on public.wallet_withdrawals
  for select to authenticated
  using ((select public.is_administrator()));
