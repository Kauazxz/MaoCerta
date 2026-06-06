'use client'

import type { EventoAtendimento } from '@/types/atendimento'
import { formatarDataPt } from '@/lib/formatar-data'

const ICONE: Record<string, string> = {
  plano_criado: '📋',
  item_enviado: '📨',
  item_aceito_cliente: '✓',
  item_recusado_cliente: '✗',
  item_alterado: '✏️',
  cobranca_criada: '💰',
  cobranca_extra_criada: '➕',
  cobranca_aceita: '✓',
  cobranca_recusada: '✗',
  pix_gerado: '💠',
  pagamento_confirmado: '✓',
  pagamento_liberado: '🏦',
  item_iniciado: '▶️',
  item_executado_profissional: '🔨',
  item_confirmado_cliente: '👍',
  item_contestado: '⚠️',
  disputa_aberta: '⚠️',
  pronto_para_termo_final: '🏁',
}

type Props = {
  eventos: EventoAtendimento[]
}

export default function HistoricoAtendimentoPanel({ eventos }: Props) {
  if (eventos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center space-y-2">
        <p className="text-2xl">📜</p>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Sem eventos ainda</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Cada acao no atendimento (proposta, aceite, pagamento) entra aqui automaticamente.
        </p>
      </div>
    )
  }

  return (
    <ol className="relative border-l-2 border-slate-200 dark:border-slate-700 pl-4 space-y-3">
      {eventos.map(e => (
        <li key={e.id} className="relative">
          <span
            className="absolute -left-[26px] top-1 inline-flex items-center justify-center w-6 h-6 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
            aria-hidden
          >
            {ICONE[e.tipo_evento] || '•'}
          </span>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 shadow-sm">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {e.titulo || e.tipo_evento}
            </p>
            {e.descricao && (
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">{e.descricao}</p>
            )}
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
              {formatarDataPt(e.created_at)} · {e.ator_tipo}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
