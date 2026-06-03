'use client'

import { useEffect, useRef } from 'react'
import { createClient } from './supabase/client'

type Evento = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

export type RealtimePayload<T = Record<string, unknown>> = {
  eventType: Evento
  new: T
  old: T
  schema: string
  table: string
  commit_timestamp: string
  errors: unknown
}

const DEBUG = typeof window !== 'undefined' && process.env.NODE_ENV !== 'production'

function log(...args: unknown[]) {
  if (DEBUG) console.log('[realtime]', ...args)
}

/**
 * Subscribe primitivo em postgres_changes. SEM polling.
 *
 * - `onEvent` recebe o payload tipado e pode decidir como atualizar
 *   o estado (insere na lista, refaz fetch da linha, invalida cache,
 *   etc.). NAO faz fetch automatico - quem chama controla.
 *
 * - `filter` segue a sintaxe do Supabase ("coluna=eq.valor") e
 *   roda no servidor, reduzindo trafego e respeitando RLS.
 *
 * - O canal e' UNICO por tabela+filter+key durante o ciclo de vida
 *   do componente. Reconexao automatica em CHANNEL_ERROR ate 5
 *   tentativas (backoff progressivo).
 */
export function useRealtimeChannel<T = Record<string, unknown>>(
  table: string,
  onEvent: (payload: RealtimePayload<T>) => void,
  options: {
    event?: Evento
    filter?: string
    key?: string | number
    schema?: string
  } = {},
) {
  const callbackRef = useRef(onEvent)
  callbackRef.current = onEvent

  const { event = '*', filter, key = '', schema = 'public' } = options

  useEffect(() => {
    if (!table) return

    const supabase = createClient()
    const nomeCanal = `rt:${table}:${key}:${event}:${filter ?? 'nofilter'}`

    let tentativas = 0
    let cancelado = false

    const config: { event: Evento; schema: string; table: string; filter?: string } = {
      event, schema, table,
    }
    if (filter) config.filter = filter

    let channel: ReturnType<typeof supabase.channel> | null = null

    function subscribe() {
      if (cancelado) return
      tentativas++
      log(`subscribe attempt ${tentativas} -> ${nomeCanal}`)

      channel = supabase
        .channel(nomeCanal)
        .on(
          'postgres_changes' as never,
          config as never,
          (payload: unknown) => {
            log(`evento em ${table}:`, payload)
            callbackRef.current(payload as RealtimePayload<T>)
          },
        )
        .subscribe((status: string, err?: Error) => {
          log(`status ${nomeCanal} = ${status}`, err || '')
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (tentativas < 5 && !cancelado) {
              const delay = Math.min(1000 * tentativas, 5000)
              setTimeout(() => {
                if (channel) void supabase.removeChannel(channel)
                subscribe()
              }, delay)
            }
          }
        })
    }

    subscribe()

    return () => {
      cancelado = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [table, event, filter, key, schema])
}

/**
 * Compatibilidade com codigo que usa o hook antigo (chama
 * `onChange` sem payload). Reaproveita `useRealtimeChannel`
 * descartando o payload. Sem polling, sem fallback.
 */
export function useRealtimeRefresh(
  table: string,
  onChange: () => void,
  options: {
    event?: Evento
    filter?: string
    key?: string | number
    schema?: string
  } = {},
) {
  useRealtimeChannel(table, () => onChange(), options)
}
