'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatarDataPt } from '@/lib/formatar-data'

type RiscoLinha = {
  id: number
  solicitacao_id: string
  titulo: string | null
  descricao: string | null
  payload: Record<string, unknown>
  created_at: string
  ator_id: string | null
}

export default function AdminAtendimentosRiscoScreen() {
  const [linhas, setLinhas] = useState<RiscoLinha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    setErro(null)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('fn_admin_listar_riscos_chat', { p_limit: 100 })
      if (error) throw error
      setLinhas((data as RiscoLinha[]) || [])
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 px-4 pt-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <header>
          <Link href="/admin/inicio" className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline">
            ← Inicio
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
            Sinais de risco no chat
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Mensagens que bateram em padroes como &quot;pix por fora&quot;, &quot;whats direto&quot;, etc.
          </p>
        </header>

        {carregando && <p className="text-sm text-slate-500">Carregando...</p>}
        {erro && <p className="text-sm text-red-700">{erro}</p>}

        {!carregando && linhas.length === 0 && (
          <p className="text-sm text-slate-500 text-center mt-8">
            Nenhum sinal de risco registrado.
          </p>
        )}

        <ul className="space-y-2">
          {linhas.map(r => {
            const rotulo = (r.payload?.rotulo as string) || 'risco'
            return (
              <li
                key={r.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-red-200 p-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-700">
                    {rotulo}
                  </span>
                  <time className="text-[10px] text-slate-400">{formatarDataPt(r.created_at)}</time>
                </div>
                {r.descricao && (
                  <p className="text-[11px] text-slate-700 dark:text-slate-200 italic">
                    &quot;{r.descricao}&quot;
                  </p>
                )}
                <Link
                  href={`/admin/atendimentos/${r.solicitacao_id}`}
                  className="text-[11px] font-bold text-violet-700 hover:underline"
                >
                  Abrir atendimento →
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </main>
  )
}
