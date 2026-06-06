'use client'

import { useState } from 'react'
import {
  aceitarItemPlano,
  confirmarExecucaoItem,
  contestarItem,
  enviarPropostaItem,
  iniciarItem,
  marcarItemExecutado,
  recusarItemPlano,
  responderExclusaoItem,
  solicitarExclusaoItem,
} from '@/lib/supabase/atendimento-plano'
import type { ItemPlano, StatusItem } from '@/types/atendimento'
import MotivoTextoModal from './MotivoTextoModal'

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
  meuId: string
  onAcao: () => void
}

type ModalAtivo =
  | null
  | 'recusar'
  | 'contestar'
  | 'solicitar_exclusao'
  | 'rejeitar_exclusao'

export default function CardItemPlano({ item, perfil, meuId, onAcao }: Props) {
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalAtivo>(null)
  const cls = STATUS_CLS[item.status] || 'bg-slate-100 text-slate-700 border-slate-200'

  const exclusaoPendente = !!item.exclusao_solicitada_por
  const exclusaoSolicitadaPorMim = exclusaoPendente && item.exclusao_solicitada_por === meuId
  const exclusaoSolicitadaPeloOutro = exclusaoPendente && !exclusaoSolicitadaPorMim

  const podeSolicitarExclusao =
    !exclusaoPendente &&
    !['concluido', 'cancelado'].includes(item.status)

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
    <>
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

        {/* Banner de contestacao */}
        {item.status === 'contestado' && (
          <div className="rounded-xl bg-orange-50 border border-orange-200 px-3 py-2 text-[11px] text-orange-900 space-y-1">
            <p className="font-bold">Item em disputa.</p>
            <p>
              {perfil === 'profissional'
                ? 'O cliente contestou. Solicite a exclusao deste item para encerrar a cobranca, ou envie uma nova proposta corrigida em "+ Item / proposta".'
                : 'Voce contestou este item. Aguarde o profissional propor um ajuste ou solicitar a exclusao.'}
            </p>
          </div>
        )}

        {/* Banner de exclusao pendente */}
        {exclusaoSolicitadaPeloOutro && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-[11px] text-amber-900 space-y-2">
            <p className="font-bold">
              {perfil === 'cliente' ? 'O profissional' : 'O cliente'} pediu para excluir este item.
            </p>
            {item.exclusao_motivo && (
              <p className="italic">&quot;{item.exclusao_motivo}&quot;</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={processando}
                onClick={() => executar(() => responderExclusaoItem(item.id, true))}
                className="flex-1 rounded-lg bg-red-700 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
              >
                Aceitar exclusao
              </button>
              <button
                type="button"
                disabled={processando}
                onClick={() => setModal('rejeitar_exclusao')}
                className="flex-1 rounded-lg border border-amber-300 bg-white py-1.5 text-[11px] font-bold text-amber-800 disabled:opacity-50"
              >
                Manter item
              </button>
            </div>
          </div>
        )}
        {exclusaoSolicitadaPorMim && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-700 space-y-1">
            <p>Voce pediu para excluir este item. Aguardando resposta do outro lado.</p>
            {item.exclusao_motivo && (
              <p className="italic">&quot;{item.exclusao_motivo}&quot;</p>
            )}
          </div>
        )}

        {/* Acoes do PROFISSIONAL */}
        {perfil === 'profissional' && !exclusaoPendente && (
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
            {podeSolicitarExclusao && (
              <button
                type="button"
                disabled={processando}
                onClick={() => setModal('solicitar_exclusao')}
                className="rounded-xl border border-red-200 bg-white dark:bg-slate-900 px-3 py-2 text-[11px] font-bold text-red-700 disabled:opacity-50"
              >
                Solicitar exclusao
              </button>
            )}
          </div>
        )}

        {/* Acoes do CLIENTE */}
        {perfil === 'cliente' && !exclusaoPendente && (
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
                  onClick={() => setModal('recusar')}
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
                  onClick={() => setModal('contestar')}
                  className="flex-1 rounded-xl border border-orange-200 bg-white py-2 text-xs font-bold text-orange-700 disabled:opacity-50"
                >
                  Contestar
                </button>
              </>
            )}
            {podeSolicitarExclusao && item.status !== 'enviado' && (
              <button
                type="button"
                disabled={processando}
                onClick={() => setModal('solicitar_exclusao')}
                className="rounded-xl border border-red-200 bg-white dark:bg-slate-900 px-3 py-2 text-[11px] font-bold text-red-700 disabled:opacity-50"
              >
                Solicitar exclusao
              </button>
            )}
          </div>
        )}

        {erro && <p className="text-xs text-red-600 font-medium">Erro: {erro}</p>}
      </article>

      <MotivoTextoModal
        aberto={modal === 'recusar'}
        titulo="Recusar proposta"
        descricao="Explique ao profissional por que voce esta recusando."
        ctaLabel="Recusar"
        ctaCor="red"
        onFechar={() => setModal(null)}
        onConfirmar={async motivo => {
          await recusarItemPlano(item.id, motivo)
          setModal(null)
          onAcao()
        }}
      />
      <MotivoTextoModal
        aberto={modal === 'contestar'}
        titulo="Contestar execucao"
        descricao="Descreva o que aconteceu de errado. A cobranca fica retida ate resolver."
        ctaLabel="Contestar"
        ctaCor="orange"
        onFechar={() => setModal(null)}
        onConfirmar={async motivo => {
          await contestarItem(item.id, motivo)
          setModal(null)
          onAcao()
        }}
      />
      <MotivoTextoModal
        aberto={modal === 'solicitar_exclusao'}
        titulo="Solicitar exclusao do item"
        descricao="Exclusao precisa de aceite do outro lado. Itens ja pagos nao podem ser excluidos."
        ctaLabel="Solicitar exclusao"
        ctaCor="red"
        obrigatorio={false}
        onFechar={() => setModal(null)}
        onConfirmar={async motivo => {
          await solicitarExclusaoItem(item.id, motivo || null)
          setModal(null)
          onAcao()
        }}
      />
      <MotivoTextoModal
        aberto={modal === 'rejeitar_exclusao'}
        titulo="Manter item"
        descricao="Por que nao concorda em excluir? (opcional)"
        ctaLabel="Manter item"
        ctaCor="orange"
        obrigatorio={false}
        onFechar={() => setModal(null)}
        onConfirmar={async motivo => {
          await responderExclusaoItem(item.id, false, motivo || null)
          setModal(null)
          onAcao()
        }}
      />
    </>
  )
}
