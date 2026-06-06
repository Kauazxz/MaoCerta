'use client'

import type { AtendimentoCompleto } from '@/types/atendimento'

function valor(v: number | null | undefined) {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type Props = {
  atendimento: AtendimentoCompleto
}

export default function AtendimentoStatusCard({ atendimento }: Props) {
  const { plano, itens, cobrancas } = atendimento

  // Total previsto SO conta itens ativos. Cancelado/recusado nao soma -
  // assim trocar uma proposta nao "duplica" o valor do atendimento.
  const totalPrevisto = itens
    .filter(it => !['cancelado', 'recusado'].includes(it.status))
    .reduce(
      (acc, it) => acc + Number(it.valor_total_previsto ?? it.valor_unitario ?? 0),
      0,
    )
  const totalPago = cobrancas
    .filter(c => c.status === 'paga' || c.status === 'retida' || c.status === 'liberada')
    .reduce((acc, c) => acc + Number(c.valor), 0)
  const totalPendente = cobrancas
    .filter(c => ['aguardando_aceite', 'aceita', 'pix_gerado', 'aguardando_pagamento'].includes(c.status))
    .reduce((acc, c) => acc + Number(c.valor), 0)

  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Plano de atendimento
        </p>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {plano?.titulo || 'Sem plano definido'}
        </h2>
        {plano?.descricao && (
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{plano.descricao}</p>
        )}
        {plano && (
          <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800">
            {plano.status}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-2">
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Previsto</p>
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{valor(totalPrevisto)}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 px-2 py-2">
          <p className="text-[10px] text-emerald-800 uppercase">Pago</p>
          <p className="text-sm font-bold text-emerald-900">{valor(totalPago)}</p>
        </div>
        <div className="rounded-lg bg-amber-50 px-2 py-2">
          <p className="text-[10px] text-amber-900 uppercase">Pendente</p>
          <p className="text-sm font-bold text-amber-900">{valor(totalPendente)}</p>
        </div>
      </div>
    </section>
  )
}
