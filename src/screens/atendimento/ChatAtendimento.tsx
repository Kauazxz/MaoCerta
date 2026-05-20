'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Mensagem = {
  id: string
  solicitacao_id: string
  remetente_id: string
  conteudo: string
  created_at: string
  alerta_pagamento_externo?: boolean
  motivo_moderacao?: string | null
}

type Props = {
  solicitacaoId: string
  meuId: string
  podeEnviar?: boolean
  corOutro?: string
  corMinha?: string
  /** Callback opcional disparado apos cada mensagem MINHA enviada com sucesso. Usado pela camada de Acordos Assistidos. */
  onMensagemEnviada?: (msg: { id: string; conteudo: string }) => void
}

export default function ChatAtendimento({
  solicitacaoId,
  meuId,
  podeEnviar = true,
  corOutro = 'bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-200',
  corMinha = 'bg-emerald-600 text-white',
  onMensagemEnviada,
}: Props) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const fimRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    let ativo = true

    // 1) Registra .on() ANTES de subscribe — evita o erro
    //    "cannot add postgres_changes callbacks after subscribe()"
    // 2) Nome único por mount — evita colisão com canal residual no Strict Mode
    const nomeCanal = `mensagens:${solicitacaoId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const canal = supabase
      .channel(nomeCanal)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens_atendimento',
          filter: `solicitacao_id=eq.${solicitacaoId}`,
        },
        (payload) => {
          const nova = payload.new as Mensagem
          setMensagens((atual) => (atual.some((m) => m.id === nova.id) ? atual : [...atual, nova]))
        },
      )
      .subscribe()

    // Carrega o histórico em paralelo
    setCarregando(true)
    supabase
      .from('mensagens_atendimento')
      .select('*')
      .eq('solicitacao_id', solicitacaoId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) {
          setErro(`Não foi possível carregar mensagens: ${error.message}`)
        } else {
          setMensagens((data as Mensagem[]) || [])
        }
        setCarregando(false)
      })

    return () => {
      ativo = false
      supabase.removeChannel(canal)
    }
  }, [solicitacaoId])

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const conteudo = texto.trim()
    if (!conteudo || enviando) return

    setEnviando(true)
    setErro(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('mensagens_atendimento')
      .insert({ solicitacao_id: solicitacaoId, remetente_id: meuId, conteudo })
      .select()
      .single()

    setEnviando(false)

    if (error) {
      setErro(`Falha ao enviar: ${error.message}`)
      return
    }
    setTexto('')
    if (data) {
      const msg = data as Mensagem
      setMensagens((atual) => (atual.some((m) => m.id === msg.id) ? atual : [...atual, msg]))
      // Dispara callback pra camadas opcionais (ex: detector de Acordos)
      if (onMensagemEnviada) {
        try {
          onMensagemEnviada({ id: msg.id, conteudo: msg.conteudo })
        } catch (err) {
          console.error('[chat] onMensagemEnviada falhou:', err)
        }
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {carregando && (
          <p className="text-center text-xs text-gray-400 dark:text-slate-500 py-6">Carregando conversa...</p>
        )}
        {!carregando && mensagens.length === 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-slate-500 py-6">
            Nenhuma mensagem ainda. Mande a primeira pra alinhar os detalhes.
          </p>
        )}
        {mensagens.map((m) => {
          const minha = m.remetente_id === meuId
          return (
            <div key={m.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  minha ? corMinha : corOutro
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                {m.alerta_pagamento_externo && (
                  <p className="text-[10px] mt-1.5 font-semibold text-amber-900 bg-amber-100/90 rounded-lg px-2 py-1 border border-amber-200">
                    ⚠️ {m.motivo_moderacao || 'Mensagem sinalizada: use apenas o pagamento oficial da plataforma (RN18).'}
                  </p>
                )}
                <p className={`text-[10px] mt-1 ${minha ? 'text-white/70' : 'text-gray-400 dark:text-slate-500'}`}>
                  {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={fimRef} />
      </div>

      {erro && (
        <p className="text-xs text-red-700 bg-red-50 border-t border-red-100 px-3 py-2">{erro}</p>
      )}

      {podeEnviar ? (
        <form onSubmit={enviar} className="border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 flex gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                enviar(e as unknown as FormEvent)
              }
            }}
            placeholder="Escreva uma mensagem..."
            rows={1}
            className="flex-1 resize-none bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 max-h-32"
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            className="shrink-0 bg-emerald-600 text-white font-semibold px-4 rounded-xl text-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {enviando ? '...' : 'Enviar'}
          </button>
        </form>
      ) : (
        <p className="border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 px-3 py-3 text-center text-xs text-gray-500 dark:text-slate-400">
          Esta conversa está fechada. Mensagens não podem mais ser enviadas.
        </p>
      )}
    </div>
  )
}
