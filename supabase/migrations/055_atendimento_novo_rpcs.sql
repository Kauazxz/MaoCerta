-- ============================================================
-- RPCs do novo motor de atendimento.
-- Todas SECURITY DEFINER, search_path=public, retornam json no formato
-- { ok: bool, ... }. Validam autorizacao e gravam evento no historico.
-- ============================================================

-- ============================================================
-- Helper interno: cria evento no historico
-- ============================================================
create or replace function public.fn_criar_evento_atendimento(
  p_solicitacao_id uuid,
  p_tipo_evento    text,
  p_titulo         text default null,
  p_descricao      text default null,
  p_ator_tipo      text default 'sistema',
  p_ator_id        uuid default null,
  p_plano_id       uuid default null,
  p_item_id        uuid default null,
  p_cobranca_id    uuid default null,
  p_pagamento_id   uuid default null,
  p_payload        jsonb default '{}',
  p_visibilidade   text default 'participantes'
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.atendimento_eventos (
    solicitacao_id, plano_id, item_id, cobranca_id, pagamento_id,
    ator_id, ator_tipo, tipo_evento, titulo, descricao, payload, visibilidade
  ) values (
    p_solicitacao_id, p_plano_id, p_item_id, p_cobranca_id, p_pagamento_id,
    p_ator_id, p_ator_tipo, p_tipo_evento, p_titulo, p_descricao, p_payload, p_visibilidade
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.fn_criar_evento_atendimento(uuid, text, text, text, text, uuid, uuid, uuid, uuid, uuid, jsonb, text) from public;

-- ============================================================
-- Helper interno: calcula comissao usando config existente
-- ============================================================
create or replace function public.fn_atendimento_calcular_comissao(
  p_valor numeric
) returns table (
  taxa_perc       numeric,
  taxa_valor      numeric,
  liquido_prof    numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pct numeric(5,2);
begin
  select coalesce(comissao_percentual, 10)::numeric(5,2)
    into v_pct
    from public.config_financeiro
    where id = 1;
  if v_pct is null then v_pct := 10; end if;
  taxa_perc    := v_pct;
  taxa_valor   := round(p_valor * v_pct / 100.0, 2);
  liquido_prof := round(p_valor - taxa_valor, 2);
  return next;
end;
$$;
revoke all on function public.fn_atendimento_calcular_comissao(numeric) from public;

-- ============================================================
-- Helper interno: cria cobranca pre-aceita (usado por fn_aceitar_item)
-- e por fn_criar_cobranca_extra. Devolve cobranca_id.
-- ============================================================
create or replace function public.fn_atendimento_criar_cobranca_interna(
  p_solicitacao_id uuid,
  p_plano_id       uuid,
  p_item_id        uuid,
  p_tipo           text,
  p_titulo         text,
  p_descricao      text,
  p_valor          numeric,
  p_status_inicial text,
  p_criado_por     uuid,
  p_metadata       jsonb default '{}'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_comissao record;
begin
  if p_valor is null or p_valor <= 0 then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;

  select * into v_comissao from public.fn_atendimento_calcular_comissao(p_valor);

  insert into public.cobrancas_atendimento (
    solicitacao_id, plano_id, item_id, tipo, titulo, descricao,
    valor, valor_bruto, taxa_plataforma_percentual,
    valor_taxa_plataforma, valor_liquido_profissional,
    status, criado_por, metadata
  ) values (
    p_solicitacao_id, p_plano_id, p_item_id, p_tipo, p_titulo, p_descricao,
    p_valor, p_valor, v_comissao.taxa_perc,
    v_comissao.taxa_valor, v_comissao.liquido_prof,
    p_status_inicial, p_criado_por, p_metadata
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.fn_atendimento_criar_cobranca_interna(uuid, uuid, uuid, text, text, text, numeric, text, uuid, jsonb) from public;

-- ============================================================
-- Helper: valida que o caller e' profissional da solicitacao
-- ============================================================
create or replace function public.fn_atendimento_is_profissional(p_solicitacao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.solicitacoes
    where id = p_solicitacao_id and profissional_id = auth.uid()
  );
$$;
revoke all on function public.fn_atendimento_is_profissional(uuid) from public;

create or replace function public.fn_atendimento_is_cliente(p_solicitacao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.solicitacoes
    where id = p_solicitacao_id and cliente_id = auth.uid()
  );
$$;
revoke all on function public.fn_atendimento_is_cliente(uuid) from public;

-- ============================================================
-- 1) fn_criar_plano_atendimento (profissional)
-- ============================================================
create or replace function public.fn_criar_plano_atendimento(
  p_solicitacao_id uuid,
  p_titulo         text,
  p_descricao      text,
  p_modelo         text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return json_build_object('ok', false, 'erro', 'nao_autenticado');
  end if;
  if not public.fn_atendimento_is_profissional(p_solicitacao_id) then
    return json_build_object('ok', false, 'erro', 'apenas_profissional');
  end if;
  if exists (
    select 1 from public.planos_atendimento
    where solicitacao_id = p_solicitacao_id
      and status in ('rascunho','em_negociacao','ativo')
  ) then
    return json_build_object('ok', false, 'erro', 'ja_existe_plano_ativo');
  end if;

  insert into public.planos_atendimento (
    solicitacao_id, titulo, descricao, modelo, status, criado_por
  ) values (
    p_solicitacao_id, p_titulo, p_descricao, p_modelo, 'em_negociacao', v_user
  )
  returning id into v_id;

  perform public.fn_criar_evento_atendimento(
    p_solicitacao_id, 'plano_criado',
    'Plano criado: ' || p_titulo, p_descricao,
    'profissional', v_user, v_id, null, null, null,
    jsonb_build_object('modelo', p_modelo)
  );

  return json_build_object('ok', true, 'plano_id', v_id);
end;
$$;
revoke all on function public.fn_criar_plano_atendimento(uuid, text, text, text) from public;
grant execute on function public.fn_criar_plano_atendimento(uuid, text, text, text) to authenticated;

-- ============================================================
-- 2) fn_criar_item_plano (profissional)
-- ============================================================
create or replace function public.fn_criar_item_plano(
  p_plano_id          uuid,
  p_tipo              text,
  p_titulo            text,
  p_descricao         text,
  p_unidade           text,
  p_quantidade_prevista numeric,
  p_valor_unitario    numeric,
  p_valor_total_previsto numeric,
  p_momento_pagamento text,
  p_requer_pag_iniciar boolean,
  p_obrigatorio       boolean,
  p_metadata          jsonb default '{}'
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano public.planos_atendimento;
  v_id uuid;
  v_ordem int;
  v_user uuid := auth.uid();
begin
  select * into v_plano from public.planos_atendimento where id = p_plano_id;
  if not found then
    return json_build_object('ok', false, 'erro', 'plano_invalido');
  end if;
  if not public.fn_atendimento_is_profissional(v_plano.solicitacao_id) then
    return json_build_object('ok', false, 'erro', 'apenas_profissional');
  end if;
  if v_plano.status in ('concluido','cancelado') then
    return json_build_object('ok', false, 'erro', 'plano_encerrado');
  end if;

  select coalesce(max(ordem), 0) + 1 into v_ordem
    from public.plano_itens_atendimento where plano_id = p_plano_id;

  insert into public.plano_itens_atendimento (
    plano_id, solicitacao_id, tipo, titulo, descricao, ordem, unidade,
    quantidade_prevista, valor_unitario, valor_total_previsto,
    momento_pagamento, requer_pagamento_para_iniciar, obrigatorio,
    status, criado_por, metadata
  ) values (
    p_plano_id, v_plano.solicitacao_id, p_tipo, p_titulo, p_descricao, v_ordem, p_unidade,
    p_quantidade_prevista, p_valor_unitario, p_valor_total_previsto,
    p_momento_pagamento, coalesce(p_requer_pag_iniciar, false), coalesce(p_obrigatorio, true),
    'rascunho', v_user, p_metadata
  )
  returning id into v_id;

  return json_build_object('ok', true, 'item_id', v_id);
end;
$$;
revoke all on function public.fn_criar_item_plano(uuid, text, text, text, text, numeric, numeric, numeric, text, boolean, boolean, jsonb) from public;
grant execute on function public.fn_criar_item_plano(uuid, text, text, text, text, numeric, numeric, numeric, text, boolean, boolean, jsonb) to authenticated;

-- ============================================================
-- 3) fn_enviar_proposta_item (profissional)
--    Quem cria/envia ja conta como aceite do profissional.
-- ============================================================
create or replace function public.fn_enviar_proposta_item(
  p_item_id uuid
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.plano_itens_atendimento;
  v_user uuid := auth.uid();
begin
  select * into v_item from public.plano_itens_atendimento where id = p_item_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'item_invalido');
  end if;
  if not public.fn_atendimento_is_profissional(v_item.solicitacao_id) then
    return json_build_object('ok', false, 'erro', 'apenas_profissional');
  end if;
  if v_item.status <> 'rascunho' then
    return json_build_object('ok', false, 'erro', 'status_invalido');
  end if;

  update public.plano_itens_atendimento
  set status = 'enviado',
      aceito_profissional_at = now(),
      updated_at = now()
  where id = p_item_id;

  -- Garante plano ativo
  update public.planos_atendimento
  set status = 'ativo', updated_at = now()
  where id = v_item.plano_id and status = 'em_negociacao';

  perform public.fn_criar_evento_atendimento(
    v_item.solicitacao_id, 'item_enviado',
    'Proposta enviada: ' || v_item.titulo,
    null, 'profissional', v_user,
    v_item.plano_id, v_item.id, null, null,
    jsonb_build_object(
      'tipo', v_item.tipo,
      'valor_total_previsto', v_item.valor_total_previsto,
      'momento_pagamento', v_item.momento_pagamento
    )
  );

  return json_build_object('ok', true);
end;
$$;
revoke all on function public.fn_enviar_proposta_item(uuid) from public;
grant execute on function public.fn_enviar_proposta_item(uuid) to authenticated;

-- ============================================================
-- 4) fn_aceitar_item_plano (cliente)
--    Se momento_pagamento='antes', ja cria cobranca em aguardando_pagamento.
-- ============================================================
create or replace function public.fn_aceitar_item_plano(
  p_item_id uuid
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.plano_itens_atendimento;
  v_cobranca_id uuid;
  v_user uuid := auth.uid();
begin
  select * into v_item from public.plano_itens_atendimento where id = p_item_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'item_invalido');
  end if;
  if not public.fn_atendimento_is_cliente(v_item.solicitacao_id) then
    return json_build_object('ok', false, 'erro', 'apenas_cliente');
  end if;
  if v_item.status <> 'enviado' then
    return json_build_object('ok', false, 'erro', 'status_invalido');
  end if;

  update public.plano_itens_atendimento
  set status = case
        when v_item.momento_pagamento = 'antes' then 'aguardando_pagamento'
        else 'aceito'
      end,
      aceito_cliente_at = now(),
      updated_at = now()
  where id = p_item_id;

  -- Cria cobranca automatica se pagamento e' antes
  if v_item.momento_pagamento = 'antes' then
    v_cobranca_id := public.fn_atendimento_criar_cobranca_interna(
      v_item.solicitacao_id, v_item.plano_id, v_item.id,
      case v_item.tipo when 'vistoria' then 'vistoria' when 'sinal' then 'sinal' else 'base' end,
      v_item.titulo, v_item.descricao,
      coalesce(v_item.valor_total_previsto, v_item.valor_unitario),
      'aceita', v_user,
      jsonb_build_object('aceite_automatico_no_aceite_item', true)
    );
    -- Marca aceites automaticos da cobranca (vinculada ao aceite do item)
    update public.cobrancas_atendimento
    set aceite_cliente_at = now(),
        aceite_profissional_at = now()
    where id = v_cobranca_id;
  end if;

  perform public.fn_criar_evento_atendimento(
    v_item.solicitacao_id, 'item_aceito_cliente',
    'Cliente aceitou: ' || v_item.titulo,
    null, 'cliente', v_user,
    v_item.plano_id, v_item.id, v_cobranca_id, null,
    jsonb_build_object('cobranca_criada', v_cobranca_id is not null)
  );

  return json_build_object('ok', true, 'cobranca_id', v_cobranca_id);
end;
$$;
revoke all on function public.fn_aceitar_item_plano(uuid) from public;
grant execute on function public.fn_aceitar_item_plano(uuid) to authenticated;

-- ============================================================
-- 5) fn_recusar_item_plano (cliente)
-- ============================================================
create or replace function public.fn_recusar_item_plano(
  p_item_id uuid,
  p_motivo  text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.plano_itens_atendimento;
  v_user uuid := auth.uid();
begin
  select * into v_item from public.plano_itens_atendimento where id = p_item_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'item_invalido');
  end if;
  if not public.fn_atendimento_is_cliente(v_item.solicitacao_id) then
    return json_build_object('ok', false, 'erro', 'apenas_cliente');
  end if;
  if v_item.status <> 'enviado' then
    return json_build_object('ok', false, 'erro', 'status_invalido');
  end if;

  update public.plano_itens_atendimento
  set status = 'recusado', updated_at = now()
  where id = p_item_id;

  perform public.fn_criar_evento_atendimento(
    v_item.solicitacao_id, 'item_recusado_cliente',
    'Cliente recusou: ' || v_item.titulo, p_motivo,
    'cliente', v_user, v_item.plano_id, v_item.id, null, null,
    jsonb_build_object('motivo', p_motivo)
  );
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.fn_recusar_item_plano(uuid, text) from public;
grant execute on function public.fn_recusar_item_plano(uuid, text) to authenticated;

-- ============================================================
-- 6) fn_pedir_alteracao_item (cliente)
--    Volta para rascunho com sugestao no payload do evento.
-- ============================================================
create or replace function public.fn_pedir_alteracao_item(
  p_item_id uuid,
  p_sugestao jsonb
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.plano_itens_atendimento;
  v_user uuid := auth.uid();
begin
  select * into v_item from public.plano_itens_atendimento where id = p_item_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'item_invalido');
  end if;
  if not public.fn_atendimento_is_cliente(v_item.solicitacao_id) then
    return json_build_object('ok', false, 'erro', 'apenas_cliente');
  end if;
  if v_item.status <> 'enviado' then
    return json_build_object('ok', false, 'erro', 'status_invalido');
  end if;

  update public.plano_itens_atendimento
  set status = 'rascunho',
      aceito_profissional_at = null,
      updated_at = now()
  where id = p_item_id;

  perform public.fn_criar_evento_atendimento(
    v_item.solicitacao_id, 'item_alterado',
    'Cliente pediu alteracao em: ' || v_item.titulo, null,
    'cliente', v_user, v_item.plano_id, v_item.id, null, null,
    coalesce(p_sugestao, '{}'::jsonb)
  );
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.fn_pedir_alteracao_item(uuid, jsonb) from public;
grant execute on function public.fn_pedir_alteracao_item(uuid, jsonb) to authenticated;

-- ============================================================
-- 7) fn_iniciar_item_plano (profissional)
--    Valida: se requer_pagamento_para_iniciar, cobranca vinculada
--    precisa estar paga.
-- ============================================================
create or replace function public.fn_iniciar_item_plano(
  p_item_id uuid
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.plano_itens_atendimento;
  v_user uuid := auth.uid();
  v_cob_paga int;
begin
  select * into v_item from public.plano_itens_atendimento where id = p_item_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'item_invalido');
  end if;
  if not public.fn_atendimento_is_profissional(v_item.solicitacao_id) then
    return json_build_object('ok', false, 'erro', 'apenas_profissional');
  end if;
  if v_item.status not in ('aceito','pago','pronto_para_iniciar') then
    return json_build_object('ok', false, 'erro', 'status_invalido');
  end if;
  if v_item.requer_pagamento_para_iniciar then
    select count(*) into v_cob_paga
      from public.cobrancas_atendimento
      where item_id = p_item_id and status in ('paga','retida','liberada');
    if v_cob_paga = 0 then
      return json_build_object('ok', false, 'erro', 'aguardando_pagamento_para_iniciar');
    end if;
  end if;

  update public.plano_itens_atendimento
  set status = 'em_execucao',
      inicio_real = coalesce(v_item.inicio_real, now()),
      updated_at = now()
  where id = p_item_id;

  perform public.fn_criar_evento_atendimento(
    v_item.solicitacao_id, 'item_iniciado',
    'Profissional iniciou: ' || v_item.titulo, null,
    'profissional', v_user, v_item.plano_id, v_item.id, null, null, '{}'::jsonb
  );
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.fn_iniciar_item_plano(uuid) from public;
grant execute on function public.fn_iniciar_item_plano(uuid) to authenticated;

-- ============================================================
-- 8) fn_marcar_item_executado (profissional)
-- ============================================================
create or replace function public.fn_marcar_item_executado(
  p_item_id uuid,
  p_quantidade_realizada numeric default null,
  p_notas text default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.plano_itens_atendimento;
  v_user uuid := auth.uid();
begin
  select * into v_item from public.plano_itens_atendimento where id = p_item_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'item_invalido');
  end if;
  if not public.fn_atendimento_is_profissional(v_item.solicitacao_id) then
    return json_build_object('ok', false, 'erro', 'apenas_profissional');
  end if;
  if v_item.status <> 'em_execucao' then
    return json_build_object('ok', false, 'erro', 'status_invalido');
  end if;

  update public.plano_itens_atendimento
  set status = 'executado_pelo_profissional',
      fim_real = now(),
      quantidade_realizada = coalesce(p_quantidade_realizada, quantidade_realizada),
      confirmado_profissional_at = now(),
      updated_at = now()
  where id = p_item_id;

  perform public.fn_criar_evento_atendimento(
    v_item.solicitacao_id, 'item_executado_profissional',
    'Profissional marcou como executado: ' || v_item.titulo, p_notas,
    'profissional', v_user, v_item.plano_id, v_item.id, null, null,
    jsonb_build_object('quantidade_realizada', p_quantidade_realizada)
  );
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.fn_marcar_item_executado(uuid, numeric, text) from public;
grant execute on function public.fn_marcar_item_executado(uuid, numeric, text) to authenticated;

-- ============================================================
-- 9) fn_confirmar_execucao_item (cliente)
--    Se momento_pagamento in ('depois','por_confirmacao','final'),
--    cria cobranca em aguardando_aceite (cliente ainda precisa aceitar
--    a cobranca formalmente para gerar Pix).
-- ============================================================
create or replace function public.fn_confirmar_execucao_item(
  p_item_id uuid
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.plano_itens_atendimento;
  v_user uuid := auth.uid();
  v_cobranca_id uuid;
begin
  select * into v_item from public.plano_itens_atendimento where id = p_item_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'item_invalido');
  end if;
  if not public.fn_atendimento_is_cliente(v_item.solicitacao_id) then
    return json_build_object('ok', false, 'erro', 'apenas_cliente');
  end if;
  if v_item.status <> 'executado_pelo_profissional' then
    return json_build_object('ok', false, 'erro', 'status_invalido');
  end if;

  -- Cria cobranca se ainda nao houver e o momento_pagamento exige
  if v_item.momento_pagamento in ('depois','por_confirmacao','final')
     and not exists (
       select 1 from public.cobrancas_atendimento
       where item_id = p_item_id and status not in ('cancelada','expirada','recusada')
     ) then
    v_cobranca_id := public.fn_atendimento_criar_cobranca_interna(
      v_item.solicitacao_id, v_item.plano_id, v_item.id,
      case v_item.tipo when 'diaria' then 'diaria' when 'hora' then 'hora'
                       when 'final' then 'final' else 'base' end,
      v_item.titulo,
      coalesce(v_item.descricao, 'Cobranca da etapa executada'),
      coalesce(v_item.valor_total_final, v_item.valor_total_previsto, v_item.valor_unitario),
      'aguardando_aceite', v_user, '{}'::jsonb
    );
  end if;

  update public.plano_itens_atendimento
  set status = case
        when v_cobranca_id is not null then 'aguardando_pagamento_final'
        else 'confirmado_pelo_cliente'
      end,
      confirmado_cliente_at = now(),
      updated_at = now()
  where id = p_item_id;

  perform public.fn_criar_evento_atendimento(
    v_item.solicitacao_id, 'item_confirmado_cliente',
    'Cliente confirmou: ' || v_item.titulo, null,
    'cliente', v_user, v_item.plano_id, v_item.id, v_cobranca_id, null,
    jsonb_build_object('cobranca_criada', v_cobranca_id is not null)
  );
  return json_build_object('ok', true, 'cobranca_id', v_cobranca_id);
end;
$$;
revoke all on function public.fn_confirmar_execucao_item(uuid) from public;
grant execute on function public.fn_confirmar_execucao_item(uuid) to authenticated;

-- ============================================================
-- 10) fn_contestar_item (cliente)
-- ============================================================
create or replace function public.fn_contestar_item(
  p_item_id uuid,
  p_motivo  text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.plano_itens_atendimento;
  v_user uuid := auth.uid();
begin
  select * into v_item from public.plano_itens_atendimento where id = p_item_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'item_invalido');
  end if;
  if not public.fn_atendimento_is_cliente(v_item.solicitacao_id) then
    return json_build_object('ok', false, 'erro', 'apenas_cliente');
  end if;
  if v_item.status not in ('executado_pelo_profissional', 'em_execucao', 'aguardando_pagamento_final', 'confirmado_pelo_cliente') then
    return json_build_object('ok', false, 'erro', 'status_invalido');
  end if;

  update public.plano_itens_atendimento
  set status = 'contestado', updated_at = now()
  where id = p_item_id;

  -- Coloca plano em disputa
  update public.planos_atendimento
  set status = 'em_disputa', updated_at = now()
  where id = v_item.plano_id;

  perform public.fn_criar_evento_atendimento(
    v_item.solicitacao_id, 'item_contestado',
    'Cliente contestou: ' || v_item.titulo, p_motivo,
    'cliente', v_user, v_item.plano_id, v_item.id, null, null,
    jsonb_build_object('motivo', p_motivo)
  );

  perform public.fn_criar_evento_atendimento(
    v_item.solicitacao_id, 'disputa_aberta',
    'Disputa aberta', p_motivo,
    'cliente', v_user, v_item.plano_id, v_item.id, null, null, '{}'::jsonb
  );
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.fn_contestar_item(uuid, text) from public;
grant execute on function public.fn_contestar_item(uuid, text) to authenticated;

-- ============================================================
-- 11) fn_criar_cobranca_extra (profissional)
--    Cobranca extra SEMPRE precisa de aceite do cliente.
-- ============================================================
create or replace function public.fn_criar_cobranca_extra(
  p_solicitacao_id uuid,
  p_item_id        uuid,
  p_titulo         text,
  p_descricao      text,
  p_valor          numeric
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_user uuid := auth.uid();
  v_plano_id uuid;
begin
  if not public.fn_atendimento_is_profissional(p_solicitacao_id) then
    return json_build_object('ok', false, 'erro', 'apenas_profissional');
  end if;
  if p_valor is null or p_valor <= 0 then
    return json_build_object('ok', false, 'erro', 'valor_invalido');
  end if;

  select id into v_plano_id from public.planos_atendimento
    where solicitacao_id = p_solicitacao_id
      and status in ('ativo','em_negociacao')
    order by created_at desc limit 1;

  v_id := public.fn_atendimento_criar_cobranca_interna(
    p_solicitacao_id, v_plano_id, p_item_id,
    'extra', p_titulo, p_descricao,
    p_valor, 'aguardando_aceite', v_user,
    jsonb_build_object('extra', true)
  );

  perform public.fn_criar_evento_atendimento(
    p_solicitacao_id, 'cobranca_extra_criada',
    'Profissional criou cobranca extra: ' || p_titulo, p_descricao,
    'profissional', v_user, v_plano_id, p_item_id, v_id, null,
    jsonb_build_object('valor', p_valor)
  );
  return json_build_object('ok', true, 'cobranca_id', v_id);
end;
$$;
revoke all on function public.fn_criar_cobranca_extra(uuid, uuid, text, text, numeric) from public;
grant execute on function public.fn_criar_cobranca_extra(uuid, uuid, text, text, numeric) to authenticated;

-- ============================================================
-- 12) fn_aceitar_cobranca_atendimento (cliente)
-- ============================================================
create or replace function public.fn_aceitar_cobranca_atendimento(
  p_cobranca_id uuid
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cob public.cobrancas_atendimento;
  v_user uuid := auth.uid();
begin
  select * into v_cob from public.cobrancas_atendimento where id = p_cobranca_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'cobranca_invalida');
  end if;
  if not public.fn_atendimento_is_cliente(v_cob.solicitacao_id) then
    return json_build_object('ok', false, 'erro', 'apenas_cliente');
  end if;
  if v_cob.status <> 'aguardando_aceite' then
    return json_build_object('ok', false, 'erro', 'status_invalido');
  end if;

  update public.cobrancas_atendimento
  set status = 'aceita',
      aceite_cliente_at = now(),
      aceite_profissional_at = coalesce(aceite_profissional_at, now()),
      updated_at = now()
  where id = p_cobranca_id;

  perform public.fn_criar_evento_atendimento(
    v_cob.solicitacao_id, 'cobranca_aceita',
    'Cliente aceitou cobranca: ' || v_cob.titulo, null,
    'cliente', v_user, v_cob.plano_id, v_cob.item_id, v_cob.id, null,
    jsonb_build_object('valor', v_cob.valor)
  );
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.fn_aceitar_cobranca_atendimento(uuid) from public;
grant execute on function public.fn_aceitar_cobranca_atendimento(uuid) to authenticated;

-- ============================================================
-- 13) fn_recusar_cobranca_atendimento (cliente)
-- ============================================================
create or replace function public.fn_recusar_cobranca_atendimento(
  p_cobranca_id uuid,
  p_motivo      text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cob public.cobrancas_atendimento;
  v_user uuid := auth.uid();
begin
  select * into v_cob from public.cobrancas_atendimento where id = p_cobranca_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'cobranca_invalida');
  end if;
  if not public.fn_atendimento_is_cliente(v_cob.solicitacao_id) then
    return json_build_object('ok', false, 'erro', 'apenas_cliente');
  end if;
  if v_cob.status <> 'aguardando_aceite' then
    return json_build_object('ok', false, 'erro', 'status_invalido');
  end if;

  update public.cobrancas_atendimento
  set status = 'cancelada',
      motivo_recusa = p_motivo,
      updated_at = now()
  where id = p_cobranca_id;

  perform public.fn_criar_evento_atendimento(
    v_cob.solicitacao_id, 'cobranca_recusada',
    'Cliente recusou cobranca: ' || v_cob.titulo, p_motivo,
    'cliente', v_user, v_cob.plano_id, v_cob.item_id, v_cob.id, null,
    jsonb_build_object('motivo', p_motivo)
  );
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.fn_recusar_cobranca_atendimento(uuid, text) from public;
grant execute on function public.fn_recusar_cobranca_atendimento(uuid, text) to authenticated;

-- ============================================================
-- 14) fn_marcar_cobranca_paga (webhook MP - service_role)
--    Idempotente: ignora se ja estiver paga/retida/liberada.
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

  -- Se a cobranca esta atrelada a um item, evolui o item
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

  perform public.fn_criar_evento_atendimento(
    v_cob.solicitacao_id, 'pagamento_confirmado',
    'Pagamento confirmado: ' || v_cob.titulo, null,
    'sistema', null, v_cob.plano_id, v_cob.item_id, v_cob.id, null,
    jsonb_build_object('valor', v_cob.valor, 'mp_payment_id', p_mp_payment_id)
  );
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.fn_marcar_cobranca_paga(uuid, text) from public;
-- Sem grant para authenticated: so service_role do webhook chama.

-- ============================================================
-- 15) fn_liberar_cobranca (sistema/admin - libera escrow)
-- ============================================================
create or replace function public.fn_liberar_cobranca(
  p_cobranca_id uuid
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cob public.cobrancas_atendimento;
  v_user uuid := auth.uid();
begin
  select * into v_cob from public.cobrancas_atendimento where id = p_cobranca_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'cobranca_invalida');
  end if;
  if v_cob.status not in ('paga','retida') then
    return json_build_object('ok', false, 'erro', 'status_invalido');
  end if;
  if not public.is_administrator()
     and not public.fn_atendimento_is_cliente(v_cob.solicitacao_id) then
    return json_build_object('ok', false, 'erro', 'sem_permissao');
  end if;

  update public.cobrancas_atendimento
  set status = 'liberada',
      liberado_em = now(),
      updated_at = now()
  where id = p_cobranca_id;

  perform public.fn_criar_evento_atendimento(
    v_cob.solicitacao_id, 'pagamento_liberado',
    'Pagamento liberado para o profissional: ' || v_cob.titulo, null,
    case when public.is_administrator() then 'admin' else 'cliente' end,
    v_user, v_cob.plano_id, v_cob.item_id, v_cob.id, null,
    jsonb_build_object('valor_liquido', v_cob.valor_liquido_profissional)
  );
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.fn_liberar_cobranca(uuid) from public;
grant execute on function public.fn_liberar_cobranca(uuid) to authenticated;

-- ============================================================
-- 16) fn_tentar_concluir_atendimento (cliente OU sistema)
--    F1: NAO conclui sem termo final (que vem na F3).
--    Esta funcao apenas valida que tudo esta pronto, deixa o atendimento
--    em estado "aguardando_termo_final" para a F3 fechar.
-- ============================================================
create or replace function public.fn_tentar_concluir_atendimento(
  p_solicitacao_id uuid
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pendentes int;
  v_cob_pendente int;
  v_disputa int;
begin
  if not (public.fn_atendimento_is_cliente(p_solicitacao_id)
          or public.fn_atendimento_is_profissional(p_solicitacao_id)
          or public.is_administrator()) then
    return json_build_object('ok', false, 'erro', 'sem_permissao');
  end if;

  select count(*) into v_pendentes
    from public.plano_itens_atendimento
    where solicitacao_id = p_solicitacao_id
      and obrigatorio = true
      and status not in ('concluido','cancelado','confirmado_pelo_cliente');

  select count(*) into v_cob_pendente
    from public.cobrancas_atendimento
    where solicitacao_id = p_solicitacao_id
      and status not in ('paga','retida','liberada','cancelada','expirada');

  select count(*) into v_disputa
    from public.planos_atendimento
    where solicitacao_id = p_solicitacao_id and status = 'em_disputa';

  if v_pendentes > 0 then
    return json_build_object('ok', false, 'erro', 'itens_obrigatorios_abertos',
                             'pendentes', v_pendentes);
  end if;
  if v_cob_pendente > 0 then
    return json_build_object('ok', false, 'erro', 'cobrancas_pendentes',
                             'pendentes', v_cob_pendente);
  end if;
  if v_disputa > 0 then
    return json_build_object('ok', false, 'erro', 'disputa_aberta');
  end if;

  -- Tudo OK: F1 sinaliza "pronto para termo final" sem concluir formalmente.
  perform public.fn_criar_evento_atendimento(
    p_solicitacao_id, 'pronto_para_termo_final',
    'Atendimento pronto para gerar termo final', null,
    'sistema', v_user, null, null, null, null, '{}'::jsonb
  );
  return json_build_object('ok', true, 'pronto_para_termo', true);
end;
$$;
revoke all on function public.fn_tentar_concluir_atendimento(uuid) from public;
grant execute on function public.fn_tentar_concluir_atendimento(uuid) to authenticated;

-- ============================================================
-- 17) fn_buscar_atendimento_completo (helper de leitura)
-- ============================================================
create or replace function public.fn_buscar_atendimento_completo(
  p_solicitacao_id uuid
) returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_plano   json;
  v_itens   json;
  v_cobs    json;
  v_evts    json;
begin
  if not (public.fn_atendimento_is_cliente(p_solicitacao_id)
          or public.fn_atendimento_is_profissional(p_solicitacao_id)
          or public.is_administrator()) then
    return json_build_object('ok', false, 'erro', 'sem_permissao');
  end if;

  select row_to_json(p) into v_plano
    from public.planos_atendimento p
    where solicitacao_id = p_solicitacao_id
    order by created_at desc limit 1;

  select coalesce(json_agg(row_to_json(i) order by i.ordem), '[]'::json) into v_itens
    from public.plano_itens_atendimento i
    where solicitacao_id = p_solicitacao_id;

  select coalesce(json_agg(row_to_json(c) order by c.created_at desc), '[]'::json) into v_cobs
    from public.cobrancas_atendimento c
    where solicitacao_id = p_solicitacao_id;

  select coalesce(json_agg(row_to_json(e) order by e.created_at desc), '[]'::json) into v_evts
    from public.atendimento_eventos e
    where solicitacao_id = p_solicitacao_id
      and (e.visibilidade = 'participantes' or public.is_administrator());

  return json_build_object(
    'ok', true,
    'plano', v_plano,
    'itens', v_itens,
    'cobrancas', v_cobs,
    'eventos', v_evts
  );
end;
$$;
revoke all on function public.fn_buscar_atendimento_completo(uuid) from public;
grant execute on function public.fn_buscar_atendimento_completo(uuid) to authenticated;
