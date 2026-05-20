-- ============================================================
-- Fix: trigger fn_acordo_chat_processar_aceite tentava inserir
-- coluna 'observacoes' em agendamento_propostas, que nao existe.
--
-- Schema real de agendamento_propostas (migration 018):
--   id, etapa_id, solicitacao_id,
--   data_proposta date, hora_proposta time, proposto_por uuid,
--   status status_agendamento,
--   respondido_por uuid, resposta_em timestamptz, motivo_rejeicao text,
--   created_at, updated_at
--
-- Decisao: observacao livre do acordo segue gravada em
-- etapas_atendimento.observacoes. agendamento_propostas e' apenas o
-- registro estruturado da troca de data/hora, sem texto livre.
--
-- Refinamento adicional: quando converter um acordo de agendamento,
-- preferir uma etapa do TIPO 'agendamento' antes de cair pra qualquer
-- etapa ativa. Evita anexar proposta de horario na etapa errada
-- (ex: na etapa de orcamento).
-- ============================================================

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

  -- Cliente aceitou?
  select exists (
    select 1 from public.acordos_chat_confirmacoes c
    where c.acordo_id = v_acordo.id
      and c.user_id = v_sol.cliente_id
      and c.acao = 'aceitou'
  ) into v_cliente_aceitou;

  -- Prestador aceitou?
  select exists (
    select 1 from public.acordos_chat_confirmacoes c
    where c.acordo_id = v_acordo.id
      and c.user_id = v_sol.profissional_id
      and c.acao = 'aceitou'
  ) into v_prestador_aceitou;

  if not (v_cliente_aceitou and v_prestador_aceitou) then
    update public.acordos_chat_sugeridos
    set status = 'aceito', updated_at = now()
    where id = v_acordo.id and status in ('aguardando', 'editado');
    return new;
  end if;

  -- AMBOS aceitaram
  if v_acordo.tipo in ('vistoria', 'consulta', 'orcamento', 'execucao', 'conclusao') then
    select coalesce(max(sequencia), 0) + 1 into v_sequencia
    from public.etapas_atendimento where solicitacao_id = v_sol.id;

    insert into public.etapas_atendimento (
      solicitacao_id, tipo, sequencia, status, valor_acordado, observacoes
    ) values (
      v_sol.id,
      v_acordo.tipo,
      v_sequencia,
      'agendada',
      v_acordo.valor,
      v_acordo.observacoes
    )
    returning id into v_etapa_id;

    update public.acordos_chat_sugeridos
    set status = 'convertido',
        convertido_em = v_etapa_id,
        convertido_tipo = 'etapa',
        updated_at = now()
    where id = v_acordo.id;

  elsif v_acordo.tipo = 'agendamento' and v_acordo.data_hora is not null then
    -- 1) Prefere etapa do tipo 'agendamento'
    select id into v_etapa_id from public.etapas_atendimento
    where solicitacao_id = v_sol.id
      and tipo = 'agendamento'
      and status in ('pendente', 'agendada', 'em_progresso')
    order by sequencia asc limit 1;

    -- 2) Fallback: qualquer etapa ativa
    if v_etapa_id is null then
      select id into v_etapa_id from public.etapas_atendimento
      where solicitacao_id = v_sol.id
        and status in ('pendente', 'agendada', 'em_progresso')
      order by sequencia asc limit 1;
    end if;

    -- 3) Ultimo fallback: cria uma etapa nova de agendamento
    if v_etapa_id is null then
      select coalesce(max(sequencia), 0) + 1 into v_sequencia
      from public.etapas_atendimento where solicitacao_id = v_sol.id;

      insert into public.etapas_atendimento (
        solicitacao_id, tipo, sequencia, status, valor_acordado, observacoes
      ) values (
        v_sol.id, 'agendamento', v_sequencia, 'agendada', v_acordo.valor, v_acordo.observacoes
      )
      returning id into v_etapa_id;
    end if;

    -- Insere a proposta de agendamento SEM a coluna observacoes (que nao existe).
    -- A observacao do acordo ja' esta refletida na etapa quando ela e' criada,
    -- e tambem permanece visivel no proprio card do acordo (status 'convertido').
    insert into public.agendamento_propostas (
      solicitacao_id, etapa_id, proposto_por, data_proposta, hora_proposta, status
    ) values (
      v_sol.id,
      v_etapa_id,
      new.user_id,
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

  elsif v_acordo.tipo = 'cancelamento' then
    update public.acordos_chat_sugeridos
    set status = 'convertido',
        convertido_tipo = 'cancelamento',
        updated_at = now()
    where id = v_acordo.id;
  end if;

  return new;
end;
$$;
