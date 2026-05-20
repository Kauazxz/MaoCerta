-- ============================================================
-- Limpa dados transacionais do MaoCerta mantendo logins e perfil basico
--
-- MANTEM:
--   auth.users (logins/senhas)
--   profiles (nome, tipo, email, telefone, avatar, plano, cidade)
--   categorias (catalogo)
--   etapas_tipos (catalogo)
--   config_financeiro (configuracao da plataforma)
--   comissao_por_categoria (configuracao)
--   profissional_categorias (areas que o prestador atua)
--   documentos_validacao (selos)
--
-- APAGA:
--   avaliacoes, denuncias, bloqueios
--   demandas, propostas, demanda_recusas, acordos
--   solicitacoes (atendimentos), mensagens_atendimento, mensagens
--   etapas_atendimento, agendamento_propostas, cancelamento_etapas
--   pagamentos, pagamentos_plano, disputas
--   wallets, wallet_transactions, saques, wallet_withdrawals,
--   wallet_locks, wallet_balance_snapshots, scheduled_withdrawals, anticipations
--   payment_methods, payment_autopay_consents
--   notificacoes_financeiras, audit_financeiro, audit_chain
--   webhook_idempotency_keys, webhook_dead_letter
--   fiscal_recibos, reembolso_pedidos, pix_generation_ratelimit
--   servicos (catalogo individual do prestador)
--
-- Como executar:
--   1) Abra o Supabase Studio -> SQL Editor
--   2) Cole este arquivo
--   3) Execute
--   4) Confira a contagem no select final
-- ============================================================

begin;

-- Auditoria / webhooks / financeiro (folhas)
truncate table
  public.audit_chain,
  public.audit_financeiro,
  public.webhook_idempotency_keys,
  public.webhook_dead_letter,
  public.notificacoes_financeiras,
  public.fiscal_recibos,
  public.reembolso_pedidos,
  public.pix_generation_ratelimit,
  public.wallet_balance_snapshots,
  public.wallet_locks,
  public.scheduled_withdrawals,
  public.anticipations,
  public.wallet_withdrawals,
  public.saques,
  public.wallet_transactions,
  public.wallets,
  public.disputas,
  public.pagamentos,
  public.pagamentos_plano,
  public.payment_autopay_consents,
  public.payment_methods
restart identity cascade;

-- Etapas e agendamento
truncate table
  public.cancelamento_etapas,
  public.agendamento_propostas,
  public.etapas_atendimento
restart identity cascade;

-- Chat
truncate table
  public.mensagens_atendimento,
  public.mensagens
restart identity cascade;

-- Atendimentos, propostas, demandas
truncate table
  public.acordos,
  public.demanda_recusas,
  public.propostas,
  public.solicitacoes,
  public.demandas
restart identity cascade;

-- Servicos do prestador (catalogo individual, nao o catalogo global de categorias)
truncate table public.servicos restart identity cascade;

-- Marketplace social
truncate table
  public.avaliacoes,
  public.denuncias,
  public.bloqueios
restart identity cascade;

-- (Opcional) Resetar todos os perfis para plano free
-- Descomente a linha abaixo se quiser que TODOS percam o plano premium/basico/profissional
-- update public.profiles set plano = 'free';

commit;

-- Conferencia: quantos registros sobraram em cada tabela
select 'profiles'      as tabela, count(*) from public.profiles
union all select 'demandas',       count(*) from public.demandas
union all select 'propostas',      count(*) from public.propostas
union all select 'solicitacoes',   count(*) from public.solicitacoes
union all select 'mensagens',      count(*) from public.mensagens
union all select 'wallets',        count(*) from public.wallets
union all select 'pagamentos',     count(*) from public.pagamentos
union all select 'avaliacoes',     count(*) from public.avaliacoes
union all select 'servicos',       count(*) from public.servicos
order by tabela;
