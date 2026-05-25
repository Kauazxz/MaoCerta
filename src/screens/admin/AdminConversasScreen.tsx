'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarDataPt, formatarRelativoPt } from '@/lib/formatar-data'
import CabecalhoAdmin from '@/components/admin/CabecalhoAdmin'

type Atendimento = {
  id: string
  titulo: string
  descricao: string
  status: string
  created_at: string
  cliente_id: string
  profissional_id: string
}

type Mensagem = {
  id: string
  solicitacao_id: string
  remetente_id: string
  conteudo: string
  created_at: string
}

type Acordo = {
  id: string
  solicitacao_id: string
  tipo: string
  resumo: string
  status: string
  valor: number | null
  data_hora: string | null
  confianca: number
  created_at: string
}

export default function AdminConversasScreen() {
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [selecionado, setSelecionado] = useState<Atendimento | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [acordos, setAcordos] = useState<Acordo[]>([])
  const [aba, setAba] = useState<'chat' | 'acordos'>('chat')

  useEffect(() => {
    let cancel = false
    async function load() {
      const sb = createClient()
      const { data } = await sb
        .from('solicitacoes')
        .select('id, titulo, descricao, status, created_at, cliente_id, profissional_id')
        .order('updated_at', { ascending: false })
        .limit(100)
      if (!cancel) {
        setAtendimentos((data as Atendimento[]) || [])
        setCarregando(false)
      }
    }
    void load()
    return () => { cancel = true }
  }, [])

  useEffect(() => {
    if (!selecionado) return
    let cancel = false
    async function loadConversa() {
      const sb = createClient()
      const [msgs, acs] = await Promise.all([
        sb.from('mensagens_atendimento')
          .select('id, solicitacao_id, remetente_id, conteudo, created_at')
          .eq('solicitacao_id', selecionado!.id)
          .order('created_at', { ascending: true }),
        sb.from('acordos_chat_sugeridos')
          .select('id, solicitacao_id, tipo, resumo, status, valor, data_hora, confianca, created_at')
          .eq('solicitacao_id', selecionado!.id)
          .order('created_at', { ascending: false }),
      ])
      if (cancel) return
      setMensagens((msgs.data as Mensagem[]) || [])
      setAcordos((acs.data as Acordo[]) || [])
    }
    void loadConversa()
    return () => { cancel = true }
  }, [selecionado])

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50/40 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 pb-10">
      <CabecalhoAdmin titulo="Conversas e acordos" subtitulo="Monitorar atendimentos — segurança e auditoria" />

      <div className="max-w-6xl mx-auto px-4 -mt-8 relative z-10 grid lg:grid-cols-[320px_1fr] gap-3 items-start">
        {/* Lista de atendimentos */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden lg:max-h-[80vh] lg:overflow-y-auto">
          <div className="p-3 border-b border-gray-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">Atendimentos recentes</p>
          </div>
          {carregando && <p className="p-4 text-sm text-gray-500 dark:text-slate-400">Carregando…</p>}
          {!carregando && atendimentos.length === 0 && (
            <p className="p-4 text-sm text-gray-500 dark:text-slate-400">Nenhum atendimento.</p>
          )}
          <ul className="divide-y divide-gray-100 dark:divide-slate-800">
            {atendimentos.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSelecionado(a)}
                  className={`w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${
                    selecionado?.id === a.id ? 'bg-amber-50 dark:bg-amber-950/30 border-l-2 border-amber-500' : ''
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{a.titulo}</p>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">{a.descricao}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">{a.status}</span>
                    <span className="text-[10px] text-gray-400 dark:text-slate-500">{formatarRelativoPt(a.created_at)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Painel da conversa */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm min-h-[400px]">
          {!selecionado && (
            <div className="p-8 text-center space-y-2">
              <p className="text-4xl">💬</p>
              <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Selecione um atendimento à esquerda</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 max-w-sm mx-auto">
                Você verá o chat completo e os acordos sugeridos pelo assistente da plataforma.
              </p>
            </div>
          )}

          {selecionado && (
            <>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">Atendimento</p>
                <p className="font-bold text-gray-900 dark:text-slate-100">{selecionado.titulo}</p>
              </div>
              <nav className="flex border-b border-gray-100 dark:border-slate-800 px-2">
                <button
                  onClick={() => setAba('chat')}
                  className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border-b-2 ${
                    aba === 'chat' ? 'border-amber-500 text-amber-700 dark:text-amber-300' : 'border-transparent text-gray-500 dark:text-slate-400'
                  }`}
                >
                  💬 Chat ({mensagens.length})
                </button>
                <button
                  onClick={() => setAba('acordos')}
                  className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border-b-2 ${
                    aba === 'acordos' ? 'border-amber-500 text-amber-700 dark:text-amber-300' : 'border-transparent text-gray-500 dark:text-slate-400'
                  }`}
                >
                  🤖 Acordos do assistente ({acordos.length})
                </button>
              </nav>

              <div className="p-4 max-h-[60vh] overflow-y-auto">
                {aba === 'chat' && (
                  <div className="space-y-2">
                    {mensagens.length === 0 && (
                      <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-6">Sem mensagens nessa conversa.</p>
                    )}
                    {mensagens.map((m) => {
                      const ehCliente = m.remetente_id === selecionado.cliente_id
                      return (
                        <div key={m.id} className={`flex ${ehCliente ? 'justify-start' : 'justify-end'}`}>
                          <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${
                            ehCliente
                              ? 'bg-purple-100 dark:bg-purple-950/40 text-purple-900 dark:text-purple-100'
                              : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100'
                          }`}>
                            <p className="text-[9px] font-bold uppercase tracking-wider opacity-70 mb-0.5">
                              {ehCliente ? 'Cliente' : 'Prestador'}
                            </p>
                            <p className="text-sm whitespace-pre-wrap break-words">{m.conteudo}</p>
                            <p className="text-[10px] opacity-60 mt-1">{formatarDataPt(m.created_at)}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {aba === 'acordos' && (
                  <div className="space-y-2">
                    {acordos.length === 0 && (
                      <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-6">
                        O assistente não sugeriu nenhum acordo neste atendimento.
                      </p>
                    )}
                    {acordos.map((a) => (
                      <article key={a.id} className="border border-gray-100 dark:border-slate-800 rounded-xl p-3 space-y-1">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <p className="font-bold text-sm text-gray-900 dark:text-slate-100 capitalize">{a.tipo}</p>
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
                            {a.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-slate-400">{a.resumo}</p>
                        <div className="flex gap-3 text-[11px] text-gray-500 dark:text-slate-400 flex-wrap">
                          {a.valor != null && <span>💰 R$ {a.valor.toFixed(2).replace('.', ',')}</span>}
                          {a.data_hora && <span>📅 {formatarDataPt(a.data_hora)}</span>}
                          <span>🤖 {a.confianca}% conf.</span>
                          <span>· {formatarRelativoPt(a.created_at)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
