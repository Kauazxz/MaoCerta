'use client'

import { useCallback, useEffect, useState, FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarDataPt, formatarRelativoPt } from '@/lib/formatar-data'
import CabecalhoAjuste from './CabecalhoAjuste'
import { useDenunciasAdmin } from '@/lib/realtime/hooks'
import { useAppRealtime } from '@/components/providers/AppRealtimeProvider'

type Denuncia = {
  id: string
  motivo: string
  descricao: string | null
  status: string
  created_at: string
  denunciado_id: string
  denunciado: { id: string; nome: string; tipo: string } | null
}

type Mensagem = {
  id: string
  remetente_id: string
  conteudo: string
  created_at: string
}

const MOTIVOS: Record<string, string> = {
  comportamento_inadequado: 'Comportamento inadequado',
  servico_nao_cumprido: 'Serviço não cumprido',
  cobranca_indevida: 'Cobrança indevida',
  perfil_falso: 'Perfil falso',
  outro: 'Outro',
}

type Props = {
  voltarHref: string
  tema?: 'cliente' | 'prestador'
}

export default function MinhasDenunciasScreen({ voltarHref, tema = 'cliente' }: Props) {
  const { ticks } = useAppRealtime()
  const [lista, setLista] = useState<Denuncia[]>([])
  const [selecionada, setSelecionada] = useState<Denuncia | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [novaMsg, setNovaMsg] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) {
      setCarregando(false)
      return
    }
    setUserId(user.id)

    const { data, error } = await sb
      .from('denuncias')
      .select(`
        id, motivo, descricao, status, created_at, denunciado_id,
        denunciado:denunciado_id ( id, nome, tipo )
      `)
      .eq('denunciante_id', user.id)
      .order('created_at', { ascending: false })

    if (!error) {
      const rows = (data as unknown as Denuncia[]) || []
      setLista(rows)
      if (selecionada) {
        const atual = rows.find((d) => d.id === selecionada.id)
        if (atual) setSelecionada(atual)
      }
    }
    setCarregando(false)
  }, [selecionada])

  const carregarMensagens = useCallback(async (denunciaId: string) => {
    const sb = createClient()
    const { data } = await sb
      .from('denuncias_mensagens')
      .select('id, remetente_id, conteudo, created_at')
      .eq('denuncia_id', denunciaId)
      .order('created_at', { ascending: true })
    setMensagens((data as Mensagem[]) || [])
  }, [])

  useEffect(() => { void carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useDenunciasAdmin(() => void carregar())

  useEffect(() => {
    if (!selecionada) return
    void carregarMensagens(selecionada.id)
  }, [selecionada, ticks.denuncias, carregarMensagens])

  async function enviarResposta(e: FormEvent) {
    e.preventDefault()
    if (!selecionada || !userId || !novaMsg.trim()) return
    if (selecionada.status === 'resolvida' || selecionada.status === 'arquivada') {
      setAviso('Esta denúncia já foi encerrada.')
      return
    }
    setEnviando(true)
    setAviso(null)
    const sb = createClient()
    const { error } = await sb.from('denuncias_mensagens').insert({
      denuncia_id: selecionada.id,
      remetente_id: userId,
      conteudo: novaMsg.trim(),
    })
    setEnviando(false)
    if (error) {
      setAviso(error.message)
      return
    }
    setNovaMsg('')
    void carregarMensagens(selecionada.id)
  }

  const card = 'bg-white dark:bg-slate-900/80 rounded-2xl border border-gray-100 dark:border-slate-800/50 shadow-sm dark:shadow-none'

  return (
    <main className="min-h-screen pb-10 dark:bg-slate-950">
      <CabecalhoAjuste titulo="Minhas denúncias" subtitulo="Acompanhe seus relatos e converse com a equipe" voltarHref={voltarHref} tema={tema} />
      <div className="max-w-lg mx-auto px-4 -mt-6 space-y-3 relative z-10">
        {carregando && <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-6">Carregando...</p>}

        {!carregando && lista.length === 0 && (
          <div className={`${card} p-8 text-center space-y-2`}>
            <p className="text-3xl">🚩</p>
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Você ainda não fez denúncias</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">Use o perfil de um usuário para reportar comportamento inadequado.</p>
          </div>
        )}

        {!carregando && lista.map((d) => {
          const aberta = selecionada?.id === d.id
          return (
            <article key={d.id} className={`${card} overflow-hidden`}>
              <button
                type="button"
                onClick={() => setSelecionada(aberta ? null : d)}
                className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-sm text-gray-900 dark:text-slate-100">{MOTIVOS[d.motivo] || d.motivo}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                      Contra {d.denunciado?.nome || 'usuário'} · {formatarRelativoPt(d.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
              </button>

              {aberta && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-slate-800/50 pt-3">
                  {d.descricao && (
                    <p className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{d.descricao}</p>
                  )}
                  <p className="text-[10px] text-gray-400 dark:text-slate-500">Enviada em {formatarDataPt(d.created_at)}</p>

                  <div className="rounded-xl bg-gray-50 dark:bg-slate-950/50 border border-gray-100 dark:border-slate-800/40 p-3 max-h-40 overflow-y-auto space-y-2">
                    {mensagens.length === 0 && (
                      <p className="text-xs text-gray-500 dark:text-slate-400 text-center py-2">Aguardando resposta da equipe.</p>
                    )}
                    {mensagens.map((m) => {
                      const minha = m.remetente_id === userId
                      return (
                        <div key={m.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                            minha
                              ? 'bg-purple-600 text-white'
                              : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 border border-gray-200 dark:border-slate-700'
                          }`}>
                            <p className="text-[9px] font-bold uppercase opacity-70 mb-0.5">{minha ? 'Você' : 'Equipe'}</p>
                            <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {d.status !== 'resolvida' && d.status !== 'arquivada' && (
                    <form onSubmit={(e) => void enviarResposta(e)} className="flex gap-2">
                      <input
                        type="text"
                        value={novaMsg}
                        onChange={(e) => setNovaMsg(e.target.value)}
                        placeholder="Responder à equipe..."
                        className="flex-1 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-gray-900 dark:text-slate-100"
                      />
                      <button
                        type="submit"
                        disabled={enviando || !novaMsg.trim()}
                        className="text-xs font-semibold px-3 py-2 rounded-xl bg-purple-600 text-white disabled:opacity-50"
                      >
                        Enviar
                      </button>
                    </form>
                  )}

                  {aviso && <p className="text-xs text-red-600 dark:text-red-400">{aviso}</p>}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </main>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    aberta: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300',
    em_analise: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
    resolvida: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
    arquivada: 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400',
  }
  const labels: Record<string, string> = {
    aberta: 'Aberta',
    em_analise: 'Em análise',
    resolvida: 'Resolvida',
    arquivada: 'Arquivada',
  }
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${map[status] || map.aberta}`}>
      {labels[status] || status}
    </span>
  )
}
