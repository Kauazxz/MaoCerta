import { createClient } from '@/lib/supabase/client'
import type { EventoAtendimento } from '@/types/atendimento'

/**
 * Lista o historico do atendimento. RLS garante visibilidade
 * conforme papel (participante / admin).
 */
export async function listarHistoricoAtendimento(
  solicitacaoId: string,
  opts?: { limit?: number; offset?: number },
): Promise<EventoAtendimento[]> {
  let q = createClient()
    .from('atendimento_eventos')
    .select('*')
    .eq('solicitacao_id', solicitacaoId)
    .order('created_at', { ascending: false })
  if (opts?.limit) q = q.limit(opts.limit)
  if (opts?.offset) q = q.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1)
  const { data, error } = await q
  if (error) throw error
  return (data as EventoAtendimento[]) || []
}
