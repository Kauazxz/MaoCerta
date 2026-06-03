'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarDataPt, formatarRelativoPt } from '@/lib/formatar-data'
import { useSolicitacoesCliente } from '@/lib/realtime/hooks'

type Aba = 'andamento' | 'historico'

type Atendimento = {
  id: string
  titulo: string
  descricao: string
  status: string
  created_at: string
  updated_at: string
  profissional: { id: string; nome: string; avatar_url: string | null } | null
}

function badgeStatus(status: string) {
  switch (status) {
    case 'aceita':
      return { label: 'Aceito', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'em_andamento':
      return { label: 'Em andamento', className: 'bg-blue-50 text-blue-700 border-blue-200' }
    case 'concluida':
      return { label: 'Concluído', className: 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700' }
    case 'cancelada':
      return { label: 'Cancelado', className: 'bg-red-50 text-red-700 border-red-200' }
    default:
      return { label: status, className: 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700' }
  }
}

export default function ClienteAtendimentosScreen() {
  const [aba, setAba] = useState<Aba>('andamento')
  const [andamento, setAndamento] = useState<Atendimento[]>([])
  const [historico, setHistorico] = useState<Atendimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Realtime: solicitacoes onde sou cliente (filtro server-side)
  useSolicitacoesCliente(userId, () => carregar())

  async function carregar() {
    setCarregando(true)
    setAviso(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setAviso('Faça login para ver seus atendimentos.')
      setCarregando(false)
      return
    }
    setUserId(user.id)

    const { data, error } = await supabase
      .from('solicitacoes')
      .select(`
        id, titulo, descricao, status, created_at, updated_at,
        profissional:profissional_id ( id, nome, avatar_url )
      `)
      .eq('cliente_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      setAviso(`Erro ao carregar: ${error.message}`)
      setCarregando(false)
      return
    }

    const lista = (data as unknown as Atendimento[]) || []
    setAndamento(lista.filter((a) => a.status === 'aceita' || a.status === 'em_andamento'))
    setHistorico(lista.filter((a) => a.status === 'concluida' || a.status === 'cancelada'))
    setCarregando(false)
  }

  const lista = aba === 'andamento' ? andamento : historico
  const vazio = !carregando && lista.length === 0

  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-50/40 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 pb-10">
      <header className="min-h-[200px] flex items-end bg-gradient-to-br from-purple-700 via-indigo-600 to-blue-600 text-white px-4 pt-8 pb-12 rounded-b-[2rem] shadow-lg">
        <div className="max-w-lg mx-auto space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Suas contratações</p>
          <h1 className="text-2xl font-bold">Atendimentos</h1>
          <p className="text-sm text-white/88 leading-relaxed">
            Quando um prestador aceita sua demanda, ele aparece aqui pra vocês conversarem e fechar o serviço.
          </p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 -mt-6 space-y-4 relative z-10">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-1 grid grid-cols-2 gap-1 shadow border border-gray-100 dark:border-slate-800">
          <BotaoAba ativo={aba === 'andamento'} onClick={() => setAba('andamento')} contador={andamento.length}>
            Em andamento
          </BotaoAba>
          <BotaoAba ativo={aba === 'historico'} onClick={() => setAba('historico')} contador={historico.length}>
            Histórico
          </BotaoAba>
        </div>

        {carregando && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow border border-gray-100 dark:border-slate-800 flex items-center gap-3">
            <span className="inline-block w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600 dark:text-slate-400">Carregando...</p>
          </div>
        )}

        {!carregando &&
          lista.map((item) => {
            const badge = badgeStatus(item.status)
            const prest = item.profissional
            return (
              <Link
                key={item.id}
                href={`/cliente/atendimentos/${item.id}`}
                className="block bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-md overflow-hidden hover:border-purple-200 transition-colors"
              >
                <div className="h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500" />
                <div className="p-5 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <time className="text-[11px] text-gray-400 dark:text-slate-500">
                      {formatarRelativoPt(item.updated_at)} · {formatarDataPt(item.updated_at)}
                    </time>
                  </div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-slate-100 leading-snug">{item.titulo}</h2>
                  <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed line-clamp-2">{item.descricao}</p>

                  {prest && (
                    <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-slate-800">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-200 to-indigo-200 flex items-center justify-center text-sm font-bold text-purple-900 overflow-hidden">
                        {prest.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={prest.avatar_url} alt={prest.nome} className="w-full h-full object-cover" />
                        ) : (
                          (prest.nome || '?').slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 dark:text-slate-400">Prestador</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{prest.nome}</p>
                      </div>
                      <span className="text-purple-600 text-xs font-semibold">Abrir conversa ›</span>
                    </div>
                  )}
                </div>
              </Link>
            )
          })}

        {vazio && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm text-center space-y-2">
            <p className="text-4xl">{aba === 'andamento' ? '🤝' : '📜'}</p>
            <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">
              {aba === 'andamento' ? 'Sem atendimento em andamento' : 'Sem histórico ainda'}
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
              {aba === 'andamento'
                ? 'Publique uma demanda em /cliente/demandas e aguarde algum prestador aceitar pra começar a conversa.'
                : 'Atendimentos concluídos ou cancelados ficam guardados aqui.'}
            </p>
          </section>
        )}

        {aviso && (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 font-medium">{aviso}</p>
        )}
      </div>
    </main>
  )
}

function BotaoAba({
  ativo,
  onClick,
  contador,
  children,
}: {
  ativo: boolean
  onClick: () => void
  contador: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-semibold py-2.5 rounded-xl transition-colors ${
        ativo ? 'bg-purple-700 text-white' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:bg-slate-800 dark:hover:bg-slate-800'
      }`}
    >
      {children}
      <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${ativo ? 'bg-white/25' : 'bg-gray-100 dark:bg-slate-800'}`}>
        {contador}
      </span>
    </button>
  )
}
