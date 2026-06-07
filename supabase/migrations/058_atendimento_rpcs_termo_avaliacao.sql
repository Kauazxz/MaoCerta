-- ============================================================
-- RPCs do termo final + avaliacao + acoes admin.
-- Todas SECURITY DEFINER. Retornam json {ok, ...}.
-- ============================================================

-- ============================================================
-- 1) fn_gerar_termo_final
--    Profissional (ou admin) gera o termo final apos todas as
--    condicoes estarem cumpridas. Monta snapshot do plano + itens
--    + cobrancas em JSON, calcula hash SHA256 do snapshot.
-- ============================================================
create or replace function public.fn_gerar_termo_final(
  p_solicitacao_id uuid
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plano public.planos_atendimento;
  v_snapshot jsonb;
  v_hash text;
  v_resumo text;
  v_pendentes int;
  v_cob_pendente int;
  v_disputa int;
  v_termo_id uuid;
  v_html text;
  v_total numeric(12,2);
begin
  if v_user is null then
    return json_build_object('ok', false, 'erro', 'nao_autenticado');
  end if;

  if not (public.fn_atendimento_is_profissional(p_solicitacao_id)
          or public.is_administrator()) then
    return json_build_object('ok', false, 'erro', 'apenas_profissional_ou_admin');
  end if;

  -- Re-verifica condicoes de conclusao
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
    return json_build_object('ok', false, 'erro', 'itens_obrigatorios_abertos', 'pendentes', v_pendentes);
  end if;
  if v_cob_pendente > 0 then
    return json_build_object('ok', false, 'erro', 'cobrancas_pendentes', 'pendentes', v_cob_pendente);
  end if;
  if v_disputa > 0 then
    return json_build_object('ok', false, 'erro', 'disputa_aberta');
  end if;

  select * into v_plano from public.planos_atendimento
    where solicitacao_id = p_solicitacao_id
    order by created_at desc limit 1;
  if not found then
    return json_build_object('ok', false, 'erro', 'plano_nao_encontrado');
  end if;

  -- Snapshot estrutural
  v_snapshot := jsonb_build_object(
    'plano', to_jsonb(v_plano),
    'itens', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.ordem)
      from public.plano_itens_atendimento i
      where i.solicitacao_id = p_solicitacao_id
    ), '[]'::jsonb),
    'cobrancas', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at)
      from public.cobrancas_atendimento c
      where c.solicitacao_id = p_solicitacao_id
    ), '[]'::jsonb),
    'gerado_em', now()
  );

  v_hash := encode(sha256(convert_to(v_snapshot::text, 'UTF8')), 'hex');

  -- Total pago
  select coalesce(sum(valor), 0) into v_total
    from public.cobrancas_atendimento
    where solicitacao_id = p_solicitacao_id
      and status in ('paga','retida','liberada');

  v_resumo := v_plano.titulo;

  v_html := concat(
    '<h1>Termo de conclusao - MaoCerta</h1>',
    '<p><strong>Atendimento:</strong> ', v_plano.titulo, '</p>',
    '<p><strong>Plano:</strong> ', v_plano.modelo, '</p>',
    '<p><strong>Valor total pago:</strong> R$ ', to_char(v_total, 'FM999G999G990D00'), '</p>',
    '<p><strong>Hash:</strong> ', v_hash, '</p>'
  );

  -- UPSERT manual (solicitacao_id e' UNIQUE)
  insert into public.termos_conclusao_atendimento (
    solicitacao_id, plano_id, criado_por_id, resumo_servico,
    valor_total, etapas_snapshot, snapshot_atendimento,
    html_relatorio, hash_relatorio, status
  ) values (
    p_solicitacao_id, v_plano.id, v_user, v_resumo,
    v_total, v_snapshot->'itens', v_snapshot,
    v_html, v_hash, 'aguardando_assinatura_cliente'
  )
  on conflict (solicitacao_id) do update set
    plano_id              = excluded.plano_id,
    criado_por_id         = excluded.criado_por_id,
    resumo_servico        = excluded.resumo_servico,
    valor_total           = excluded.valor_total,
    etapas_snapshot       = excluded.etapas_snapshot,
    snapshot_atendimento  = excluded.snapshot_atendimento,
    html_relatorio        = excluded.html_relatorio,
    hash_relatorio        = excluded.hash_relatorio,
    status                = case
      when termos_conclusao_atendimento.status in ('confirmado','assinado_ambos','dispensado_por_admin')
      then termos_conclusao_atendimento.status
      else 'aguardando_assinatura_cliente'
    end,
    updated_at            = now()
  returning id into v_termo_id;

  perform public.fn_criar_evento_atendimento(
    p_solicitacao_id, 'termo_gerado',
    'Termo final gerado', null,
    case when public.is_administrator() then 'admin' else 'profissional' end,
    v_user, v_plano.id, null, null, null,
    jsonb_build_object('termo_id', v_termo_id, 'hash', v_hash, 'valor_total', v_total)
  );

  return json_build_object('ok', true, 'termo_id', v_termo_id, 'hash', v_hash);
end;
$$;
revoke all on function public.fn_gerar_termo_final(uuid) from public;
grant execute on function public.fn_gerar_termo_final(uuid) to authenticated;

-- ============================================================
-- 2) fn_assinar_termo_final
--    Cliente OU profissional assina. Se ambos assinaram, conclui
--    o atendimento (plano + solicitacao).
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

  -- Re-le para checar se viraram ambos
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
    -- Conclui plano e solicitacao
    update public.planos_atendimento
    set status = 'concluido', updated_at = now()
    where solicitacao_id = v_termo.solicitacao_id and status in ('ativo','em_negociacao');

    update public.solicitacoes
    set status = 'concluida', updated_at = now()
    where id = v_termo.solicitacao_id and status in ('aceita','em_andamento');

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
revoke all on function public.fn_assinar_termo_final(uuid) from public;
grant execute on function public.fn_assinar_termo_final(uuid) to authenticated;

-- ============================================================
-- 3) fn_admin_dispensar_termo
--    Admin encerra atendimento mesmo sem assinatura, registrando motivo.
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

  perform public.fn_criar_evento_atendimento(
    v_termo.solicitacao_id, 'decisao_admin',
    'Admin dispensou assinatura e encerrou o atendimento', p_motivo,
    'admin', v_user, v_termo.plano_id, null, null, null,
    jsonb_build_object('termo_id', p_termo_id, 'motivo', p_motivo)
  );

  return json_build_object('ok', true);
end;
$$;
revoke all on function public.fn_admin_dispensar_termo(uuid, text) from public;
grant execute on function public.fn_admin_dispensar_termo(uuid, text) to authenticated;

-- ============================================================
-- 4) fn_avaliar_atendimento_novo
--    Insere avaliacao apos conclusao. Reutiliza tabela avaliacoes.
--    Nome diferente do RPC antigo para nao conflitar.
-- ============================================================
create or replace function public.fn_avaliar_atendimento_novo(
  p_solicitacao_id uuid,
  p_nota smallint,
  p_comentario text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_sol record;
  v_avaliado uuid;
  v_id uuid;
begin
  if v_user is null then
    return json_build_object('ok', false, 'erro', 'nao_autenticado');
  end if;
  if p_nota is null or p_nota < 1 or p_nota > 5 then
    return json_build_object('ok', false, 'erro', 'nota_invalida');
  end if;

  select id, cliente_id, profissional_id, status into v_sol
    from public.solicitacoes where id = p_solicitacao_id;
  if not found then
    return json_build_object('ok', false, 'erro', 'solicitacao_invalida');
  end if;
  if v_sol.status <> 'concluida' then
    return json_build_object('ok', false, 'erro', 'atendimento_nao_concluido');
  end if;

  if v_sol.cliente_id = v_user then
    v_avaliado := v_sol.profissional_id;
  elsif v_sol.profissional_id = v_user then
    v_avaliado := v_sol.cliente_id;
  else
    return json_build_object('ok', false, 'erro', 'sem_permissao');
  end if;

  insert into public.avaliacoes (
    atendimento_id, avaliador_id, avaliado_id, nota, comentario
  ) values (
    p_solicitacao_id, v_user, v_avaliado, p_nota, nullif(trim(coalesce(p_comentario, '')), '')
  )
  on conflict (atendimento_id, avaliador_id) do update set
    nota = excluded.nota,
    comentario = excluded.comentario
  returning id into v_id;

  perform public.fn_criar_evento_atendimento(
    p_solicitacao_id, 'avaliacao_realizada',
    case when v_sol.cliente_id = v_user then 'Cliente avaliou o profissional'
         else 'Profissional avaliou o cliente' end,
    null,
    case when v_sol.cliente_id = v_user then 'cliente' else 'profissional' end,
    v_user, null, null, null, null,
    jsonb_build_object('nota', p_nota, 'avaliacao_id', v_id)
  );

  return json_build_object('ok', true, 'avaliacao_id', v_id);
end;
$$;
revoke all on function public.fn_avaliar_atendimento_novo(uuid, smallint, text) from public;
grant execute on function public.fn_avaliar_atendimento_novo(uuid, smallint, text) to authenticated;

-- ============================================================
-- 5) fn_admin_listar_riscos_chat
--    Helper para o painel admin: ultimos eventos de risco_detectado_chat.
-- ============================================================
create or replace function public.fn_admin_listar_riscos_chat(
  p_limit int default 50
) returns table (
  evento_id bigint,
  solicitacao_id uuid,
  ator_id uuid,
  titulo text,
  descricao text,
  payload jsonb,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_administrator() then
    raise exception 'apenas_admin' using errcode = '42501';
  end if;
  return query
    select e.id, e.solicitacao_id, e.ator_id, e.titulo, e.descricao, e.payload, e.created_at
    from public.atendimento_eventos e
    where e.tipo_evento = 'risco_detectado_chat'
    order by e.created_at desc
    limit p_limit;
end;
$$;
revoke all on function public.fn_admin_listar_riscos_chat(int) from public;
grant execute on function public.fn_admin_listar_riscos_chat(int) to authenticated;
