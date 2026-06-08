'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAvaliacoesReputacao, useSolicitacoesReputacao } from '@/lib/realtime/hooks'
import { buscarReputacao, type ReputacaoPainel } from '@/lib/supabase/reputacao'

export function useReputacao(userId: string | null) {
  const [dados, setDados] = useState<ReputacaoPainel | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!userId) {
      setDados(null)
      setCarregando(false)
      setErro('Faça login para ver sua reputação.')
      return
    }

    setCarregando(true)
    setErro(null)

    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
      setErro('Sessão expirada. Entre novamente.')
      setCarregando(false)
      return
    }

    const painel = await buscarReputacao(userId)
    if (!painel) {
      setErro('Perfil não encontrado.')
      setDados(null)
    } else {
      setDados(painel)
      setErro(null)
    }
    setCarregando(false)
  }, [userId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useAvaliacoesReputacao(userId, carregar)
  useSolicitacoesReputacao(carregar)

  return { dados, carregando, erro, recarregar: carregar }
}
