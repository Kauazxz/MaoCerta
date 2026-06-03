-- ============================================================
-- Notificacoes automaticas (sino do app)
--
-- Antes essa rodada: quando o cliente publicava uma demanda, fazia
-- uma solicitacao direta ou enviava uma proposta, NADA inseria em
-- public.notificacoes_financeiras. Logo, o sino do prestador/cliente
-- nunca tinha o que mostrar - mesmo com Realtime funcionando.
--
-- Esta migration adiciona triggers que INSERT em
-- notificacoes_financeiras nos eventos importantes:
--   - nova solicitacao direta -> notifica o prestador
--   - nova proposta em demanda -> notifica o cliente dono da demanda
--   - solicitacao aceita pelo prestador -> notifica o cliente
--   - solicitacao recusada pelo prestador -> notifica o cliente
--   - solicitacao cancelada -> notifica o outro lado
--
-- Como notificacoes_financeiras esta na publication supabase_realtime
-- (migration 044), assim que um INSERT acontece o BarraTopoApp em
-- todos os dispositivos conectados recebe o evento e mostra o sino
-- com badge.
--
-- Idempotente.
-- ============================================================

-- 1) Helper de insert
create or replace function public.fn_notif_inserir(
  p_user uuid, p_tipo text, p_titulo text, p_corpo text, p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then return; end if;
  insert into public.notificacoes_financeiras (user_id, tipo, titulo, corpo, payload)
  values (p_user, p_tipo, p_titulo, coalesce(p_corpo, ''), coalesce(p_payload, '{}'::jsonb));
end;
$$;

-- 2) Trigger em solicitacoes (INSERT + UPDATE de status)
create or replace function public.trg_notif_solicitacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome_cli text;
  v_nome_pre text;
begin
  -- Nome de quem dispara, para textos amigaveis
  select nome into v_nome_cli from public.profiles where id = new.cliente_id;
  select nome into v_nome_pre from public.profiles where id = new.profissional_id;

  if tg_op = 'INSERT' then
    -- Solicitacao nova entrando como pendente: avisa o prestador
    if new.status = 'pendente' then
      perform public.fn_notif_inserir(
        new.profissional_id,
        'nova_solicitacao',
        'Nova solicitação de serviço',
        coalesce(v_nome_cli, 'Um cliente') || ' enviou uma solicitação: ' || coalesce(new.titulo, 'sem titulo'),
        jsonb_build_object('solicitacao_id', new.id)
      );
    end if;
    -- Solicitacao criada ja como aceita (escolheu proposta): avisa o prestador
    if new.status = 'aceita' then
      perform public.fn_notif_inserir(
        new.profissional_id,
        'proposta_aceita',
        'Sua proposta foi escolhida',
        coalesce(v_nome_cli, 'O cliente') || ' escolheu sua proposta em "' || coalesce(new.titulo, 'demanda') || '".',
        jsonb_build_object('solicitacao_id', new.id)
      );
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'aceita' then
      perform public.fn_notif_inserir(
        new.cliente_id,
        'solicitacao_aceita',
        'Prestador aceitou seu pedido',
        coalesce(v_nome_pre, 'O prestador') || ' aceitou: ' || coalesce(new.titulo, ''),
        jsonb_build_object('solicitacao_id', new.id)
      );
    elsif new.status = 'recusada' then
      perform public.fn_notif_inserir(
        new.cliente_id,
        'solicitacao_recusada',
        'Prestador recusou seu pedido',
        coalesce(v_nome_pre, 'O prestador') || ' recusou: ' || coalesce(new.titulo, ''),
        jsonb_build_object('solicitacao_id', new.id)
      );
    elsif new.status = 'em_andamento' then
      perform public.fn_notif_inserir(
        new.cliente_id,
        'atendimento_iniciado',
        'Atendimento iniciado',
        coalesce(v_nome_pre, 'O prestador') || ' começou: ' || coalesce(new.titulo, ''),
        jsonb_build_object('solicitacao_id', new.id)
      );
    elsif new.status = 'concluida' then
      perform public.fn_notif_inserir(
        new.cliente_id,
        'atendimento_concluido',
        'Atendimento concluído',
        coalesce(v_nome_pre, 'O prestador') || ' marcou como concluído: ' || coalesce(new.titulo, ''),
        jsonb_build_object('solicitacao_id', new.id)
      );
    elsif new.status = 'cancelada' then
      -- Notifica o lado oposto a quem cancelou
      if auth.uid() = new.cliente_id then
        perform public.fn_notif_inserir(
          new.profissional_id,
          'atendimento_cancelado',
          'Atendimento cancelado',
          coalesce(v_nome_cli, 'O cliente') || ' cancelou: ' || coalesce(new.titulo, ''),
          jsonb_build_object('solicitacao_id', new.id)
        );
      else
        perform public.fn_notif_inserir(
          new.cliente_id,
          'atendimento_cancelado',
          'Atendimento cancelado',
          coalesce(v_nome_pre, 'O prestador') || ' cancelou: ' || coalesce(new.titulo, ''),
          jsonb_build_object('solicitacao_id', new.id)
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notificar_solicitacao on public.solicitacoes;
create trigger trg_notificar_solicitacao
  after insert or update of status on public.solicitacoes
  for each row execute function public.trg_notif_solicitacao();

-- 3) Trigger em propostas (nova proposta -> avisa cliente da demanda)
create or replace function public.trg_notif_proposta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_demanda record;
  v_nome_pre text;
begin
  if tg_op <> 'INSERT' then return new; end if;

  select d.id, d.cliente_id, d.titulo into v_demanda
  from public.demandas d
  where d.id = new.demanda_id;

  if not found or v_demanda.cliente_id is null then
    return new;
  end if;

  select nome into v_nome_pre from public.profiles where id = new.profissional_id;

  perform public.fn_notif_inserir(
    v_demanda.cliente_id,
    'nova_proposta',
    'Nova proposta recebida',
    coalesce(v_nome_pre, 'Um prestador') || ' enviou uma proposta na sua demanda "' || coalesce(v_demanda.titulo, '') || '".',
    jsonb_build_object('demanda_id', v_demanda.id, 'proposta_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_notificar_proposta on public.propostas;
create trigger trg_notificar_proposta
  after insert on public.propostas
  for each row execute function public.trg_notif_proposta();
