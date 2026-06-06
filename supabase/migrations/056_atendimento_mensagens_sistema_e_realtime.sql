-- ============================================================
-- F2 do novo motor de atendimento.
--
-- 1) Trigger que cria mensagem de sistema compacta no chat sempre que
--    um evento relevante e' inserido em atendimento_eventos. Isso
--    deixa o chat limpo: a conversa segue normal e as acoes formais
--    viram bolhinhas compactas clicaveis (deeplink para a aba/card).
--
-- 2) Garante REPLICA IDENTITY FULL nas novas tabelas e as adiciona a
--    publicacao supabase_realtime para que postgres_changes funcione
--    com server-side filters.
-- ============================================================

-- ============================================================
-- 1) Mapeia eventos -> conteudo curto + deeplink. Helper interno
--    chamado pelo trigger.
-- ============================================================
create or replace function public.fn_evento_para_mensagem(
  p_evento public.atendimento_eventos
) returns table (
  conteudo  text,
  deeplink  jsonb
)
language plpgsql
stable
as $$
declare
  v_texto text;
  v_link  jsonb;
begin
  v_link := jsonb_build_object(
    'evento_id', p_evento.id,
    'plano_id',  p_evento.plano_id,
    'item_id',   p_evento.item_id,
    'cobranca_id', p_evento.cobranca_id
  );

  v_texto := case p_evento.tipo_evento
    when 'plano_criado'                then '📋 ' || coalesce(p_evento.titulo, 'Plano criado')
    when 'item_enviado'                then '📨 ' || coalesce(p_evento.titulo, 'Nova proposta')
    when 'item_aceito_cliente'         then '✓ ' || coalesce(p_evento.titulo, 'Cliente aceitou a proposta')
    when 'item_recusado_cliente'       then '✗ ' || coalesce(p_evento.titulo, 'Cliente recusou a proposta')
    when 'item_alterado'               then '✏️ ' || coalesce(p_evento.titulo, 'Cliente pediu alteracao')
    when 'cobranca_criada'             then '💰 ' || coalesce(p_evento.titulo, 'Nova cobranca')
    when 'cobranca_extra_criada'       then '➕ ' || coalesce(p_evento.titulo, 'Cobranca extra')
    when 'cobranca_aceita'             then '✓ ' || coalesce(p_evento.titulo, 'Cobranca aceita')
    when 'cobranca_recusada'           then '✗ ' || coalesce(p_evento.titulo, 'Cobranca recusada')
    when 'pix_gerado'                  then '💠 ' || coalesce(p_evento.titulo, 'Pix gerado')
    when 'pagamento_confirmado'        then '✓ ' || coalesce(p_evento.titulo, 'Pagamento confirmado')
    when 'pagamento_liberado'          then '🏦 ' || coalesce(p_evento.titulo, 'Valor liberado para o profissional')
    when 'item_iniciado'               then '▶️ ' || coalesce(p_evento.titulo, 'Profissional iniciou a etapa')
    when 'item_executado_profissional' then '🔨 ' || coalesce(p_evento.titulo, 'Profissional marcou como executado')
    when 'item_confirmado_cliente'     then '👍 ' || coalesce(p_evento.titulo, 'Cliente confirmou a execucao')
    when 'item_contestado'             then '⚠️ ' || coalesce(p_evento.titulo, 'Cobranca contestada')
    when 'disputa_aberta'              then '⚠️ Disputa aberta'
    when 'pronto_para_termo_final'     then '🏁 Atendimento pronto para conclusao'
    when 'atendimento_concluido'       then '✅ Atendimento concluido'
    else null
  end;

  conteudo := v_texto;
  deeplink := v_link;
  return next;
end;
$$;
revoke all on function public.fn_evento_para_mensagem(public.atendimento_eventos) from public;

-- ============================================================
-- 2) Trigger: ao inserir evento, escreve mensagem de sistema no chat
-- ============================================================
create or replace function public.fn_atendimento_evento_para_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg     record;
  v_remete  uuid;
begin
  -- Pega texto + deeplink correspondentes
  select * into v_msg from public.fn_evento_para_mensagem(new);
  if v_msg.conteudo is null then
    return new;
  end if;

  -- mensagens_atendimento.remetente_id e' NOT NULL FK -> profiles.
  -- Mensagem de sistema usa o profissional da solicitacao apenas para
  -- satisfazer a constraint. O front filtra por tipo='sistema' e nao
  -- exibe 'enviado por'.
  select profissional_id into v_remete from public.solicitacoes where id = new.solicitacao_id;
  if v_remete is null then
    return new;
  end if;

  insert into public.mensagens_atendimento (
    solicitacao_id, remetente_id, conteudo, tipo, deeplink
  ) values (
    new.solicitacao_id, v_remete, v_msg.conteudo, 'sistema', v_msg.deeplink
  );
  return new;
end;
$$;

drop trigger if exists trg_atendimento_evento_para_chat on public.atendimento_eventos;
create trigger trg_atendimento_evento_para_chat
  after insert on public.atendimento_eventos
  for each row execute function public.fn_atendimento_evento_para_chat();

-- ============================================================
-- 3) Realtime: REPLICA IDENTITY FULL + publicacao
-- ============================================================
alter table public.planos_atendimento        replica identity full;
alter table public.plano_itens_atendimento   replica identity full;
alter table public.cobrancas_atendimento     replica identity full;
alter table public.atendimento_eventos       replica identity full;

-- Adiciona a publicacao supabase_realtime de forma idempotente (se ja
-- estiverem na publicacao, o add falha silenciosamente via DO).
do $$
begin
  begin
    alter publication supabase_realtime add table public.planos_atendimento;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.plano_itens_atendimento;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.cobrancas_atendimento;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.atendimento_eventos;
  exception when duplicate_object then null;
  end;
end $$;
