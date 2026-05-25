-- ============================================================
-- Admin - Fase 1.5: fixes e novas capacidades
--
-- 1) RPC fn_admin_listar_usuarios() retorna profiles + email da
--    auth.users (que nao tem acesso direto via PostgREST).
-- 2) Trigger BEFORE INSERT em solicitacoes que bloqueia prestador
--    nao validado de aceitar atendimentos (RN31 enforcement real).
-- 3) RPC fn_admin_notificar_usuario(user_id, titulo, corpo).
-- 4) Policies SELECT admin em mensagens_atendimento e
--    acordos_chat_sugeridos para a tela de monitoramento de chats.
-- ============================================================

-- 1) Listar usuarios com email (admin-only)
create or replace function public.fn_admin_listar_usuarios()
returns table (
  id uuid,
  nome text,
  email text,
  tipo text,
  cidade text,
  estado text,
  plano text,
  suspenso boolean,
  motivo_suspensao text,
  validado boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_administrator() then
    raise exception 'apenas_admin';
  end if;

  return query
  select
    p.id, p.nome, u.email::text, p.tipo::text, p.cidade, p.estado,
    p.plano::text, p.suspenso, p.motivo_suspensao, p.validado, p.created_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  order by p.created_at desc;
end;
$$;

revoke all on function public.fn_admin_listar_usuarios() from public;
grant execute on function public.fn_admin_listar_usuarios() to authenticated;

-- 2) Notificar usuario (admin avisa prestador a enviar/corrigir documentos, p.ex.)
create or replace function public.fn_admin_notificar_usuario(p_user_id uuid, p_titulo text, p_corpo text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_administrator() then
    return json_build_object('ok', false, 'erro', 'apenas_admin');
  end if;
  if coalesce(trim(p_titulo), '') = '' then
    return json_build_object('ok', false, 'erro', 'titulo_obrigatorio');
  end if;

  insert into public.notificacoes_financeiras (user_id, tipo, titulo, corpo, payload)
  values (p_user_id, 'admin_aviso', trim(p_titulo), coalesce(trim(p_corpo), ''), '{}'::jsonb);

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.fn_admin_notificar_usuario(uuid, text, text) from public;
grant execute on function public.fn_admin_notificar_usuario(uuid, text, text) to authenticated;

-- 3) Trigger: bloqueia prestador nao validado de aceitar atendimento (RN31)
create or replace function public.fn_bloqueia_prestador_nao_validado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_validado boolean;
  v_suspenso boolean;
begin
  -- Aplica apenas quando vira aceita/em_andamento (insert ou update)
  if new.status not in ('aceita', 'em_andamento') then
    return new;
  end if;

  select validado, suspenso into v_validado, v_suspenso
  from public.profiles where id = new.profissional_id;

  if v_suspenso then
    raise exception 'prestador_suspenso' using hint = 'Conta do prestador está suspensa.';
  end if;

  if v_validado is not true then
    raise exception 'prestador_nao_validado' using hint = 'O prestador precisa enviar e ter documentos aprovados antes de atender.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bloqueia_prestador_nao_validado on public.solicitacoes;
create trigger trg_bloqueia_prestador_nao_validado
  before insert or update of status on public.solicitacoes
  for each row execute function public.fn_bloqueia_prestador_nao_validado();

-- 4) Policies de SELECT admin para monitorar chats e acordos
drop policy if exists "mensagens_atend_select_admin" on public.mensagens_atendimento;
create policy "mensagens_atend_select_admin" on public.mensagens_atendimento
  for select to authenticated
  using (public.is_administrator());

drop policy if exists "acordos_sugeridos_select_admin" on public.acordos_chat_sugeridos;
create policy "acordos_sugeridos_select_admin" on public.acordos_chat_sugeridos
  for select to authenticated
  using (public.is_administrator());

drop policy if exists "acordos_conf_select_admin" on public.acordos_chat_confirmacoes;
create policy "acordos_conf_select_admin" on public.acordos_chat_confirmacoes
  for select to authenticated
  using (public.is_administrator());

-- 5) Backfill esquecido: docs com status 'enviado' (legados) -> 'pendente'
update public.documentos_validacao
set status = 'pendente'
where status = 'enviado';
