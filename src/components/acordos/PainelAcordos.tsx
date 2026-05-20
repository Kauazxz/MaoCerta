'use client'

import { useEffect, useMemo, useState } from 'react'
import { acordosService } from '@/lib/supabase/acordos'
import type { AcordoComConfirmacoes } from '@/types/acordos'
import CardAcordoSugerido from './CardAcordoSugerido'

type Props = {
  solicitacaoId: string
  meuId: string
  meuPapel: 'cliente' | 'profissional'
  /** Recarrega quando este valor muda (ex: nova mensagem detectada gerou sugestão) */
  recarregarTrigger?: number
  /** Mostrar histórico (convertidos / recusados / expirados) em vez de ativos */
  modo?: 'ativos' | 'historico'
}

export default function PainelAcordos({ solicitacaoId, meuId, meuPapel, recarregarTrigger = 0, modo = 'ativos' }: Props) {
  const [acordos, setAcordos] = useState<AcordoComConfirmacoes[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancel = false
    async function carregar() {
      setCarregando(true)
      setErro(null)
      try {
        const lista = await acordosService.listar(solicitacaoId)
        if (!cancel) setAcordos(lista)
      } catch (e) {
        if (!cancel) setErro((e as Error).message || 'Falha ao carregar acordos.')
      } finally {
        if (!cancel) setCarregando(false)
      }
    }
    void carregar()
    return () => {
      cancel = true
    }
  }, [solicitacaoId, recarregarTrigger, tick])

  const visiveis = useMemo(() => {
    if (modo === 'historico') {
      return acordos.filter((a) =>
        a.status === 'convertido' || a.status === 'recusado' || a.status === 'expirado',
      )
    }
    return acordos.filter((a) =>
      a.status === 'aguardando' || a.status === 'aceito' || a.status === 'editado',
    )
  }, [acordos, modo])

  if (carregando) {
    return (
      <div className="p-6 flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-slate-400">
        <span className="inline-block w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        Carregando acordos...
      </div>
    )
  }

  if (erro) {
    return (
      <p className="m-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-2xl p-3">
        {erro}
      </p>
    )
  }

  if (visiveis.length === 0) {
    return (
      <div className="p-8 text-center space-y-1">
        <p className="text-3xl">{modo === 'historico' ? '📜' : '💬'}</p>
        <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">
          {modo === 'historico' ? 'Nada no histórico ainda' : 'Nenhum acordo sugerido ainda'}
        </p>
        <p className="text-xs text-gray-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
          {modo === 'historico'
            ? 'Acordos aceitos, recusados ou expirados aparecem aqui.'
            : 'Conforme você conversa no chat, o assistente sugere acordos para acelerar o atendimento.'}
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {visiveis.map((a) => (
        <CardAcordoSugerido
          key={a.id}
          acordo={a}
          meuId={meuId}
          meuPapel={meuPapel}
          onAlterado={() => setTick((n) => n + 1)}
        />
      ))}
    </div>
  )
}
