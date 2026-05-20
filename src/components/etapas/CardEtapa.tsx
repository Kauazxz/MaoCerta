'use client'

import { useState } from 'react'
import { Etapa, Pagamento, TipoEtapa } from '@/types'
import { formatarDataPt, formatarValorBrl } from '@/lib/formatar-data'
import PagamentoEtapaPanel from '@/components/financeiro/PagamentoEtapaPanel'
import EtapaFinanceiraTimeline from '@/components/financeiro/EtapaFinanceiraTimeline'
import { pagamentoPermiteIniciarEtapa } from '@/lib/financeiro/status-pagamento'

type Props = {
  etapa: Etapa
  meuId: string
  meuTipo: 'cliente' | 'profissional'
  solicitacaoStatus: string
  pagamento: Pagamento | null
  onPagamentoAlterado: () => void
  onComecar: () => void
  onConcluir: () => void
  onConfirmar: () => void
  onCancelar: (motivo?: string) => void
  onPropostaAgendamento: () => void
  onVerAgendamentos: () => void
  podeInteragir: boolean
}

const statusBadges: Record<Etapa['status'], { label: string; bg: string; text: string }> = {
  pendente: { label: '⏳ Pendente', bg: 'bg-gray-50 dark:bg-slate-800', text: 'text-gray-700 dark:text-slate-300' },
  agendada: { label: '📅 Agendada', bg: 'bg-blue-50', text: 'text-blue-700' },
  em_progresso: { label: '⚙️ Em Progresso', bg: 'bg-amber-50', text: 'text-amber-700' },
  finalizada_prestador: { label: '⌛ Aguardando cliente', bg: 'bg-purple-50', text: 'text-purple-800' },
  concluida: { label: '✅ Concluída', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  contestada: { label: '⚠️ Contestada', bg: 'bg-red-50', text: 'text-red-700' },
  cancelada: { label: '❌ Cancelada', bg: 'bg-red-50', text: 'text-red-700' }
}

const nomeEtapaMap: Record<TipoEtapa, { nome: string; emoji: string }> = {
  vistoria: { nome: 'Vistoria/Consulta', emoji: '🔍' },
  orcamento: { nome: 'Orçamento', emoji: '💰' },
  execucao: { nome: 'Execução', emoji: '🔨' }
}

export default function CardEtapa({
  etapa,
  meuId,
  meuTipo,
  solicitacaoStatus,
  pagamento,
  onPagamentoAlterado,
  onComecar,
  onConcluir,
  onConfirmar,
  onCancelar,
  onPropostaAgendamento,
  onVerAgendamentos,
  podeInteragir
}: Props) {
  const [expandido, setExpandido] = useState(false)
  const [mostraCancelamento, setMostraCancelamento] = useState(false)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  
  const badge = statusBadges[etapa.status]
  const nomeEtapa = nomeEtapaMap[etapa.tipo]
  const valorEtapaNum = Number(etapa.valor_acordado ?? 0)
  const pagamentoOkParaIniciar = pagamentoPermiteIniciarEtapa(pagamento?.status)
  const podeIniciarComoProfissional =
    meuTipo === 'profissional' &&
    ((etapa.status === 'pendente' && valorEtapaNum <= 0) ||
      (etapa.status === 'agendada' && (valorEtapaNum <= 0 || pagamentoOkParaIniciar)))
  const ambosCfirmaram = etapa.cliente_confirmou && etapa.profissional_confirmou
  const podeConfirmar = 
    etapa.status === 'concluida' && 
    (
      (meuTipo === 'cliente' && !etapa.cliente_confirmou) ||
      (meuTipo === 'profissional' && !etapa.profissional_confirmou)
    )

  const podePropor = etapa.status === 'pendente' && meuTipo === 'profissional'

  const clientePodeVerAgendamentos =
    meuTipo === 'cliente' && etapa.status !== 'cancelada' && etapa.status !== 'concluida'

  function handleCancelar() {
    if (motivoCancelamento.trim()) {
      onCancelar(motivoCancelamento)
      setMostraCancelamento(false)
      setMotivoCancelamento('')
    }
  }

  return (
    <div className={`rounded-xl border-2 transition-all ${badge.bg} border-transparent`}>
      <button
        onClick={() => setExpandido(!expandido)}
        className="w-full text-left p-4 flex items-center justify-between hover:opacity-80"
      >
        <div className="flex items-center gap-3 flex-1">
          <span className="text-2xl">{nomeEtapa.emoji}</span>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-slate-100">{nomeEtapa.nome}</h3>
            <p className={`text-xs font-medium ${badge.text}`}>{badge.label}</p>
            {valorEtapaNum > 0 && (
              <p className="text-[11px] font-semibold text-emerald-700 mt-1">
                Valor da etapa: {formatarValorBrl(valorEtapaNum)}
              </p>
            )}
          </div>
        </div>
        <span className="text-2xl text-gray-400 dark:text-slate-500">{expandido ? '▼' : '▶'}</span>
      </button>

      {expandido && (
        <div className="border-t border-gray-200 dark:border-slate-700 px-4 py-4 space-y-4">
          {/* Informações de agendamento */}
          {etapa.data_proposta && (
            <div className="bg-white dark:bg-slate-900 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">📅 DATA E HORÁRIO AGENDADO</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                {formatarDataPt(etapa.data_proposta)} às {etapa.hora_proposta || '...:...'}
              </p>
            </div>
          )}

          {/* Notas */}
          {etapa.notas_inicial && (
            <div className="bg-white dark:bg-slate-900 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">📝 NOTAS INICIAIS</p>
              <p className="text-sm text-gray-700 dark:text-slate-300">{etapa.notas_inicial}</p>
            </div>
          )}

          {etapa.notas_conclusao && (
            <div className="bg-white dark:bg-slate-900 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">✍️ NOTAS DE CONCLUSÃO</p>
              <p className="text-sm text-gray-700 dark:text-slate-300">{etapa.notas_conclusao}</p>
            </div>
          )}

          {/* Confirmações */}
          <div className="bg-white dark:bg-slate-900 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-slate-400">Prestador confirmou:</span>
              <span className={etapa.profissional_confirmou ? 'text-emerald-600 font-semibold' : 'text-gray-400 dark:text-slate-500'}>
                {etapa.profissional_confirmou ? '✅ Sim' : '⏳ Não'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-slate-400">Cliente confirmou:</span>
              <span className={etapa.cliente_confirmou ? 'text-emerald-600 font-semibold' : 'text-gray-400 dark:text-slate-500'}>
                {etapa.cliente_confirmou ? '✅ Sim' : '⏳ Não'}
              </span>
            </div>
          </div>

          <EtapaFinanceiraTimeline etapa={etapa} pagamento={pagamento} />

          <PagamentoEtapaPanel
            etapa={etapa}
            solicitacaoStatus={solicitacaoStatus}
            meuTipo={meuTipo}
            pagamento={pagamento}
            onAlterado={onPagamentoAlterado}
          />

          {/* Botões de ação */}
          {podeInteragir && (
            <div className="space-y-2 pt-2">
              {etapa.status === 'pendente' && (
                <>
                  {podeIniciarComoProfissional && (
                    <button
                      onClick={onComecar}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                    >
                      ▶️ Iniciar etapa
                    </button>
                  )}
                  {podePropor && (
                    <button
                      onClick={onPropostaAgendamento}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                    >
                      📅 Propor Data/Horário
                    </button>
                  )}
                  {clientePodeVerAgendamentos && (
                    <button
                      type="button"
                      onClick={onVerAgendamentos}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                    >
                      📅 Ver agendamentos e responder
                    </button>
                  )}
                </>
              )}

              {etapa.status === 'agendada' && meuTipo === 'profissional' && valorEtapaNum > 0 && !pagamentoOkParaIniciar && (
                <p className="text-[11px] text-center text-amber-800 bg-amber-50 border border-amber-100 rounded-lg py-2 px-2">
                  Aguardando o cliente pagar esta etapa pela plataforma para você iniciar o trabalho (RF39.3).
                </p>
              )}

              {etapa.status === 'agendada' && podeIniciarComoProfissional && (
                <button
                  onClick={onComecar}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                >
                  ▶️ Iniciar etapa
                </button>
              )}

              {etapa.status === 'em_progresso' && meuTipo === 'profissional' && (
                <button
                  onClick={onConcluir}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                >
                  ✅ Marcar como Concluída
                </button>
              )}

              {clientePodeVerAgendamentos &&
                (etapa.status === 'agendada' || etapa.status === 'em_progresso') && (
                  <button
                    type="button"
                    onClick={onVerAgendamentos}
                    className="w-full bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                  >
                    📅 Ver agendamentos
                  </button>
                )}

              {podeConfirmar && (
                <button
                  onClick={onConfirmar}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                >
                  🤝 Confirmar Conclusão
                </button>
              )}

              {etapa.status !== 'concluida' && etapa.status !== 'cancelada' && (
                <button
                  onClick={() => setMostraCancelamento(!mostraCancelamento)}
                  className="w-full border-2 border-red-300 text-red-600 hover:bg-red-50 font-semibold py-2 px-4 rounded-lg transition"
                >
                  ❌ Cancelar Etapa
                </button>
              )}

              {mostraCancelamento && (
                <div className="bg-red-50 rounded-lg p-3 space-y-2">
                  <textarea
                    placeholder="Por que esta etapa está sendo cancelada? (opcional)"
                    value={motivoCancelamento}
                    onChange={(e) => setMotivoCancelamento(e.target.value)}
                    className="w-full text-xs border border-red-200 rounded p-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancelar}
                      disabled={!motivoCancelamento.trim()}
                      className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-1 px-2 rounded text-sm transition"
                    >
                      Confirmar Cancelamento
                    </button>
                    <button
                      onClick={() => {
                        setMostraCancelamento(false)
                        setMotivoCancelamento('')
                      }}
                      className="flex-1 border border-red-300 text-red-600 hover:bg-red-50 font-semibold py-1 px-2 rounded text-sm transition"
                    >
                      Manter
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!podeInteragir && etapa.status === 'concluida' && ambosCfirmaram && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
              <span className="text-lg">✅</span>
              <p className="text-sm font-semibold text-emerald-700">Etapa finalizada com ambas as confirmações</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
