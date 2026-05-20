'use client'

import { FormEvent, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  atendimentoId: string
  clienteId: string
  nomeCliente: string
  statusAtendimento: string
}

type Modo = 'carregando' | 'form' | 'ok' | 'oculto'

export default function AvaliarClienteCard({
  atendimentoId,
  clienteId,
  nomeCliente,
  statusAtendimento,
}: Props) {
  const [modo, setModo] = useState<Modo>('carregando')
  const [nota, setNota] = useState(5)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    async function checar() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelado) setModo('oculto')
        return
      }

      if (statusAtendimento !== 'concluida') {
        if (!cancelado) setModo('oculto')
        return
      }

      const { data: existente } = await supabase
        .from('avaliacoes')
        .select('id')
        .eq('atendimento_id', atendimentoId)
        .eq('avaliador_id', user.id)
        .maybeSingle()

      if (cancelado) return
      setModo(existente ? 'ok' : 'form')
    }
    void checar()
    return () => {
      cancelado = true
    }
  }, [atendimentoId, statusAtendimento])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setErro('Sessão expirada. Faça login novamente.')
      setEnviando(false)
      return
    }
    const { error } = await supabase.from('avaliacoes').insert({
      atendimento_id: atendimentoId,
      avaliador_id: user.id,
      avaliado_id: clienteId,
      nota,
      comentario: comentario.trim() || null,
    })
    setEnviando(false)
    if (error) {
      setErro(error.message)
      return
    }
    setModo('ok')
  }

  if (modo === 'carregando' || modo === 'oculto') return null

  if (modo === 'ok') {
    return (
      <section className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-4 text-center">
        <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Cliente avaliado</p>
        <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1">
          Sua avaliação alimenta a reputação pública do cliente (RF47).
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900 shadow-md overflow-hidden">
      <div className="bg-gradient-to-r from-emerald-700 to-teal-600 px-4 py-3 text-white">
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">RF47 · Atendimento concluído</p>
        <h2 className="text-base font-bold">Avaliar {nomeCliente || 'o cliente'}</h2>
      </div>
      <form onSubmit={enviar} className="p-4 sm:p-5 space-y-4">
        <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">
          Como foi a experiência com este cliente? A nota e o comentário aparecem no perfil público dele.
        </p>

        <div>
          <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-300 mb-1">Nota geral</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNota(n)}
                className={`flex-1 h-10 rounded-lg text-sm font-bold border-2 ${
                  nota >= n
                    ? 'border-amber-400 bg-amber-100 text-amber-900'
                    : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-400 dark:text-slate-500'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-gray-600 dark:text-slate-400">Comentário público (opcional)</span>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Pagamento em dia, comunicação clara, expectativas alinhadas..."
            className="mt-1 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:bg-white dark:focus:bg-slate-900 resize-none"
          />
          <span className="block text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 text-right">
            {comentario.length}/500
          </span>
        </label>

        {erro && <p className="text-xs text-red-600 dark:text-red-400 font-medium">{erro}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-xl bg-emerald-700 py-3 text-sm font-bold text-white shadow hover:bg-emerald-800 disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : 'Enviar avaliação'}
        </button>
      </form>
    </section>
  )
}
