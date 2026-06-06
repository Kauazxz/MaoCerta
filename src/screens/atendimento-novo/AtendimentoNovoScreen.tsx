'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAtendimentoRealtime } from '@/lib/supabase/atendimento-realtime'
import AtendimentoShell from '@/components/atendimento-novo/AtendimentoShell'

type Props = {
  solicitacaoId: string
  perfil: 'cliente' | 'profissional'
}

export default function AtendimentoNovoScreen({ solicitacaoId, perfil }: Props) {
  const [meuId, setMeuId] = useState<string | null>(null)
  const [autenticado, setAutenticado] = useState<boolean | null>(null)
  const { atendimento, status, erro, refresh, conexao } = useAtendimentoRealtime(solicitacaoId)

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelado) return
      if (!user) {
        setAutenticado(false)
        return
      }
      setMeuId(user.id)
      setAutenticado(true)
    }
    void carregar()
    return () => {
      cancelado = true
    }
  }, [])

  if (autenticado === false) {
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
            Realtime ativo. Tudo aparece em tempo real - sem precisar atualizar.
          </p>
        </div>
      </header>

      <div className="-mt-6 relative z-10">
        {erro && (
          <div className="max-w-2xl mx-auto px-4">
            <div className="rounded-2xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {erro === 'sem_permissao'
                ? 'Voce nao tem acesso a este atendimento.'
                : `Erro: ${erro}`}
            </div>
          </div>
        )}

        {status === 'carregando' && !atendimento && (
          <p className="text-center text-sm text-slate-500 mt-6">Carregando atendimento...</p>
        )}

        {atendimento && meuId && (
          <AtendimentoShell
            atendimento={atendimento}
            perfil={perfil}
            meuId={meuId}
            solicitacaoId={solicitacaoId}
            conexao={conexao}
            onRefresh={() => void refresh()}
          />
        )}
      </div>
    </main>
  )
}
