-- ============================================================
-- Fase 2 - Fluxo dinamico do atendimento
--
-- Para de criar etapas padrao automaticamente quando uma solicitacao
-- vira 'aceita'. A partir de agora, etapas so nascem por acordo
-- mutuo registrado pela camada de Acordos Assistidos (chat).
--
-- Resultado pratico:
-- - servicos sem vistoria nao tem vistoria
-- - servicos sem orcamento nao tem orcamento
-- - cada atendimento monta seu fluxo conforme as conversas reais
-- - o EtapaAtualCard mostra "Aguardando acordos" em vez de etapa
--   vazia automatica
--
-- A funcao criar_etapas_padrao(uuid) permanece disponivel para uso
-- manual futuro (admin pode disparar se quiser modelo legado).
-- ============================================================

drop trigger if exists trg_criar_etapas_na_aceicao on public.solicitacoes;

-- Comentario explicativo na funcao remanescente
comment on function public.criar_etapas_padrao(uuid) is
  'Cria etapas padrao (vistoria, orcamento, execucao). NAO e chamada automaticamente. Pode ser disparada manualmente quando o modelo classico for desejavel.';

-- Backfill: NAO mexemos em atendimentos existentes que ja tinham
-- etapas criadas pelo modelo antigo. Eles continuam funcionando.
-- Apenas garantimos que dali em diante novos atendimentos seguem
-- o fluxo por acordo.
