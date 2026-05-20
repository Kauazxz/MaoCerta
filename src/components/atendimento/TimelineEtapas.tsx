'use client'

import GerenciadorEtapas from '@/components/etapas/GerenciadorEtapas'

type Props = {
  solicitacaoId: string
  meuId: string
  meuTipo: 'cliente' | 'profissional'
  solicitacaoStatus: string
  financeSignal?: number
}

export default function TimelineEtapas({ solicitacaoId, meuId, meuTipo, solicitacaoStatus, financeSignal }: Props) {
  return (
    <div className="p-4">
      <GerenciadorEtapas
        solicitacaoId={solicitacaoId}
        meuId={meuId}
        meuTipo={meuTipo}
        solicitacaoStatus={solicitacaoStatus}
        financeSignal={financeSignal}
      />
    </div>
  )
}
