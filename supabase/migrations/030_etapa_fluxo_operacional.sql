-- ============================================================
-- Fase 2 - Fluxo operacional do atendimento
--
-- Acrescenta ao enum status_etapa os estados:
--   - finalizada_prestador (prestador disse "terminei", aguardando cliente)
--   - contestada (cliente abriu disputa)
--
-- E adiciona 4 funcoes RPC para transicionar a etapa:
--   - fn_etapa_iniciar           : agendada -> em_progresso (so' prestador)
--   - fn_etapa_finalizar_prestador: em_progresso -> finalizada_prestador (so' prestador)
--   - fn_etapa_aceitar_conclusao : finalizada_prestador -> concluida (so' cliente)
--   - fn_etapa_contestar         : finalizada_prestador -> contestada (so' cliente)
--
-- Aceitar conclusao tambem marca cliente_confirmou + profissional_confirmou.
-- O gatilho de liberacao financeira (escrow) ja existe no schema atual
-- e dispara pela mudanca de status.
-- ============================================================

-- 1) Acrescenta valores ao enum (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_enum e on t.oid = e.enumtypid
    where t.typname = 'status_etapa' and e.enumlabel = 'finalizada_prestador'
  ) then
    alter type public.status_etapa add value 'finalizada_prestador';
  end if;
  if not exists (
    select 1 from pg_type t join pg_enum e on t.oid = e.enumtypid
    where t.typname = 'status_etapa' and e.enumlabel = 'contestada'
  ) then
    alter type public.status_etapa add value 'contestada';
  end if;
end $$;

-- 2) fn_etapa_iniciar -------------------------------------------------------
create or replace function public.fn_etapa_iniciar(p_etapa_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapa record;
  v_sol record;
begin
  select * into v_etapa from public.etapas_atendimento where id = p_etapa_id;
  if not found then return json_build_object('ok', false, 'erro', 'etapa_invalida'); end if;

  select * into v_sol from public.solicitacoes where id = v_etapa.solicitacao_id;
  if v_sol.profissional_id <> auth.uid() then
    return json_build_object('ok', false, 'erro', 'apenas_prestador');
  end if;

  if v_etapa.status not in ('pendente'::public.status_etapa, 'agendada'::public.status_etapa) then
    return json_build_object('ok', false, 'erro', 'estado_invalido');
  end if;

  update public.etapas_atendimento
  set status = 'em_progresso'::public.status_etapa, updated_at = now()
  where id = p_etapa_id;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.fn_etapa_iniciar(uuid) from public;
grant execute on function public.fn_etapa_iniciar(uuid) to authenticated;

-- 3) fn_etapa_finalizar_prestador -------------------------------------------
create or replace function public.fn_etapa_finalizar_prestador(p_etapa_id uuid, p_notas text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapa record;
  v_sol record;
begin
  select * into v_etapa from public.etapas_atendimento where id = p_etapa_id;
  if not found then return json_build_object('ok', false, 'erro', 'etapa_invalida'); end if;

  select * into v_sol from public.solicitacoes where id = v_etapa.solicitacao_id;
  if v_sol.profissional_id <> auth.uid() then
    return json_build_object('ok', false, 'erro', 'apenas_prestador');
  end if;

  if v_etapa.status <> 'em_progresso'::public.status_etapa then
    return json_build_object('ok', false, 'erro', 'estado_invalido');
  end if;

  update public.etapas_atendimento
  set status = 'finalizada_prestador'::public.status_etapa,
      profissional_confirmou = true,
      data_confirmacao_profissional = now(),
      notas_conclusao = coalesce(nullif(trim(p_notas), ''), notas_conclusao),
      updated_at = now()
  where id = p_etapa_id;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.fn_etapa_finalizar_prestador(uuid, text) from public;
grant execute on function public.fn_etapa_finalizar_prestador(uuid, text) to authenticated;

-- 4) fn_etapa_aceitar_conclusao ---------------------------------------------
create or replace function public.fn_etapa_aceitar_conclusao(p_etapa_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapa record;
  v_sol record;
begin
  select * into v_etapa from public.etapas_atendimento where id = p_etapa_id;
  if not found then return json_build_object('ok', false, 'erro', 'etapa_invalida'); end if;

  select * into v_sol from public.solicitacoes where id = v_etapa.solicitacao_id;
  if v_sol.cliente_id <> auth.uid() then
    return json_build_object('ok', false, 'erro', 'apenas_cliente');
  end if;

  if v_etapa.status <> 'finalizada_prestador'::public.status_etapa then
    return json_build_object('ok', false, 'erro', 'estado_invalido');
  end if;

  update public.etapas_atendimento
  set status = 'concluida'::public.status_etapa,
      cliente_confirmou = true,
      data_confirmacao_cliente = now(),
      updated_at = now()
  where id = p_etapa_id;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.fn_etapa_aceitar_conclusao(uuid) from public;
grant execute on function public.fn_etapa_aceitar_conclusao(uuid) to authenticated;

-- 5) fn_etapa_contestar ------------------------------------------------------
create or replace function public.fn_etapa_contestar(p_etapa_id uuid, p_motivo text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapa record;
  v_sol record;
  v_disputa_id uuid;
  v_pag record;
begin
  select * into v_etapa from public.etapas_atendimento where id = p_etapa_id;
  if not found then return json_build_object('ok', false, 'erro', 'etapa_invalida'); end if;

  select * into v_sol from public.solicitacoes where id = v_etapa.solicitacao_id;
  if v_sol.cliente_id <> auth.uid() then
    return json_build_object('ok', false, 'erro', 'apenas_cliente');
  end if;

  if v_etapa.status <> 'finalizada_prestador'::public.status_etapa then
    return json_build_object('ok', false, 'erro', 'estado_invalido');
  end if;

  if coalesce(trim(p_motivo), '') = '' then
    return json_build_object('ok', false, 'erro', 'motivo_obrigatorio');
  end if;

  update public.etapas_atendimento
  set status = 'contestada'::public.status_etapa,
      cliente_confirmou = false,
      updated_at = now()
  where id = p_etapa_id;

  -- Se ja existe pagamento em escrow, criar disputa formal
  select * into v_pag from public.pagamentos
  where etapa_id = p_etapa_id and status in ('em_escrow', 'pago')
  limit 1;

  if found then
    insert into public.disputas (pagamento_id, motivo, status, aberta_por)
    values (v_pag.id, p_motivo, 'aberta', auth.uid())
    returning id into v_disputa_id;

    update public.pagamentos set status = 'contestado' where id = v_pag.id;
  end if;

  return json_build_object('ok', true, 'disputa_id', v_disputa_id);
end;
$$;

revoke all on function public.fn_etapa_contestar(uuid, text) from public;
grant execute on function public.fn_etapa_contestar(uuid, text) to authenticated;
