import { createClient } from '@/lib/supabase/client'
import type {
  AtendimentoCompleto,
  ItemPlano,
  MomentoPagamento,
  PlanoAtendimento,
  TipoItem,
  UnidadeItem,
} from '@/types/atendimento'

type RpcOk<T = Record<string, unknown>> = { ok: true } & T
type RpcErro = { ok: false; erro: string; [k: string]: unknown }
type RpcResp<T = Record<string, unknown>> = RpcOk<T> | RpcErro

function unwrap<T = Record<string, unknown>>(data: unknown): RpcResp<T> {
  return (data as RpcResp<T>) ?? { ok: false, erro: 'sem_resposta' }
}

/**
 * Busca tudo do atendimento novo numa unica chamada (RPC).
 * Devolve { plano, itens, cobrancas, eventos }.
 */
export async function buscarAtendimentoCompleto(
  solicitacaoId: string,
): Promise<AtendimentoCompleto | null> {
  const { data, error } = await createClient().rpc('fn_buscar_atendimento_completo', {
    p_solicitacao_id: solicitacaoId,
  })
  if (error) throw error
  const r = unwrap<{
    plano: PlanoAtendimento | null
    itens: ItemPlano[]
    cobrancas: AtendimentoCompleto['cobrancas']
    eventos: AtendimentoCompleto['eventos']
  }>(data)
  if (!r.ok) {
    if (r.erro === 'sem_permissao') return null
    throw new Error(r.erro)
  }
  return {
    plano: r.plano,
    itens: r.itens || [],
    cobrancas: r.cobrancas || [],
    eventos: r.eventos || [],
  }
}

export async function criarPlanoAtendimento(input: {
  solicitacao_id: string
  titulo: string
  descricao?: string | null
  modelo: PlanoAtendimento['modelo']
}): Promise<string> {
  const { data, error } = await createClient().rpc('fn_criar_plano_atendimento', {
    p_solicitacao_id: input.solicitacao_id,
    p_titulo: input.titulo,
    p_descricao: input.descricao ?? null,
    p_modelo: input.modelo,
  })
  if (error) throw error
  const r = unwrap<{ plano_id: string }>(data)
  if (!r.ok) throw new Error(r.erro)
  return r.plano_id
}

export async function criarItemPlano(input: {
  plano_id: string
  tipo: TipoItem
  titulo: string
  descricao?: string | null
  unidade: UnidadeItem
  quantidade_prevista?: number | null
  valor_unitario?: number | null
  valor_total_previsto?: number | null
  momento_pagamento: MomentoPagamento
  requer_pagamento_para_iniciar?: boolean
  obrigatorio?: boolean
  metadata?: Record<string, unknown>
}): Promise<string> {
  const { data, error } = await createClient().rpc('fn_criar_item_plano', {
    p_plano_id: input.plano_id,
    p_tipo: input.tipo,
    p_titulo: input.titulo,
    p_descricao: input.descricao ?? null,
    p_unidade: input.unidade,
    p_quantidade_prevista: input.quantidade_prevista ?? null,
    p_valor_unitario: input.valor_unitario ?? null,
    p_valor_total_previsto: input.valor_total_previsto ?? null,
    p_momento_pagamento: input.momento_pagamento,
    p_requer_pag_iniciar: input.requer_pagamento_para_iniciar ?? false,
    p_obrigatorio: input.obrigatorio ?? true,
    p_metadata: input.metadata ?? {},
  })
  if (error) throw error
  const r = unwrap<{ item_id: string }>(data)
  if (!r.ok) throw new Error(r.erro)
  return r.item_id
}

export async function enviarPropostaItem(itemId: string): Promise<void> {
  const { data, error } = await createClient().rpc('fn_enviar_proposta_item', {
    p_item_id: itemId,
  })
  if (error) throw error
  const r = unwrap(data)
  if (!r.ok) throw new Error(r.erro)
}

export async function aceitarItemPlano(itemId: string): Promise<{ cobranca_id: string | null }> {
  const { data, error } = await createClient().rpc('fn_aceitar_item_plano', {
    p_item_id: itemId,
  })
  if (error) throw error
  const r = unwrap<{ cobranca_id: string | null }>(data)
  if (!r.ok) throw new Error(r.erro)
  return { cobranca_id: r.cobranca_id ?? null }
}

export async function recusarItemPlano(itemId: string, motivo: string): Promise<void> {
  const { data, error } = await createClient().rpc('fn_recusar_item_plano', {
    p_item_id: itemId,
    p_motivo: motivo,
  })
  if (error) throw error
  const r = unwrap(data)
  if (!r.ok) throw new Error(r.erro)
}

export async function pedirAlteracaoItem(
  itemId: string,
  sugestao: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await createClient().rpc('fn_pedir_alteracao_item', {
    p_item_id: itemId,
    p_sugestao: sugestao,
  })
  if (error) throw error
  const r = unwrap(data)
  if (!r.ok) throw new Error(r.erro)
}

export async function iniciarItem(itemId: string): Promise<void> {
  const { data, error } = await createClient().rpc('fn_iniciar_item_plano', { p_item_id: itemId })
  if (error) throw error
  const r = unwrap(data)
  if (!r.ok) throw new Error(r.erro)
}

export async function marcarItemExecutado(
  itemId: string,
  quantidadeRealizada?: number | null,
  notas?: string | null,
): Promise<void> {
  const { data, error } = await createClient().rpc('fn_marcar_item_executado', {
    p_item_id: itemId,
    p_quantidade_realizada: quantidadeRealizada ?? null,
    p_notas: notas ?? null,
  })
  if (error) throw error
  const r = unwrap(data)
  if (!r.ok) throw new Error(r.erro)
}

export async function confirmarExecucaoItem(
  itemId: string,
): Promise<{ cobranca_id: string | null }> {
  const { data, error } = await createClient().rpc('fn_confirmar_execucao_item', {
    p_item_id: itemId,
  })
  if (error) throw error
  const r = unwrap<{ cobranca_id: string | null }>(data)
  if (!r.ok) throw new Error(r.erro)
  return { cobranca_id: r.cobranca_id ?? null }
}

export async function contestarItem(itemId: string, motivo: string): Promise<void> {
  const { data, error } = await createClient().rpc('fn_contestar_item', {
    p_item_id: itemId,
    p_motivo: motivo,
  })
  if (error) throw error
  const r = unwrap(data)
  if (!r.ok) throw new Error(r.erro)
}

export async function tentarConcluirAtendimento(
  solicitacaoId: string,
): Promise<{ ok: boolean; erro?: string; pronto_para_termo?: boolean }> {
  const { data, error } = await createClient().rpc('fn_tentar_concluir_atendimento', {
    p_solicitacao_id: solicitacaoId,
  })
  if (error) throw error
  return data as { ok: boolean; erro?: string; pronto_para_termo?: boolean }
}
