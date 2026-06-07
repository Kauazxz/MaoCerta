'use client'

import { useEffect } from 'react'

type Props = {
  aberto: boolean
  titulo: string
  onFechar: () => void
  children: React.ReactNode
}

export default function ModalBase({ aberto, titulo, onFechar, children }: Props) {
  // ESC fecha o modal
  useEffect(() => {
    if (!aberto) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto, onFechar])

  // Trava o scroll do body enquanto modal aberto
  useEffect(() => {
    if (!aberto) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [aberto])

  if (!aberto) return null

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm"
      onClick={onFechar}
    >
      <div
        className="
          bg-white dark:bg-slate-900 shadow-xl
          w-full max-w-md
          flex flex-col
          rounded-t-2xl sm:rounded-2xl
          h-[92dvh] sm:h-auto sm:max-h-[88dvh]
          sm:m-3
        "
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3 shrink-0">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{titulo}</h2>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-1 -mr-1"
            aria-label="Fechar"
          >
            ✕
          </button>
        </header>
        <div
          className="
            flex-1 overflow-y-auto overscroll-contain
            p-4 space-y-3
            pb-[calc(env(safe-area-inset-bottom)+1rem)]
          "
        >
          {children}
        </div>
      </div>
    </div>
  )
}
