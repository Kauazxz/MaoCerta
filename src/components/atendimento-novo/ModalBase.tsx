'use client'

import { useEffect } from 'react'

type Props = {
  aberto: boolean
  titulo: string
  onFechar: () => void
  children: React.ReactNode
}

export default function ModalBase({ aberto, titulo, onFechar, children }: Props) {
  useEffect(() => {
    if (!aberto) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto, onFechar])

  if (!aberto) return null

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-3"
      onClick={onFechar}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{titulo}</h2>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
      </div>
    </div>
  )
}
