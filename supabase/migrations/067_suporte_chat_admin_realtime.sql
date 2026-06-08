-- ============================================================
-- Suporte: chat realtime entre usuarios e administrador
--
-- Cria uma conversa de suporte por usuario + mensagens em tempo
-- real. Usuarios veem apenas a propria conversa; administradores
-- veem todas e respondem pela central de suporte.
-- ============================================================

create table if not exists public.suporte_conversas (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'aberta' check (status in ('aberta', 'fechada')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suporte_conversas_usuario_admin_diferentes check (user_id <> admin_id)
);

create unique index if not exists uniq_suporte_conversa_aberta_por_usuario
  on public.suporte_conversas (user_id)
  where status = 'aberta';

create index if not exists idx_suporte_conversas_admin_last
  on public.suporte_conversas (admin_id, last_message_at desc);

create table if not exists public.suporte_mensagens (
  id uuid default gen_random_uuid() primary key,
  conversa_id uuid not null references public.suporte_conversas(id) on delete cascade,
  remetente_id uuid not null references public.profiles(id) on delete cascade,
  conteudo text not null,
  created_at timestamptz not null default now(),
  constraint suporte_mensagens_conteudo_check check (char_length(trim(conteudo)) > 0)
);

create index if not exists idx_suporte_mensagens_conversa_created
  on public.suporte_mensagens (conversa_id, created_at);

alter table public.suporte_conversas enable row level security;
alter table public.suporte_mensagens enable row level security;

drop policy if exists "profiles_select_admin_suporte" on public.profiles;
create policy "profiles_select_admin_suporte" on public.profiles
  for select to authenticated
  using (tipo = 'administrador');

drop policy if exists "suporte_conversas_select" on public.suporte_conversas;
create policy "suporte_conversas_select" on public.suporte_conversas
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or admin_id = (select auth.uid())
    or (select public.is_administrator())
  );

drop policy if exists "suporte_conversas_insert_usuario" on public.suporte_conversas;
create policy "suporte_conversas_insert_usuario" on public.suporte_conversas
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = admin_id
        and p.tipo = 'administrador'
    )
  );

drop policy if exists "suporte_conversas_update_participantes" on public.suporte_conversas;
create policy "suporte_conversas_update_participantes" on public.suporte_conversas
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or admin_id = (select auth.uid())
    or (select public.is_administrator())
  )
  with check (
    user_id = (select auth.uid())
    or admin_id = (select auth.uid())
    or (select public.is_administrator())
  );

drop policy if exists "suporte_mensagens_select" on public.suporte_mensagens;
create policy "suporte_mensagens_select" on public.suporte_mensagens
  for select to authenticated
  using (
    exists (
      select 1
      from public.suporte_conversas c
      where c.id = conversa_id
        and (
          c.user_id = (select auth.uid())
          or c.admin_id = (select auth.uid())
          or (select public.is_administrator())
        )
    )
  );

drop policy if exists "suporte_mensagens_insert_participante" on public.suporte_mensagens;
create policy "suporte_mensagens_insert_participante" on public.suporte_mensagens
  for insert to authenticated
  with check (
    remetente_id = (select auth.uid())
    and exists (
      select 1
      from public.suporte_conversas c
      where c.id = conversa_id
        and c.status = 'aberta'
        and (
          c.user_id = (select auth.uid())
          or c.admin_id = (select auth.uid())
          or (select public.is_administrator())
        )
    )
  );

create or replace function public.fn_suporte_touch_conversa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.suporte_conversas
     set last_message_at = new.created_at,
         updated_at = now()
   where id = new.conversa_id;

  return new;
end;
$$;

drop trigger if exists trg_suporte_mensagens_touch_conversa on public.suporte_mensagens;
create trigger trg_suporte_mensagens_touch_conversa
after insert on public.suporte_mensagens
for each row execute function public.fn_suporte_touch_conversa();

-- Realtime
do $$
begin
  execute 'alter table public.suporte_conversas replica identity full';
exception when others then
  raise notice 'replica identity suporte_conversas: %', sqlerrm;
end $$;

do $$
begin
  execute 'alter table public.suporte_mensagens replica identity full';
exception when others then
  raise notice 'replica identity suporte_mensagens: %', sqlerrm;
end $$;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  begin
    alter publication supabase_realtime add table public.suporte_conversas;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.suporte_mensagens;
  exception when duplicate_object then null;
  end;
end $$;
