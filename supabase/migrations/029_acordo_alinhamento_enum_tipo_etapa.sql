-- ============================================================
-- Fix: trigger fn_acordo_chat_processar_aceite tentava inserir
-- etapa com tipo='agendamento', mas o enum tipo_etapa so' possui:
--   vistoria, orcamento, execucao
--
-- Decisao de produto: o modelo formal sao 3 etapas pagaveis. As
-- demais intencoes do detector de acordos (consulta/agendamento/
-- conclusao/cancelamento) NAO sao etapas novas:
--   - consulta -> mapeada para 'vistoria' (etapas_tipos.nome ja' e'
--     "Vistoria/Consulta")
--   - agendamento -> nao cria etapa; so' anexa proposta de horario
--     em uma etapa existente. Sem etapa existente, marca o acordo
--     como convertido sem efeito colateral
--   - conclusao -> nao cria etapa; marca acordo como convertido
--     (a conclusao real ocorre via fluxo de etapas existente)
--   - cancelamento -> ja' funcionava: so' marca acordo
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
  v_tipo_etapa public.tipo_etapa;
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

  -- AMBOS aceitaram --------------------------------------------------------
  if v_acordo.tipo in ('vistoria', 'consulta', 'orcamento', 'execucao') then
    -- Mapeia para os 3 valores reais do enum
    v_tipo_etapa := case v_acordo.tipo
      when 'consulta' then 'vistoria'::public.tipo_etapa
      else v_acordo.tipo::public.tipo_etapa
    end;

    select coalesce(max(sequencia), 0) + 1 into v_sequencia
    from public.etapas_atendimento where solicitacao_id = v_sol.id;

    insert into public.etapas_atendimento (
      solicitacao_id, tipo, sequencia, status, valor_acordado, observacoes
    ) values (
      v_sol.id, v_tipo_etapa, v_sequencia, 'agendada', v_acordo.valor, v_acordo.observacoes
    )
    returning id into v_etapa_id;

    update public.acordos_chat_sugeridos
    set status = 'convertido',
        convertido_em = v_etapa_id,
        convertido_tipo = 'etapa',
        updated_at = now()
    where id = v_acordo.id;

  elsif v_acordo.tipo = 'agendamento' and v_acordo.data_hora is not null then
    -- Agendamento NAO e' etapa: anexa proposta de horario em etapa existente.
    -- Sem etapa existente ativa, marca acordo como convertido sem efeito
    -- colateral (evita criar etapa solta de tipo invalido).
    select id into v_etapa_id from public.etapas_atendimento
    where solicitacao_id = v_sol.id
      and status in ('pendente', 'agendada', 'em_progresso')
    order by sequencia asc limit 1;

    if v_etapa_id is not null then
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
    else
      -- Sem etapa pra anexar: registra que foi resolvido mas nao gera artefato real
      update public.acordos_chat_sugeridos
      set status = 'convertido',
          convertido_tipo = 'agendamento',
          updated_at = now()
      where id = v_acordo.id;
    end if;

  elsif v_acordo.tipo in ('conclusao', 'cancelamento') then
    -- Conclusao/cancelamento sao acordos terminais sem etapa propria.
    -- Apenas registra a conversao; o fluxo real (concluir/cancelar
    -- atendimento) continua nos botoes existentes do atendimento.
    update public.acordos_chat_sugeridos
    set status = 'convertido',
        convertido_tipo = v_acordo.tipo,
        updated_at = now()
    where id = v_acordo.id;
  end if;

  return new;
end;
$$;
