'use client'

import { useState } from 'react'
import {
  aceitarItemPlano,
  confirmarExecucaoItem,
  contestarItem,
  iniciarItem,
  marcarItemExecutado,
  recusarItemPlano,
  enviarPropostaItem,
} from '@/lib/supabase/atendimento-plano'
import type { ItemPlano, StatusItem } from '@/types/atendimento'

function valor(v: number | null | undefined) {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const STATUS_LABEL: Record<StatusItem, string> = {
  rascunho: 'Rascunho',
  enviado: 'Aguardando aceite do cliente',
  aceito: 'Aceito',
  recusado: 'Recusado',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  pronto_para_iniciar: 'Pronto para iniciar',
  em_execucao: 'Em execucao',
  executado_pelo_profissional: 'Executado - aguardando confirmacao',
  aguardando_confirmacao_cliente: 'Aguardando confirmacao do cliente',
  confirmado_pelo_cliente: 'Confirmado pelo cliente',
  aguardando_pagamento_final: 'Aguardando pagamento final',
  concluido: 'Concluido',
  contestado: 'Contestado',
  cancelado: 'Cancelado',
}

const STATUS_CLS: Partial<Record<StatusItem, string>> = {
  rascunho: 'bg-slate-100 text-slate-700 border-slate-200',
  enviado: 'bg-amber-50 text-amber-900 border-amber-200',
  aceito: 'bg-blue-50 text-blue-900 border-blue-200',
  aguardando_pagamento: 'bg-amber-50 text-amber-900 border-amber-200',
  pago: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  pronto_para_iniciar: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  em_execucao: 'bg-blue-50 text-blue-900 border-blue-200',
  executado_pelo_profissional: 'bg-amber-50 text-amber-900 border-amber-200',
  confirmado_pelo_cliente: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  aguardando_pagamento_final: 'bg-amber-50 text-amber-900 border-amber-200',
  concluido: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  contestado: 'bg-orange-50 text-orange-900 border-orange-200',
  recusado: 'bg-red-50 text-red-700 border-red-200',
  cancelado: 'bg-slate-100 text-slate-700 border-slate-200',
}

type Props = {
  item: ItemPlano
  perfil: 'cliente' | 'profissional'
  onAcao: () => void
}

export default function CardItemPlano({ item, perfil, onAcao }: Props) {
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const cls = STATUS_CLS[item.status] || 'bg-slate-100 text-slate-700 border-slate-200'

  async function executar(fn: () => Promise<unknown>) {
    setProcessando(true)
    setErro(null)
    try {
      await fn()
      onAcao()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setProcessando(false)
    }
  }

  return (
    <article className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-3">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {item.tipo}
          </p>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.titulo}</h3>
          {item.descricao && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{item.descricao}</p>
          )}
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cls}`}>
          {STATUS_LABEL[item.status]}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-1.5">
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Valor previsto</p>
          <p className="font-bold text-slate-900 dark:text-slate-100">
            {valor(item.valor_total_previsto ?? item.valor_unitario)}
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-1.5">
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Pagamento</p>
          <p className="font-semibold text-slate-700 dark:text-slate-200">{item.momento_pagamento}</p>
        </div>
      </div>

      {/* Acoes do PROFISSIONAL */}
      {perfil === 'profissional' && (
        <div className="flex flex-wrap gap-2">
          {item.status === 'rascunho' && (
            <button
              type="button"
              disabled={processando}
              onClick={() => executar(() => enviarPropostaItem(item.id))}
              className="flex-1 rounded-xl bg-violet-700 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              Enviar proposta
            </button>
          )}
          {(item.status === 'aceito' || item.status === 'pronto_para_iniciar') && (
            <button
              type="button"
              disabled={processando}
              onClick={() => executar(() => iniciarItem(item.id))}
              className="flex-1 rounded-xl bg-blue-700 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              Iniciar
            </button>
          )}
          {item.status === 'em_execucao' && (
            <button
              type="button"
              disabled={processando}
              onClick={() => executar(() => marcarItemExecutado(item.id))}
              className="flex-1 rounded-xl bg-emerald-700 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              Marcar como executado
            </button>
          )}
        </div>
      )}

      {/* Acoes do CLIENTE */}
      {perfil === 'cliente' && (
        <div className="flex flex-wrap gap-2">
          {item.status === 'enviado' && (
            <>
              <button
                type="button"
                disabled={processando}
                onClick={() => executar(() => aceitarItemPlano(item.id))}
                className="flex-1 rounded-xl bg-emerald-700 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                Aceitar
              </button>
              <button
                type="button"
                disabled={processando}
                onClick={() => {
                  const motivo = window.prompt('Motivo da recusa:') || ''
                  if (motivo.trim()) void executar(() => recusarItemPlano(item.id, motivo))
                }}
                className="flex-1 rounded-xl border border-red-200 bg-white py-2 text-xs font-bold text-red-700 disabled:opacity-50"
              >
                Recusar
              </button>
            </>
          )}
          {item.status === 'executado_pelo_profissional' && (
            <>
              <button
                type="button"
                disabled={processando}
                onClick={() => executar(() => confirmarExecucaoItem(item.id))}
                className="flex-1 rounded-xl bg-emerald-700 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                Confirmar
              </button>
              <button
                type="button"
                disabled={processando}
                onClick={() => {
                  const motivo = window.prompt('Por que esta contestando?') || ''
                  if (motivo.trim()) void executar(() => contestarItem(item.id, motivo))
                }}
                className="flex-1 rounded-xl border border-orange-200 bg-white py-2 text-xs font-bold text-orange-700 disabled:opacity-50"
              >
                Contestar
              </button>
            </>
          )}
        </div>
      )}

      {erro && <p className="text-xs text-red-600 font-medium">Erro: {erro}</p>}
    </article>
  )
}
