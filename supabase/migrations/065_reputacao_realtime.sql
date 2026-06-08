-- ============================================================
-- Reputação: métricas centralizadas, score consistente e
-- suporte a atualização em tempo real (avaliacoes já na publication).
-- Funciona para qualquer usuário autenticado (email, OAuth, etc.)
-- via auth.uid() — o tipo vem de profiles, não do provedor de login.
-- ============================================================

-- Nota efetiva (média das 3 dimensões ou nota simples)
create or replace function public.fn_avaliacao_nota_efetiva(
  p_nota smallint,
  p_qualidade smallint,
  p_prazo smallint,
  p_comunicacao smallint
)
returns numeric
language sql
immutable
as $$
  select round((
    coalesce(p_qualidade, p_nota)
    + coalesce(p_prazo, p_nota)
    + coalesce(p_comunicacao, p_nota)
  )::numeric / 3.0, 2);
$$;

-- Recalcula score de busca do prestador (ignora avaliações ocultas)
create or replace function public.fn_atualizar_score_prestador(p_prestador uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_media numeric;
  v_n int;
begin
  select count(*), avg(public.fn_avaliacao_nota_efetiva(nota, nota_qualidade, nota_prazo, nota_comunicacao))
  into v_n, v_media
  from public.avaliacoes
  where avaliado_id = p_prestador
    and coalesce(moderacao_oculto, false) = false;

  update public.profiles
  set score_prioridade_busca = coalesce(round(coalesce(v_media, 0)::numeric, 3), 0)
      + case when coalesce(v_n, 0) >= 5 and coalesce(v_media, 0) >= 4.5 then 0.5 else 0 end
  where id = p_prestador and tipo = 'profissional'::tipo_usuario;
end;
$$;

-- Taxa de resposta do profissional: % de mensagens de clientes respondidas em até 1h
create or replace function public.fn_reputacao_taxa_resposta(p_profissional_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with msgs_cliente as (
    select m.id, m.solicitacao_id, m.created_at, s.profissional_id
    from public.mensagens_atendimento m
    join public.solicitacoes s on s.id = m.solicitacao_id
    where s.profissional_id = p_profissional_id
      and m.remetente_id = s.cliente_id
  ),
  respondidas as (
    select mc.id
    from msgs_cliente mc
    where exists (
      select 1
      from public.mensagens_atendimento mp
      where mp.solicitacao_id = mc.solicitacao_id
        and mp.remetente_id = mc.profissional_id
        and mp.created_at > mc.created_at
        and mp.created_at <= mc.created_at + interval '1 hour'
    )
  )
  select case
    when (select count(*) from msgs_cliente) = 0 then 100
    else least(100, greatest(0, round(
      100.0 * (select count(*)::numeric from respondidas)
      / nullif((select count(*)::numeric from msgs_cliente), 0)
    )::int))
  end;
$$;

-- Taxa de cancelamento do cliente: % de solicitações canceladas sobre o total relevante
create or replace function public.fn_reputacao_taxa_cancelamento(p_cliente_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when total = 0 then 0
    else least(100, greatest(0, round(100.0 * canceladas / total)::int))
  end
  from (
    select
      count(*) filter (where status = 'cancelada')::numeric as canceladas,
      count(*) filter (where status in ('cancelada', 'concluida', 'em_andamento', 'aceita', 'pendente'))::numeric as total
    from public.solicitacoes
    where cliente_id = p_cliente_id
  ) t;
$$;

-- Painel completo de reputação (métricas + últimas avaliações públicas)
create or replace function public.fn_reputacao_buscar(
  p_user_id uuid,
  p_limite int default 20
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tipo public.tipo_usuario;
  v_nota_media numeric := 0;
  v_total int := 0;
  v_concluidos int := 0;
  v_taxa_secundaria int := 0;
  v_avaliacoes json;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'erro', 'nao_autenticado');
  end if;

  if p_user_id is null then
    return json_build_object('ok', false, 'erro', 'usuario_invalido');
  end if;

  select tipo into v_tipo
  from public.profiles
  where id = p_user_id;

  if not found then
    return json_build_object('ok', false, 'erro', 'perfil_nao_encontrado');
  end if;

  select
    coalesce(round(avg(public.fn_avaliacao_nota_efetiva(nota, nota_qualidade, nota_prazo, nota_comunicacao))::numeric, 2), 0),
    count(*)::int
  into v_nota_media, v_total
  from public.avaliacoes
  where avaliado_id = p_user_id
    and coalesce(moderacao_oculto, false) = false;

  if v_tipo = 'profissional'::tipo_usuario then
    select count(*)::int into v_concluidos
    from public.solicitacoes
    where profissional_id = p_user_id and status = 'concluida';

    v_taxa_secundaria := public.fn_reputacao_taxa_resposta(p_user_id);
  else
    select count(*)::int into v_concluidos
    from public.solicitacoes
    where cliente_id = p_user_id and status = 'concluida';

    v_taxa_secundaria := public.fn_reputacao_taxa_cancelamento(p_user_id);
  end if;

  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json)
  into v_avaliacoes
  from (
    select
      a.id,
      public.fn_avaliacao_nota_efetiva(a.nota, a.nota_qualidade, a.nota_prazo, a.nota_comunicacao) as nota,
      a.comentario,
      a.created_at,
      coalesce(av.nome, 'Usuário') as avaliador_nome,
      coalesce(s.titulo, 'Atendimento') as servico
    from public.avaliacoes a
    join public.profiles av on av.id = a.avaliador_id
    left join public.solicitacoes s on s.id = a.atendimento_id
    where a.avaliado_id = p_user_id
      and coalesce(a.moderacao_oculto, false) = false
      and a.comentario is not null
      and length(trim(a.comentario)) > 0
    order by a.created_at desc
    limit greatest(1, least(coalesce(p_limite, 20), 50))
  ) t;

  return json_build_object(
    'ok', true,
    'user_id', p_user_id,
    'tipo', v_tipo::text,
    'nota_media', coalesce(v_nota_media, 0),
    'total_avaliacoes', coalesce(v_total, 0),
    'concluidos', coalesce(v_concluidos, 0),
    'taxa_secundaria', coalesce(v_taxa_secundaria, 0),
    'avaliacoes', coalesce(v_avaliacoes, '[]'::json)
  );
end;
$$;

-- Atualiza fn_avaliar_atendimento_novo: notifica + recalcula score do prestador
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
  v_eh_cliente boolean;
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

  v_eh_cliente := v_sol.cliente_id = v_user;

  if v_eh_cliente then
    v_avaliado := v_sol.profissional_id;
  elsif v_sol.profissional_id = v_user then
    v_avaliado := v_sol.cliente_id;
  else
    return json_build_object('ok', false, 'erro', 'sem_permissao');
  end if;

  if v_avaliado = v_user then
    return json_build_object('ok', false, 'erro', 'autoavaliacao');
  end if;

  insert into public.avaliacoes (
    atendimento_id, avaliador_id, avaliado_id, nota, comentario,
    nota_qualidade, nota_prazo, nota_comunicacao, bloqueio_edicao_ate
  ) values (
    p_solicitacao_id, v_user, v_avaliado, p_nota,
    nullif(trim(coalesce(p_comentario, '')), ''),
    p_nota, p_nota, p_nota,
    now() + interval '7 days'
  )
  on conflict (atendimento_id, avaliador_id) do update set
    nota = excluded.nota,
    comentario = excluded.comentario,
    nota_qualidade = excluded.nota_qualidade,
    nota_prazo = excluded.nota_prazo,
    nota_comunicacao = excluded.nota_comunicacao
  returning id into v_id;

  if v_eh_cliente then
    perform public.fn_atualizar_score_prestador(v_sol.profissional_id);
    perform public.fn_notificar_financeiro(
      v_sol.profissional_id,
      'nova_avaliacao',
      'Nova avaliação',
      coalesce(nullif(trim(coalesce(p_comentario, '')), ''), 'Um cliente avaliou seu atendimento.'),
      jsonb_build_object('solicitacao_id', p_solicitacao_id, 'avaliacao_id', v_id, 'nota', p_nota)
    );
  else
    perform public.fn_notificar_financeiro(
      v_sol.cliente_id,
      'nova_avaliacao',
      'Nova avaliação',
      coalesce(nullif(trim(coalesce(p_comentario, '')), ''), 'Um profissional avaliou você.'),
      jsonb_build_object('solicitacao_id', p_solicitacao_id, 'avaliacao_id', v_id, 'nota', p_nota)
    );
  end if;

  perform public.fn_criar_evento_atendimento(
    p_solicitacao_id, 'avaliacao_realizada',
    case when v_eh_cliente then 'Cliente avaliou o profissional'
         else 'Profissional avaliou o cliente' end,
    null,
    case when v_eh_cliente then 'cliente' else 'profissional' end,
    v_user, null, null, null, null,
    jsonb_build_object('nota', p_nota, 'avaliacao_id', v_id)
  );

  return json_build_object('ok', true, 'avaliacao_id', v_id);
end;
$$;

-- Garante score atualizado em qualquer insert/update de avaliação
create or replace function public.trg_avaliacao_atualiza_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.moderacao_oculto, false) = false then
    perform public.fn_atualizar_score_prestador(new.avaliado_id);
  end if;
  if tg_op = 'UPDATE' and old.avaliado_id is distinct from new.avaliado_id then
    perform public.fn_atualizar_score_prestador(old.avaliado_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_avaliacao_score on public.avaliacoes;
create trigger trg_avaliacao_score
  after insert or update of nota, nota_qualidade, nota_prazo, nota_comunicacao, moderacao_oculto, avaliado_id
  on public.avaliacoes
  for each row execute function public.trg_avaliacao_atualiza_score();

revoke all on function public.fn_reputacao_buscar(uuid, int) from public;
grant execute on function public.fn_reputacao_buscar(uuid, int) to authenticated;

revoke all on function public.fn_reputacao_taxa_resposta(uuid) from public;
grant execute on function public.fn_reputacao_taxa_resposta(uuid) to authenticated;

revoke all on function public.fn_reputacao_taxa_cancelamento(uuid) from public;
grant execute on function public.fn_reputacao_taxa_cancelamento(uuid) to authenticated;
