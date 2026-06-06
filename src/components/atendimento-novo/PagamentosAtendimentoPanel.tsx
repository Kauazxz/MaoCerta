'use client'

import CardCobrancaAtendimento from './CardCobrancaAtendimento'
import type { AtendimentoCompleto } from '@/types/atendimento'

type Props = {
  atendimento: AtendimentoCompleto
  perfil: 'cliente' | 'profissional'
  onAlterado: () => void
}

export default function PagamentosAtendimentoPanel({ atendimento, perfil, onAlterado }: Props) {
  const { cobrancas } = atendimento

  if (cobrancas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center space-y-2">
        <p className="text-2xl">💸</p>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Sem cobrancas ainda</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Cobrancas aparecem aqui assim que itens forem aceitos ou execucoes confirmadas.
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {cobrancas.map(c => (
        <li key={c.id}>
          <CardCobrancaAtendimento cobranca={c} perfil={perfil} onAlterado={onAlterado} />
        </li>
      ))}
    </ul>
  )
}
