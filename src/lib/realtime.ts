'use client'

import { useEffect, useRef } from 'react'
import { createClient } from './supabase/client'

type Evento = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

/**
 * Faz subscribe em postgres_changes de uma tabela e chama `onChange`
 * quando algo mudar. Idempotente: nome do canal e' unico por mount
 * para evitar colisao no Strict Mode.
 *
 * - `filter` segue o formato do Supabase ("coluna=eq.valor").
 * - Use `key` para forcar resubscribe quando dependencias importantes
 *   mudarem (ex.: troca de usuario logado).
 */
export function useRealtimeRefresh(
  table: string,
  onChange: () => void,
  options: {
    event?: Evento
    filter?: string
    key?: string | number
    schema?: string
    /** Intervalo (ms) do polling de fallback. Default 10000 (10s). 0 = desliga. */
    pollMs?: number
  } = {},
) {
  const callbackRef = useRef(onChange)
  callbackRef.current = onChange

  const { event = '*', filter, key = '', schema = 'public', pollMs = 10000 } = options

  useEffect(() => {
    const supabase = createClient()
    const nomeCanal = `rt:${table}:${key}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const config: {
      event: Evento
      schema: string
      table: string
      filter?: string
    } = { event, schema, table }
    if (filter) config.filter = filter

    let recebeuEvento = false

    const channel = supabase
      .channel(nomeCanal)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, config, (payload: unknown) => {
        recebeuEvento = true
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[realtime:${table}] evento`, payload)
        }
        callbackRef.current()
      })
      .subscribe((status: string) => {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[realtime:${table}] subscribe status =`, status)
        }
      })

    // Polling de fallback: dispara o callback periodicamente para
    // garantir refresh mesmo que o Realtime falhe (rede, cache,
    // tabela nao habilitada no Studio, etc.)
    let intervalId: ReturnType<typeof setInterval> | null = null
    if (pollMs > 0) {
      intervalId = setInterval(() => {
        callbackRef.current()
        if (process.env.NODE_ENV !== 'production' && !recebeuEvento) {
          console.log(`[realtime:${table}] poll fallback (sem evento Realtime ainda)`)
        }
      }, pollMs)
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
      void supabase.removeChannel(channel)
    }
  }, [table, event, filter, key, schema, pollMs])
}
