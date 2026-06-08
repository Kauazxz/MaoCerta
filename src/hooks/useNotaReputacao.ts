'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAvaliacoesReputacao } from '@/lib/realtime/hooks'
import { buscarNotaResumo, type NotaResumo } from '@/lib/supabase/reputacao'

export function useNotaReputacao(userId: string | null) {
  const [resumo, setResumo] = useState<NotaResumo>({ notaMedia: null, totalAvaliacoes: 0 })
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    if (!userId) {
      setResumo({ notaMedia: null, totalAvaliacoes: 0 })
      setCarregando(false)
      return
    }
    setCarregando(true)
    const dados = await buscarNotaResumo(userId)
    setResumo(dados)
    setCarregando(false)
  }, [userId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useAvaliacoesReputacao(userId, carregar)

  return { ...resumo, carregando, recarregar: carregar }
}
