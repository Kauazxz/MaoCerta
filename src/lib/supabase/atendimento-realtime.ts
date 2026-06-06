'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buscarAtendimentoCompleto } from '@/lib/supabase/atendimento-plano'
import type { AtendimentoCompleto } from '@/types/atendimento'

type Status = 'inicial' | 'carregando' | 'pronto' | 'erro'
type ConexaoStatus = 'desconectado' | 'conectando' | 'conectado'

type Resultado = {
  atendimento: AtendimentoCompleto | null
  status: Status
  erro: string | null
  refresh: () => Promise<void>
  conexao: ConexaoStatus
}

const DEBUG = typeof window !== 'undefined' && process.env.NODE_ENV !== 'production'
const POLL_MS = 10_000

function log(...args: unknown[]) {
  if (DEBUG) console.log('[atend-rt]', ...args)
}

/**
 * Hook unico do atendimento novo:
 *  - canal unico por solicitacao com server-side filter
 *  - debounce de 250ms entre refetchs (rajada vira 1 chamada)
 *  - polling lento de 10s como rede de seguranca caso o realtime
 *    caia, perca conexao ou a publicacao nao esteja configurada
 *  - cleanup garantido no unmount
 */
export function useAtendimentoRealtime(solicitacaoId: string): Resultado {
  const [atendimento, setAtendimento] = useState<AtendimentoCompleto | null>(null)
  const [status, setStatus] = useState<Status>('inicial')
  const [erro, setErro] = useState<string | null>(null)
  const [conexao, setConexao] = useState<ConexaoStatus>('desconectado')

  const refetchPendente = useRef(false)
  const refetchEmVoo = useRef(false)
  const timerDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerPoll = useRef<ReturnType<typeof setInterval> | null>(null)

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
        (payload: unknown) => {
          log('evento', table, payload)
          refreshDebounced()
        },
      )
    }

    channel.subscribe((s: string, err?: Error) => {
      log('status canal', s, err || '')
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

  // Polling de seguranca - so' refaz se NAO tivermos refetch em voo.
  // Custo: 1 query a cada 10s. Beneficio: garante que mesmo sem
  // realtime configurado, a UI converge sem precisar F5.
  useEffect(() => {
    if (!solicitacaoId) return
    timerPoll.current = setInterval(() => {
      if (!refetchEmVoo.current) {
        log('poll de seguranca')
        refreshDebounced()
      }
    }, POLL_MS)
    return () => {
      if (timerPoll.current) clearInterval(timerPoll.current)
    }
  }, [solicitacaoId, refreshDebounced])

  return { atendimento, status, erro, refresh, conexao }
}
