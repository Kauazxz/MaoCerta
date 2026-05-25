'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

type Props = {
  titulo: string
  subtitulo?: string
  /** Texto/destino do link de voltar (default: ‹ Painel → /admin/inicio) */
  voltarHref?: string
  voltarLabel?: string
  /** Acoes extras a' direita do header (botoes, badges, etc.) */
  acoes?: ReactNode
}

export default function CabecalhoAdmin({
  titulo,
  subtitulo,
  voltarHref = '/admin/inicio',
  voltarLabel = '‹ Painel',
  acoes,
}: Props) {
  return (
    <header className="min-h-[180px] flex items-end bg-gradient-to-br from-amber-700 via-orange-600 to-red-600 text-white px-4 pt-8 pb-10 rounded-b-[2rem] shadow-lg">
      <div className="max-w-6xl mx-auto w-full flex items-end justify-between gap-3">
        <div className="space-y-2 min-w-0">
          {voltarHref && (
            <Link href={voltarHref} className="text-[11px] text-white/80 hover:text-white">
              {voltarLabel}
            </Link>
          )}
          <h1 className="text-2xl font-bold">{titulo}</h1>
          {subtitulo && <p className="text-sm text-white/85 max-w-2xl">{subtitulo}</p>}
        </div>
        {acoes && <div className="shrink-0 flex items-center gap-2">{acoes}</div>}
      </div>
    </header>
  )
}
