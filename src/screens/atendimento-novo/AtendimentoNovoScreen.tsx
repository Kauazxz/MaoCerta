'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { buscarAtendimentoCompleto } from '@/lib/supabase/atendimento-plano'
import AtendimentoShell from '@/components/atendimento-novo/AtendimentoShell'
import type { AtendimentoCompleto } from '@/types/atendimento'

type Props = {
  solicitacaoId: string
  perfil: 'cliente' | 'profissional'
}

export default function AtendimentoNovoScreen({ solicitacaoId, perfil }: Props) {
  const [atendimento, setAtendimento] = useState<AtendimentoCompleto | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [autenticado, setAutenticado] = useState(true)

  const recarregar = useCallback(async () => {
    setErro(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setAutenticado(false)
        return
      }
      const data = await buscarAtendimentoCompleto(solicitacaoId)
      if (!data) {
        setErro('Sem permissao para este atendimento.')
        return
      }
      setAtendimento(data)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [solicitacaoId])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  if (!autenticado) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 pt-10">
        <div className="max-w-md mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center">
          <p className="text-sm text-slate-700 dark:text-slate-200">Faca login para ver o atendimento.</p>
          <Link href="/entrar" className="block mt-3 text-xs font-bold text-emerald-700">
            Entrar
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24">
      <header className="bg-gradient-to-br from-violet-700 to-violet-900 text-white px-4 pt-8 pb-12 rounded-b-3xl shadow-lg">
        <div className="max-w-2xl mx-auto">
          <Link
            href={perfil === 'cliente' ? '/cliente/atendimentos' : '/profissional/atendimentos'}
            className="text-[11px] font-semibold text-white/70 hover:text-white"
          >
            ← Voltar
          </Link>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 mt-2">
            Atendimento (novo modelo)
          </p>
          <h1 className="text-xl font-bold mt-1">Plano de atendimento</h1>
          <p className="text-xs text-white/75 mt-1 leading-relaxed">
            Versao opt-in. Realtime entra na F2. Aperte &quot;Atualizar&quot; quando precisar refrescar.
          </p>
        </div>
      </header>

      <div className="-mt-6 relative z-10">
        {erro && (
          <div className="max-w-2xl mx-auto px-4">
            <div className="rounded-2xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              Erro: {erro}
            </div>
          </div>
        )}

        {carregando && !atendimento && (
          <p className="text-center text-sm text-slate-500 mt-6">Carregando atendimento...</p>
        )}

        {atendimento && (
          <AtendimentoShell atendimento={atendimento} perfil={perfil} onRefresh={recarregar} />
        )}

        <div className="max-w-2xl mx-auto px-4 mt-6">
          <button
            type="button"
            onClick={() => void recarregar()}
            className="w-full rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            Atualizar
          </button>
        </div>
      </div>
    </main>
  )
}
