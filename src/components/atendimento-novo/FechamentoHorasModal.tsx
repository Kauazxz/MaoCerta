'use client'

import { useMemo, useState } from 'react'
import ModalBase from './ModalBase'
import { criarCobrancaExtra } from '@/lib/supabase/atendimento-cobrancas'
import type { ItemPlano } from '@/types/atendimento'

/**
 * Modal especifico para fechamento de servico por hora.
 * Cliente verifica horas extras e o profissional cria UMA cobranca
 * extra cobrindo as horas adicionais. A cobranca extra exige aceite
 * antes do Pix - mesmo fluxo de CobrancaExtraModal.
 */

type Props = {
  aberto: boolean
  solicitacaoId: string
  itemBase: ItemPlano | null
  onFechar: () => void
  onCriado: () => void
}

export default function FechamentoHorasModal({
  aberto,
  solicitacaoId,
  itemBase,
  onFechar,
  onCriado,
}: Props) {
  const horasPrevistas = Number(itemBase?.quantidade_prevista ?? 0)
  const valorHora = Number(itemBase?.valor_unitario ?? 0)
  const [horasTotais, setHorasTotais] = useState(String(horasPrevistas || 0))
  const [valorHoraExtra, setValorHoraExtra] = useState(String(valorHora || 0))
  const [observacao, setObservacao] = useState('')
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const horasExtras = useMemo(() => {
    const total = Number(horasTotais.replace(',', '.')) || 0
    return Math.max(0, total - horasPrevistas)
  }, [horasTotais, horasPrevistas])

  const valorExtra = useMemo(() => {
    const v = Number(valorHoraExtra.replace(',', '.')) || 0
    return Math.round(horasExtras * v * 100) / 100
  }, [horasExtras, valorHoraExtra])

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (horasExtras <= 0 || valorExtra <= 0) {
      setErro('Sem horas extras para cobrar. Use a confirmacao normal do item.')
      return
    }
    setProcessando(true)
    setErro(null)
    try {
      await criarCobrancaExtra({
        solicitacao_id: solicitacaoId,
        item_id: itemBase?.id ?? null,
        titulo: `${horasExtras}h extras`,
        descricao:
          (observacao.trim() ? observacao.trim() + ' · ' : '') +
          `${horasExtras}h x ${Number(valorHoraExtra.replace(',', '.')).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
        valor: valorExtra,
      })
      onCriado()
      setObservacao('')
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setProcessando(false)
    }
  }

  return (
    <ModalBase aberto={aberto} titulo="Fechamento por hora" onFechar={onFechar}>
      <form onSubmit={submeter} className="space-y-3">
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs">
          {itemBase ? (
            <>
              <p>
                <strong>Item base:</strong> {itemBase.titulo}
              </p>
              <p>
                Previsto: <strong>{horasPrevistas}h</strong> x{' '}
                <strong>
                  {valorHora.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </strong>
              </p>
            </>
          ) : (
            <p className="text-slate-500">Sem item base selecionado.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Horas trabalhadas no total
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={horasTotais}
              onChange={e => setHorasTotais(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-2 text-xs"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Valor por hora extra
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={valorHoraExtra}
              onChange={e => setValorHoraExtra(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-2 text-xs"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Observacao (opcional)
          </span>
          <textarea
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            rows={2}
            placeholder="Ex.: ficamos ate 19h porque o servico era maior"
            className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm resize-none"
          />
        </label>
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2">
          <p className="text-[10px] text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
            Cobranca extra a gerar
          </p>
          <p className="text-base font-bold text-emerald-900 dark:text-emerald-200">
            {horasExtras}h ·{' '}
            {valorExtra.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
          <p className="text-[10px] text-emerald-800 dark:text-emerald-300 mt-1">
            Cliente precisa aceitar antes do Pix.
          </p>
        </div>
        {erro && <p className="text-xs text-red-600 font-medium">{erro}</p>}
        <button
          type="submit"
          disabled={processando || horasExtras <= 0}
          className="w-full rounded-xl bg-violet-700 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {processando ? 'Enviando...' : 'Enviar cobranca de horas extras'}
        </button>
      </form>
    </ModalBase>
  )
}
