import { createClient } from './client'

type Rpc = { ok: boolean; erro?: string; disputa_id?: string }

async function callRpc(fn: string, args: Record<string, unknown>): Promise<Rpc> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, erro: error.message }
  return (data as Rpc) ?? { ok: false, erro: 'sem_resposta' }
}

export const etapasService = {
  iniciar(etapaId: string) {
    return callRpc('fn_etapa_iniciar', { p_etapa_id: etapaId })
  },
  finalizarPrestador(etapaId: string, notas?: string) {
    return callRpc('fn_etapa_finalizar_prestador', { p_etapa_id: etapaId, p_notas: notas ?? null })
  },
  aceitarConclusao(etapaId: string) {
    return callRpc('fn_etapa_aceitar_conclusao', { p_etapa_id: etapaId })
  },
  contestar(etapaId: string, motivo: string) {
    return callRpc('fn_etapa_contestar', { p_etapa_id: etapaId, p_motivo: motivo })
  },
}
