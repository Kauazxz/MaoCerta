-- ============================================================
-- Admin - Fase 1: acoes essenciais
--
-- 1) Coluna profiles.suspenso para RF61 (penalidade)
-- 2) Coluna profiles.validado para RN31 (prestador so atua validado)
-- 3) RPCs admin-only:
--    fn_admin_aprovar_documento(p_doc_id)
--    fn_admin_rejeitar_documento(p_doc_id, p_motivo)
--    fn_admin_suspender_usuario(p_user_id, p_motivo)
--    fn_admin_reativar_usuario(p_user_id)
--    fn_admin_promover_administrador(p_user_id)
--    fn_admin_marcar_validado(p_user_id, p_validado)
--
-- Todas usam SECURITY DEFINER e validam is_administrator().
-- ============================================================

-- 1) Colunas novas
alter table public.profiles
  add column if not exists suspenso boolean not null default false,
  add column if not exists motivo_suspensao text,
  add column if not exists suspenso_em timestamptz,
  add column if not exists validado boolean not null default false,
  add column if not exists validado_em timestamptz;

comment on column public.profiles.suspenso is 'Usuario suspenso por penalidade administrativa (RF61). Quando true, bloqueia operacoes principais.';
comment on column public.profiles.validado is 'Perfil verificado pela equipe administrativa (RN30/RN31). Prestador so atua se true.';

-- 2) Index para listagens admin rapidas
create index if not exists idx_profiles_tipo on public.profiles (tipo);
create index if not exists idx_profiles_validado on public.profiles (validado) where validado = false;
create index if not exists idx_documentos_status_pendente on public.documentos_validacao (status) where status in ('pendente', 'em_analise');

-- 3) Aprovar documento -> ja' aceito + marca prestador como validado se for o primeiro doc aprovado
create or replace function public.fn_admin_aprovar_documento(p_doc_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc record;
begin
  if not public.is_administrator() then
    return json_build_object('ok', false, 'erro', 'apenas_admin');
  end if;

  select * into v_doc from public.documentos_validacao where id = p_doc_id;
  if not found then
    return json_build_object('ok', false, 'erro', 'doc_invalido');
  end if;

  update public.documentos_validacao
  set status = 'aprovado',
      analisado_em = now(),
      analisado_por = auth.uid(),
      motivo_rejeicao = null
  where id = p_doc_id;

  -- Marca o profissional como validado quando tiver pelo menos 1 doc aprovado
  update public.profiles
  set validado = true, validado_em = now()
  where id = v_doc.profissional_id
    and validado = false;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.fn_admin_aprovar_documento(uuid) from public;
grant execute on function public.fn_admin_aprovar_documento(uuid) to authenticated;

-- 4) Rejeitar documento com motivo
create or replace function public.fn_admin_rejeitar_documento(p_doc_id uuid, p_motivo text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_administrator() then
    return json_build_object('ok', false, 'erro', 'apenas_admin');
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    return json_build_object('ok', false, 'erro', 'motivo_obrigatorio');
  end if;

  update public.documentos_validacao
  set status = 'rejeitado',
      analisado_em = now(),
      analisado_por = auth.uid(),
      motivo_rejeicao = trim(p_motivo)
  where id = p_doc_id;

  if not found then
    return json_build_object('ok', false, 'erro', 'doc_invalido');
  end if;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.fn_admin_rejeitar_documento(uuid, text) from public;
grant execute on function public.fn_admin_rejeitar_documento(uuid, text) to authenticated;

-- 5) Suspender usuario (penalidade)
create or replace function public.fn_admin_suspender_usuario(p_user_id uuid, p_motivo text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_administrator() then
    return json_build_object('ok', false, 'erro', 'apenas_admin');
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    return json_build_object('ok', false, 'erro', 'motivo_obrigatorio');
  end if;

  -- Bloqueia auto-suspensao acidental
  if p_user_id = auth.uid() then
    return json_build_object('ok', false, 'erro', 'nao_pode_suspender_a_si_mesmo');
  end if;

  update public.profiles
  set suspenso = true,
      motivo_suspensao = trim(p_motivo),
      suspenso_em = now()
  where id = p_user_id;

  if not found then
    return json_build_object('ok', false, 'erro', 'usuario_invalido');
  end if;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.fn_admin_suspender_usuario(uuid, text) from public;
grant execute on function public.fn_admin_suspender_usuario(uuid, text) to authenticated;

-- 6) Reativar usuario suspenso
create or replace function public.fn_admin_reativar_usuario(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_administrator() then
    return json_build_object('ok', false, 'erro', 'apenas_admin');
  end if;

  update public.profiles
  set suspenso = false,
      motivo_suspensao = null,
      suspenso_em = null
  where id = p_user_id;

  if not found then
    return json_build_object('ok', false, 'erro', 'usuario_invalido');
  end if;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.fn_admin_reativar_usuario(uuid) from public;
grant execute on function public.fn_admin_reativar_usuario(uuid) to authenticated;

-- 7) Promover administrador
create or replace function public.fn_admin_promover_administrador(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_administrator() then
    return json_build_object('ok', false, 'erro', 'apenas_admin');
  end if;

  update public.profiles
  set tipo = 'administrador'::tipo_usuario
  where id = p_user_id;

  if not found then
    return json_build_object('ok', false, 'erro', 'usuario_invalido');
  end if;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.fn_admin_promover_administrador(uuid) from public;
grant execute on function public.fn_admin_promover_administrador(uuid) to authenticated;

-- 8) Marcar/desmarcar validado direto (atalho admin sem precisar passar pelo doc)
create or replace function public.fn_admin_marcar_validado(p_user_id uuid, p_validado boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_administrator() then
    return json_build_object('ok', false, 'erro', 'apenas_admin');
  end if;

  update public.profiles
  set validado = p_validado,
      validado_em = case when p_validado then now() else null end
  where id = p_user_id;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.fn_admin_marcar_validado(uuid, boolean) from public;
grant execute on function public.fn_admin_marcar_validado(uuid, boolean) to authenticated;
