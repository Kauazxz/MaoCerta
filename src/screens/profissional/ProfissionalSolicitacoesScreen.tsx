'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SOLICITACOES_DEMONSTRACAO } from '@/lib/demo-marketplace'
import { formatarDataPt, formatarRelativoPt } from '@/lib/formatar-data'

type Solicitacao = {
  id: string
  titulo: string
  descricao: string
  status: string
  created_at: string
}

function normalizarStatus(status: string | null | undefined) {
  return (status || 'pendente').toLowerCase().trim()
}

function badgeStatus(status: string) {
  const s = normalizarStatus(status)
  if (s === 'aceita' || s === 'em_andamento') return { label: 'Aceita', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
  if (s === 'concluida') return { label: 'Concluída', className: 'bg-blue-50 text-blue-700 border-blue-200' }
  if (s === 'recusada' || s === 'cancelada') return { label: s === 'cancelada' ? 'Cancelada' : 'Recusada', className: 'bg-red-50 text-red-700 border-red-100' }
  return { label: 'Pendente', className: 'bg-amber-50 text-amber-900 border-amber-200' }
}

export default function ProfissionalSolicitacoesScreen() {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()
      const { data: auth } = await supabase.auth.getUser()
      const user = auth.user
      if (!user) {
        setCarregando(false)
        return
      }

      const { data, error } = await supabase
        .from('solicitacoes')
        .select('id, titulo, descricao, status, created_at')
        .eq('profissional_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        setAviso('Não foi possível carregar solicitações. A migration do RF12 pode não ter sido aplicada.')
      }
      // Inbox so' mostra pedidos abertos: pendente (aguardando resposta) ou
      // aceita/em_andamento (recem aceito). Cancelada, recusada e concluida
      // ja' sairam do fluxo da inbox.
      const lista = ((data as Solicitacao[] | null) || []).filter((s) => {
        const st = normalizarStatus(s.status)
        return st === 'pendente' || st === 'aceita' || st === 'em_andamento'
      })
      setSolicitacoes(lista)
      setCarregando(false)
    }
    carregar()
  }, [])

  async function atualizarStatus(id: string, status: 'aceita' | 'recusada') {
    setAviso(null)
    const supabase = createClient()
    const { error } = await supabase.from('solicitacoes').update({ status }).eq('id', id)
    if (error) {
      console.error('[solicitacoes] update falhou:', error)
      // Mensagens amigaveis para erros do trigger de validacao
      if (error.message.includes('prestador_nao_validado')) {
        setAviso('Você precisa ter pelo menos um documento aprovado pelo admin antes de aceitar atendimentos. Envie em Ajustes → Validação.')
      } else if (error.message.includes('prestador_suspenso')) {
        setAviso('Sua conta está suspensa pela administração. Acesse a notificação no sino para mais detalhes.')
      } else {
        setAviso(`Falha ao atualizar: ${error.message}`)
      }
      return
    }
    setSolicitacoes((atual) => atual.map((item) => (item.id === id ? { ...item, status } : item)))
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50/40 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 pb-10">
      <header className="min-h-[200px] flex items-end bg-gradient-to-br from-emerald-700 via-teal-600 to-cyan-600 text-white px-4 pt-8 pb-12 rounded-b-[2rem] shadow-lg">
        <div className="max-w-lg mx-auto space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Inbox</p>
          <h1 className="text-2xl font-bold">Solicitações recebidas</h1>
          <p className="text-sm text-white/88 leading-relaxed">
            Pedidos diretos de clientes que encontraram seu perfil. Responda rápido para aumentar a taxa de fechamento.
          </p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 -mt-6 space-y-4 relative z-10">
        {carregando && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow border border-gray-100 dark:border-slate-800 flex items-center gap-3">
            <span className="inline-block w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600 dark:text-slate-400">Carregando solicitações...</p>
          </div>
        )}

        {!carregando &&
          solicitacoes.map((item) => {
            const badge = badgeStatus(item.status)
            const statusNorm = normalizarStatus(item.status)
            return (
              <article
                key={item.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-md overflow-hidden"
              >
                <div className="h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
                <div className="p-5 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <time className="text-[11px] text-gray-400 dark:text-slate-500" dateTime={item.created_at}>
                      {formatarRelativoPt(item.created_at)} · {formatarDataPt(item.created_at)}
                    </time>
                  </div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-slate-100 leading-snug">{item.titulo}</h2>
                  <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">{item.descricao}</p>
                  {statusNorm === 'pendente' && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => atualizarStatus(item.id, 'aceita')}
                        className="flex-1 min-w-[120px] text-sm font-semibold bg-emerald-600 text-white py-2.5 rounded-xl hover:bg-emerald-700 transition-colors"
                      >
                        Aceitar
                      </button>
                      <button
                        type="button"
                        onClick={() => atualizarStatus(item.id, 'recusada')}
                        className="flex-1 min-w-[120px] text-sm font-semibold bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800"
                      >
                        Recusar
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}

        {!carregando && solicitacoes.length === 0 && (
          <>
            <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-gray-100 dark:border-slate-800 shadow-sm text-center space-y-2">
              <p className="text-4xl">📬</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">Nenhuma solicitação real ainda</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
                Quando clientes usarem <strong>Buscar e solicitar</strong> com o seu ID de perfil, os pedidos aparecem aqui com status pendente.
              </p>
            </section>

            <section className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-200 to-transparent" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-violet-400">Prévia de como fica</h2>
                <span className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-200 to-transparent" />
              </div>
              {SOLICITACOES_DEMONSTRACAO.map((item) => {
                const badge = badgeStatus(item.status)
                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/30 p-4 space-y-2 opacity-95"
                  >
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <time className="text-[11px] text-gray-400 dark:text-slate-500">{formatarRelativoPt(item.created_at)}</time>
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">{item.titulo}</h3>
                    <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">{item.descricao}</p>
                    <p className="text-[10px] text-violet-600 font-medium">Exemplo fictício</p>
                  </article>
                )
              })}
            </section>
          </>
        )}

        {aviso && <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 font-medium">{aviso}</p>}
      </div>
    </main>
  )
}
