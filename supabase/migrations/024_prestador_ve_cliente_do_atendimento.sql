-- ============================================================
-- Permite que o prestador veja o perfil basico do cliente
-- nas solicitacoes (atendimentos) em que ele e' o profissional.
--
-- Sintoma antes do fix:
--   No detalhe do atendimento o prestador via "Sem nome" no
--   bloco do cliente, porque o join cliente:cliente_id na
--   solicitacoes era bloqueado pelo RLS de profiles (que so'
--   permitia ler o proprio perfil ou perfis publicos de
--   prestadores).
--
-- Mesma logica espelhada para o cliente ver o profissional
-- (ja' funcionava para prestadores via policy publica, mas
-- garantimos por linhagem do atendimento).
-- ============================================================

drop policy if exists "profiles_select_via_atendimento" on public.profiles;
create policy "profiles_select_via_atendimento"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.solicitacoes s
      where (
        (s.cliente_id = auth.uid() and s.profissional_id = profiles.id)
        or
        (s.profissional_id = auth.uid() and s.cliente_id = profiles.id)
      )
    )
  );
