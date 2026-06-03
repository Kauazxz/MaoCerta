-- ============================================================
-- Fase 1 do Pix real em etapa + saque manual + wallet admin
--
-- Decisoes adotadas:
-- 1. Mercado Pago em PRODUCAO para Pix de etapa de atendimento
-- 2. Saque do prestador e' MANUAL - admin transfere via app do banco
--    e marca o saque como pago, sistema debita do saldo
-- 3. Wallet admin separada acumula a comissao da plataforma
--
-- O que esta migration faz:
--   1) profiles.chave_pix + tipo_chave para o prestador receber saque
--   2) pagamentos.mp_payment_id + qr para Pix real do Mercado Pago
--   3) saques.chave_pix_destino + tipo_chave_destino + processado_por +
--      observacao do comprovante (snapshot do que foi pago)
--   4) wallets para o admin (user_id = qualquer admin ou um id especial)
--      Para nao depender de user especifico, usamos o flag
--      e' tipo='plataforma' (extensao) com chave UUID fixa
--   5) Funcao processar pagamento de etapa pago:
--      - marca pagamentos.status = 'em_escrow'
--      - credita comissao na wallet platform
--      - credita liquido prestador (em saldo_bloqueado ate liberacao)
--   6) Funcao admin marcar saque como pago:
--      - valida saldo do prestador
--      - debita saldo
--      - marca saque processado
--      - notifica prestador
-- ============================================================

-- 1) Chave Pix do prestador
alter table public.profiles
  add column if not exists chave_pix text,
  add column if not exists tipo_chave_pix text check (tipo_chave_pix in (
    'cpf', 'cnpj', 'email', 'telefone', 'aleatoria'
  ));

comment on column public.profiles.chave_pix is 'Chave Pix para receber saques. Snapshot no saque para nao mudar historico.';

-- 2) Mercado Pago em etapas
alter table public.pagamentos
  add column if not exists mp_payment_id text,
  add column if not exists mp_qr_code_base64 text,
  add column if not exists mp_pix_copia_e_cola text,
  add column if not exists mp_expires_at timestamptz;

create index if not exists idx_pagamentos_mp_payment_id on public.pagamentos (mp_payment_id);

-- Amplia tipos permitidos em wallet_transactions
alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_tipo_check;
alter table public.wallet_transactions
  add constraint wallet_transactions_tipo_check check (tipo in (
    'credito', 'debito',
    'recebimento_etapa', 'liberacao_escrow', 'estorno_disputa',
    'reembolso_admin', 'saque', 'comissao_plataforma'
  ));

-- 3) Saques: snapshot da chave + processado_por + comprovante
alter table public.saques
  add column if not exists chave_pix_destino text,
  add column if not exists tipo_chave_destino text,
  add column if not exists processado_por uuid references public.profiles(id) on delete set null,
  add column if not exists comprovante_obs text;

-- 4) Wallet da plataforma - usamos um id fixo bem conhecido
-- Como wallet.user_id e' uuid PK, criamos um perfil fantasma 'plataforma'
-- ou simplesmente usamos um id reservado. Optamos por id reservado
-- para nao misturar com usuarios reais.
do $$
declare
  v_platform_id constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  -- Cria a wallet da plataforma se ainda nao existe
  insert into public.wallets (user_id, saldo, saldo_bloqueado)
  values (v_platform_id, 0, 0)
  on conflict (user_id) do nothing;
end $$;

-- View auxiliar de saldo plataforma
create or replace view public.v_saldo_plataforma as
  select user_id, saldo, saldo_bloqueado, updated_at
  from public.wallets
  where user_id = '00000000-0000-0000-0000-000000000001';

grant select on public.v_saldo_plataforma to authenticated;

-- 5) Funcao chamada pelo webhook quando o Pix da etapa e' confirmado
create or replace function public.fn_pagamento_etapa_confirmado(
  p_pagamento_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p record;
  v_platform_id constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  select * into v_p from public.pagamentos where id = p_pagamento_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'pagamento_invalido');
  end if;

  if v_p.status not in ('aguardando_pagamento') then
    return json_build_object('ok', true, 'duplicate', true);
  end if;

  -- Marca pagamento como em escrow
  update public.pagamentos
  set status = 'em_escrow',
      pago_em = now(),
      updated_at = now()
  where id = p_pagamento_id;

  -- Credita comissao na plataforma (saldo disponivel imediato)
  update public.wallets
  set saldo = saldo + v_p.valor_comissao, updated_at = now()
  where user_id = v_platform_id;

  insert into public.wallet_transactions (
    user_id, tipo, valor, descricao, referencia, etapa_id
  ) values (
    v_platform_id, 'comissao_plataforma', v_p.valor_comissao,
    'Comissao etapa ' || coalesce(v_p.etapa_id::text, ''),
    v_p.id::text, v_p.etapa_id
  );

  -- Credita liquido do prestador como BLOQUEADO (escrow ate liberacao)
  insert into public.wallets (user_id, saldo, saldo_bloqueado)
  values (v_p.profissional_id, 0, 0)
  on conflict (user_id) do nothing;

  update public.wallets
  set saldo_bloqueado = saldo_bloqueado + v_p.valor_liquido_prestador,
      updated_at = now()
  where user_id = v_p.profissional_id;

  insert into public.wallet_transactions (
    user_id, tipo, valor, descricao, referencia, etapa_id, bloqueado_ate
  ) values (
    v_p.profissional_id, 'recebimento_etapa', v_p.valor_liquido_prestador,
    'Pix etapa confirmado - em retencao ate liberacao',
    v_p.id::text, v_p.etapa_id, now() + interval '48 hours'
  );

  -- Notifica
  insert into public.notificacoes_financeiras (user_id, tipo, titulo, corpo, payload)
  values
    (v_p.cliente_id, 'pagamento_recebido', 'Pix confirmado',
     'Seu pagamento foi recebido e esta em retencao.',
     jsonb_build_object('pagamento_id', v_p.id)),
    (v_p.profissional_id, 'pagamento_recebido', 'Pagamento em retencao',
     'O cliente pagou. Valor disponivel para saque apos liberacao da etapa.',
     jsonb_build_object('pagamento_id', v_p.id));

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.fn_pagamento_etapa_confirmado(uuid) from public;
-- Sem grant para authenticated. So o service_role do webhook chama.

-- 6) Admin marca saque como pago manualmente
create or replace function public.fn_admin_processar_saque(
  p_saque_id uuid,
  p_observacao text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saque record;
  v_wallet record;
begin
  if not public.is_administrator() then
    return json_build_object('ok', false, 'erro', 'apenas_admin');
  end if;

  select * into v_saque from public.saques where id = p_saque_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'saque_invalido');
  end if;

  if v_saque.status <> 'pendente' then
    return json_build_object('ok', false, 'erro', 'status_invalido');
  end if;

  select * into v_wallet from public.wallets where user_id = v_saque.user_id for update;
  if not found or coalesce(v_wallet.saldo, 0) < v_saque.valor then
    return json_build_object('ok', false, 'erro', 'saldo_insuficiente');
  end if;

  -- Debita do saldo
  update public.wallets
  set saldo = saldo - v_saque.valor, updated_at = now()
  where user_id = v_saque.user_id;

  insert into public.wallet_transactions (user_id, tipo, valor, descricao, referencia)
  values (v_saque.user_id, 'saque', v_saque.valor,
          'Saque processado para chave ' || coalesce(v_saque.chave_pix_destino, ''),
          v_saque.id::text);

  -- Marca o saque
  update public.saques
  set status = 'processado',
      processado_em = now(),
      processado_por = auth.uid(),
      comprovante_obs = coalesce(nullif(trim(p_observacao), ''), comprovante_obs)
  where id = p_saque_id;

  -- Notifica prestador
  insert into public.notificacoes_financeiras (user_id, tipo, titulo, corpo, payload)
  values (v_saque.user_id, 'saque_pago', 'Saque liberado',
          'Seu saque de R$ ' || v_saque.valor::text || ' foi processado.',
          jsonb_build_object('saque_id', v_saque.id));

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.fn_admin_processar_saque(uuid, text) from public;
grant execute on function public.fn_admin_processar_saque(uuid, text) to authenticated;

-- 7) Solicitar saque copiando snapshot da chave do prestador
create or replace function public.fn_solicitar_saque(
  p_valor numeric,
  p_observacao text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_perfil record;
  v_wallet record;
  v_saque_id uuid;
begin
  if v_user_id is null then
    return json_build_object('ok', false, 'erro', 'nao_autenticado');
  end if;
  if p_valor <= 0 then
    return json_build_object('ok', false, 'erro', 'valor_invalido');
  end if;

  select chave_pix, tipo_chave_pix into v_perfil
  from public.profiles where id = v_user_id;

  if v_perfil.chave_pix is null or trim(v_perfil.chave_pix) = '' then
    return json_build_object('ok', false, 'erro', 'sem_chave_pix');
  end if;

  select * into v_wallet from public.wallets where user_id = v_user_id;
  if not found or coalesce(v_wallet.saldo, 0) < p_valor then
    return json_build_object('ok', false, 'erro', 'saldo_insuficiente');
  end if;

  insert into public.saques (
    user_id, valor, status, observacao,
    chave_pix_destino, tipo_chave_destino
  ) values (
    v_user_id, p_valor, 'pendente', p_observacao,
    v_perfil.chave_pix, v_perfil.tipo_chave_pix
  )
  returning id into v_saque_id;

  return json_build_object('ok', true, 'saque_id', v_saque_id);
end;
$$;

revoke all on function public.fn_solicitar_saque(numeric, text) from public;
grant execute on function public.fn_solicitar_saque(numeric, text) to authenticated;
