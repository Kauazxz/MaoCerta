'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buscarAtendimentoCompleto } from '@/lib/supabase/atendimento-plano'
import type { AtendimentoCompleto } from '@/types/atendimento'

type Status = 'inicial' | 'carregando' | 'pronto' | 'erro'

type Resultado = {
  atendimento: AtendimentoCompleto | null
  status: Status
  erro: string | null
  refresh: () => Promise<void>
  conexao: 'desconectado' | 'conectando' | 'conectado'
}

/**
 * Hook unico do atendimento novo. Faz UMA assinatura em todas as tabelas
 * relevantes filtradas por solicitacao_id, com cleanup garantido no unmount.
 *
 * Estrategia:
 *  - canal nomeado por solicitacao
 *  - debounce de 250ms para evitar refetch em rajada de eventos
 *  - reconexao automatica (Supabase ja faz, mas tratamos CHANNEL_ERROR)
 *  - apenas UM refetch em voo por vez
 */
export function useAtendimentoRealtime(solicitacaoId: string): Resultado {
  const [atendimento, setAtendimento] = useState<AtendimentoCompleto | null>(null)
  const [status, setStatus] = useState<Status>('inicial')
  const [erro, setErro] = useState<string | null>(null)
  const [conexao, setConexao] = useState<Resultado['conexao']>('desconectado')

  const refetchPendente = useRef(false)
  const refetchEmVoo = useRef(false)
  const timerDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    if (refetchEmVoo.current) {
      refetchPendente.current = true
      return
    }
    refetchEmVoo.current = true
    setErro(null)
    try {
      const data = await buscarAtendimentoCompleto(solicitacaoId)
      if (data) {
        setAtendimento(data)
        setStatus('pronto')
      } else {
        setErro('sem_permissao')
        setStatus('erro')
      }
    } catch (e) {
      setErro((e as Error).message)
      setStatus('erro')
    } finally {
      refetchEmVoo.current = false
      if (refetchPendente.current) {
        refetchPendente.current = false
        void refresh()
      }
    }
  }, [solicitacaoId])

  const refreshDebounced = useCallback(() => {
    if (timerDebounce.current) clearTimeout(timerDebounce.current)
    timerDebounce.current = setTimeout(() => {
      void refresh()
    }, 250)
  }, [refresh])

  // Primeiro load
  useEffect(() => {
    if (!solicitacaoId) return
    setStatus('carregando')
    void refresh()
  }, [solicitacaoId, refresh])

  // Subscribe realtime
  useEffect(() => {
    if (!solicitacaoId) return
    const supabase = createClient()
    setConexao('conectando')

    const nomeCanal = `atend:${solicitacaoId}`
    const filter = `solicitacao_id=eq.${solicitacaoId}`

    const channel = supabase.channel(nomeCanal)
    const tabelas = [
      'mensagens_atendimento',
      'planos_atendimento',
      'plano_itens_atendimento',
      'cobrancas_atendimento',
      'atendimento_eventos',
    ]
    for (const table of tabelas) {
      channel.on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table, filter } as never,
        () => refreshDebounced(),
      )
    }

    channel.subscribe((s: string) => {
      if (s === 'SUBSCRIBED') setConexao('conectado')
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setConexao('desconectado')
      else setConexao('conectando')
    })

    return () => {
      setConexao('desconectado')
      void supabase.removeChannel(channel)
      if (timerDebounce.current) clearTimeout(timerDebounce.current)
    }
  }, [solicitacaoId, refreshDebounced])

  return { atendimento, status, erro, refresh, conexao }
}
