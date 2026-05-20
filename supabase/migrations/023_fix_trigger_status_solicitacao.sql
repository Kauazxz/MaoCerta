-- ============================================================
-- Fix: trigger criar_etapas_na_aceicao referenciava o type
-- public.status_solicitacao que nunca foi criado.
-- A coluna solicitacoes.status e' text (definida na migration 007),
-- entao basta comparar com a string diretamente.
--
-- Sintomas que isso causa antes do fix:
--   - "Falha ao abrir atendimento: type public.status_solicitacao does not exist"
--   - Erro ao publicar Solicitar servico direto pro prestador
--   - Erro ao escolher prestador (insert de solicitacao)
-- ============================================================

create or replace function public.trigger_criar_etapas_na_aceicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'aceita' then
    perform public.criar_etapas_padrao(new.id);
  end if;
  return new;
end;
$$;
