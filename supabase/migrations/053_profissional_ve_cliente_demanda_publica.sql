-- Permite que profissionais vejam o perfil do cliente que publicou uma demanda aberta.
-- Necessario para exibir o solicitante nos cards de demandas publicas.

drop policy if exists "profiles_select_cliente_demanda_aberta" on public.profiles;

create policy "profiles_select_cliente_demanda_aberta"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.demandas d
      where d.cliente_id = profiles.id
        and d.status = 'aberta'
        and d.cliente_id <> (select auth.uid())
    )
  );
