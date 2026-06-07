import { createClient } from '@/lib/supabase/client'
import type { CobrancaAtendimento } from '@/types/atendimento'

type RpcOk<T = Record<string, unknown>> = { ok: true } & T
type RpcErro = { ok: false; erro: string; [k: string]: unknown }
type RpcResp<T = Record<string, unknown>> = RpcOk<T> | RpcErro

function unwrap<T = Record<string, unknown>>(data: unknown): RpcResp<T> {
  return (data as RpcResp<T>) ?? { ok: false, erro: 'sem_resposta' }
}

export async function criarCobrancaExtra(input: {
  solicitacao_id: string
  item_id?: string | null
  titulo: string
  descricao?: string | null
  valor: number
}): Promise<string> {
  const { data, error } = await createClient().rpc('fn_criar_cobranca_extra', {
    p_solicitacao_id: input.solicitacao_id,
    p_item_id: input.item_id ?? null,
    p_titulo: input.titulo,
    p_descricao: input.descricao ?? null,
    p_valor: input.valor,
  })
  if (error) throw error
  const r = unwrap<{ cobranca_id: string }>(data)
  if (!r.ok) throw new Error(r.erro)
  return r.cobranca_id
}

export async function aceitarCobranca(cobrancaId: string): Promise<void> {
  const { data, error } = await createClient().rpc('fn_aceitar_cobranca_atendimento', {
    p_cobranca_id: cobrancaId,
  })
  if (error) throw error
  const r = unwrap(data)
  if (!r.ok) throw new Error(r.erro)
}

export async function recusarCobranca(cobrancaId: string, motivo: string): Promise<void> {
  const { data, error } = await createClient().rpc('fn_recusar_cobranca_atendimento', {
    p_cobranca_id: cobrancaId,
    p_motivo: motivo,
  })
  if (error) throw error
  const r = unwrap(data)
  if (!r.ok) throw new Error(r.erro)
}

/**
 * Pede o servidor para gerar Pix da cobranca. Idempotente: se a cobranca
 * ja tem Pix ativo (status pix_gerado/aguardando_pagamento), devolve o
 * mesmo Pix sem chamar o MP de novo.
 */
export async function gerarPixCobranca(cobrancaId: string): Promise<{
  pix_qr_code_base64: string | null
  pix_copia_cola: string | null
  pix_expira_em: string | null
  mp_payment_id: string | null
}> {
  const resp = await fetch('/api/pix/cobranca/criar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cobranca_id: cobrancaId }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.erro || `pix_falhou_${resp.status}`)
  }
  return {
    pix_qr_code_base64: data.pix_qr_code_base64 ?? null,
    pix_copia_cola: data.pix_copia_cola ?? null,
    pix_expira_em: data.pix_expira_em ?? null,
    mp_payment_id: data.mp_payment_id ?? null,
  }
}

/**
 * Forca o servidor a consultar o Mercado Pago e, se aprovado, confirmar
 * a cobranca via fn_marcar_cobranca_paga - mesmo que o webhook nao tenha
 * chegado. Idempotente.
 */
export async function conferirPagamentoNoMP(
  cobrancaId: string,
): Promise<{ aprovado: boolean; mensagem?: string; mp_status?: string }> {
  const resp = await fetch('/api/pix/cobranca/conferir-mp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cobranca_id: cobrancaId }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.erro || `conferir_falhou_${resp.status}`)
  }
  if (data.ja_paga) return { aprovado: true }
  return {
    aprovado: !!data.aprovado,
    mensagem: data.mensagem,
    mp_status: data.mp_status,
  }
}

export async function consultarStatusPixCobranca(cobrancaId: string): Promise<CobrancaAtendimento | null> {
  const resp = await fetch(`/api/pix/cobranca/status?id=${encodeURIComponent(cobrancaId)}`, {
    cache: 'no-store',
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || data?.ok === false) {
    if (data?.erro === 'cobranca_invalida') return null
    throw new Error(data?.erro || `status_falhou_${resp.status}`)
  }
  return data.cobranca as CobrancaAtendimento
}
