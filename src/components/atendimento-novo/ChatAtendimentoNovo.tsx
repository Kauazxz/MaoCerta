'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Mensagem = {
  id: string
  solicitacao_id: string
  remetente_id: string
  conteudo: string
  tipo: 'usuario' | 'sistema'
  deeplink: Record<string, unknown> | null
  created_at: string
}

type Props = {
  solicitacaoId: string
  meuId: string
  onDeeplink?: (deeplink: Record<string, unknown>) => void
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatAtendimentoNovo({ solicitacaoId, meuId, onDeeplink }: Props) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const listaRef = useRef<HTMLDivElement | null>(null)

  // Carrega historico inicial
  useEffect(() => {
    let cancelado = false
    async function carregar() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('mensagens_atendimento')
        .select('id, solicitacao_id, remetente_id, conteudo, tipo, deeplink, created_at')
        .eq('solicitacao_id', solicitacaoId)
        .order('created_at', { ascending: true })
        .limit(500)
      if (cancelado) return
      if (error) {
        setErro(error.message)
        return
      }
      setMensagens((data as Mensagem[]) || [])
    }
    void carregar()
    return () => {
      cancelado = true
    }
  }, [solicitacaoId])

  // Realtime de INSERT (proprio chat). Canal por mount, cleanup garantido.
  useEffect(() => {
    if (!solicitacaoId) return
    const supabase = createClient()
    const nome = `chat:${solicitacaoId}:${Math.random().toString(36).slice(2, 8)}`
    const channel = supabase
      .channel(nome)
      .on(
        'postgres_changes' as never,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens_atendimento',
          filter: `solicitacao_id=eq.${solicitacaoId}`,
        } as never,
        (payload: { new: Mensagem }) => {
          setMensagens(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [solicitacaoId])

  // Auto scroll
  useEffect(() => {
    const el = listaRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [mensagens])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const conteudo = texto.trim()
    if (!conteudo) return
    setEnviando(true)
    setErro(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('mensagens_atendimento').insert({
        solicitacao_id: solicitacaoId,
        remetente_id: meuId,
        conteudo,
        tipo: 'usuario',
      })
      if (error) throw error
      setTexto('')
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col h-[60vh] min-h-[400px] bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div ref={listaRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {mensagens.length === 0 && (
          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-6">
            Sem mensagens ainda. Conversa livremente — acoes formais aparecem como bolhinhas compactas.
          </p>
        )}
        {mensagens.map(m => {
          if (m.tipo === 'sistema') {
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => m.deeplink && onDeeplink?.(m.deeplink)}
                className="block w-full text-center text-[11px] text-slate-600 dark:text-slate-300 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30 rounded-full py-1 px-2 transition-colors"
                title={onDeeplink ? 'Ir para o card' : undefined}
              >
                {m.conteudo}{' '}
                <span className="text-[9px] text-slate-400">· {hora(m.created_at)}</span>
              </button>
            )
          }
          const ehMinha = m.remetente_id === meuId
          return (
            <div
              key={m.id}
              className={`flex ${ehMinha ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  ehMinha
                    ? 'bg-emerald-600 text-white rounded-br-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-sm border border-slate-200 dark:border-slate-700'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                <p
                  className={`text-[10px] mt-0.5 ${
                    ehMinha ? 'text-emerald-100' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {hora(m.created_at)}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <form
        onSubmit={enviar}
        className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 flex gap-2"
      >
        <input
          type="text"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="Escreva uma mensagem..."
          disabled={enviando}
          className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:border-emerald-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={enviando || !texto.trim()}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
      {erro && <p className="text-[11px] text-red-600 px-3 pb-2">Erro: {erro}</p>}
    </div>
  )
}
