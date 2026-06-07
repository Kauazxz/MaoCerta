-- ============================================================
-- Hotfix: fn_gerar_termo_final da 058 usava digest() que depende
-- da extension pgcrypto. Trocado por sha256() nativo do Postgres
-- (built-in desde a 11, recebe bytea e retorna bytea).
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

  -- Sem dependencia de pgcrypto - sha256 nativo
  v_hash := encode(sha256(convert_to(v_snapshot::text, 'UTF8')), 'hex');

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
