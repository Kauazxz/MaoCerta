'use client'

import { cloneElement, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { detectarIntencao } from '@/lib/acordos/detector'
import { acordosService } from '@/lib/supabase/acordos'
import PainelAcordos from './PainelAcordos'

type Aba = 'conversa' | 'acordos' | 'historico'
type Toast = { id: string; tipo: 'novo' | 'contraproposta' | 'aceite' | 'recusa'; mensagem: string }

type Props = {
  solicitacaoId: string
  meuId: string
  meuPapel: 'cliente' | 'profissional'
  conversa: ReactNode
}

const DEBUG = true
function log(...args: unknown[]) {
  if (DEBUG) console.log('[acordos]', ...args)
}

export default function AbasAtendimento({ solicitacaoId, meuId, meuPapel, conversa }: Props) {
  const [aba, setAba] = useState<Aba>('conversa')
  const [contadores, setContadores] = useState({ ativos: 0, historico: 0 })
  const [trigger, setTrigger] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])

  function pushToast(t: Omit<Toast, 'id'>) {
    const id = Math.random().toString(36).slice(2)
    setToasts((atual) => [...atual, { ...t, id }])
    setTimeout(() => {
      setToasts((atual) => atual.filter((x) => x.id !== id))
    }, 5000)
  }

  async function detectarECriar(mensagemId: string, conteudo: string) {
    log('detectarECriar', { mensagemId, conteudo })
    const intencao = detectarIntencao(conteudo || '')
    if (!intencao) {
      log('nenhuma intencao detectada')
      return
    }
    log('intencao:', intencao)
    const r = await acordosService.sugerir(solicitacaoId, meuId, mensagemId, intencao)
    log('resultado da sugestao:', r)
    if (r.tipo === 'novo') {
      pushToast({ tipo: 'novo', mensagem: `Novo acordo sugerido: ${intencao.tipo}` })
    } else if (r.tipo === 'contraproposta') {
      pushToast({
        tipo: 'contraproposta',
        mensagem: `Contraproposta registrada (${r.mudancas.join('; ')})`,
      })
    } else if (r.tipo === 'duplicado') {
      log('mensagem reafirmando acordo existente — sem mudanca')
    }
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
      } catch (err) {
        console.error('[acordos] listar falhou:', err)
      }
    }
    void carregar()
    return () => {
      cancel = true
    }
  }, [solicitacaoId, trigger])

  // Realtime backup: detecta mensagens novas que vierem por outra aba/dispositivo
  useEffect(() => {
    const supabase = createClient()
    const nomeCanal = `acordos:${solicitacaoId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    log('subscribing', nomeCanal)
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
          const row = payload.new as { id: string; remetente_id: string; conteudo: string }
          log('realtime msg', row)
          if (row.remetente_id !== meuId) return
          await detectarECriar(row.id, row.conteudo)
        },
      )
      .subscribe((status) => log('subscribe status:', status))

    return () => {
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitacaoId, meuId])

  // Realtime de NOTIFICACAO: novos acordos/confirmacoes do outro lado
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel(`acordos-notif:${solicitacaoId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'acordos_chat_sugeridos',
          filter: `solicitacao_id=eq.${solicitacaoId}`,
        },
        (payload) => {
          const row = payload.new as { sugerido_por_id: string; tipo: string }
          if (row.sugerido_por_id !== meuId) {
            pushToast({ tipo: 'novo', mensagem: `${meuPapel === 'cliente' ? 'Prestador' : 'Cliente'} sugeriu: ${row.tipo}` })
            setTrigger((n) => n + 1)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'acordos_chat_sugeridos',
          filter: `solicitacao_id=eq.${solicitacaoId}`,
        },
        (payload) => {
          const row = payload.new as { sugerido_por_id: string; tipo: string; revisao: number; status: string }
          if (row.sugerido_por_id !== meuId && row.revisao > 0 && row.status === 'editado') {
            pushToast({ tipo: 'contraproposta', mensagem: `${meuPapel === 'cliente' ? 'Prestador' : 'Cliente'} contrapropôs (${row.tipo})` })
            setTrigger((n) => n + 1)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'acordos_chat_confirmacoes',
        },
        (payload) => {
          const row = payload.new as { user_id: string; acao: string }
          if (row.user_id !== meuId) {
            const acao = row.acao === 'aceitou' ? 'aceite' : row.acao === 'recusou' ? 'recusa' : 'novo'
            pushToast({
              tipo: acao as Toast['tipo'],
              mensagem:
                row.acao === 'aceitou'
                  ? `${meuPapel === 'cliente' ? 'Prestador' : 'Cliente'} aceitou um acordo`
                  : row.acao === 'recusou'
                    ? `${meuPapel === 'cliente' ? 'Prestador' : 'Cliente'} recusou um acordo`
                    : `${meuPapel === 'cliente' ? 'Prestador' : 'Cliente'} editou um acordo`,
            })
            setTrigger((n) => n + 1)
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitacaoId, meuId, meuPapel])

  const conversaComCallback = isValidElement(conversa)
    ? cloneElement(conversa as ReactElement<{ onMensagemEnviada?: (m: { id: string; conteudo: string }) => void }>, {
        onMensagemEnviada: (msg: { id: string; conteudo: string }) => {
          log('callback do chat:', msg)
          void detectarECriar(msg.id, msg.conteudo)
        },
      })
    : conversa

  return (
    <>
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

      {/* Toasts de notificacao */}
      {toasts.length > 0 && (
        <div className="fixed top-16 right-4 z-[60] space-y-2 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto rounded-xl shadow-lg border px-4 py-3 text-sm font-medium max-w-xs animate-[fadeIn_0.2s_ease-out] ${
                t.tipo === 'novo'
                  ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-100'
                  : t.tipo === 'contraproposta'
                    ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100'
                    : t.tipo === 'aceite'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
                      : 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100'
              }`}
            >
              {t.mensagem}
            </div>
          ))}
        </div>
      )}
    </>
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
