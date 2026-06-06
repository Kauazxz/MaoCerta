'use client'

import { useState } from 'react'
import AtendimentoStatusCard from './AtendimentoStatusCard'
import ProximaAcaoAtendimento from './ProximaAcaoAtendimento'
import PlanoAtendimentoPanel from './PlanoAtendimentoPanel'
import PagamentosAtendimentoPanel from './PagamentosAtendimentoPanel'
import HistoricoAtendimentoPanel from './HistoricoAtendimentoPanel'
import type { AtendimentoCompleto } from '@/types/atendimento'

type Aba = 'plano' | 'pagamentos' | 'historico'

type Props = {
  atendimento: AtendimentoCompleto
  perfil: 'cliente' | 'profissional'
  onRefresh: () => void
}

export default function AtendimentoShell({ atendimento, perfil, onRefresh }: Props) {
  const [aba, setAba] = useState<Aba>('plano')

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-24 space-y-4">
      <AtendimentoStatusCard atendimento={atendimento} />
      <ProximaAcaoAtendimento
        atendimento={atendimento}
        perfil={perfil}
        onAcao={destino => destino && setAba(destino)}
      />

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-1 grid grid-cols-3 gap-1 shadow border border-slate-200 dark:border-slate-800">
        <BotaoAba ativo={aba === 'plano'} onClick={() => setAba('plano')} contador={atendimento.itens.length}>
          Plano
        </BotaoAba>
        <BotaoAba
          ativo={aba === 'pagamentos'}
          onClick={() => setAba('pagamentos')}
          contador={atendimento.cobrancas.length}
        >
          Pagamentos
        </BotaoAba>
        <BotaoAba
          ativo={aba === 'historico'}
          onClick={() => setAba('historico')}
          contador={atendimento.eventos.length}
        >
          Historico
        </BotaoAba>
      </div>

      {aba === 'plano' && (
        <PlanoAtendimentoPanel atendimento={atendimento} perfil={perfil} onAlterado={onRefresh} />
      )}
      {aba === 'pagamentos' && (
        <PagamentosAtendimentoPanel atendimento={atendimento} perfil={perfil} onAlterado={onRefresh} />
      )}
      {aba === 'historico' && <HistoricoAtendimentoPanel eventos={atendimento.eventos} />}
    </div>
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
        ativo ? 'bg-violet-700 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
    >
      {children}
      <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${ativo ? 'bg-white/25' : 'bg-slate-100 dark:bg-slate-800'}`}>
        {contador}
      </span>
    </button>
  )
}
