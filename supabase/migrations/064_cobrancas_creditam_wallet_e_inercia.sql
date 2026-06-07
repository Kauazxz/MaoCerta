-- ============================================================
-- 1) BUG: fn_marcar_cobranca_paga nao creditava wallet do prestador nem
--    platform_balance. Atendimentos concluidos no novo motor ficavam com
--    saldo zerado.
--
-- 2) NOVO: encerramento por inercia. Apos 7 dias sem o cliente assinar
--    o termo, o profissional pode forcar a conclusao (libera wallet,
--    marca termo como dispensado_por_inercia, conclui plano + solicitacao).
--
-- 3) BONUS: helper fn_atendimento_recreditar_wallet recompoe os creditos
--    perdidos em cobrancas ja' pagas antes do fix.
-- ============================================================

-- ============================================================
-- A) fn_marcar_cobranca_paga - agora credita wallet + platform_balance
-- ============================================================
create or replace function public.fn_marcar_cobranca_paga(
  p_cobranca_id   uuid,
  p_mp_payment_id text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cob public.cobrancas_atendimento;
  v_sol record;
  v_liquido numeric;
  v_taxa    numeric;
begin
  select * into v_cob from public.cobrancas_atendimento where id = p_cobranca_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'cobranca_invalida');
  end if;
  if v_cob.status in ('paga','retida','liberada') then
    return json_build_object('ok', true, 'duplicate', true);
  end if;
  if v_cob.status not in ('pix_gerado','aguardando_pagamento','aceita') then
    return json_build_object('ok', false, 'erro', 'status_invalido', 'atual', v_cob.status);
  end if;

  update public.cobrancas_atendimento
  set status = 'paga',
      mp_payment_id = coalesce(p_mp_payment_id, mp_payment_id),
      pago_em = now(),
      updated_at = now()
  where id = p_cobranca_id;

  if v_cob.item_id is not null then
    update public.plano_itens_atendimento
    set status = case
          when status = 'aguardando_pagamento' then 'pronto_para_iniciar'
          when status = 'aguardando_pagamento_final' then 'concluido'
          else status
        end,
        updated_at = now()
    where id = v_cob.item_id;
  end if;

  -- Carrega cliente/profissional da solicitacao
  select cliente_id, profissional_id into v_sol
    from public.solicitacoes where id = v_cob.solicitacao_id;

  v_liquido := coalesce(v_cob.valor_liquido_profissional, 0);
  v_taxa    := coalesce(v_cob.valor_taxa_plataforma, 0);

  -- (1) Comissao da plataforma
  if v_taxa > 0 then
    update public.platform_balance
    set saldo = saldo + v_taxa, updated_at = now()
    where id = 1;

    insert into public.platform_transactions (
      tipo, valor, descricao, referencia
    ) values (
      'comissao', v_taxa,
      'Comissao cobranca ' || coalesce(v_cob.titulo, v_cob.id::text),
      v_cob.id::text
    );
  end if;

  -- (2) Saldo bloqueado do prestador (escrow ate a conclusao do atendimento)
  if v_liquido > 0 and v_sol.profissional_id is not null then
    insert into public.wallets (user_id, saldo, saldo_bloqueado)
    values (v_sol.profissional_id, 0, 0)
    on conflict (user_id) do nothing;

    update public.wallets
    set saldo_bloqueado = saldo_bloqueado + v_liquido,
        updated_at = now()
    where user_id = v_sol.profissional_id;

    insert into public.wallet_transactions (
      user_id, tipo, valor, descricao, referencia, bloqueado_ate
    ) values (
      v_sol.profissional_id, 'recebimento_etapa', v_liquido,
      'Pagamento recebido - em escrow ate conclusao',
      v_cob.id::text, now() + interval '48 hours'
    );
  end if;

  perform public.fn_criar_evento_atendimento(
    v_cob.solicitacao_id, 'pagamento_confirmado',
    'Pagamento confirmado: ' || v_cob.titulo, null,
    'sistema', null, v_cob.plano_id, v_cob.item_id, v_cob.id, null,
    jsonb_build_object('valor', v_cob.valor, 'mp_payment_id', p_mp_payment_id)
  );
  return json_build_object('ok', true);
end;
$$;

-- ============================================================
-- B) Helper interno: libera UMA cobranca paga (saldo_bloqueado ->
--    saldo do prestador), idempotente
-- ============================================================
create or replace function public.fn_atendimento_liberar_cobranca_paga(
  p_cobranca_id uuid,
  p_ator        text default 'sistema'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cob public.cobrancas_atendimento;
  v_sol record;
  v_liquido numeric;
begin
  select * into v_cob from public.cobrancas_atendimento where id = p_cobranca_id for update;
  if not found then return false; end if;
  if v_cob.status <> 'paga' then return false; end if;

  v_liquido := coalesce(v_cob.valor_liquido_profissional, 0);
  if v_liquido <= 0 then
    update public.cobrancas_atendimento
    set status = 'liberada', liberado_em = now(), updated_at = now()
    where id = p_cobranca_id;
    return true;
  end if;

  select cliente_id, profissional_id into v_sol
    from public.solicitacoes where id = v_cob.solicitacao_id;
  if v_sol.profissional_id is null then return false; end if;

  update public.wallets
  set saldo_bloqueado = greatest(0, saldo_bloqueado - v_liquido),
      saldo           = saldo + v_liquido,
      updated_at      = now()
  where user_id = v_sol.profissional_id;

  insert into public.wallet_transactions (
    user_id, tipo, valor, descricao, referencia
  ) values (
    v_sol.profissional_id, 'liberacao_escrow', v_liquido,
    'Liberacao escrow - ' || coalesce(v_cob.titulo, v_cob.id::text),
    v_cob.id::text
  );

  update public.cobrancas_atendimento
  set status = 'liberada',
      liberado_em = now(),
      updated_at = now()
  where id = p_cobranca_id;

  perform public.fn_criar_evento_atendimento(
    v_cob.solicitacao_id, 'pagamento_liberado',
    'Valor liberado para a carteira do profissional', null,
    p_ator, null, v_cob.plano_id, v_cob.item_id, v_cob.id, null,
    jsonb_build_object('valor_liquido', v_liquido)
  );
  return true;
end;
$$;
revoke all on function public.fn_atendimento_liberar_cobranca_paga(uuid, text) from public;

-- ============================================================
-- C) fn_assinar_termo_final - quando ambos assinarem, libera todas as
--    cobrancas pagas do atendimento para o saldo disponivel
-- ============================================================
create or replace function public.fn_assinar_termo_final(
  p_termo_id uuid
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_termo public.termos_conclusao_atendimento;
  v_user uuid := auth.uid();
  v_eh_cliente boolean;
  v_eh_prof boolean;
  v_status_novo text;
  v_cob record;
begin
  select * into v_termo from public.termos_conclusao_atendimento where id = p_termo_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'termo_invalido');
  end if;
  if v_termo.status in ('assinado_ambos','confirmado','dispensado_por_admin','cancelado') then
    return json_build_object('ok', true, 'duplicate', true);
  end if;

  v_eh_cliente := public.fn_atendimento_is_cliente(v_termo.solicitacao_id);
  v_eh_prof    := public.fn_atendimento_is_profissional(v_termo.solicitacao_id);
  if not (v_eh_cliente or v_eh_prof) then
    return json_build_object('ok', false, 'erro', 'sem_permissao');
  end if;

  if v_eh_cliente and not v_termo.confirmado_cliente then
    update public.termos_conclusao_atendimento
    set confirmado_cliente = true,
        confirmado_cliente_em = now(),
        updated_at = now()
    where id = p_termo_id;
    perform public.fn_criar_evento_atendimento(
      v_termo.solicitacao_id, 'termo_assinado_cliente',
      'Cliente assinou o termo final', null,
      'cliente', v_user, v_termo.plano_id, null, null, null,
      jsonb_build_object('termo_id', p_termo_id)
    );
  end if;

  if v_eh_prof and not v_termo.confirmado_profissional then
    update public.termos_conclusao_atendimento
    set confirmado_profissional = true,
        confirmado_profissional_em = now(),
        updated_at = now()
    where id = p_termo_id;
  end if;

  select * into v_termo from public.termos_conclusao_atendimento where id = p_termo_id;

  if v_termo.confirmado_cliente and v_termo.confirmado_profissional then
    v_status_novo := 'assinado_ambos';
  elsif v_termo.confirmado_cliente then
    v_status_novo := 'assinado_cliente';
  else
    v_status_novo := v_termo.status;
  end if;

  update public.termos_conclusao_atendimento
  set status = v_status_novo,
      updated_at = now()
  where id = p_termo_id;

  if v_status_novo = 'assinado_ambos' then
    update public.planos_atendimento
    set status = 'concluido', updated_at = now()
    where solicitacao_id = v_termo.solicitacao_id and status in ('ativo','em_negociacao');

    update public.solicitacoes
    set status = 'concluida', updated_at = now()
    where id = v_termo.solicitacao_id and status in ('aceita','em_andamento');

    -- NOVO: libera todas as cobrancas pagas do atendimento
    for v_cob in
      select id from public.cobrancas_atendimento
      where solicitacao_id = v_termo.solicitacao_id and status = 'paga'
    loop
      perform public.fn_atendimento_liberar_cobranca_paga(v_cob.id, 'sistema');
    end loop;

    perform public.fn_criar_evento_atendimento(
      v_termo.solicitacao_id, 'atendimento_concluido',
      'Atendimento concluido', null,
      'sistema', v_user, v_termo.plano_id, null, null, null,
      jsonb_build_object('termo_id', p_termo_id)
    );
  end if;

  return json_build_object('ok', true, 'status', v_status_novo);
end;
$$;

-- ============================================================
-- D) fn_admin_dispensar_termo - tambem libera as cobrancas
-- ============================================================
create or replace function public.fn_admin_dispensar_termo(
  p_termo_id uuid,
  p_motivo text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_termo public.termos_conclusao_atendimento;
  v_user uuid := auth.uid();
  v_cob record;
begin
  if not public.is_administrator() then
    return json_build_object('ok', false, 'erro', 'apenas_admin');
  end if;

  select * into v_termo from public.termos_conclusao_atendimento where id = p_termo_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'termo_invalido');
  end if;

  update public.termos_conclusao_atendimento
  set status = 'dispensado_por_admin',
      dispensado_por_admin_at = now(),
      dispensado_por_admin_id = v_user,
      dispensado_por_admin_motivo = p_motivo,
      updated_at = now()
  where id = p_termo_id;

  update public.planos_atendimento
  set status = 'concluido', updated_at = now()
  where solicitacao_id = v_termo.solicitacao_id;

  update public.solicitacoes
  set status = 'concluida', updated_at = now()
  where id = v_termo.solicitacao_id;

  for v_cob in
    select id from public.cobrancas_atendimento
    where solicitacao_id = v_termo.solicitacao_id and status = 'paga'
  loop
    perform public.fn_atendimento_liberar_cobranca_paga(v_cob.id, 'admin');
  end loop;

  perform public.fn_criar_evento_atendimento(
    v_termo.solicitacao_id, 'decisao_admin',
    'Admin dispensou assinatura e encerrou o atendimento', p_motivo,
    'admin', v_user, v_termo.plano_id, null, null, null,
    jsonb_build_object('termo_id', p_termo_id, 'motivo', p_motivo)
  );

  return json_build_object('ok', true);
end;
$$;

-- ============================================================
-- E) NOVO: fn_profissional_encerrar_por_inercia
--    Profissional que ja assinou pode forcar conclusao apos 7 dias
--    sem o cliente assinar.
-- ============================================================
create or replace function public.fn_profissional_encerrar_por_inercia(
  p_termo_id uuid
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_termo public.termos_conclusao_atendimento;
  v_user uuid := auth.uid();
  v_cob record;
  v_dias int;
begin
  if v_user is null then
    return json_build_object('ok', false, 'erro', 'nao_autenticado');
  end if;

  select * into v_termo from public.termos_conclusao_atendimento where id = p_termo_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'termo_invalido');
  end if;
  if not public.fn_atendimento_is_profissional(v_termo.solicitacao_id) then
    return json_build_object('ok', false, 'erro', 'apenas_profissional');
  end if;
  if not v_termo.confirmado_profissional then
    return json_build_object('ok', false, 'erro', 'voce_precisa_assinar_antes');
  end if;
  if v_termo.confirmado_cliente then
    return json_build_object('ok', false, 'erro', 'cliente_ja_assinou');
  end if;
  if v_termo.status in ('assinado_ambos','dispensado_por_admin','cancelado') then
    return json_build_object('ok', true, 'duplicate', true);
  end if;

  v_dias := extract(day from (now() - v_termo.created_at))::int;
  if v_dias < 7 then
    return json_build_object('ok', false, 'erro', 'prazo_de_inercia_nao_atingido', 'dias', v_dias, 'min', 7);
  end if;

  update public.termos_conclusao_atendimento
  set status = 'dispensado_por_admin',
      dispensado_por_admin_at = now(),
      dispensado_por_admin_motivo = 'Encerrado por inercia: cliente nao assinou em ' || v_dias || ' dias',
      updated_at = now()
  where id = p_termo_id;

  update public.planos_atendimento
  set status = 'concluido', updated_at = now()
  where solicitacao_id = v_termo.solicitacao_id;

  update public.solicitacoes
  set status = 'concluida', updated_at = now()
  where id = v_termo.solicitacao_id;

  for v_cob in
    select id from public.cobrancas_atendimento
    where solicitacao_id = v_termo.solicitacao_id and status = 'paga'
  loop
    perform public.fn_atendimento_liberar_cobranca_paga(v_cob.id, 'sistema');
  end loop;

  perform public.fn_criar_evento_atendimento(
    v_termo.solicitacao_id, 'decisao_admin',
    'Encerrado por inercia (cliente nao assinou em ' || v_dias || ' dias)',
    'Profissional ativou encerramento automatico apos prazo.',
    'profissional', v_user, v_termo.plano_id, null, null, null,
    jsonb_build_object('termo_id', p_termo_id, 'dias', v_dias)
  );

  return json_build_object('ok', true);
end;
$$;
revoke all on function public.fn_profissional_encerrar_por_inercia(uuid) from public;
grant execute on function public.fn_profissional_encerrar_por_inercia(uuid) to authenticated;

-- ============================================================
-- F) RECUPERACAO RETROATIVA
--    Para cobrancas pagas antes do fix, credita o que ficou faltando.
--    Idempotente: usa wallet_transactions.referencia para nao duplicar.
-- ============================================================
do $$
declare
  v_cob record;
  v_sol record;
  v_taxa numeric;
  v_liquido numeric;
begin
  for v_cob in
    select * from public.cobrancas_atendimento
    where status in ('paga','liberada','retida')
      and valor_liquido_profissional is not null
  loop
    v_taxa    := coalesce(v_cob.valor_taxa_plataforma, 0);
    v_liquido := coalesce(v_cob.valor_liquido_profissional, 0);

    -- Comissao
    if v_taxa > 0 and not exists (
      select 1 from public.platform_transactions
      where referencia = v_cob.id::text and tipo = 'comissao'
    ) then
      update public.platform_balance
      set saldo = saldo + v_taxa, updated_at = now()
      where id = 1;

      insert into public.platform_transactions (
        tipo, valor, descricao, referencia
      ) values (
        'comissao', v_taxa,
        'Comissao cobranca ' || coalesce(v_cob.titulo, v_cob.id::text) || ' (recuperada)',
        v_cob.id::text
      );
    end if;

    select cliente_id, profissional_id into v_sol
      from public.solicitacoes where id = v_cob.solicitacao_id;
    if v_sol.profissional_id is null then continue; end if;

    -- Recebimento (se ainda nao existe wallet_transaction tipo recebimento_etapa
    -- com essa referencia)
    if v_liquido > 0 and not exists (
      select 1 from public.wallet_transactions
      where referencia = v_cob.id::text and tipo = 'recebimento_etapa'
    ) then
      insert into public.wallets (user_id, saldo, saldo_bloqueado)
      values (v_sol.profissional_id, 0, 0)
      on conflict (user_id) do nothing;

      update public.wallets
      set saldo_bloqueado = saldo_bloqueado + v_liquido,
          updated_at = now()
      where user_id = v_sol.profissional_id;

      insert into public.wallet_transactions (
        user_id, tipo, valor, descricao, referencia
      ) values (
        v_sol.profissional_id, 'recebimento_etapa', v_liquido,
        'Recebimento recuperado - ' || coalesce(v_cob.titulo, v_cob.id::text),
        v_cob.id::text
      );
    end if;

    -- Se a cobranca esta em 'liberada' tambem libera o saldo agora
    if v_cob.status = 'liberada' and v_liquido > 0 and not exists (
      select 1 from public.wallet_transactions
      where referencia = v_cob.id::text and tipo = 'liberacao_escrow'
    ) then
      update public.wallets
      set saldo_bloqueado = greatest(0, saldo_bloqueado - v_liquido),
          saldo           = saldo + v_liquido,
          updated_at      = now()
      where user_id = v_sol.profissional_id;

      insert into public.wallet_transactions (
        user_id, tipo, valor, descricao, referencia
      ) values (
        v_sol.profissional_id, 'liberacao_escrow', v_liquido,
        'Liberacao recuperada - ' || coalesce(v_cob.titulo, v_cob.id::text),
        v_cob.id::text
      );
    end if;
  end loop;

  -- Para atendimentos JA concluidos com cobrancas ainda em 'paga',
  -- libera tudo agora.
  for v_cob in
    select c.* from public.cobrancas_atendimento c
    join public.planos_atendimento p on p.id = c.plano_id
    where c.status = 'paga' and p.status = 'concluido'
  loop
    perform public.fn_atendimento_liberar_cobranca_paga(v_cob.id, 'sistema');
  end loop;
end $$;
