import { createClient } from '@/lib/supabase/client'
import type { AvaliacaoAtendimento, TermoFinal } from '@/types/atendimento'

type RpcOk<T = Record<string, unknown>> = { ok: true } & T
type RpcErro = { ok: false; erro: string; [k: string]: unknown }
type RpcResp<T = Record<string, unknown>> = RpcOk<T> | RpcErro
function unwrap<T = Record<string, unknown>>(data: unknown): RpcResp<T> {
  return (data as RpcResp<T>) ?? { ok: false, erro: 'sem_resposta' }
}

export async function buscarTermoFinal(solicitacaoId: string): Promise<TermoFinal | null> {
  const { data, error } = await createClient()
    .from('termos_conclusao_atendimento')
    .select('*')
    .eq('solicitacao_id', solicitacaoId)
    .maybeSingle()
  if (error) throw error
  return (data as TermoFinal | null) ?? null
}

export async function gerarTermoFinal(solicitacaoId: string): Promise<{ termo_id: string; hash: string }> {
  const { data, error } = await createClient().rpc('fn_gerar_termo_final', {
    p_solicitacao_id: solicitacaoId,
  })
  if (error) throw error
  const r = unwrap<{ termo_id: string; hash: string }>(data)
  if (!r.ok) throw new Error(r.erro)
  return { termo_id: r.termo_id, hash: r.hash }
}

export async function assinarTermoFinal(termoId: string): Promise<string> {
  const { data, error } = await createClient().rpc('fn_assinar_termo_final', {
    p_termo_id: termoId,
  })
  if (error) throw error
  const r = unwrap<{ status: string }>(data)
  if (!r.ok) throw new Error(r.erro)
  return r.status
}

export async function adminDispensarTermo(termoId: string, motivo: string): Promise<void> {
  const { data, error } = await createClient().rpc('fn_admin_dispensar_termo', {
    p_termo_id: termoId,
    p_motivo: motivo,
  })
  if (error) throw error
  const r = unwrap(data)
  if (!r.ok) throw new Error(r.erro)
}

export async function avaliarAtendimento(
  solicitacaoId: string,
  nota: number,
  comentario?: string | null,
): Promise<string> {
  const { data, error } = await createClient().rpc('fn_avaliar_atendimento_novo', {
    p_solicitacao_id: solicitacaoId,
    p_nota: nota,
    p_comentario: comentario ?? null,
  })
  if (error) throw error
  const r = unwrap<{ avaliacao_id: string }>(data)
  if (!r.ok) throw new Error(r.erro)
  return r.avaliacao_id
}

export async function buscarMinhaAvaliacao(
  solicitacaoId: string,
): Promise<AvaliacaoAtendimento | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('avaliacoes')
    .select('*')
    .eq('atendimento_id', solicitacaoId)
    .eq('avaliador_id', user.id)
    .maybeSingle()
  return (data as AvaliacaoAtendimento | null) ?? null
}
