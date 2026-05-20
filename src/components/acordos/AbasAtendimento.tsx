'use client'

import { cloneElement, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { detectarIntencao } from '@/lib/acordos/detector'
import { acordosService } from '@/lib/supabase/acordos'
import PainelAcordos from './PainelAcordos'

type Aba = 'conversa' | 'acordos' | 'historico'

type Props = {
  solicitacaoId: string
  meuId: string
  meuPapel: 'cliente' | 'profissional'
  /** ChatAtendimento renderizado de fora. Recebe automaticamente onMensagemEnviada injetado. */
  conversa: ReactNode
}

// Logs temporarios pra validar a Fase 1. Pode remover depois.
const DEBUG = true
function log(...args: unknown[]) {
  if (DEBUG) console.log('[acordos]', ...args)
}

export default function AbasAtendimento({ solicitacaoId, meuId, meuPapel, conversa }: Props) {
  const [aba, setAba] = useState<Aba>('conversa')
  const [contadores, setContadores] = useState({ ativos: 0, historico: 0 })
  const [trigger, setTrigger] = useState(0)

  // Roda o detector e cria a sugestao. Idempotente: nao recria se ja' existe sugestao
  // ativa para a mesma mensagem.
  async function detectarECriar(mensagemId: string, conteudo: string) {
    log('detectarECriar chamado', { mensagemId, conteudo, meuId, solicitacaoId })
    const intencao = detectarIntencao(conteudo || '')
    if (!intencao) {
      log('nenhuma intencao detectada')
      return
    }
    log('intencao detectada:', intencao)

    // Evita duplicar: se ja existe acordo aguardando vinculado a essa mensagem, ignora
    const supabase = createClient()
    const { data: ja } = await supabase
      .from('acordos_chat_sugeridos')
      .select('id')
      .eq('mensagem_origem_id', mensagemId)
      .maybeSingle()
    if (ja) {
      log('acordo ja existe para essa mensagem, pulando')
      return
    }

    const r = await acordosService.sugerir(solicitacaoId, meuId, mensagemId, intencao)
    if (!r) {
      log('FALHOU ao inserir acordo - veja console anterior pelo erro')
      return
    }
    log('acordo criado:', r.id)
    setTrigger((n) => n + 1)
  }

  // Carrega contadores
  useEffect(() => {
    let cancel = false
    async function carregar() {
      try {
        const lista = await acordosService.listar(solicitacaoId)
        if (cancel) return
        const ativos = lista.filter((a) => a.status === 'aguardando' || a.status === 'aceito' || a.status === 'editado').length
        const historico = lista.filter((a) => a.status === 'convertido' || a.status === 'recusado' || a.status === 'expirado').length
        setContadores({ ativos, historico })
        log('contadores atualizados:', { ativos, historico, totalLista: lista.length })
      } catch (err) {
        console.error('[acordos] listar falhou:', err)
      }
    }
    void carregar()
    return () => {
      cancel = true
    }
  }, [solicitacaoId, trigger])

  // Realtime: tambem detecta mensagens novas que entrarem (cobre o caso de a
  // mensagem ter sido inserida sem passar pelo callback do chat — sincronizacao
  // entre dispositivos do mesmo usuario, por exemplo).
  useEffect(() => {
    const supabase = createClient()
    const nomeCanal = `acordos:${solicitacaoId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    log('subscribing realtime channel', nomeCanal)
    const channel = supabase
      .channel(nomeCanal)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens_atendimento',
          filter: `solicitacao_id=eq.${solicitacaoId}`,
        },
        async (payload) => {
          // CORRECAO: as colunas certas sao remetente_id e conteudo
          const row = payload.new as { id: string; remetente_id: string; conteudo: string }
          log('realtime INSERT recebido:', row)
          if (row.remetente_id !== meuId) {
            log('mensagem nao e minha (remetente_id !== meuId), ignorando')
            return
          }
          await detectarECriar(row.id, row.conteudo)
        },
      )
      .subscribe((status) => log('realtime subscribe status:', status))

    return () => {
      log('removendo realtime channel', nomeCanal)
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitacaoId, meuId])

  // Injeta callback no ChatAtendimento (fallback que funciona mesmo se Realtime falhar)
  const conversaComCallback = isValidElement(conversa)
    ? cloneElement(conversa as ReactElement<{ onMensagemEnviada?: (m: { id: string; conteudo: string }) => void }>, {
        onMensagemEnviada: (msg: { id: string; conteudo: string }) => {
          log('onMensagemEnviada (callback direto do chat):', msg)
          void detectarECriar(msg.id, msg.conteudo)
        },
      })
    : conversa

  return (
    <section className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800">
      <nav className="flex border-b border-gray-100 dark:border-slate-800 px-2 sm:px-4">
        <BotaoAba ativo={aba === 'conversa'} onClick={() => setAba('conversa')}>
          💬 Conversa
        </BotaoAba>
        <BotaoAba ativo={aba === 'acordos'} onClick={() => setAba('acordos')} contador={contadores.ativos}>
          📌 Acordos
        </BotaoAba>
        <BotaoAba ativo={aba === 'historico'} onClick={() => setAba('historico')} contador={contadores.historico}>
          📜 Histórico
        </BotaoAba>
      </nav>

      <div className="min-h-[300px]">
        {aba === 'conversa' && conversaComCallback}
        {aba === 'acordos' && (
          <PainelAcordos
            solicitacaoId={solicitacaoId}
            meuId={meuId}
            meuPapel={meuPapel}
            recarregarTrigger={trigger}
            modo="ativos"
          />
        )}
        {aba === 'historico' && (
          <PainelAcordos
            solicitacaoId={solicitacaoId}
            meuId={meuId}
            meuPapel={meuPapel}
            recarregarTrigger={trigger}
            modo="historico"
          />
        )}
      </div>
    </section>
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
  contador?: number
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-3 text-xs font-bold uppercase tracking-wide transition-colors border-b-2 ${
        ativo
          ? 'text-purple-700 dark:text-purple-300 border-purple-600 dark:border-purple-400'
          : 'text-gray-500 dark:text-slate-400 border-transparent hover:text-gray-700 dark:hover:text-slate-200'
      }`}
    >
      {children}
      {contador !== undefined && contador > 0 && (
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
            ativo
              ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200'
              : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300'
          }`}
        >
          {contador}
        </span>
      )}
    </button>
  )
}
