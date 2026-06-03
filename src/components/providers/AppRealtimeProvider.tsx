'use client'

/**
 * AppRealtimeProvider
 *
 * Provider global de Realtime montado nos layouts cliente/profissional/admin.
 * Enquanto o usuario estiver logado, mantem subscribes ativas em todas as
 * tabelas operacionais relevantes - de forma que NOTIFICACOES, LISTAS,
 * CARDS, CONTADORES e DASHBOARDS atualizem em tempo real INDEPENDENTE da
 * tela onde o usuario esta no momento.
 *
 * Como funciona:
 * 1. Ao montar, busca o usuario autenticado.
 * 2. Abre canais Supabase Realtime para as tabelas alvo, com filtros
 *    server-side por user_id quando aplicavel.
 * 3. Mantem um "tick" por tabela. Telas individuais leem esse tick via
 *    useAppRealtime() e usam como dependency em useEffect/refetch.
 * 4. Conta notificacoes nao lidas e dispara toast quando chega novo INSERT.
 *
 * IMPORTANTE - CHAT NAO E' TOCADO:
 * - mensagens_atendimento NAO esta na lista de tabelas escutadas aqui.
 * - ChatAtendimento continua subscribendo separadamente como sempre.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase/client'

type Papel = 'cliente' | 'profissional' | 'administrador'

type Ticks = {
  demandas: number
  propostas: number
  solicitacoes: number
  notificacoes: number
  documentos: number
  etapas: number
  pagamentos: number
  wallet: number
}

const TICKS_ZERO: Ticks = {
  demandas: 0, propostas: 0, solicitacoes: 0, notificacoes: 0,
  documentos: 0, etapas: 0, pagamentos: 0, wallet: 0,
}

type Toast = {
  id: string
  titulo: string
  corpo?: string
  tipo: 'info' | 'sucesso' | 'erro'
}

type AppRealtimeContext = {
  /** Tick incrementa cada vez que algo muda na tabela. Use em deps de useEffect/refetch. */
  ticks: Ticks
  /** Contador de notificacoes nao lidas (atualiza em tempo real). */
  naoLidas: number
  /** Toasts ativos para mostrar (opcional). */
  toasts: Toast[]
  /** Remove um toast (acionado pelo componente que renderiza). */
  dismissToast: (id: string) => void
  /** Forca um refresh manual de um tick (ex: depois de criar algo localmente). */
  bump: (tabela: keyof Ticks) => void
  /** Marca todas as notificacoes como lidas localmente. */
  marcarNotifLidas: () => void
  /** Papel atual do user logado. Null se nao logado. */
  papel: Papel | null
  /** id do user logado. Null se nao logado. */
  userId: string | null
}

const ctx = createContext<AppRealtimeContext | null>(null)

const DEBUG = typeof window !== 'undefined' && process.env.NODE_ENV !== 'production'
const log = (...args: unknown[]) => { if (DEBUG) console.log('[AppRealtime]', ...args) }

export function AppRealtimeProvider({
  papel,
  children,
}: {
  papel: Papel
  children: ReactNode
}) {
  const [userId, setUserId] = useState<string | null>(null)
  const [ticks, setTicks] = useState<Ticks>(TICKS_ZERO)
  const [naoLidas, setNaoLidas] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const subscribedRef = useRef(false)

  const bump = useCallback((tabela: keyof Ticks) => {
    setTicks((t) => ({ ...t, [tabela]: t[tabela] + 1 }))
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((arr) => arr.filter((t) => t.id !== id))
  }, [])

  const pushToast = useCallback((titulo: string, corpo?: string, tipo: Toast['tipo'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts((arr) => [...arr, { id, titulo, corpo, tipo }])
    setTimeout(() => dismissToast(id), 6000)
  }, [dismissToast])

  const marcarNotifLidas = useCallback(() => {
    setNaoLidas(0)
  }, [])

  // 1) Pega o user logado
  useEffect(() => {
    const supabase = createClient()
    let cancel = false
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (cancel) return
      const id = data.user?.id ?? null
      log('user identificado', id)
      setUserId(id)
    })()

    // Monitora mudancas de sessao - logout/login limpa subscribes
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      log('auth event', event)
      setUserId(session?.user?.id ?? null)
    })

    return () => {
      cancel = true
      sub.subscription.unsubscribe()
    }
  }, [])

  // 2) Carrega contador inicial de nao lidas
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    void (async () => {
      const { count } = await supabase
        .from('notificacoes_financeiras')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('lida_em', null)
      log('nao lidas inicial =', count)
      setNaoLidas(count ?? 0)
    })()
  }, [userId, ticks.notificacoes])

  // 3) Subscribes globais. Ficam vivos enquanto provider montado.
  useEffect(() => {
    if (!userId) return
    if (subscribedRef.current) return // evita duplicar em StrictMode

    const supabase = createClient()
    subscribedRef.current = true
    log('abrindo canais para user', userId, 'papel', papel)

    type PostgresChange = { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }

    function bind(canal: string, table: string, filter: string | undefined, onEvent: (p: PostgresChange) => void) {
      const ch = supabase.channel(canal)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on('postgres_changes' as any, { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, (payload: unknown) => {
          log('evento', table, payload)
          onEvent(payload as PostgresChange)
        })
        .subscribe((status: string, err?: Error) => {
          log(`status ${canal} = ${status}`, err || '')
        })
      return ch
    }

    // -- Notificacoes do user (sempre, qualquer papel) --
    const chNotif = bind(
      `app:notif:${userId}`,
      'notificacoes_financeiras',
      `user_id=eq.${userId}`,
      (p) => {
        bump('notificacoes')
        if (p.eventType === 'INSERT') {
          const titulo = String((p.new as Record<string, unknown>).titulo ?? 'Nova notificação')
          const corpo = String((p.new as Record<string, unknown>).corpo ?? '')
          pushToast(titulo, corpo, 'info')
          setNaoLidas((n) => n + 1)
        }
      },
    )

    // -- Demandas: cliente ve as suas, prestador/admin veem todas --
    const chDemandas = bind(
      `app:demandas:${papel}:${userId}`,
      'demandas',
      papel === 'cliente' ? `cliente_id=eq.${userId}` : undefined,
      () => bump('demandas'),
    )

    // -- Propostas: cliente ve por suas demandas (sem filter), prestador filtra
    const chPropostas = bind(
      `app:propostas:${papel}:${userId}`,
      'propostas',
      papel === 'profissional' ? `profissional_id=eq.${userId}` : undefined,
      () => bump('propostas'),
    )

    // -- Solicitacoes: filtra pelo lado do user
    const chSolicitacoes = bind(
      `app:sol:${papel}:${userId}`,
      'solicitacoes',
      papel === 'cliente'
        ? `cliente_id=eq.${userId}`
        : papel === 'profissional'
          ? `profissional_id=eq.${userId}`
          : undefined,
      (p) => {
        bump('solicitacoes')
        if (p.eventType === 'INSERT' && papel === 'profissional') {
          const titulo = String((p.new as Record<string, unknown>).titulo ?? 'Novo pedido')
          pushToast('Nova solicitação recebida', titulo, 'sucesso')
        }
      },
    )

    // -- Documentos: prestador ve os seus, admin ve tudo
    const chDocumentos = bind(
      `app:docs:${papel}:${userId}`,
      'documentos_validacao',
      papel === 'profissional' ? `profissional_id=eq.${userId}` : undefined,
      (p) => {
        bump('documentos')
        if (p.eventType === 'UPDATE' && papel === 'profissional') {
          const status = String((p.new as Record<string, unknown>).status ?? '')
          if (status === 'aprovado') pushToast('Documento aprovado', 'Seu documento foi validado!', 'sucesso')
          else if (status === 'rejeitado') pushToast('Documento rejeitado', 'Confira o motivo e reenvie.', 'erro')
        }
      },
    )

    // -- Wallet (so prestador) --
    let chWallet: ReturnType<typeof supabase.channel> | null = null
    if (papel === 'profissional') {
      chWallet = bind(`app:wallet:${userId}`, 'wallet_transactions', `user_id=eq.${userId}`, () => bump('wallet'))
    }

    return () => {
      log('removendo canais')
      subscribedRef.current = false
      void supabase.removeChannel(chNotif)
      void supabase.removeChannel(chDemandas)
      void supabase.removeChannel(chPropostas)
      void supabase.removeChannel(chSolicitacoes)
      void supabase.removeChannel(chDocumentos)
      if (chWallet) void supabase.removeChannel(chWallet)
    }
  }, [userId, papel, bump, pushToast])

  const value = useMemo<AppRealtimeContext>(() => ({
    ticks, naoLidas, toasts, dismissToast, bump, marcarNotifLidas,
    papel: userId ? papel : null,
    userId,
  }), [ticks, naoLidas, toasts, dismissToast, bump, marcarNotifLidas, papel, userId])

  return (
    <ctx.Provider value={value}>
      {children}
      <ToastOverlay toasts={toasts} onClose={dismissToast} />
    </ctx.Provider>
  )
}

export function useAppRealtime(): AppRealtimeContext {
  const v = useContext(ctx)
  if (!v) throw new Error('useAppRealtime deve ser usado dentro de AppRealtimeProvider')
  return v
}

// Toast UI simples (fixo top-right)
function ToastOverlay({ toasts, onClose }: { toasts: Toast[]; onClose: (id: string) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-16 right-3 z-[60] flex flex-col gap-2 pointer-events-none max-w-xs">
      {toasts.map((t) => {
        const cls = t.tipo === 'sucesso'
          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-100'
          : t.tipo === 'erro'
            ? 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-900 text-red-900 dark:text-red-100'
            : 'bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-900 text-purple-900 dark:text-purple-100'
        return (
          <button
            key={t.id}
            onClick={() => onClose(t.id)}
            className={`pointer-events-auto text-left rounded-xl shadow-lg border px-3 py-2 text-xs font-medium ${cls}`}
          >
            <p className="font-bold">{t.titulo}</p>
            {t.corpo && <p className="opacity-90 mt-0.5">{t.corpo}</p>}
          </button>
        )
      })}
    </div>
  )
}
