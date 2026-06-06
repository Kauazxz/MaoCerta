-- ============================================================
-- Hotfix: fn_atendimento_calcular_comissao criada na 055 usava
-- coluna inexistente 'comissao_padrao_percentual'. O nome correto
-- em config_financeiro (definido na 019) e' 'comissao_percentual'.
--
-- Sem essa correcao, qualquer chamada a' funcao falha com 42703 -
-- inclusive a fn_atendimento_migrar_legado da 059.
-- ============================================================

create or replace function public.fn_atendimento_calcular_comissao(
  p_valor numeric
) returns table (
  taxa_perc       numeric,
  taxa_valor      numeric,
  liquido_prof    numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pct numeric(5,2);
begin
  select coalesce(comissao_percentual, 10)::numeric(5,2)
    into v_pct
    from public.config_financeiro
    where id = 1;
  if v_pct is null then v_pct := 10; end if;
  taxa_perc    := v_pct;
  taxa_valor   := round(p_valor * v_pct / 100.0, 2);
  liquido_prof := round(p_valor - taxa_valor, 2);
  return next;
end;
$$;
revoke all on function public.fn_atendimento_calcular_comissao(numeric) from public;
