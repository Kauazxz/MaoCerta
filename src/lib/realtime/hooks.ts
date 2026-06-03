'use client'

/**
 * Hooks de Realtime tipados para uso direto nas telas.
 *
 * Cada hook usa filtro server-side quando aplicavel para reduzir
 * trafego e respeitar RLS, evitando que clientes recebam eventos
 * que nao deveriam ver.
 *
 * Estes hooks NAO chamam fetch automaticamente - o callback decide
 * o que fazer. Use o callback para invalidar/refazer a query do
 * componente.
 *
 * IMPORTANTE: NAO mexer em chat / mensagens_atendimento. Quem
 * controla isso e' ChatAtendimento.tsx (intocado).
 */

import { useRealtimeChannel, type RealtimePayload } from '@/lib/realtime'

type Refetch = () => void

// ============================================================
// DEMANDAS
// ============================================================

/** Cliente vendo suas proprias demandas. */
export function useDemandasCliente(clienteId: string | null, refetch: Refetch) {
  useRealtimeChannel('demandas', refetch, {
    key: `dem-cli-${clienteId ?? 'none'}`,
    filter: clienteId ? `cliente_id=eq.${clienteId}` : undefined,
  })
}

/**
 * Prestador vendo demandas publicas (qualquer status). Nao filtramos
 * por status na subscription porque queremos pegar tambem mudancas
 * de status (ex: aceita->aberta de novo apos cancelamento).
 */
export function useDemandasPublicas(refetch: Refetch) {
  useRealtimeChannel('demandas', refetch, { key: 'dem-publicas' })
}

/** Telas de detalhe de demanda especifica. */
export function useDemandaUnica(demandaId: string | null, refetch: Refetch) {
  useRealtimeChannel('demandas', refetch, {
    key: `dem-${demandaId ?? 'none'}`,
    filter: demandaId ? `id=eq.${demandaId}` : undefined,
  })
}

// ============================================================
// PROPOSTAS
// ============================================================

/** Cliente vendo propostas das suas demandas. Sem filtro pois Supabase
 *  Realtime nao suporta IN. RLS ja' restringe e o callback decide. */
export function usePropostasCliente(refetch: Refetch) {
  useRealtimeChannel('propostas', refetch, { key: 'props-cli' })
}

/** Prestador vendo suas propostas (filtra por profissional_id). */
export function usePropostasPrestador(profissionalId: string | null, refetch: Refetch) {
  useRealtimeChannel('propostas', refetch, {
    key: `props-prest-${profissionalId ?? 'none'}`,
    filter: profissionalId ? `profissional_id=eq.${profissionalId}` : undefined,
  })
}

/** Propostas de uma demanda especifica. */
export function usePropostasDeDemanda(demandaId: string | null, refetch: Refetch) {
  useRealtimeChannel('propostas', refetch, {
    key: `props-dem-${demandaId ?? 'none'}`,
    filter: demandaId ? `demanda_id=eq.${demandaId}` : undefined,
  })
}

// ============================================================
// SOLICITACOES / ATENDIMENTOS
// ============================================================

/** Cliente: suas solicitacoes (todos os status). */
export function useSolicitacoesCliente(clienteId: string | null, refetch: Refetch) {
  useRealtimeChannel('solicitacoes', refetch, {
    key: `sol-cli-${clienteId ?? 'none'}`,
    filter: clienteId ? `cliente_id=eq.${clienteId}` : undefined,
  })
}

/** Prestador: suas solicitacoes/atendimentos (todos os status). */
export function useSolicitacoesPrestador(profissionalId: string | null, refetch: Refetch) {
  useRealtimeChannel('solicitacoes', refetch, {
    key: `sol-prest-${profissionalId ?? 'none'}`,
    filter: profissionalId ? `profissional_id=eq.${profissionalId}` : undefined,
  })
}

/** Solicitacao especifica (tela detalhe). */
export function useSolicitacaoUnica(solicitacaoId: string | null, refetch: Refetch) {
  useRealtimeChannel('solicitacoes', refetch, {
    key: `sol-${solicitacaoId ?? 'none'}`,
    filter: solicitacaoId ? `id=eq.${solicitacaoId}` : undefined,
  })
}

// ============================================================
// DOCUMENTOS DE VALIDACAO
// ============================================================

/** Prestador vendo seus proprios documentos. */
export function useDocumentosPrestador(profissionalId: string | null, refetch: Refetch) {
  useRealtimeChannel('documentos_validacao', refetch, {
    key: `docs-prest-${profissionalId ?? 'none'}`,
    filter: profissionalId ? `profissional_id=eq.${profissionalId}` : undefined,
  })
}

/** Admin vendo todos os documentos. RLS da policy admin permite. */
export function useDocumentosAdmin(refetch: Refetch) {
  useRealtimeChannel('documentos_validacao', refetch, { key: 'docs-admin' })
}

// ============================================================
// NOTIFICACOES (sino)
// ============================================================

/** Notificacoes do usuario logado. */
export function useNotificacoesUsuario(userId: string | null, refetch: Refetch) {
  useRealtimeChannel('notificacoes_financeiras', refetch, {
    key: `notif-${userId ?? 'none'}`,
    filter: userId ? `user_id=eq.${userId}` : undefined,
  })
}

// ============================================================
// ETAPAS E PAGAMENTOS DE UM ATENDIMENTO
// ============================================================

export function useEtapasAtendimento(solicitacaoId: string | null, refetch: Refetch) {
  useRealtimeChannel('etapas_atendimento', refetch, {
    key: `etapa-${solicitacaoId ?? 'none'}`,
    filter: solicitacaoId ? `solicitacao_id=eq.${solicitacaoId}` : undefined,
  })
}

export function usePagamentosSolicitacao(solicitacaoId: string | null, refetch: Refetch) {
  useRealtimeChannel('pagamentos', refetch, {
    key: `pag-${solicitacaoId ?? 'none'}`,
    filter: solicitacaoId ? `solicitacao_id=eq.${solicitacaoId}` : undefined,
  })
}

// ============================================================
// DASHBOARD ADMIN - varios contadores
// ============================================================

export function useDashboardAdminRefresh(refetch: Refetch) {
  // Admin nao precisa de filtro - RLS admin cobre tudo
  useRealtimeChannel('solicitacoes',           refetch, { key: 'adm-sol' })
  useRealtimeChannel('documentos_validacao',   refetch, { key: 'adm-docs' })
  useRealtimeChannel('denuncias',              refetch, { key: 'adm-den' })
  useRealtimeChannel('disputas',               refetch, { key: 'adm-disp' })
  useRealtimeChannel('profiles',               refetch, { key: 'adm-prof' })
}

// ============================================================
// CARTEIRA DO PRESTADOR
// ============================================================

export function useCarteiraPrestador(prestadorId: string | null, refetch: Refetch) {
  useRealtimeChannel('wallet_transactions', refetch, {
    key: `wallet-tx-${prestadorId ?? 'none'}`,
    filter: prestadorId ? `user_id=eq.${prestadorId}` : undefined,
  })
  useRealtimeChannel('wallets', refetch, {
    key: `wallet-${prestadorId ?? 'none'}`,
    filter: prestadorId ? `user_id=eq.${prestadorId}` : undefined,
  })
  useRealtimeChannel('saques', refetch, {
    key: `saques-${prestadorId ?? 'none'}`,
    filter: prestadorId ? `user_id=eq.${prestadorId}` : undefined,
  })
}

// Re-export para conveniencia
export type { RealtimePayload }
