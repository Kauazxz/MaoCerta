-- ============================================================
-- Exclusao de item exige aceite mutuo (cliente + profissional).
-- Quem solicita marca o campo exclusao_solicitada_por; o outro
-- lado aprova (vira cancelado) ou rejeita (limpa o campo).
-- ============================================================

alter table public.plano_itens_atendimento
  add column if not exists exclusao_solicitada_por uuid references public.profiles(id) on delete set null,
  add column if not exists exclusao_solicitada_em  timestamptz,
  add column if not exists exclusao_motivo         text;

-- ============================================================
-- 1) fn_solicitar_exclusao_item
-- ============================================================
create or replace function public.fn_solicitar_exclusao_item(
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
  v_eh_cliente boolean;
  v_eh_prof boolean;
begin
  if v_user is null then
    return json_build_object('ok', false, 'erro', 'nao_autenticado');
  end if;

  select * into v_item from public.plano_itens_atendimento where id = p_item_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'item_invalido');
  end if;

  v_eh_cliente := public.fn_atendimento_is_cliente(v_item.solicitacao_id);
  v_eh_prof    := public.fn_atendimento_is_profissional(v_item.solicitacao_id);
  if not (v_eh_cliente or v_eh_prof) then
    return json_build_object('ok', false, 'erro', 'sem_permissao');
  end if;

  if v_item.status in ('concluido','cancelado') then
    return json_build_object('ok', false, 'erro', 'item_ja_encerrado');
  end if;

  -- Se ha pagamento confirmado vinculado, nao permite exclusao
  if exists (
    select 1 from public.cobrancas_atendimento
    where item_id = p_item_id and status in ('paga','retida','liberada')
  ) then
    return json_build_object('ok', false, 'erro', 'item_pago_nao_pode_excluir');
  end if;

  -- Se ja' existe solicitacao do MESMO lado, e' no-op
  if v_item.exclusao_solicitada_por = v_user then
    return json_build_object('ok', true, 'duplicate', true);
  end if;

  update public.plano_itens_atendimento
  set exclusao_solicitada_por = v_user,
      exclusao_solicitada_em  = now(),
      exclusao_motivo         = nullif(trim(coalesce(p_motivo, '')), ''),
      updated_at              = now()
  where id = p_item_id;

  perform public.fn_criar_evento_atendimento(
    v_item.solicitacao_id, 'exclusao_solicitada',
    'Solicitada exclusao do item: ' || v_item.titulo,
    p_motivo,
    case when v_eh_cliente then 'cliente' else 'profissional' end,
    v_user, v_item.plano_id, v_item.id, null, null,
    jsonb_build_object('motivo', p_motivo)
  );

  return json_build_object('ok', true);
end;
$$;
revoke all on function public.fn_solicitar_exclusao_item(uuid, text) from public;
grant execute on function public.fn_solicitar_exclusao_item(uuid, text) to authenticated;

-- ============================================================
-- 2) fn_responder_exclusao_item
-- ============================================================
create or replace function public.fn_responder_exclusao_item(
  p_item_id uuid,
  p_aceitou boolean,
  p_motivo  text default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.plano_itens_atendimento;
  v_user uuid := auth.uid();
  v_eh_cliente boolean;
  v_eh_prof boolean;
begin
  if v_user is null then
    return json_build_object('ok', false, 'erro', 'nao_autenticado');
  end if;

  select * into v_item from public.plano_itens_atendimento where id = p_item_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'item_invalido');
  end if;
  if v_item.exclusao_solicitada_por is null then
    return json_build_object('ok', false, 'erro', 'sem_solicitacao_de_exclusao');
  end if;
  if v_item.exclusao_solicitada_por = v_user then
    return json_build_object('ok', false, 'erro', 'voce_solicitou');
  end if;

  v_eh_cliente := public.fn_atendimento_is_cliente(v_item.solicitacao_id);
  v_eh_prof    := public.fn_atendimento_is_profissional(v_item.solicitacao_id);
  if not (v_eh_cliente or v_eh_prof) then
    return json_build_object('ok', false, 'erro', 'sem_permissao');
  end if;

  if p_aceitou then
    update public.plano_itens_atendimento
    set status                  = 'cancelado',
        exclusao_solicitada_por = null,
        exclusao_solicitada_em  = null,
        updated_at              = now()
    where id = p_item_id;

    -- Cancela cobrancas pendentes (nao pagas) deste item
    update public.cobrancas_atendimento
    set status     = 'cancelada',
        updated_at = now()
    where item_id = p_item_id
      and status not in ('paga','retida','liberada');

    perform public.fn_criar_evento_atendimento(
      v_item.solicitacao_id, 'item_excluido',
      'Item excluido por acordo mutuo: ' || v_item.titulo, null,
      case when v_eh_cliente then 'cliente' else 'profissional' end,
      v_user, v_item.plano_id, v_item.id, null, null, '{}'::jsonb
    );
  else
    update public.plano_itens_atendimento
    set exclusao_solicitada_por = null,
        exclusao_solicitada_em  = null,
        exclusao_motivo         = null,
        updated_at              = now()
    where id = p_item_id;

    perform public.fn_criar_evento_atendimento(
      v_item.solicitacao_id, 'exclusao_rejeitada',
      'Exclusao rejeitada: ' || v_item.titulo, p_motivo,
      case when v_eh_cliente then 'cliente' else 'profissional' end,
      v_user, v_item.plano_id, v_item.id, null, null,
      jsonb_build_object('motivo', p_motivo)
    );
  end if;

  return json_build_object('ok', true, 'aceitou', p_aceitou);
end;
$$;
revoke all on function public.fn_responder_exclusao_item(uuid, boolean, text) from public;
grant execute on function public.fn_responder_exclusao_item(uuid, boolean, text) to authenticated;

-- ============================================================
-- 3) Estende fn_evento_para_mensagem (da 056) com os novos tipos
-- ============================================================
create or replace function public.fn_evento_para_mensagem(
  p_evento public.atendimento_eventos
) returns table (
  conteudo  text,
  deeplink  jsonb
)
language plpgsql
stable
as $$
declare
  v_texto text;
  v_link  jsonb;
begin
  v_link := jsonb_build_object(
    'evento_id', p_evento.id,
    'plano_id',  p_evento.plano_id,
    'item_id',   p_evento.item_id,
    'cobranca_id', p_evento.cobranca_id
  );

  v_texto := case p_evento.tipo_evento
    when 'plano_criado'                then '📋 ' || coalesce(p_evento.titulo, 'Plano criado')
    when 'item_enviado'                then '📨 ' || coalesce(p_evento.titulo, 'Nova proposta')
    when 'item_aceito_cliente'         then '✓ ' || coalesce(p_evento.titulo, 'Cliente aceitou a proposta')
    when 'item_recusado_cliente'       then '✗ ' || coalesce(p_evento.titulo, 'Cliente recusou a proposta')
    when 'item_alterado'               then '✏️ ' || coalesce(p_evento.titulo, 'Cliente pediu alteracao')
    when 'cobranca_criada'             then '💰 ' || coalesce(p_evento.titulo, 'Nova cobranca')
    when 'cobranca_extra_criada'       then '➕ ' || coalesce(p_evento.titulo, 'Cobranca extra')
    when 'cobranca_aceita'             then '✓ ' || coalesce(p_evento.titulo, 'Cobranca aceita')
    when 'cobranca_recusada'           then '✗ ' || coalesce(p_evento.titulo, 'Cobranca recusada')
    when 'pix_gerado'                  then '💠 ' || coalesce(p_evento.titulo, 'Pix gerado')
    when 'pagamento_confirmado'        then '✓ ' || coalesce(p_evento.titulo, 'Pagamento confirmado')
    when 'pagamento_liberado'          then '🏦 ' || coalesce(p_evento.titulo, 'Valor liberado para o profissional')
    when 'item_iniciado'               then '▶️ ' || coalesce(p_evento.titulo, 'Profissional iniciou a etapa')
    when 'item_executado_profissional' then '🔨 ' || coalesce(p_evento.titulo, 'Profissional marcou como executado')
    when 'item_confirmado_cliente'     then '👍 ' || coalesce(p_evento.titulo, 'Cliente confirmou a execucao')
    when 'item_contestado'             then '⚠️ ' || coalesce(p_evento.titulo, 'Cobranca contestada')
    when 'disputa_aberta'              then '⚠️ Disputa aberta'
    when 'exclusao_solicitada'         then '🗑️ ' || coalesce(p_evento.titulo, 'Solicitada exclusao de item')
    when 'item_excluido'               then '🗑️ ' || coalesce(p_evento.titulo, 'Item excluido por acordo mutuo')
    when 'exclusao_rejeitada'          then '↩️ ' || coalesce(p_evento.titulo, 'Exclusao rejeitada')
    when 'pronto_para_termo_final'     then '🏁 Atendimento pronto para conclusao'
    when 'atendimento_concluido'       then '✅ Atendimento concluido'
    when 'termo_gerado'                then '📝 Termo final gerado'
    when 'termo_assinado_cliente'      then '✍️ Cliente assinou o termo final'
    when 'avaliacao_realizada'         then '⭐ Avaliacao registrada'
    else null
  end;

  conteudo := v_texto;
  deeplink := v_link;
  return next;
end;
$$;
revoke all on function public.fn_evento_para_mensagem(public.atendimento_eventos) from public;
