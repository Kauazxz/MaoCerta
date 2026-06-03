import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/admin'

/**
 * Webhook Mercado Pago.
 *
 * Validacao: HMAC-SHA256 do payload "id:<paymentId>;request-id:<reqId>;ts:<ts>;"
 * com a "Assinatura secreta" exibida no painel do MP (Webhooks → Configurar notificacoes).
 *
 * Roteamento:
 * - external_reference "plano:<id>" → atualiza pagamentos_plano + plano do usuario.
 * - external_reference "etapa:<id>" → libera comissao plataforma + escrow prestador.
 * - Fluxo antigo (etapa, Pix sandbox interno) → chama fn_financeiro_webhook_confirmar_pix.
 */

function validarAssinatura(req: Request, paymentId: string): boolean {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET
  if (!secret) return true // sem secret configurado: nao bloqueia (modo dev)

  const xSignature = req.headers.get('x-signature') || ''
  const xRequestId = req.headers.get('x-request-id') || ''
  if (!xSignature || !xRequestId) return false

  // Header x-signature vem como "ts=1700000000,v1=hashhex..."
  const partes: Record<string, string> = {}
  for (const p of xSignature.split(',')) {
    const [k, v] = p.split('=').map(s => s.trim())
    if (k && v) partes[k] = v
  }
  const ts = partes.ts
  const v1 = partes.v1
  if (!ts || !v1) return false

  const manifest = `id:${paymentId};request-id:${xRequestId};ts:${ts};`
  const calculado = createHmac('sha256', secret).update(manifest).digest('hex')

  try {
    const a = Buffer.from(calculado, 'hex')
    const b = Buffer.from(v1, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const data = body?.data as Record<string, unknown> | undefined

  const paymentId =
    (typeof data?.id === 'string' && data.id) ||
    (typeof data?.id === 'number' && String(data.id)) ||
    url.searchParams.get('data.id') ||
    url.searchParams.get('id') ||
    (typeof body?.txid === 'string' && body.txid) ||
    (typeof body?.pix_txid === 'string' && body.pix_txid) ||
    ''

  if (!paymentId) {
    return NextResponse.json({ ok: false, erro: 'payment_id_ausente' }, { status: 400 })
  }

  if (!validarAssinatura(req, paymentId)) {
    return NextResponse.json({ ok: false, erro: 'assinatura_invalida' }, { status: 401 })
  }

  const admin = createServiceRoleClient()
  if (!admin) {
    return NextResponse.json({ ok: false, erro: 'service_role_nao_configurado' }, { status: 503 })
  }

  // Busca detalhes do pagamento no MP (precisamos do external_reference pra rotear)
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN
  let externalReference = ''
  let mpStatus = ''
  if (accessToken) {
    try {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (r.ok) {
        const mp = (await r.json()) as { external_reference?: string; status?: string }
        externalReference = mp.external_reference || ''
        mpStatus = mp.status || ''
      }
    } catch {
      // segue sem dados detalhados
    }
  }

  // Roteamento: pagamento de PLANO vs ETAPA
  if (externalReference.startsWith('plano:')) {
    if (mpStatus !== 'approved') {
      return NextResponse.json({ ok: true, ignorado: true, mp_status: mpStatus })
    }
    const { data: rpcData, error } = await admin.rpc('fn_pagamento_plano_confirmar', {
      p_mp_payment_id: String(paymentId),
    })
    if (error) {
      return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
    }
    return NextResponse.json(rpcData)
  }

  // ETAPA com Mercado Pago real
  if (externalReference.startsWith('etapa:')) {
    if (mpStatus !== 'approved') {
      return NextResponse.json({ ok: true, ignorado: true, mp_status: mpStatus })
    }
    const pagamentoId = externalReference.slice('etapa:'.length).trim()
    if (!pagamentoId) {
      return NextResponse.json({ ok: false, erro: 'pagamento_id_invalido' }, { status: 400 })
    }
    const { data: rpcData, error } = await admin.rpc('fn_pagamento_etapa_confirmado', {
      p_pagamento_id: pagamentoId,
    })
    if (error) {
      return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
    }
    return NextResponse.json(rpcData)
  }

  // Fluxo antigo (etapa de atendimento — Pix sandbox interno)
  const idem =
    req.headers.get('x-idempotency-key') ||
    req.headers.get('x-request-id') ||
    (typeof body?.id === 'string' ? body.id : null) ||
    null

  const { data: rpcData, error } = await admin.rpc('fn_financeiro_webhook_confirmar_pix', {
    p_pix_txid: paymentId,
    p_webhook_ref: JSON.stringify(body).slice(0, 900),
    p_idempotency_key: idem,
  })

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  }

  return NextResponse.json(rpcData)
}
