-- ============================================================
-- Limpa lancamentos de carteira originados do Pix SANDBOX (anterior
-- a integracao real com Mercado Pago feita na 048).
--
-- Heuristica de "sandbox": pagamentos sem mp_payment_id sao todos do
-- fluxo antigo (sandbox interno gerava SANDBOX-xxx). Como agora todo
-- pagamento real passa pela /api/pix/etapa/criar e tem mp_payment_id,
-- qualquer wallet_transaction que referencia um pagamento sem
-- mp_payment_id e' lixo de teste.
--
-- O que faz:
-- 1) Apaga as wallet_transactions cuja referencia aponta para
--    pagamentos sandbox.
-- 2) Apaga snapshots de saldo (vao ser regerados pelo job).
-- 3) Recalcula saldo e saldo_bloqueado das wallets a partir das
--    transactions remanescentes.
-- 4) Marca esses pagamentos sandbox antigos como 'cancelado' para
--    nao aparecerem mais como em escrow no front.
-- ============================================================

begin;

-- 1) Apaga lancamentos de carteira originados de pagamentos sandbox
with sandbox as (
  select id::text as id_text from public.pagamentos where mp_payment_id is null
)
delete from public.wallet_transactions
where referencia in (select id_text from sandbox);

-- 2) Limpa snapshots (regenerados pelo job de saldo)
delete from public.wallet_balance_snapshots;

-- 3) Recalcula saldos a partir das transactions remanescentes
with totais as (
  select
    user_id,
    coalesce(sum(valor) filter (where tipo in (
      'credito', 'liberacao_escrow', 'reembolso_admin', 'comissao_plataforma'
    )), 0)
    - coalesce(sum(valor) filter (where tipo in ('debito', 'saque')), 0) as saldo_calc,
    coalesce(sum(valor) filter (where tipo = 'recebimento_etapa'), 0)
    - coalesce(sum(valor) filter (where tipo in ('liberacao_escrow', 'estorno_disputa')), 0) as bloq_calc
  from public.wallet_transactions
  group by user_id
)
update public.wallets w
set saldo = greatest(0, t.saldo_calc),
    saldo_bloqueado = greatest(0, t.bloq_calc),
    updated_at = now()
from totais t
where t.user_id = w.user_id;

-- Wallets que nao tem mais nenhuma transaction: zera tudo
update public.wallets
set saldo = 0,
    saldo_bloqueado = 0,
    updated_at = now()
where user_id not in (select distinct user_id from public.wallet_transactions);

-- 4) Marca os pagamentos sandbox como cancelados para nao reaparecerem
update public.pagamentos
set status = 'cancelado', updated_at = now()
where mp_payment_id is null
  and status in ('aguardando_pagamento', 'pago', 'em_escrow', 'contestado');

commit;
