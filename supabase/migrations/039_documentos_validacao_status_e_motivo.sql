-- ============================================================
-- documentos_validacao: status formal + motivo da rejeicao
--
-- Antes: coluna status era text livre com default 'enviado' e nao
-- havia campo para justificativa quando o admin rejeitasse.
--
-- Agora:
--   status text constrained: pendente | em_analise | aprovado | rejeitado
--     (mantemos 'enviado' como alias historico mapeado para 'pendente'
--      via backfill abaixo)
--   motivo_rejeicao text (preenchido pelo admin quando rejeita)
--   analisado_por uuid -> profiles(id) (admin que decidiu)
--
-- Tambem cria policy de SELECT propria do prestador (ja tem RLS,
-- mas garantimos que ele veja os proprios documentos + admin ve tudo).
-- ============================================================

alter table public.documentos_validacao
  add column if not exists motivo_rejeicao text,
  add column if not exists analisado_por uuid references public.profiles(id) on delete set null;

-- Backfill: 'enviado' -> 'pendente'
update public.documentos_validacao
set status = 'pendente'
where status = 'enviado';

-- Constraint enum-like (drop primeiro pra ser idempotente)
alter table public.documentos_validacao
  drop constraint if exists documentos_validacao_status_check;

alter table public.documentos_validacao
  add constraint documentos_validacao_status_check
  check (status in ('pendente', 'em_analise', 'aprovado', 'rejeitado'));

-- Default agora e' 'pendente'
alter table public.documentos_validacao
  alter column status set default 'pendente';

-- RLS: garantir que o prestador veja os proprios documentos
alter table public.documentos_validacao enable row level security;

drop policy if exists "docs_select_dono_ou_admin" on public.documentos_validacao;
create policy "docs_select_dono_ou_admin" on public.documentos_validacao
  for select to authenticated
  using (
    profissional_id = auth.uid()
    or public.is_administrator()
  );

drop policy if exists "docs_insert_dono" on public.documentos_validacao;
create policy "docs_insert_dono" on public.documentos_validacao
  for insert to authenticated
  with check (profissional_id = auth.uid());

drop policy if exists "docs_update_admin" on public.documentos_validacao;
create policy "docs_update_admin" on public.documentos_validacao
  for update to authenticated
  using (public.is_administrator());
