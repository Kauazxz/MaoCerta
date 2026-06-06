'use client'

import { useState } from 'react'
import ModalBase from './ModalBase'
import { criarCobrancaExtra } from '@/lib/supabase/atendimento-cobrancas'
import type { ItemPlano } from '@/types/atendimento'

type Props = {
  aberto: boolean
  solicitacaoId: string
  itens: ItemPlano[]
  onFechar: () => void
  onCriado: () => void
}

export default function CobrancaExtraModal({ aberto, solicitacaoId, itens, onFechar, onCriado }: Props) {
  const [itemId, setItemId] = useState<string>('')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    const valorNum = Number(valor.replace(',', '.'))
    if (!titulo.trim()) {
      setErro('Informe um titulo.')
      return
    }
    if (!valorNum || valorNum <= 0) {
      setErro('Informe um valor maior que zero.')
      return
    }
    setProcessando(true)
    setErro(null)
    try {
      await criarCobrancaExtra({
        solicitacao_id: solicitacaoId,
        item_id: itemId || null,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        valor: valorNum,
      })
      onCriado()
      setTitulo('')
      setDescricao('')
      setValor('')
      setItemId('')
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setProcessando(false)
    }
  }

  const itensAtivos = itens.filter(i => !['cancelado', 'recusado'].includes(i.status))

  return (
    <ModalBase aberto={aberto} titulo="Criar cobranca extra" onFechar={onFechar}>
      <form onSubmit={submeter} className="space-y-3">
        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
          O cliente precisa aceitar a cobranca antes do Pix ser gerado.
        </p>
        {itensAtivos.length > 0 && (
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Item relacionado (opcional)
            </span>
            <select
              value={itemId}
              onChange={e => setItemId(e.target.value)}
              className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm"
            >
              <option value="">Sem item especifico</option>
              {itensAtivos.map(i => (
                <option key={i.id} value={i.id}>
                  {i.titulo}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Titulo
          </span>
          <input
            type="text"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            placeholder='Ex.: "2 horas extras"'
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
            placeholder="Detalhe o motivo do extra"
            className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm resize-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Valor (R$)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={valor}
            onChange={e => setValor(e.target.value)}
            placeholder="0,00"
            required
            className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm"
          />
        </label>
        {erro && <p className="text-xs text-red-600 font-medium">{erro}</p>}
        <button
          type="submit"
          disabled={processando}
          className="w-full rounded-xl bg-violet-700 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {processando ? 'Enviando...' : 'Enviar cobranca extra'}
        </button>
      </form>
    </ModalBase>
  )
}
