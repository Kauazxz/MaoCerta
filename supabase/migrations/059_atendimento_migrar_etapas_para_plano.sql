-- ============================================================
-- F4 do novo motor.
--
-- Migracao IDEMPOTENTE de atendimentos antigos (modelo etapas_atendimento)
-- para o novo modelo (planos_atendimento + plano_itens + cobrancas).
--
-- Estrategia:
-- * Para cada solicitacao que JA TEM etapas mas NAO TEM plano, cria
--   um plano "Migrado do modelo antigo" e converte cada etapa em item
--   e cada pagamento vinculado em cobranca.
-- * Roda inteira em uma funcao SECURITY DEFINER que pode ser chamada
--   varias vezes - so atua em atendimentos ainda nao migrados.
-- * Marca plano.metadata.migrado_de='etapas_atendimento' para auditoria.
-- * Cria evento 'migrado_para_novo_modelo' no historico.
--
-- A funcao retorna json com contagem de planos/itens/cobrancas criados.
-- Executa de imediato uma chamada para fazer a migracao em lote.
-- ============================================================

create or replace function public.fn_atendimento_migrar_legado()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sol_rec       record;
  v_etapa         record;
  v_pagto         record;
  v_plano_id      uuid;
  v_item_id       uuid;
  v_cob_id        uuid;
  v_count_planos  int := 0;
  v_count_itens   int := 0;
  v_count_cobs    int := 0;
  v_status_plano  text;
  v_status_item   text;
  v_status_cob    text;
  v_tipo_item     text;
  v_momento       text;
  v_cobravel      boolean;
  v_valor         numeric;
  v_titulo        text;
  v_seq           int;
  v_comissao      record;
begin
  -- Itera apenas sobre solicitacoes que tem etapas mas NAO tem plano
  for v_sol_rec in
    select s.id as sol_id, s.titulo as sol_titulo, s.status as sol_status,
           s.cliente_id, s.profissional_id
    from public.solicitacoes s
    where exists (
            select 1 from public.etapas_atendimento e where e.solicitacao_id = s.id
          )
      and not exists (
            select 1 from public.planos_atendimento p where p.solicitacao_id = s.id
          )
  loop
    -- Define status do plano a partir do status da solicitacao
    v_status_plano := case v_sol_rec.sol_status
      when 'aceita'       then 'ativo'
      when 'em_andamento' then 'ativo'
      when 'concluida'    then 'concluido'
      when 'cancelada'    then 'cancelado'
      else 'ativo'
    end;

    insert into public.planos_atendimento (
      solicitacao_id, titulo, descricao, modelo, status,
      criado_por, metadata
    ) values (
      v_sol_rec.sol_id,
      coalesce(v_sol_rec.sol_titulo, 'Atendimento migrado'),
      'Plano gerado automaticamente a partir do modelo antigo de etapas.',
      'personalizado',
      v_status_plano,
      v_sol_rec.profissional_id,
      jsonb_build_object('migrado_de', 'etapas_atendimento', 'migrado_em', now())
    )
    returning id into v_plano_id;
    v_count_planos := v_count_planos + 1;

    v_seq := 0;
    for v_etapa in
      select * from public.etapas_atendimento
      where solicitacao_id = v_sol_rec.sol_id
      order by sequencia asc, created_at asc
    loop
      v_seq := v_seq + 1;

      v_tipo_item := case v_etapa.tipo::text
        when 'vistoria'  then 'vistoria'
        when 'orcamento' then 'servico'
        when 'execucao'  then 'servico'
        when 'agendamento' then 'servico'
        else 'etapa'
      end;

      v_status_item := case v_etapa.status::text
        when 'pendente'           then 'rascunho'
        when 'agendada'           then 'aceito'
        when 'em_progresso'       then 'em_execucao'
        when 'finalizada_prestador' then 'executado_pelo_profissional'
        when 'concluida'          then 'concluido'
        when 'cancelada'          then 'cancelado'
        else 'rascunho'
      end;

      v_cobravel := coalesce(v_etapa.cobravel, false);
      v_momento := case
        when not v_cobravel then 'sem_cobranca'
        when coalesce(v_etapa.momento_cobranca, '') = 'antes_da_etapa' then 'antes'
        when coalesce(v_etapa.momento_cobranca, '') = 'somente_no_final' then 'final'
        when coalesce(v_etapa.momento_cobranca, '') = 'incluido_no_total_final' then 'final'
        else 'depois'
      end;

      v_valor := coalesce(v_etapa.valor_acordado, 0);

      insert into public.plano_itens_atendimento (
        plano_id, solicitacao_id, tipo, titulo, descricao, ordem, unidade,
        quantidade_prevista, valor_unitario, valor_total_previsto,
        momento_pagamento, requer_pagamento_para_iniciar, obrigatorio,
        status, criado_por, metadata,
        inicio_real, fim_real, aceito_cliente_at,
        confirmado_cliente_at, confirmado_profissional_at
      ) values (
        v_plano_id, v_sol_rec.sol_id, v_tipo_item,
        coalesce(v_etapa.tipo::text, 'etapa') || ' #' || v_seq,
        coalesce(v_etapa.observacoes, v_etapa.notas_inicial, v_etapa.notas_conclusao),
        v_seq, 'fixa',
        null, null, nullif(v_valor, 0),
        v_momento,
        case when v_momento = 'antes' then true else false end,
        true,
        v_status_item, v_sol_rec.profissional_id,
        jsonb_build_object(
          'migrado_de_etapa_id', v_etapa.id,
          'momento_cobranca_antigo', v_etapa.momento_cobranca
        ),
        v_etapa.data_inicio,
        v_etapa.data_conclusao,
        case when v_etapa.status::text in ('agendada','em_progresso','finalizada_prestador','concluida')
             then coalesce(v_etapa.data_inicio, v_etapa.created_at) end,
        v_etapa.data_confirmacao_cliente,
        v_etapa.data_confirmacao_profissional
      )
      returning id into v_item_id;
      v_count_itens := v_count_itens + 1;

      -- Para cada pagamento vinculado a esta etapa, cria cobranca
      for v_pagto in
        select * from public.pagamentos where etapa_id = v_etapa.id
      loop
        v_status_cob := case v_pagto.status::text
          when 'aguardando_pagamento' then 'aguardando_pagamento'
          when 'pago'                 then 'paga'
          when 'em_escrow'            then 'paga'
          when 'liberado'             then 'liberada'
          when 'cancelado'            then 'cancelada'
          when 'contestado'           then 'contestada'
          else 'rascunho'
        end;

        select * into v_comissao from public.fn_atendimento_calcular_comissao(coalesce(v_pagto.valor_bruto, 0));

        v_titulo := 'Pagamento migrado · ' || coalesce(v_etapa.tipo::text, 'etapa');
        insert into public.cobrancas_atendimento (
          solicitacao_id, plano_id, item_id, pagamento_id,
          tipo, titulo, descricao,
          valor, valor_bruto, taxa_plataforma_percentual,
          valor_taxa_plataforma, valor_liquido_profissional,
          status,
          requer_aceite_cliente, requer_aceite_profissional,
          aceite_cliente_at, aceite_profissional_at,
          mp_payment_id, pix_copia_cola, pago_em, liberado_em,
          criado_por, metadata
        ) values (
          v_sol_rec.sol_id, v_plano_id, v_item_id, v_pagto.id,
          case v_tipo_item when 'vistoria' then 'vistoria'
                           when 'servico'  then 'base'
                           else 'etapa' end,
          v_titulo,
          'Cobranca migrada do modelo antigo (pagamentos.id = ' || v_pagto.id || ')',
          coalesce(v_pagto.valor_bruto, 0),
          coalesce(v_pagto.valor_bruto, 0),
          coalesce(v_pagto.comissao_percentual, v_comissao.taxa_perc),
          coalesce(v_pagto.valor_comissao, v_comissao.taxa_valor),
          coalesce(v_pagto.valor_liquido_prestador, v_comissao.liquido_prof),
          v_status_cob,
          false, false,
          coalesce(v_pagto.created_at, now()),
          coalesce(v_pagto.created_at, now()),
          v_pagto.mp_payment_id, v_pagto.pix_copia_e_cola,
          v_pagto.pago_em, v_pagto.liberado_em,
          v_sol_rec.profissional_id,
          jsonb_build_object('migrado_de_pagamento_id', v_pagto.id)
        )
        returning id into v_cob_id;
        v_count_cobs := v_count_cobs + 1;
      end loop;
    end loop;

    -- Evento de auditoria no historico
    perform public.fn_criar_evento_atendimento(
      v_sol_rec.sol_id, 'migrado_para_novo_modelo',
      'Atendimento migrado para o novo motor',
      'Plano, itens e cobrancas geradas a partir das etapas antigas.',
      'sistema', null, v_plano_id, null, null, null,
      jsonb_build_object('etapas_origem', true),
      'admin'
    );
  end loop;

  return json_build_object(
    'ok', true,
    'planos_criados', v_count_planos,
    'itens_criados', v_count_itens,
    'cobrancas_criadas', v_count_cobs
  );
end;
$$;

revoke all on function public.fn_atendimento_migrar_legado() from public;
grant execute on function public.fn_atendimento_migrar_legado() to authenticated;

-- Comentario para o admin saber que existe.
comment on function public.fn_atendimento_migrar_legado is
  'Migra atendimentos do modelo antigo (etapas_atendimento) para o novo (planos + itens + cobrancas). Idempotente: atua apenas em solicitacoes sem plano. Pode ser chamada por admin via Supabase SQL ou via UI futura.';

-- Roda automaticamente na aplicacao da migration (admin pode rerodar).
do $$
declare
  v_resultado json;
begin
  select public.fn_atendimento_migrar_legado() into v_resultado;
  raise notice 'Migracao automatica: %', v_resultado;
end $$;
