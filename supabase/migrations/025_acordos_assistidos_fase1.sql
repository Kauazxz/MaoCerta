-- ============================================================
-- Acordos Assistidos no chat do atendimento - Fase 1
--
-- Camada de comunicacao sobre o chat existente:
-- - acordos_chat_sugeridos: card de sugestao criado a partir de uma
--   mensagem do chat
-- - acordos_chat_confirmacoes: cada lado (cliente/prestador) confirma
--   ou recusa o card
-- - eventos_moderacao_chat: detecoes de tentativa de pagamento fora,
--   compartilhamento de telefone, etc. (preenchida na fase 2)
-- - termos_conclusao_atendimento: termo final de conclusao do servico
--   (usado na fase 3)
--
-- Nada do fluxo existente e' alterado. Todas as tabelas sao novas.
-- ============================================================

-- 1) acordos_chat_sugeridos --------------------------------------------------

create table if not exists public.acordos_chat_sugeridos (
  id uuid default gen_random_uuid() primary key,
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  mensagem_origem_id uuid references public.mensagens_atendimento(id) on delete set null,
  sugerido_por_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in (
    'vistoria', 'consulta', 'orcamento', 'agendamento',
    'execucao', 'conclusao', 'cancelamento'
  )),
  resumo text not null,
  data_hora timestamptz,
  valor numeric(10, 2),
  observacoes text,
  status text not null default 'aguardando' check (status in (
    'aguardando', 'aceito', 'recusado', 'editado', 'convertido', 'expirado'
  )),
  convertido_em uuid,        -- id da etapa OU agendamento criado
  convertido_tipo text,      -- 'etapa' | 'agendamento'
  confianca smallint default 80 check (confianca between 0 and 100),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_acordos_sugeridos_solicitacao on public.acordos_chat_sugeridos (solicitacao_id);
create index if not exists idx_acordos_sugeridos_status on public.acordos_chat_sugeridos (status);

alter table public.acordos_chat_sugeridos enable row level security;

drop policy if exists "acordos_sugeridos_select_participantes" on public.acordos_chat_sugeridos;
create policy "acordos_sugeridos_select_participantes" on public.acordos_chat_sugeridos
  for select to authenticated
  using (
    exists (
      select 1 from public.solicitacoes s
      where s.id = solicitacao_id
        and (s.cliente_id = auth.uid() or s.profissional_id = auth.uid())
    )
  );

drop policy if exists "acordos_sugeridos_insert_participantes" on public.acordos_chat_sugeridos;
create policy "acordos_sugeridos_insert_participantes" on public.acordos_chat_sugeridos
  for insert to authenticated
  with check (
    sugerido_por_id = auth.uid()
    and exists (
      select 1 from public.solicitacoes s
      where s.id = solicitacao_id
        and (s.cliente_id = auth.uid() or s.profissional_id = auth.uid())
    )
  );

drop policy if exists "acordos_sugeridos_update_participantes" on public.acordos_chat_sugeridos;
create policy "acordos_sugeridos_update_participantes" on public.acordos_chat_sugeridos
  for update to authenticated
  using (
    exists (
      select 1 from public.solicitacoes s
      where s.id = solicitacao_id
        and (s.cliente_id = auth.uid() or s.profissional_id = auth.uid())
    )
  );

-- 2) acordos_chat_confirmacoes -----------------------------------------------

create table if not exists public.acordos_chat_confirmacoes (
  id uuid default gen_random_uuid() primary key,
  acordo_id uuid not null references public.acordos_chat_sugeridos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  acao text not null check (acao in ('aceitou', 'recusou', 'editou')),
  dados_edicao jsonb,
  created_at timestamptz default now() not null,
  unique (acordo_id, user_id, acao)
);

create index if not exists idx_acordos_confirmacoes_acordo on public.acordos_chat_confirmacoes (acordo_id);

alter table public.acordos_chat_confirmacoes enable row level security;

drop policy if exists "acordos_conf_select_participantes" on public.acordos_chat_confirmacoes;
create policy "acordos_conf_select_participantes" on public.acordos_chat_confirmacoes
  for select to authenticated
  using (
    exists (
      select 1 from public.acordos_chat_sugeridos a
      join public.solicitacoes s on s.id = a.solicitacao_id
      where a.id = acordo_id
        and (s.cliente_id = auth.uid() or s.profissional_id = auth.uid())
    )
  );

drop policy if exists "acordos_conf_insert_proprio" on public.acordos_chat_confirmacoes;
create policy "acordos_conf_insert_proprio" on public.acordos_chat_confirmacoes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.acordos_chat_sugeridos a
      join public.solicitacoes s on s.id = a.solicitacao_id
      where a.id = acordo_id
        and (s.cliente_id = auth.uid() or s.profissional_id = auth.uid())
    )
  );

-- 3) eventos_moderacao_chat (estrutura pronta, populada na Fase 2) -----------

create table if not exists public.eventos_moderacao_chat (
  id uuid default gen_random_uuid() primary key,
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  mensagem_id uuid references public.mensagens_atendimento(id) on delete cascade,
  autor_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in (
    'telefone', 'whatsapp', 'email', 'link_externo', 'pagamento_externo', 'outro'
  )),
  trecho_detectado text,
  severidade smallint not null default 1 check (severidade between 1 and 5),
  revisado boolean default false not null,
  revisado_por uuid references public.profiles(id) on delete set null,
  revisado_em timestamptz,
  created_at timestamptz default now() not null
);

create index if not exists idx_eventos_moderacao_solicitacao on public.eventos_moderacao_chat (solicitacao_id);
create index if not exists idx_eventos_moderacao_revisado on public.eventos_moderacao_chat (revisado) where revisado = false;

alter table public.eventos_moderacao_chat enable row level security;

drop policy if exists "moderacao_select_participantes_admin" on public.eventos_moderacao_chat;
create policy "moderacao_select_participantes_admin" on public.eventos_moderacao_chat
  for select to authenticated
  using (
    public.is_administrator()
    or exists (
      select 1 from public.solicitacoes s
      where s.id = solicitacao_id
        and (s.cliente_id = auth.uid() or s.profissional_id = auth.uid())
    )
  );

drop policy if exists "moderacao_insert_participantes" on public.eventos_moderacao_chat;
create policy "moderacao_insert_participantes" on public.eventos_moderacao_chat
  for insert to authenticated
  with check (
    autor_id = auth.uid()
  );

-- 4) termos_conclusao_atendimento (estrutura pronta, usada na Fase 3) --------

create table if not exists public.termos_conclusao_atendimento (
  id uuid default gen_random_uuid() primary key,
  solicitacao_id uuid not null unique references public.solicitacoes(id) on delete cascade,
  criado_por_id uuid not null references public.profiles(id) on delete cascade,
  resumo_servico text not null,
  valor_total numeric(10, 2),
  etapas_snapshot jsonb,
  confirmado_cliente boolean default false not null,
  confirmado_cliente_em timestamptz,
  confirmado_profissional boolean default false not null,
  confirmado_profissional_em timestamptz,
  status text not null default 'aguardando' check (status in (
    'aguardando', 'confirmado', 'cancelado'
  )),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.termos_conclusao_atendimento enable row level security;

drop policy if exists "termos_select_participantes" on public.termos_conclusao_atendimento;
create policy "termos_select_participantes" on public.termos_conclusao_atendimento
  for select to authenticated
  using (
    exists (
      select 1 from public.solicitacoes s
      where s.id = solicitacao_id
        and (s.cliente_id = auth.uid() or s.profissional_id = auth.uid())
    )
  );

drop policy if exists "termos_insert_participantes" on public.termos_conclusao_atendimento;
create policy "termos_insert_participantes" on public.termos_conclusao_atendimento
  for insert to authenticated
  with check (
    criado_por_id = auth.uid()
    and exists (
      select 1 from public.solicitacoes s
      where s.id = solicitacao_id
        and (s.cliente_id = auth.uid() or s.profissional_id = auth.uid())
    )
  );

drop policy if exists "termos_update_participantes" on public.termos_conclusao_atendimento;
create policy "termos_update_participantes" on public.termos_conclusao_atendimento
  for update to authenticated
  using (
    exists (
      select 1 from public.solicitacoes s
      where s.id = solicitacao_id
        and (s.cliente_id = auth.uid() or s.profissional_id = auth.uid())
    )
  );

-- 5) Trigger: aceite mutuo - converter acordo para etapa/agendamento ---------

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
    -- ainda nao temos aceite dos dois; apenas atualiza status para 'aceito' parcial
    update public.acordos_chat_sugeridos
    set status = 'aceito', updated_at = now()
    where id = v_acordo.id and status = 'aguardando';
    return new;
  end if;

  -- AMBOS aceitaram: converter em recurso real
  if v_acordo.tipo in ('vistoria', 'consulta', 'orcamento', 'execucao', 'conclusao') then
    -- Cria etapa no atendimento. Usa o tipo do acordo como tipo da etapa
    -- (mantendo coerencia com etapas_tipos quando possivel).
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
    -- Para agendamento puro, registra como proposta de agendamento na etapa
    -- mais proxima de status agendable. Se nao houver etapa, cria uma.
    select id into v_etapa_id from public.etapas_atendimento
    where solicitacao_id = v_sol.id
      and status in ('pendente', 'agendada', 'em_progresso')
    order by sequencia asc limit 1;

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

    insert into public.agendamento_propostas (
      solicitacao_id, etapa_id, proposto_por, data_proposta, hora_proposta,
      status, observacoes
    ) values (
      v_sol.id, v_etapa_id, new.user_id,
      (v_acordo.data_hora at time zone 'America/Sao_Paulo')::date,
      to_char((v_acordo.data_hora at time zone 'America/Sao_Paulo')::time, 'HH24:MI'),
      'aceito_ambos',
      v_acordo.observacoes
    );

    update public.acordos_chat_sugeridos
    set status = 'convertido',
        convertido_em = v_etapa_id,
        convertido_tipo = 'agendamento',
        updated_at = now()
    where id = v_acordo.id;

  elsif v_acordo.tipo = 'cancelamento' then
    -- Cancelamento e' acao terminal: marca o acordo como convertido mas nao
    -- cancela a solicitacao automaticamente (o usuario deve usar o botao
    -- existente, evitando concorrencia com fluxo de pagamento/escrow).
    update public.acordos_chat_sugeridos
    set status = 'convertido',
        convertido_tipo = 'cancelamento',
        updated_at = now()
    where id = v_acordo.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_acordo_chat_processar_aceite on public.acordos_chat_confirmacoes;
create trigger trg_acordo_chat_processar_aceite
  after insert on public.acordos_chat_confirmacoes
  for each row execute function public.fn_acordo_chat_processar_aceite();

-- 6) Coluna 'observacoes' em etapas_atendimento (se nao existir) -------------
-- O trigger acima precisa de uma coluna observacoes; criamos se nao houver.
alter table public.etapas_atendimento
  add column if not exists observacoes text;
