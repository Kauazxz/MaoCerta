'use client'

import CardItemPlano from './CardItemPlano'
import type { AtendimentoCompleto } from '@/types/atendimento'

type Props = {
  atendimento: AtendimentoCompleto
  perfil: 'cliente' | 'profissional'
  meuId: string
  onAlterado: () => void
}

export default function PlanoAtendimentoPanel({ atendimento, perfil, meuId, onAlterado }: Props) {
  const { plano, itens } = atendimento

  if (!plano) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center space-y-2">
        <p className="text-2xl">📋</p>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Sem plano ainda</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {perfil === 'profissional'
            ? 'Crie o plano para organizar o atendimento (proposta, valor, momento de pagamento).'
            : 'Aguardando o profissional enviar o plano com a(s) proposta(s).'}
        </p>
      </div>
    )
  }

  if (itens.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center space-y-2">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Plano criado. Sem itens ainda.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {perfil === 'profissional'
            ? 'Adicione um item (vistoria, diaria, hora, etc) para iniciar a negociacao.'
            : 'Aguardando o profissional adicionar os itens do plano.'}
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {itens.map(item => (
        <li key={item.id}>
          <CardItemPlano item={item} perfil={perfil} meuId={meuId} onAcao={onAlterado} />
        </li>
      ))}
    </ul>
  )
}
