'use client'

import { useState } from 'react'
import ModalBase from './ModalBase'
import { avaliarAtendimento } from '@/lib/supabase/atendimento-termo'

type Props = {
  aberto: boolean
  solicitacaoId: string
  perfil: 'cliente' | 'profissional'
  onFechar: () => void
  onAvaliado: () => void
}

export default function AvaliacaoModal({ aberto, solicitacaoId, perfil, onFechar, onAvaliado }: Props) {
  const [nota, setNota] = useState(5)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    try {
      await avaliarAtendimento(solicitacaoId, nota, comentario.trim() || null)
      onAvaliado()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <ModalBase
      aberto={aberto}
      titulo={`Avaliar ${perfil === 'cliente' ? 'profissional' : 'cliente'}`}
      onFechar={onFechar}
    >
      <form onSubmit={submeter} className="space-y-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Nota
          </span>
          <div className="mt-2 flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setNota(n)}
                className={`flex-1 rounded-xl border py-3 text-lg ${
                  nota >= n
                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-white dark:bg-slate-900 text-slate-400'
                }`}
                aria-label={`${n} estrelas`}
              >
                ★
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 text-center">
            {nota === 1 && 'Muito ruim'}
            {nota === 2 && 'Ruim'}
            {nota === 3 && 'Razoavel'}
            {nota === 4 && 'Bom'}
            {nota === 5 && 'Excelente'}
          </p>
        </div>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Comentario (opcional)
          </span>
          <textarea
            value={comentario}
            onChange={e => setComentario(e.target.value)}
            rows={3}
            placeholder="Conte como foi o atendimento..."
            className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm resize-none"
          />
        </label>
        {erro && <p className="text-xs text-red-600 font-medium">{erro}</p>}
        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {enviando ? 'Enviando...' : 'Enviar avaliacao'}
        </button>
      </form>
    </ModalBase>
  )
}
