-- ============================================================
-- HOTFIX da migration 041:
--
-- O trigger trg_bloqueia_prestador_nao_validado lancava raise
-- exception em qualquer INSERT/UPDATE de status para 'aceita' ou
-- 'em_andamento' em solicitacoes. Como nenhum prestador estava com
-- validado=true (default false), todo o fluxo de aceitar atendimento
-- ficou quebrado:
--   - Cliente "Solicitar serviço" -> falha
--   - Cliente "Escolher proposta" -> falha
--   - Prestador "Aceitar pedido" -> falha
--   - Prestador "Iniciar atendimento" -> falha
--
-- ESTRATEGIA:
--
-- 1) Backfill: marca como validado=true todos os prestadores que
--    JA TIVERAM pelo menos 1 atendimento aceito antes da regra. Isso
--    preserva o estado real da plataforma (eles ja' estavam operando).
--
-- 2) Reescreve o trigger:
--    - Sempre bloqueia se profissional.suspenso = true
--    - Para validado: emite RAISE NOTICE (warning) mas NAO bloqueia.
--      A regra "prestador nao validado nao atende" pode ser ativada
--      em producao trocando a linha indicada no comentario.
--
-- Assim a apresentacao funciona e o admin tem o controle visual
-- (badges, dashboard) sem o sistema travar usuarios reais.
-- ============================================================

-- 1) Backfill: prestadores com historico real viram validados
update public.profiles p
set validado = true,
    validado_em = coalesce(p.validado_em, now())
where p.tipo = 'profissional'
  and p.validado = false
  and exists (
    select 1 from public.solicitacoes s
    where s.profissional_id = p.id
      and s.status in ('aceita', 'em_andamento', 'concluida')
  );

-- 2) Trigger relaxado
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
  if new.status not in ('aceita', 'em_andamento') then
    return new;
  end if;

  select validado, suspenso into v_validado, v_suspenso
  from public.profiles where id = new.profissional_id;

  -- Suspensao continua bloqueando (decisao administrativa forte)
  if v_suspenso then
    raise exception 'prestador_suspenso'
      using hint = 'A conta deste prestador esta suspensa pela administracao.';
  end if;

  -- Validacao: por enquanto SOFT (so registra notice).
  -- Para ativar bloqueio rigido em producao, descomente o RAISE EXCEPTION abaixo
  -- e comente o RAISE NOTICE:
  if v_validado is not true then
    raise notice 'Prestador % atendendo sem validacao completa', new.profissional_id;
    -- raise exception 'prestador_nao_validado'
    --   using hint = 'O prestador precisa enviar e ter documentos aprovados antes de atender.';
  end if;

  return new;
end;
$$;
