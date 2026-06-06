-- ============================================================
-- F1 do novo motor de atendimento (coexiste com modelo antigo).
--
-- Cria 4 tabelas:
--   1) planos_atendimento     - um plano ativo por solicitacao
--   2) plano_itens_atendimento - itens do plano (vistoria, diaria, etc)
--   3) cobrancas_atendimento  - ponte entre item e Pix (com campos
--                               explicitos de comissao da plataforma)
--   4) atendimento_eventos    - historico append-only
--
-- RLS:
--   - Writes diretos do client SO em planos (cliente/profissional)
--   - cobrancas e eventos so podem ser escritos via RPC SECURITY DEFINER
--   - Eventos sao append-only (sem UPDATE/DELETE policy)
--
-- Coexistencia: modelo antigo (etapas_atendimento, acordos_chat_*) NAO e'
-- tocado. Nenhuma migration anterior e' alterada.
-- ============================================================

-- ============================================================
-- 1) planos_atendimento
-- ============================================================
create table if not exists public.planos_atendimento (
  id              uuid primary key default gen_random_uuid(),
  solicitacao_id  uuid not null references public.solicitacoes(id) on delete cascade,
  titulo          text not null,
  descricao       text,
  modelo          text not null check (modelo in (
                    'servico_simples', 'pagamento_antes', 'pagamento_depois',
                    'por_hora', 'por_diaria', 'por_etapa', 'personalizado')),
  status          text not null default 'rascunho' check (status in (
                    'rascunho', 'em_negociacao', 'ativo',
                    'concluido', 'cancelado', 'em_disputa')),
  criado_por      uuid references public.profiles(id) on delete set null,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Apenas UM plano ativo por solicitacao
create unique index if not exists uniq_plano_ativo_por_solicitacao
  on public.planos_atendimento(solicitacao_id)
  where status in ('rascunho', 'em_negociacao', 'ativo');

create index if not exists idx_planos_solicitacao
  on public.planos_atendimento(solicitacao_id, status);

alter table public.planos_atendimento enable row level security;

-- SELECT: cliente, profissional ou admin
drop policy if exists "planos_select_participantes" on public.planos_atendimento;
create policy "planos_select_participantes" on public.planos_atendimento
  for select to authenticated
  using (
    exists (
      select 1 from public.solicitacoes s
      where s.id = solicitacao_id
        and (s.cliente_id = (select auth.uid())
             or s.profissional_id = (select auth.uid())
             or (select public.is_administrator()))
    )
  );

-- INSERT: profissional da solicitacao cria o plano
drop policy if exists "planos_insert_profissional" on public.planos_atendimento;
create policy "planos_insert_profissional" on public.planos_atendimento
  for insert to authenticated
  with check (
    criado_por = (select auth.uid())
    and exists (
      select 1 from public.solicitacoes s
      where s.id = solicitacao_id
        and s.profissional_id = (select auth.uid())
    )
  );

-- UPDATE direto so admin (transicoes feitas via RPC SECURITY DEFINER)
drop policy if exists "planos_update_admin" on public.planos_atendimento;
create policy "planos_update_admin" on public.planos_atendimento
  for update to authenticated
  using ((select public.is_administrator()));

-- ============================================================
-- 2) plano_itens_atendimento
-- ============================================================
create table if not exists public.plano_itens_atendimento (
  id              uuid primary key default gen_random_uuid(),
  plano_id        uuid not null references public.planos_atendimento(id) on delete cascade,
  solicitacao_id  uuid not null references public.solicitacoes(id) on delete cascade,
  tipo            text not null check (tipo in (
                    'vistoria','servico','diaria','hora','etapa','extra','sinal','final','ajuste')),
  titulo          text not null,
  descricao       text,
  ordem           int not null default 0,
  unidade         text not null default 'fixa' check (unidade in (
                    'fixa','hora','dia','etapa','extra')),
  quantidade_prevista     numeric(10,2),
  quantidade_realizada    numeric(10,2),
  valor_unitario          numeric(10,2),
  valor_total_previsto    numeric(10,2),
  valor_total_final       numeric(10,2),
  momento_pagamento       text not null check (momento_pagamento in (
                            'antes','depois','por_confirmacao','final','sem_cobranca')),
  requer_pagamento_para_iniciar          boolean not null default false,
  requer_confirmacao_cliente_para_cobrar boolean not null default true,
  permite_extra           boolean not null default true,
  obrigatorio             boolean not null default true,
  status                  text not null default 'rascunho' check (status in (
                            'rascunho','enviado','aceito','recusado',
                            'aguardando_pagamento','pago','pronto_para_iniciar',
                            'em_execucao','executado_pelo_profissional',
                            'aguardando_confirmacao_cliente','confirmado_pelo_cliente',
                            'aguardando_pagamento_final','concluido',
                            'contestado','cancelado')),
  inicio_previsto         timestamptz,
  fim_previsto            timestamptz,
  inicio_real             timestamptz,
  fim_real                timestamptz,
  aceito_cliente_at       timestamptz,
  aceito_profissional_at  timestamptz,
  confirmado_cliente_at   timestamptz,
  confirmado_profissional_at timestamptz,
  criado_por              uuid references public.profiles(id) on delete set null,
  metadata                jsonb not null default '{}',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_plano_itens_plano   on public.plano_itens_atendimento(plano_id, ordem);
create index if not exists idx_plano_itens_status  on public.plano_itens_atendimento(solicitacao_id, status);

alter table public.plano_itens_atendimento enable row level security;

drop policy if exists "itens_select_participantes" on public.plano_itens_atendimento;
create policy "itens_select_participantes" on public.plano_itens_atendimento
  for select to authenticated
  using (
    exists (
      select 1 from public.solicitacoes s
      where s.id = solicitacao_id
        and (s.cliente_id = (select auth.uid())
             or s.profissional_id = (select auth.uid())
             or (select public.is_administrator()))
    )
  );

-- INSERT direto pelo profissional (rascunho); transicoes via RPC
drop policy if exists "itens_insert_profissional" on public.plano_itens_atendimento;
create policy "itens_insert_profissional" on public.plano_itens_atendimento
  for insert to authenticated
  with check (
    criado_por = (select auth.uid())
    and exists (
      select 1 from public.solicitacoes s
      where s.id = solicitacao_id
        and s.profissional_id = (select auth.uid())
    )
  );

drop policy if exists "itens_update_admin" on public.plano_itens_atendimento;
create policy "itens_update_admin" on public.plano_itens_atendimento
  for update to authenticated
  using ((select public.is_administrator()));

-- ============================================================
-- 3) cobrancas_atendimento
-- ============================================================
create table if not exists public.cobrancas_atendimento (
  id              uuid primary key default gen_random_uuid(),
  solicitacao_id  uuid not null references public.solicitacoes(id) on delete cascade,
  plano_id        uuid references public.planos_atendimento(id) on delete set null,
  item_id         uuid references public.plano_itens_atendimento(id) on delete set null,
  pagamento_id    uuid references public.pagamentos(id) on delete set null,
  tipo            text not null check (tipo in (
                    'vistoria','sinal','base','diaria','hora','etapa','extra','final','ajuste')),
  titulo          text not null,
  descricao       text,
  -- Campos financeiros explicitos (preparado para taxa configuravel)
  valor                       numeric(10,2) not null check (valor > 0),
  valor_bruto                 numeric(10,2),
  taxa_plataforma_percentual  numeric(5,2),
  valor_taxa_plataforma       numeric(10,2),
  valor_liquido_profissional  numeric(10,2),
  moeda           text not null default 'BRL',
  status          text not null default 'rascunho' check (status in (
                    'rascunho','aguardando_aceite','aceita','pix_gerado',
                    'aguardando_pagamento','paga','retida','liberada',
                    'contestada','cancelada','expirada')),
  requer_aceite_cliente       boolean not null default true,
  requer_aceite_profissional  boolean not null default false,
  aceite_cliente_at           timestamptz,
  aceite_profissional_at      timestamptz,
  -- Mercado Pago
  mp_payment_id               text,
  mp_external_reference       text,
  pix_qr_code                 text,
  pix_qr_code_base64          text,
  pix_copia_cola              text,
  pix_expira_em               timestamptz,
  -- Datas chave
  pago_em                     timestamptz,
  liberado_em                 timestamptz,
  retido_em                   timestamptz,
  contestado_em               timestamptz,
  motivo_recusa               text,
  criado_por                  uuid references public.profiles(id) on delete set null,
  metadata                    jsonb not null default '{}',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- Idempotencia: nao permite duas cobrancas usando o mesmo mp_payment_id
-- (vem do MP, ja unico globalmente) nem o mesmo external_reference.
create unique index if not exists uniq_cobranca_mp_payment_id
  on public.cobrancas_atendimento(mp_payment_id)
  where mp_payment_id is not null;

create unique index if not exists uniq_cobranca_mp_external_reference
  on public.cobrancas_atendimento(mp_external_reference)
  where mp_external_reference is not null;

create index if not exists idx_cobrancas_solicitacao_status
  on public.cobrancas_atendimento(solicitacao_id, status);

create index if not exists idx_cobrancas_item
  on public.cobrancas_atendimento(item_id);

alter table public.cobrancas_atendimento enable row level security;

drop policy if exists "cobrancas_select_participantes" on public.cobrancas_atendimento;
create policy "cobrancas_select_participantes" on public.cobrancas_atendimento
  for select to authenticated
  using (
    exists (
      select 1 from public.solicitacoes s
      where s.id = solicitacao_id
        and (s.cliente_id = (select auth.uid())
             or s.profissional_id = (select auth.uid())
             or (select public.is_administrator()))
    )
  );

-- Sem INSERT/UPDATE/DELETE direto para authenticated.
-- Todas as escritas passam por RPC SECURITY DEFINER (ver migration 055).
drop policy if exists "cobrancas_update_admin" on public.cobrancas_atendimento;
create policy "cobrancas_update_admin" on public.cobrancas_atendimento
  for update to authenticated
  using ((select public.is_administrator()));

-- ============================================================
-- 4) atendimento_eventos (append-only)
-- ============================================================
create table if not exists public.atendimento_eventos (
  id              bigserial primary key,
  solicitacao_id  uuid not null references public.solicitacoes(id) on delete cascade,
  plano_id        uuid,
  item_id         uuid,
  cobranca_id     uuid,
  pagamento_id    uuid,
  ator_id         uuid references public.profiles(id) on delete set null,
  ator_tipo       text not null check (ator_tipo in ('cliente','profissional','admin','sistema')),
  tipo_evento     text not null,
  titulo          text,
  descricao       text,
  payload         jsonb not null default '{}',
  visibilidade    text not null default 'participantes' check (visibilidade in (
                    'participantes','admin','sistema')),
  created_at      timestamptz not null default now()
);

create index if not exists idx_eventos_solicitacao_created
  on public.atendimento_eventos(solicitacao_id, created_at desc);

create index if not exists idx_eventos_tipo
  on public.atendimento_eventos(tipo_evento);

alter table public.atendimento_eventos enable row level security;

-- SELECT: participante ve eventos com visibilidade=participantes; admin ve tudo
drop policy if exists "eventos_select_participantes" on public.atendimento_eventos;
create policy "eventos_select_participantes" on public.atendimento_eventos
  for select to authenticated
  using (
    (visibilidade = 'participantes'
      and exists (
        select 1 from public.solicitacoes s
        where s.id = solicitacao_id
          and (s.cliente_id = (select auth.uid())
               or s.profissional_id = (select auth.uid()))
      ))
    or (select public.is_administrator())
  );

-- Sem INSERT/UPDATE/DELETE direto. Append-only via fn_criar_evento_atendimento.

-- ============================================================
-- 5) Adicionar coluna 'tipo' em mensagens_atendimento para mensagens
--    de sistema (F2 inserira em /sistema; F1 prepara a coluna)
-- ============================================================
alter table public.mensagens_atendimento
  add column if not exists tipo text not null default 'usuario'
  check (tipo in ('usuario','sistema'));

alter table public.mensagens_atendimento
  add column if not exists deeplink jsonb;

comment on column public.mensagens_atendimento.tipo is
  'usuario = digitada por humano; sistema = compacta gerada por RPC';
comment on column public.mensagens_atendimento.deeplink is
  'metadata para clique levar a aba/card (ex: {aba: "plano", item_id: "..."})';
