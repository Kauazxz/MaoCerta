'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ClienteAtendimentoDetalheScreen from '@/screens/cliente/ClienteAtendimentoDetalheScreen'
import ProfissionalAtendimentoDetalheScreen from '@/screens/profissional/ProfissionalAtendimentoDetalheScreen'
import AtendimentoNovoScreen from '@/screens/atendimento-novo/AtendimentoNovoScreen'

type Props = {
  solicitacaoId: string
  perfil: 'cliente' | 'profissional'
}

/**
 * Decide qual motor renderizar:
 * - Se a solicitacao tem plano em planos_atendimento -> motor novo.
 * - Caso contrario -> motor antigo (compat para casos sem migracao).
 *
 * A migration 059 ja cria plano automaticamente para todo atendimento
 * com etapas, entao em producao o caminho antigo so' deve aparecer para
 * solicitacoes muito iniciais (sem etapas, sem plano).
 */
export default function SwitcherAtendimento({ solicitacaoId, perfil }: Props) {
  const [decisao, setDecisao] = useState<'novo' | 'antigo' | 'carregando'>('carregando')

  useEffect(() => {
    let cancelado = false
    async function decidir() {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('planos_atendimento')
          .select('id')
          .eq('solicitacao_id', solicitacaoId)
          .limit(1)
        if (cancelado) return
        setDecisao(data && data.length > 0 ? 'novo' : 'antigo')
      } catch {
        if (!cancelado) setDecisao('antigo')
      }
    }
    void decidir()
    return () => {
      cancelado = true
    }
  }, [solicitacaoId])

  if (decisao === 'carregando') {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 pt-10">
        <p className="text-center text-sm text-slate-500 mt-6">Carregando atendimento...</p>
      </main>
    )
  }

  if (decisao === 'novo') {
    return <AtendimentoNovoScreen solicitacaoId={solicitacaoId} perfil={perfil} />
  }

  return perfil === 'cliente' ? (
    <ClienteAtendimentoDetalheScreen id={solicitacaoId} />
  ) : (
    <ProfissionalAtendimentoDetalheScreen id={solicitacaoId} />
  )
}
