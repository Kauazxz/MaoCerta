'use client'

import { useEffect, useMemo, useState } from 'react'
import ModalBase from './ModalBase'
import { criarItemPlano, enviarPropostaItem } from '@/lib/supabase/atendimento-plano'
import type { MomentoPagamento, TipoItem, UnidadeItem } from '@/types/atendimento'

const TIPOS: { value: TipoItem; label: string }[] = [
  { value: 'vistoria', label: 'Vistoria' },
  { value: 'servico', label: 'Servico' },
  { value: 'diaria', label: 'Diaria' },
  { value: 'hora', label: 'Hora' },
  { value: 'etapa', label: 'Etapa' },
  { value: 'sinal', label: 'Sinal' },
  { value: 'final', label: 'Pagamento final' },
]

const UNIDADES: { value: UnidadeItem; label: string }[] = [
  { value: 'fixa', label: 'Fixa' },
  { value: 'hora', label: 'Hora' },
  { value: 'dia', label: 'Dia' },
  { value: 'etapa', label: 'Etapa' },
]

const MOMENTOS: { value: MomentoPagamento; label: string; descricao: string }[] = [
  { value: 'antes', label: 'Antes de iniciar', descricao: 'Cliente paga ao aceitar.' },
  { value: 'depois', label: 'Depois da execucao', descricao: 'Pix nasce apos confirmacao do cliente.' },
  { value: 'por_confirmacao', label: 'Por confirmacao', descricao: 'Mesmo de "depois".' },
  { value: 'final', label: 'No fim do servico', descricao: 'Cobrado junto com o ultimo item.' },
  { value: 'sem_cobranca', label: 'Sem cobranca', descricao: 'Item gratuito.' },
]

type Props = {
  aberto: boolean
  planoId: string
  onFechar: () => void
  onCriado: () => void
}

export default function CriarItemModal({ aberto, planoId, onFechar, onCriado }: Props) {
  const [tipo, setTipo] = useState<TipoItem>('servico')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [unidade, setUnidade] = useState<UnidadeItem>('fixa')
  const [quantidade, setQuantidade] = useState('1')
  const [valorUnit, setValorUnit] = useState('')
  const [momento, setMomento] = useState<MomentoPagamento>('depois')
  const [requerPagIniciar, setRequerPagIniciar] = useState(false)
  const [obrigatorio, setObrigatorio] = useState(true)
  const [enviarAgora, setEnviarAgora] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    // Heuristicas: tipo influencia unidade e momento default
    if (tipo === 'hora') {
      setUnidade('hora')
    } else if (tipo === 'diaria') {
      setUnidade('dia')
    } else if (tipo === 'etapa') {
      setUnidade('etapa')
    }
    if (tipo === 'vistoria' || tipo === 'sinal') {
      setMomento('antes')
      setRequerPagIniciar(true)
    } else if (tipo === 'final') {
      setMomento('final')
    }
  }, [tipo, aberto])

  const total = useMemo(() => {
    const q = Number(quantidade.replace(',', '.')) || 0
    const v = Number(valorUnit.replace(',', '.')) || 0
    return Math.round(q * v * 100) / 100
  }, [quantidade, valorUnit])

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) {
      setErro('Informe um titulo.')
      return
    }
    if (momento !== 'sem_cobranca' && total <= 0) {
      setErro('Informe valor > 0 (ou marque "sem cobranca").')
      return
    }
    setProcessando(true)
    setErro(null)
    try {
      const itemId = await criarItemPlano({
        plano_id: planoId,
        tipo,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        unidade,
        quantidade_prevista: Number(quantidade.replace(',', '.')) || null,
        valor_unitario: Number(valorUnit.replace(',', '.')) || null,
        valor_total_previsto: total > 0 ? total : null,
        momento_pagamento: momento,
        requer_pagamento_para_iniciar: requerPagIniciar,
        obrigatorio,
      })
      if (enviarAgora) {
        await enviarPropostaItem(itemId)
      }
      onCriado()
      setTitulo('')
      setDescricao('')
      setQuantidade('1')
      setValorUnit('')
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setProcessando(false)
    }
  }

  return (
    <ModalBase aberto={aberto} titulo="Adicionar item ao plano" onFechar={onFechar}>
      <form onSubmit={submeter} className="space-y-3">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Tipo
          </span>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value as TipoItem)}
            className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm"
          >
            {TIPOS.map(t => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Titulo
          </span>
          <input
            type="text"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            placeholder='Ex.: "Vistoria inicial"'
            required
            className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Descricao (opcional)
          </span>
          <textarea
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm resize-none"
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Unidade
            </span>
            <select
              value={unidade}
              onChange={e => setUnidade(e.target.value as UnidadeItem)}
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-2 text-xs"
            >
              {UNIDADES.map(u => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Quant.
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={quantidade}
              onChange={e => setQuantidade(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-2 text-xs"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Valor unit.
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={valorUnit}
              onChange={e => setValorUnit(e.target.value)}
              placeholder="0,00"
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-2 text-xs"
            />
          </label>
        </div>
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2">
          <p className="text-[10px] text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
            Total previsto
          </p>
          <p className="text-base font-bold text-emerald-900 dark:text-emerald-200">
            {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Pagamento
          </span>
          <div className="mt-1 grid grid-cols-1 gap-1.5">
            {MOMENTOS.map(m => (
              <label
                key={m.value}
                className={`flex items-start gap-2 rounded-xl border p-2 cursor-pointer text-xs ${
                  momento === m.value
                    ? 'border-violet-300 bg-violet-50 dark:bg-violet-950/30'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="momento"
                  value={m.value}
                  checked={momento === m.value}
                  onChange={() => setMomento(m.value)}
                  className="mt-0.5"
                />
                <span>
                  <strong className="text-slate-900 dark:text-slate-100">{m.label}</strong>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">{m.descricao}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={requerPagIniciar}
            onChange={e => setRequerPagIniciar(e.target.checked)}
          />
          <span>Cliente precisa pagar antes de eu iniciar</span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={obrigatorio} onChange={e => setObrigatorio(e.target.checked)} />
          <span>Item obrigatorio (bloqueia conclusao se em aberto)</span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={enviarAgora} onChange={e => setEnviarAgora(e.target.checked)} />
          <span>Enviar proposta ao cliente agora</span>
        </label>
        {erro && <p className="text-xs text-red-600 font-medium">{erro}</p>}
        <button
          type="submit"
          disabled={processando}
          className="w-full rounded-xl bg-violet-700 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {processando ? 'Salvando...' : enviarAgora ? 'Criar e enviar' : 'Salvar rascunho'}
        </button>
      </form>
    </ModalBase>
  )
}
