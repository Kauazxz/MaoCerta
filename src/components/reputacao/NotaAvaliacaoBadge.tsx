'use client'

type Props = {
  notaMedia: number | null
  totalAvaliacoes?: number
  carregando?: boolean
  compacto?: boolean
}

export default function NotaAvaliacaoBadge({
  notaMedia,
  totalAvaliacoes = 0,
  carregando = false,
  compacto = false,
}: Props) {
  if (carregando) {
    return <p className="font-bold text-amber-500 text-sm">…</p>
  }

  if (notaMedia == null || totalAvaliacoes === 0) {
    return (
      <p className="font-bold text-amber-500">
        — <span className="text-sm">⭐</span>
      </p>
    )
  }

  if (compacto) {
    return (
      <p className="font-bold text-amber-500">
        {notaMedia.toFixed(1)} <span className="text-sm">⭐</span>
      </p>
    )
  }

  return (
    <div className="text-right">
      <p className="font-bold text-amber-500">
        {notaMedia.toFixed(1)} <span className="text-sm">⭐</span>
      </p>
      <p className="text-[10px] text-gray-400 dark:text-slate-500">
        {totalAvaliacoes} avaliação{totalAvaliacoes === 1 ? '' : 'ões'}
      </p>
    </div>
  )
}
