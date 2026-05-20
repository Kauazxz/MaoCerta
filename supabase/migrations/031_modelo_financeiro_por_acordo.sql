-- ============================================================
-- Fase 2 - Modelo financeiro guiado por acordo
--
-- Substitui o modelo antigo (rateio automatico do valor_total_servico
-- entre etapas) pelo modelo onde cada etapa decide explicitamente se
-- e' cobravel, qual o valor e quando cobrar.
--
-- Mudancas:
-- 1) etapas_atendimento ganha duas colunas:
--    - cobravel boolean default false
--    - momento_cobranca text (nao_se_aplica | antes_da_etapa |
--      apos_conclusao_etapa | somente_no_final | incluido_no_total_final)
-- 2) Drop do trigger trg_solicitacao_distribuir_valor e da funcao
--    distribuir_valor_etapas. valor_total_servico permanece, mas como
--    estimativa, sem rateio automatico.
-- 3) Backfill: etapas que ja tem valor_acordado > 0 sao marcadas como
--    cobravel=true e momento_cobranca='apos_conclusao_etapa' (default
--    seguro).
-- 4) Atualiza fn_acordo_chat_processar_aceite para marcar a etapa criada
--    como cobravel=true SOMENTE se o acordo veio com valor > 0.
-- ============================================================

-- 1) Colunas novas (idempotente)
alter table public.etapas_atendimento
  add column if not exists cobravel boolean not null default false,
  add column if not exists momento_cobranca text not null default 'nao_se_aplica';

alter table public.etapas_atendimento
  drop constraint if exists etapas_atendimento_momento_cobranca_check;

alter table public.etapas_atendimento
  add constraint etapas_atendimento_momento_cobranca_check
  check (momento_cobranca in (
    'nao_se_aplica',
    'antes_da_etapa',
    'apos_conclusao_etapa',
    'somente_no_final',
    'incluido_no_total_final'
  ));

-- 2) Drop do rateio automatico
drop trigger if exists trg_solicitacao_distribuir_valor on public.solicitacoes;
drop function if exists public.trg_solicitacao_distribuir_valor() cascade;
drop function if exists public.distribuir_valor_etapas(uuid, numeric) cascade;

-- 3) Backfill: etapas com valor > 0 viram cobraveis e cobrancao apos conclusao
update public.etapas_atendimento
set cobravel = true,
    momento_cobranca = 'apos_conclusao_etapa'
where coalesce(valor_acordado, 0) > 0
  and cobravel = false;

-- 4) Comentarios atualizados
comment on column public.solicitacoes.valor_total_servico is
  'Valor de referencia/estimativa do servico. NAO e' rateado automaticamente entre etapas.';
comment on column public.etapas_atendimento.valor_acordado is
  'Valor desta etapa quando ela e cobravel. Definido por acordo mutuo, nao por rateio.';
comment on column public.etapas_atendimento.cobravel is
  'Indica se a etapa gera cobranca financeira. Default false. Deve ser true so apos acordo explicito.';
comment on column public.etapas_atendimento.momento_cobranca is
  'Quando o pagamento da etapa ocorre: nao_se_aplica (gratuita), antes_da_etapa, apos_conclusao_etapa, somente_no_final, incluido_no_total_final.';

-- 5) Atualiza trigger de conversao acordo->etapa para refletir corretamente
--    o flag cobravel baseado em "tem valor explicito > 0?"
create or replace function public.fn_acordo_chat_processar_aceite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acordo public.acordos_chat_sugeridos;
  v_sol public.solicitacoes;
  v_cliente_aceitou boolean;
  v_prestador_aceitou boolean;
  v_etapa_id uuid;
  v_sequencia smallint;
  v_tipo_etapa public.tipo_etapa;
  v_cobravel boolean;
  v_momento text;
begin
  if new.acao <> 'aceitou' then
    return new;
  end if;

  select * into v_acordo from public.acordos_chat_sugeridos where id = new.acordo_id;
  if not found or v_acordo.status not in ('aguardando', 'editado', 'aceito') then
    return new;
  end if;

  select * into v_sol from public.solicitacoes where id = v_acordo.solicitacao_id;
  if not found then
    return new;
  end if;

  select exists (
    select 1 from public.acordos_chat_confirmacoes c
    where c.acordo_id = v_acordo.id
      and c.user_id = v_sol.cliente_id and c.acao = 'aceitou'
  ) into v_cliente_aceitou;

  select exists (
    select 1 from public.acordos_chat_confirmacoes c
    where c.acordo_id = v_acordo.id
      and c.user_id = v_sol.profissional_id and c.acao = 'aceitou'
  ) into v_prestador_aceitou;

  if not (v_cliente_aceitou and v_prestador_aceitou) then
    update public.acordos_chat_sugeridos
    set status = 'aceito', updated_at = now()
    where id = v_acordo.id and status in ('aguardando', 'editado');
    return new;
  end if;

  -- AMBOS aceitaram
  if v_acordo.tipo in ('vistoria', 'consulta', 'orcamento', 'execucao') then
    v_tipo_etapa := case v_acordo.tipo
      when 'consulta' then 'vistoria'::public.tipo_etapa
      else v_acordo.tipo::public.tipo_etapa
    end;

    -- Cobravel SO se o acordo veio com valor > 0
    v_cobravel := (coalesce(v_acordo.valor, 0) > 0);
    v_momento := case when v_cobravel then 'apos_conclusao_etapa' else 'nao_se_aplica' end;

    select coalesce(max(sequencia), 0) + 1 into v_sequencia
    from public.etapas_atendimento where solicitacao_id = v_sol.id;

    insert into public.etapas_atendimento (
      solicitacao_id, tipo, sequencia, status, valor_acordado, observacoes,
      cobravel, momento_cobranca
    ) values (
      v_sol.id, v_tipo_etapa, v_sequencia, 'agendada',
      v_acordo.valor, v_acordo.observacoes,
      v_cobravel, v_momento
    )
    returning id into v_etapa_id;

    update public.acordos_chat_sugeridos
    set status = 'convertido',
        convertido_em = v_etapa_id,
        convertido_tipo = 'etapa',
        updated_at = now()
    where id = v_acordo.id;

  elsif v_acordo.tipo = 'agendamento' and v_acordo.data_hora is not null then
    select id into v_etapa_id from public.etapas_atendimento
    where solicitacao_id = v_sol.id
      and status in ('pendente', 'agendada', 'em_progresso')
    order by sequencia asc limit 1;

    if v_etapa_id is not null then
      insert into public.agendamento_propostas (
        solicitacao_id, etapa_id, proposto_por, data_proposta, hora_proposta, status
      ) values (
        v_sol.id, v_etapa_id, new.user_id,
        (v_acordo.data_hora at time zone 'America/Sao_Paulo')::date,
        (v_acordo.data_hora at time zone 'America/Sao_Paulo')::time,
        'aceito_ambos'
      );

      update public.acordos_chat_sugeridos
      set status = 'convertido',
          convertido_em = v_etapa_id,
          convertido_tipo = 'agendamento',
          updated_at = now()
      where id = v_acordo.id;
    else
      update public.acordos_chat_sugeridos
      set status = 'convertido',
          convertido_tipo = 'agendamento',
          updated_at = now()
      where id = v_acordo.id;
    end if;

  elsif v_acordo.tipo in ('conclusao', 'cancelamento') then
    update public.acordos_chat_sugeridos
    set status = 'convertido',
        convertido_tipo = v_acordo.tipo,
        updated_at = now()
    where id = v_acordo.id;
  end if;

  return new;
end;
$$;

-- 6) Bloqueio de seguranca: criar pagamento Pix so se etapa for cobravel
--    Substitui apenas a checagem de "valor_etapa_nao_definido" pelo combo
--    "etapa_nao_cobravel" + "valor_etapa_nao_definido".
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

  -- NOVA CHECAGEM: etapa marcada explicitamente como nao cobravel
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

  v_txid := 'SANDBOX-' || encode(gen_random_bytes(8), 'hex');
  v_pix := '00020126580014BR.GOV.BCB.PIX0136' || v_txid
    || '5204000053039865802BR5920MaoCerta Pix Demo6009SAO PAULO62070503***6304'
    || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));

  v_hash := encode(digest(v_pix, 'sha256'), 'hex');

  insert into public.pagamentos (
    solicitacao_id, etapa_id, cliente_id, profissional_id,
    valor_bruto, valor_etapa, comissao_percentual, valor_comissao, valor_liquido_prestador,
    metodo, status, pix_copia_e_cola, pix_txid, pix_payload_hash,
    pagamento_method_id, client_ip, user_agent, device_fingerprint,
    escrow_terms_accepted_at, escrow_terms_version
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
