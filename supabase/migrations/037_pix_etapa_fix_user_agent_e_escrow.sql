-- ============================================================
-- Fix: a funcao fn_financeiro_criar_pagamento_pix tinha 2 typos
-- adicionais nos nomes das colunas:
--
--   funcao usava        -> schema real (migration 021)
--   user_agent          -> client_user_agent
--   escrow_terms_accepted_at -> escrow_accepted_at
--
-- Erro do usuario:
--   column "user_agent" of relation "pagamentos" does not exist
--
-- Migration 037 recria a funcao com TODOS os nomes alinhados ao
-- schema real:
--   pagamentos.client_user_agent
--   pagamentos.escrow_accepted_at
--   pagamentos.payment_method_id (ja corrigido na 036)
--   pagamentos.escrow_terms_version
--   pagamentos.client_ip, device_fingerprint, currency
-- ============================================================

create or replace function public.fn_financeiro_criar_pagamento_pix(
  p_etapa_id uuid,
  p_escrow_terms_accepted boolean default false,
  p_terms_version text default null,
  p_client_ip text default null,
  p_user_agent text default null,
  p_fingerprint text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapa record;
  v_solic record;
  v_cfg record;
  v_pct numeric(5,2);
  v_comissao numeric(10,2);
  v_liquido numeric(10,2);
  v_bruto numeric(10,2);
  v_pix text;
  v_txid text;
  v_id uuid;
  v_hash text;
  v_cnt int;
  v_pm smallint;
begin
  if p_escrow_terms_accepted is distinct from true then
    return json_build_object('ok', false, 'erro', 'escrow_terms_nao_aceitos');
  end if;

  select * into v_cfg from public.config_financeiro where id = 1;

  select count(*) into v_cnt
  from public.pix_generation_ratelimit
  where user_id = auth.uid() and created_at > now() - interval '1 minute';
  if v_cnt >= coalesce(v_cfg.limite_geracao_pix_por_minuto, 10) then
    return json_build_object('ok', false, 'erro', 'rate_limit_pix');
  end if;

  select * into v_etapa from public.etapas_atendimento where id = p_etapa_id for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'etapa_invalida');
  end if;

  if v_etapa.cobravel is not true then
    return json_build_object('ok', false, 'erro', 'etapa_nao_cobravel');
  end if;

  select * into v_solic from public.solicitacoes where id = v_etapa.solicitacao_id;
  if v_solic.cliente_id <> auth.uid() then
    return json_build_object('ok', false, 'erro', 'apenas_cliente');
  end if;

  if v_etapa.status not in ('agendada'::public.status_etapa, 'em_progresso'::public.status_etapa, 'finalizada_prestador'::public.status_etapa) then
    return json_build_object('ok', false, 'erro', 'etapa_nao_pagavel');
  end if;

  v_bruto := coalesce(v_etapa.valor_acordado, 0);
  if v_bruto <= 0 then
    return json_build_object('ok', false, 'erro', 'valor_etapa_nao_definido');
  end if;

  if v_bruto > coalesce(v_cfg.valor_max_etapa_sem_revisao, 15000) then
    return json_build_object('ok', false, 'erro', 'valor_acima_limite_revisao');
  end if;

  if exists (
    select 1 from public.pagamentos
    where etapa_id = p_etapa_id
      and status in ('aguardando_pagamento', 'pago', 'em_escrow', 'contestado')
  ) then
    return json_build_object('ok', false, 'erro', 'ja_existe_pagamento');
  end if;

  v_pct := public.fn_comissao_percentual_para_solicitacao(v_solic.id);
  v_comissao := round(v_bruto * coalesce(v_pct, 10) / 100.0, 2);
  v_liquido := round(v_bruto - v_comissao, 2);
  if v_liquido < 0 then v_liquido := 0; end if;

  select id into v_pm from public.payment_methods where codigo = 'pix' limit 1;

  v_txid := 'SANDBOX-' || substring(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text) from 1 for 16);
  v_pix := '00020126580014BR.GOV.BCB.PIX0136' || v_txid
    || '5204000053039865802BR5920MaoCerta Pix Demo6009SAO PAULO62070503***6304'
    || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
  v_hash := md5(v_pix);

  insert into public.pagamentos (
    solicitacao_id, etapa_id, cliente_id, profissional_id,
    valor_bruto, valor_etapa, comissao_percentual, valor_comissao, valor_liquido_prestador,
    metodo, status, pix_copia_e_cola, pix_txid, pix_payload_hash,
    payment_method_id, client_ip, client_user_agent, device_fingerprint,
    escrow_accepted_at, escrow_terms_version
  ) values (
    v_solic.id, p_etapa_id, v_solic.cliente_id, v_solic.profissional_id,
    v_bruto, v_bruto, coalesce(v_pct, 10), v_comissao, v_liquido,
    'pix', 'aguardando_pagamento', v_pix, v_txid, v_hash,
    v_pm, nullif(trim(p_client_ip), ''), nullif(trim(p_user_agent), ''),
    nullif(trim(p_fingerprint), ''),
    now(), nullif(trim(p_terms_version), '')
  )
  returning id into v_id;

  insert into public.pix_generation_ratelimit (user_id) values (auth.uid());

  return json_build_object(
    'ok', true,
    'pagamento_id', v_id,
    'pix_copia_e_cola', v_pix,
    'valor', v_bruto,
    'comissao', v_comissao,
    'liquido', v_liquido
  );
end;
$$;

revoke all on function public.fn_financeiro_criar_pagamento_pix(uuid, boolean, text, text, text, text) from public;
grant execute on function public.fn_financeiro_criar_pagamento_pix(uuid, boolean, text, text, text, text) to authenticated;
