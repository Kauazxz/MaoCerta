-- Denúncias: nota interna do admin + thread de mensagens com o denunciante

alter table public.denuncias
  add column if not exists nota_admin text;

create table if not exists public.denuncias_mensagens (
  id uuid default gen_random_uuid() primary key,
  denuncia_id uuid not null references public.denuncias(id) on delete cascade,
  remetente_id uuid not null references public.profiles(id) on delete cascade,
  conteudo text not null,
  created_at timestamptz default now(),
  constraint denuncias_mensagens_conteudo_check check (char_length(trim(conteudo)) > 0)
);

create index if not exists idx_denuncias_mensagens_denuncia
  on public.denuncias_mensagens (denuncia_id, created_at);

alter table public.denuncias_mensagens enable row level security;

drop policy if exists "denuncias_mensagens_select" on public.denuncias_mensagens;
create policy "denuncias_mensagens_select" on public.denuncias_mensagens
  for select to authenticated
  using (
    (select public.is_administrator())
    or exists (
      select 1 from public.denuncias d
      where d.id = denuncia_id
        and d.denunciante_id = (select auth.uid())
    )
  );

drop policy if exists "denuncias_mensagens_insert" on public.denuncias_mensagens;
create policy "denuncias_mensagens_insert" on public.denuncias_mensagens
  for insert to authenticated
  with check (
    remetente_id = (select auth.uid())
    and (
      (select public.is_administrator())
      or exists (
        select 1 from public.denuncias d
        where d.id = denuncia_id
          and d.denunciante_id = (select auth.uid())
      )
    )
  );

-- Realtime
do $$
begin
  execute 'alter table public.denuncias_mensagens replica identity full';
exception when others then
  raise notice 'replica identity denuncias_mensagens: %', sqlerrm;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.denuncias_mensagens';
exception when others then
  raise notice 'publication denuncias_mensagens: %', sqlerrm;
end $$;
