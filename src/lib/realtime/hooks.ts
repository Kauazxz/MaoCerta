'use client'

/**
 * Compatibilidade: estes hooks viraram no-ops. O AppRealtimeProvider
 * mantem as subscriptions globais. As telas devem usar
 * useAppRealtime() e depender de ticks.X no useEffect/refetch.
 *
 * Mantemos as exports para nao quebrar imports existentes.
 */

import { useAppRealtime } from '@/components/providers/AppRealtimeProvider'
import { useEffect } from 'react'

type Refetch = () => void

/** Cria um efeito que chama refetch quando o tick correspondente muda. */
function useRefetchOnTick(tick: number, refetch: Refetch) {
  useEffect(() => {
    if (tick > 0) refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])
}

export function useDemandasCliente(_clienteId: string | null, refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useRefetchOnTick(ticks.demandas, refetch)
}
export function useDemandasPublicas(refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useRefetchOnTick(ticks.demandas, refetch)
}
export function useDemandaUnica(_id: string | null, refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useRefetchOnTick(ticks.demandas, refetch)
}
export function usePropostasCliente(refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useRefetchOnTick(ticks.propostas, refetch)
}
export function usePropostasPrestador(_id: string | null, refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useRefetchOnTick(ticks.propostas, refetch)
}
export function usePropostasDeDemanda(_id: string | null, refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useRefetchOnTick(ticks.propostas, refetch)
}
export function useSolicitacoesCliente(_id: string | null, refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useRefetchOnTick(ticks.solicitacoes, refetch)
}
export function useSolicitacoesPrestador(_id: string | null, refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useRefetchOnTick(ticks.solicitacoes, refetch)
}
export function useSolicitacaoUnica(_id: string | null, refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useRefetchOnTick(ticks.solicitacoes, refetch)
}
export function useDocumentosPrestador(_id: string | null, refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useRefetchOnTick(ticks.documentos, refetch)
}
export function useDocumentosAdmin(refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useRefetchOnTick(ticks.documentos, refetch)
}
export function useNotificacoesUsuario(_id: string | null, refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useRefetchOnTick(ticks.notificacoes, refetch)
}
export function useEtapasAtendimento(_id: string | null, refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useRefetchOnTick(ticks.etapas, refetch)
}
export function usePagamentosSolicitacao(_id: string | null, refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useRefetchOnTick(ticks.pagamentos, refetch)
}
export function useDashboardAdminRefresh(refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useEffect(() => {
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticks.solicitacoes, ticks.documentos, ticks.demandas])
}
export function useCarteiraPrestador(_id: string | null, refetch: Refetch) {
  const { ticks } = useAppRealtime()
  useRefetchOnTick(ticks.wallet, refetch)
}
