'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { prestadorService, type Atendimento } from '@/lib/supabase/prestador'
import { formatarDataPt, formatarRelativoPt } from '@/lib/formatar-data'
import { useRealtimeRefresh } from '@/lib/realtime'

type Aba = 'andamento' | 'historico'

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

export default function ProfissionalAtendimentosScreen() {
  const [aba, setAba] = useState<Aba>('andamento')
  const [emAndamento, setEmAndamento] = useState<Atendimento[]>([])
  const [historico, setHistorico] = useState<Atendimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useRealtimeRefresh('solicitacoes', () => carregar(), { key: 'prest-atend' })

  async function carregar() {
    setCarregando(true)
    setAviso(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setAviso('Faça login como prestador para acompanhar seus atendimentos.')
        return
      }
      const [andamento, hist] = await Promise.all([
        prestadorService.getAtendimentosEmAndamento(user.id),
        prestadorService.getHistoricoAtendimentos(user.id),
      ])
      setEmAndamento(andamento)
      setHistorico(hist)
    } catch (e) {
      console.error(e)
      setAviso('Não foi possível carregar atendimentos. Verifique se as migrações estão aplicadas.')
    } finally {
      setCarregando(false)
    }
  }

  const lista = aba === 'andamento' ? emAndamento : historico
  const vazio = !carregando && lista.length === 0

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50/40 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 pb-10">
      <header className="min-h-[200px] flex items-end bg-gradient-to-br from-emerald-700 via-teal-600 to-cyan-600 text-white px-4 pt-8 pb-12 rounded-b-[2rem] shadow-lg">
        <div className="max-w-lg mx-auto space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Sua agenda</p>
          <h1 className="text-2xl font-bold">Atendimentos</h1>
          <p className="text-sm text-white/88 leading-relaxed">
            Acompanhe os trabalhos aceitos, marque como em andamento e finalize quando concluir o serviço.
          </p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 -mt-6 space-y-4 relative z-10">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-1 grid grid-cols-2 gap-1 shadow border border-gray-100 dark:border-slate-800">
          <BotaoAba ativo={aba === 'andamento'} onClick={() => setAba('andamento')} contador={emAndamento.length}>
            Em andamento
          </BotaoAba>
          <BotaoAba ativo={aba === 'historico'} onClick={() => setAba('historico')} contador={historico.length}>
            Histórico
          </BotaoAba>
        </div>

        {carregando && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow border border-gray-100 dark:border-slate-800 flex items-center gap-3">
            <span className="inline-block w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600 dark:text-slate-400">Carregando...</p>
          </div>
        )}

        {!carregando &&
          lista.map((item) => {
            const badge = badgeStatus(item.status)
            const cliente = item.cliente
            const ehAndamento = aba === 'andamento'
            const conteudo = (
              <>
                <div className="h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
                <div className="p-5 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <time className="text-[11px] text-gray-400 dark:text-slate-500" dateTime={item.updated_at}>
                      {formatarRelativoPt(item.updated_at)} · {formatarDataPt(item.updated_at)}
                    </time>
                  </div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-slate-100 leading-snug">{item.titulo}</h2>
                  <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed line-clamp-2">{item.descricao}</p>

                  {cliente && (
                    <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-slate-800">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-200 to-teal-200 flex items-center justify-center text-sm font-bold text-emerald-900 overflow-hidden">
                        {cliente.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cliente.avatar_url} alt={cliente.nome} className="w-full h-full object-cover" />
                        ) : (
                          (cliente.nome || '?').slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 dark:text-slate-400">Cliente</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{cliente.nome}</p>
                      </div>
                      {ehAndamento && (
                        <span className="text-emerald-700 text-xs font-semibold shrink-0">Abrir conversa ›</span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )

            return (
              <Link
                key={item.id}
                href={`/profissional/atendimentos/${item.id}`}
                className="block bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-md overflow-hidden hover:border-emerald-200 transition-colors"
              >
                {conteudo}
              </Link>
            )
          })}

        {vazio && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm text-center space-y-2">
            <p className="text-4xl">{aba === 'andamento' ? '🛠️' : '📜'}</p>
            <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">
              {aba === 'andamento' ? 'Nenhum atendimento ativo' : 'Sem histórico ainda'}
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
              {aba === 'andamento'
                ? 'Quando você aceitar uma solicitação na aba Pedidos, ela aparece aqui pra acompanhar.'
                : 'Atendimentos concluídos ou cancelados ficam guardados aqui.'}
            </p>
          </section>
        )}

        {aviso && (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 font-medium">
            {aviso}
          </p>
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
        ativo ? 'bg-emerald-700 text-white' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:bg-slate-800 dark:hover:bg-slate-800'
      }`}
    >
      {children}
      <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${ativo ? 'bg-white/25' : 'bg-gray-100 dark:bg-slate-800'}`}>
        {contador}
      </span>
    </button>
  )
}
