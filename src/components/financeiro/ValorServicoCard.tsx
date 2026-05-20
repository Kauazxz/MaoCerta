'use client'

import { FormEvent, useEffect, useState } from 'react'
import { financeiroService } from '@/lib/supabase/financeiro'
import { formatarValorBrl } from '@/lib/formatar-data'

type Props = {
  solicitacaoId: string
  valorAtual: number | null | undefined
  status: string
  podeEditar: boolean
  onSalvo: () => void
  /** Cliente: roxo | Profissional: esmeralda */
  tema: 'cliente' | 'profissional'
}

export default function ValorServicoCard({
  solicitacaoId,
  valorAtual,
  status,
  podeEditar,
  onSalvo,
  tema,
}: Props) {
  const shell =
    tema === 'cliente'
      ? 'from-violet-600 via-indigo-600 to-blue-600 border-violet-100'
      : 'from-emerald-700 via-teal-600 to-cyan-600 border-emerald-100'

  const btn =
    tema === 'cliente'
      ? 'bg-violet-700 hover:bg-violet-800 focus-visible:ring-violet-500'
      : 'bg-emerald-700 hover:bg-emerald-800 focus-visible:ring-emerald-500'

  const [valor, setValor] = useState(valorAtual != null ? String(valorAtual) : '')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; t: string } | null>(null)

  useEffect(() => {
    setValor(valorAtual != null ? String(valorAtual) : '')
  }, [valorAtual])

  const ativo = status === 'aceita' || status === 'em_andamento'

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!podeEditar || !ativo) return
    const v = Number(valor.replace(',', '.'))
    if (!valor.trim() || Number.isNaN(v) || v <= 0) {
      setMsg({ tipo: 'erro', t: 'Informe um valor maior que zero.' })
      return
    }
    setSalvando(true)
    setMsg(null)
    try {
      const r = await financeiroService.definirValorTotalServico(solicitacaoId, v)
      if (!r.ok) {
        setMsg({ tipo: 'erro', t: 'Não foi possível salvar o valor.' })
        return
      }
      setMsg({ tipo: 'ok', t: 'Valor de referência salvo. Cada etapa cobrável é cobrada conforme o que foi acordado no chat.' })
      onSalvo()
    } catch (err) {
      console.error(err)
      setMsg({ tipo: 'erro', t: 'Erro ao salvar. Verifique sua conexão.' })
    } finally {
      setSalvando(false)
    }
  }

  const num = valorAtual != null ? Number(valorAtual) : null

  return (
    <section
      className={`rounded-2xl border shadow-md overflow-hidden bg-gradient-to-br ${shell} p-[1px]`}
    >
      <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">Financeiro</p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100 mt-0.5">Valor de referência do serviço</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-md leading-relaxed">
              Estimativa global do atendimento. <strong>Cada etapa é cobrada conforme o que foi acordado no chat</strong> —
              não há rateio automático. Cobranças saem apenas de etapas marcadas como cobráveis.
            </p>
          </div>
          {num != null && num > 0 && (
            <div className="shrink-0 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 px-4 py-3 text-right min-w-[140px]">
              <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase font-semibold">Referência</p>
              <p className="text-xl font-extrabold text-gray-900 dark:text-slate-100">{formatarValorBrl(num)}</p>
            </div>
          )}
        </div>

        {podeEditar && ativo ? (
          <form onSubmit={salvar} className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600 dark:text-slate-400">Valor (R$)</span>
              <input
                type="text"
                inputMode="decimal"
                value={valor}
                onChange={e => setValor(e.target.value)}
                placeholder="Ex.: 900,00"
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 px-3 py-3 text-base font-semibold text-gray-900 dark:text-slate-100 outline-none focus:border-gray-400 focus:bg-white dark:bg-slate-900 transition"
              />
            </label>
            <p className="text-[11px] text-gray-500 dark:text-slate-400">
              Só você (prestador) define o valor. O cliente vê o total e paga cada etapa.
            </p>
            <button
              type="submit"
              disabled={salvando}
              className={`w-full rounded-xl py-3 text-sm font-bold text-white shadow-md transition focus-visible:outline focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${btn}`}
            >
              {salvando ? 'Salvando…' : 'Salvar valor de referência'}
            </button>
          </form>
        ) : (
          <p className="text-xs text-gray-500 dark:text-slate-400">
            {!ativo
              ? 'Valor bloqueado para edição neste status do atendimento.'
              : tema === 'cliente'
                ? 'Apenas o prestador define o valor do serviço. Você vê o total acordado e paga cada etapa.'
                : 'Apenas você (prestador) altera este valor.'}
          </p>
        )}

        {msg && (
          <p
            className={`text-xs font-medium rounded-lg px-3 py-2 ${
              msg.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
            }`}
          >
            {msg.t}
          </p>
        )}
      </div>
    </section>
  )
}
