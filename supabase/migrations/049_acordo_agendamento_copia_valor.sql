-- ============================================================
-- Quando o acordo do tipo "agendamento" e' aceito por ambos e tem
-- valor > 0, copia esse valor para a etapa (valor_acordado, cobravel,
-- momento_cobranca). Antes desta migration o ramo de agendamento
-- so' criava uma agendamento_proposta com data/hora, deixando a etapa
-- sem valor e sem cobravel. Resultado: o PagamentoEtapaPanel nao
-- mostrava QR code para o cliente apos o aceite mutuo.
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

      -- NOVO: se o acordo de agendamento veio com valor > 0, copia para
      -- a etapa e marca como cobravel. Sem isso, o painel de pagamento
      -- nao mostra o QR para o cliente apos o aceite mutuo.
      if coalesce(v_acordo.valor, 0) > 0 then
        update public.etapas_atendimento
        set valor_acordado = v_acordo.valor,
            cobravel = true,
            momento_cobranca = case
              when momento_cobranca = 'nao_se_aplica' then 'apos_conclusao_etapa'
              else momento_cobranca
            end,
            observacoes = coalesce(observacoes, v_acordo.observacoes),
            updated_at = now()
        where id = v_etapa_id;
      end if;

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
