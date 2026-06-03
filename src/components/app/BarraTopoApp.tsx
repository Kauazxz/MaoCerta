'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { notificacoesService, type NotificacaoFinanceira } from '@/lib/supabase/notificacoes'
import { logClienteErro } from '@/lib/telemetry'
import { useNotificacoesUsuario } from '@/lib/realtime/hooks'
import { createClient } from '@/lib/supabase/client'

type Variant = 'cliente' | 'profissional' | 'admin'

export default function BarraTopoApp({ variant }: { variant: Variant }) {
  const { theme, cycleTheme } = useTheme()
  const [aberto, setAberto] = useState(false)
  const [lista, setLista] = useState<NotificacaoFinanceira[]>([])
  const [carregando, setCarregando] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const base =
    variant === 'cliente' ? '/cliente' : variant === 'profissional' ? '/profissional' : '/admin'

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const rows = await notificacoesService.listarRecentes(20)
      setLista(rows)
    } catch (e) {
      logClienteErro('notificacoes_listar', e)
      setLista([])
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
    void (async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      setUserId(data.user?.id ?? null)
    })()
  }, [carregar])

  // Realtime filtrado server-side por user_id. So recebe as notificacoes do usuario logado.
  useNotificacoesUsuario(userId, () => void carregar())

  const naoLidas = lista.filter((n) => !n.lida_em).length

  function hrefNotif(n: NotificacaoFinanceira) {
    const p = (n.payload || {}) as Record<string, unknown>
    const sid = typeof p.solicitacao_id === 'string' ? p.solicitacao_id : null
    if (sid) return `${base}/atendimentos/${sid}`
    if (variant === 'cliente') return '/cliente/financeiro'
    if (variant === 'profissional') return '/profissional/carteira'
    return '/admin/financeiro'
  }

  async function aoClicarNotif(n: NotificacaoFinanceira) {
    if (!n.lida_em) {
      try {
        await notificacoesService.marcarLida(n.id)
        setLista((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, lida_em: new Date().toISOString() } : x)),
        )
      } catch (e) {
        logClienteErro('notificacao_marcar_lida', e, { id: n.id })
      }
    }
    setAberto(false)
  }

  const iconeTema = theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '💻'

  // Botoes flutuantes elegantes no canto superior direito.
  // Sem barra horizontal — apenas pills com leve sombra e blur.
  return (
    <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5 pointer-events-none">
      <button
        type="button"
        onClick={cycleTheme}
        title={`Tema: ${theme}`}
        aria-label="Alternar tema"
        className="pointer-events-auto w-9 h-9 rounded-full border border-gray-200 dark:border-slate-700 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md text-base shadow-md hover:bg-white dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
      >
        <span aria-hidden>{iconeTema}</span>
      </button>

      <div className="relative pointer-events-auto">
        <button
          type="button"
          onClick={() => {
            setAberto((v) => !v)
            if (!aberto) void carregar()
          }}
          aria-label="Alertas"
          className="relative w-9 h-9 rounded-full border border-gray-200 dark:border-slate-700 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md text-base shadow-md hover:bg-white dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
        >
          <span aria-hidden>🔔</span>
          {naoLidas > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-[10px] font-bold text-white flex items-center justify-center">
              {naoLidas > 9 ? '9+' : naoLidas}
            </span>
          )}
        </button>

        {aberto && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default bg-transparent"
              aria-label="Fechar"
              onClick={() => setAberto(false)}
            />
            <div className="absolute right-0 top-full mt-2 w-[min(100vw-1.5rem,20rem)] max-h-[70vh] overflow-y-auto rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl z-50 py-2">
              {carregando && (
                <p className="px-3 py-2 text-xs text-gray-500 dark:text-slate-400">Carregando…</p>
              )}
              {!carregando && lista.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-500 dark:text-slate-400">
                  Nenhum alerta financeiro ainda.
                </p>
              )}
              {!carregando &&
                lista.map((n) => (
                  <Link
                    key={n.id}
                    href={hrefNotif(n)}
                    onClick={() => void aoClicarNotif(n)}
                    className={`block px-3 py-2.5 border-b border-gray-100 dark:border-slate-800 last:border-0 hover:bg-gray-50 dark:bg-slate-800 dark:hover:bg-slate-800/80 ${
                      n.lida_em ? 'opacity-70' : ''
                    }`}
                  >
                    <p className="text-[11px] font-bold text-gray-900 dark:text-slate-100 leading-snug">
                      {n.titulo}
                    </p>
                    {n.corpo && (
                      <p className="text-[10px] text-gray-600 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {n.corpo}
                      </p>
                    )}
                    <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-1">{n.tipo}</p>
                  </Link>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
