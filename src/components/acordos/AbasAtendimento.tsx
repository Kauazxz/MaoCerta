'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { detectarIntencao } from '@/lib/acordos/detector'
import { acordosService } from '@/lib/supabase/acordos'
import PainelAcordos from './PainelAcordos'

type Aba = 'conversa' | 'acordos' | 'historico'

type Props = {
  solicitacaoId: string
  meuId: string
  meuPapel: 'cliente' | 'profissional'
  /** ChatAtendimento renderizado de fora (preservamos o componente original) */
  conversa: ReactNode
}

export default function AbasAtendimento({ solicitacaoId, meuId, meuPapel, conversa }: Props) {
  const [aba, setAba] = useState<Aba>('conversa')
  const [contadores, setContadores] = useState({ ativos: 0, historico: 0 })
  const [trigger, setTrigger] = useState(0)

  // Carrega contadores
  useEffect(() => {
    let cancel = false
    async function carregar() {
      const lista = await acordosService.listar(solicitacaoId)
      if (cancel) return
      const ativos = lista.filter((a) => a.status === 'aguardando' || a.status === 'aceito' || a.status === 'editado').length
      const historico = lista.filter((a) => a.status === 'convertido' || a.status === 'recusado' || a.status === 'expirado').length
      setContadores({ ativos, historico })
    }
    void carregar()
    return () => {
      cancel = true
    }
  }, [solicitacaoId, trigger])

  // Escuta novas mensagens via Realtime e roda o detector
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`acordos-${solicitacaoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens_atendimento',
          filter: `solicitacao_id=eq.${solicitacaoId}`,
        },
        async (payload) => {
          const row = payload.new as { id: string; autor_id: string; texto: string }
          // Só processa minhas próprias mensagens (evita duplicar do outro lado)
          if (row.autor_id !== meuId) return
          const intencao = detectarIntencao(row.texto || '')
          if (!intencao) return
          // Evita criar sugestão duplicada para a mesma mensagem
          await acordosService.sugerir(solicitacaoId, meuId, row.id, intencao)
          setTrigger((n) => n + 1)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [solicitacaoId, meuId])

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
        {aba === 'conversa' && conversa}
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
