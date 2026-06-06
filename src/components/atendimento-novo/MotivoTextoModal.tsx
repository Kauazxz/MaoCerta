'use client'

import { useEffect, useState } from 'react'
import ModalBase from './ModalBase'

type Props = {
  aberto: boolean
  titulo: string
  descricao?: string
  placeholder?: string
  ctaLabel?: string
  ctaCor?: 'emerald' | 'red' | 'orange' | 'violet'
  obrigatorio?: boolean
  onFechar: () => void
  onConfirmar: (motivo: string) => Promise<void> | void
}

const CORES: Record<NonNullable<Props['ctaCor']>, string> = {
  emerald: 'bg-emerald-700 hover:bg-emerald-800',
  red: 'bg-red-700 hover:bg-red-800',
  orange: 'bg-orange-700 hover:bg-orange-800',
  violet: 'bg-violet-700 hover:bg-violet-800',
}

export default function MotivoTextoModal({
  aberto,
  titulo,
  descricao,
  placeholder = 'Descreva o motivo...',
  ctaLabel = 'Confirmar',
  ctaCor = 'violet',
  obrigatorio = true,
  onFechar,
  onConfirmar,
}: Props) {
  const [motivo, setMotivo] = useState('')
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (aberto) {
      setMotivo('')
      setErro(null)
      setProcessando(false)
    }
  }, [aberto])

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    const txt = motivo.trim()
    if (obrigatorio && !txt) {
      setErro('Descreva o motivo para continuar.')
      return
    }
    setProcessando(true)
    setErro(null)
    try {
      await onConfirmar(txt)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setProcessando(false)
    }
  }

  return (
    <ModalBase aberto={aberto} titulo={titulo} onFechar={onFechar}>
      <form onSubmit={submeter} className="space-y-3">
        {descricao && (
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            {descricao}
          </p>
        )}
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Motivo{obrigatorio && ' *'}
          </span>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={4}
            placeholder={placeholder}
            autoFocus
            className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm focus:outline-none focus:border-violet-600 resize-none"
          />
        </label>
        {erro && <p className="text-xs text-red-600 font-medium">{erro}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onFechar}
            disabled={processando}
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={processando}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 ${CORES[ctaCor]}`}
          >
            {processando ? 'Enviando...' : ctaLabel}
          </button>
        </div>
      </form>
    </ModalBase>
  )
}
