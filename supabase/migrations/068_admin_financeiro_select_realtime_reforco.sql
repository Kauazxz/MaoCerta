-- ============================================================
-- Admin financeiro: reforco de leitura e realtime
--
-- A tela /admin/financeiro precisa listar pagamentos de servico,
-- compras de plano, transacoes de carteira e disputas com contexto
-- de usuario. Esta migration e idempotente e reforca as policies
-- ja criadas anteriormente para bancos que estejam desalinhados.
-- ============================================================

drop policy if exists "pagamentos_select_admin_global" on public.pagamentos;
create policy "pagamentos_select_admin_global" on public.pagamentos
  for select to authenticated using ((select public.is_administrator()));

drop policy if exists "pp_select_admin" on public.pagamentos_plano;
create policy "pp_select_admin" on public.pagamentos_plano
  for select to authenticated using ((select public.is_administrator()));

drop policy if exists "wallet_tx_select_admin" on public.wallet_transactions;
create policy "wallet_tx_select_admin" on public.wallet_transactions
  for select to authenticated using ((select public.is_administrator()));

drop policy if exists "wallets_select_admin" on public.wallets;
create policy "wallets_select_admin" on public.wallets
  for select to authenticated using ((select public.is_administrator()));

drop policy if exists "disputas_select_admin" on public.disputas;
create policy "disputas_select_admin" on public.disputas
  for select to authenticated using ((select public.is_administrator()));

drop policy if exists "disputas_update_admin" on public.disputas;
create policy "disputas_update_admin" on public.disputas
  for update to authenticated using ((select public.is_administrator()));

-- Realtime para atualizacao administrativa quando pagamentos/carteira mudarem.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  begin
    execute 'alter table public.pagamentos replica identity full';
  exception when others then
    raise notice 'replica identity pagamentos: %', sqlerrm;
  end;

  begin
    execute 'alter table public.pagamentos_plano replica identity full';
  exception when others then
    raise notice 'replica identity pagamentos_plano: %', sqlerrm;
  end;

  begin
    execute 'alter table public.wallet_transactions replica identity full';
  exception when others then
    raise notice 'replica identity wallet_transactions: %', sqlerrm;
  end;

  begin
    execute 'alter table public.disputas replica identity full';
  exception when others then
    raise notice 'replica identity disputas: %', sqlerrm;
  end;

  begin
    alter publication supabase_realtime add table public.pagamentos;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.pagamentos_plano;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.wallet_transactions;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.disputas;
  exception when duplicate_object then null;
  end;
end $$;
