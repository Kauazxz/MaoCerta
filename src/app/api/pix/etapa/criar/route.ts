import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'

type Body = { etapa_id?: string; aceitouTermos?: boolean }

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body
  const etapaId = body.etapa_id
  const aceitouTermos = body.aceitouTermos === true

  if (!etapaId) {
    return NextResponse.json({ ok: false, erro: 'etapa_id_obrigatorio' }, { status: 400 })
  }
  if (!aceitouTermos) {
    return NextResponse.json({ ok: false, erro: 'escrow_terms_nao_aceitos' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, erro: 'nao_autenticado' }, { status: 401 })
  }

  // Busca etapa + solicitacao + perfil cliente (precisa ser dono)
  const { data: etapa } = await supabase
    .from('etapas_atendimento')
    .select('id, solicitacao_id, status, valor_acordado, cobravel, tipo')
    .eq('id', etapaId)
    .maybeSingle()
  if (!etapa) {
    return NextResponse.json({ ok: false, erro: 'etapa_invalida' }, { status: 404 })
  }
  if (!etapa.cobravel) {
    return NextResponse.json({ ok: false, erro: 'etapa_nao_cobravel' }, { status: 400 })
  }

  const valor = Number(etapa.valor_acordado ?? 0)
  if (!Number.isFinite(valor) || valor < 0.5) {
    return NextResponse.json({ ok: false, erro: 'valor_invalido' }, { status: 400 })
  }

  const { data: sol } = await supabase
    .from('solicitacoes')
    .select('id, cliente_id, profissional_id, titulo')
    .eq('id', etapa.solicitacao_id)
    .maybeSingle()
  if (!sol) {
    return NextResponse.json({ ok: false, erro: 'solicitacao_invalida' }, { status: 404 })
  }
  if (sol.cliente_id !== user.id) {
    return NextResponse.json({ ok: false, erro: 'apenas_cliente' }, { status: 403 })
  }

  const { data: perfilCliente } = await supabase
    .from('profiles')
    .select('nome')
    .eq('id', user.id)
    .maybeSingle()

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN
  if (!accessToken) {
    return NextResponse.json({ ok: false, erro: 'mp_nao_configurado' }, { status: 503 })
  }

  const admin = createServiceRoleClient()
  if (!admin) {
    return NextResponse.json({ ok: false, erro: 'service_role_nao_configurado' }, { status: 503 })
  }

  // 0) Bloqueia se ja existe pagamento ativo
  const { data: existente } = await admin
    .from('pagamentos')
    .select('id, status')
    .eq('etapa_id', etapaId)
    .in('status', ['aguardando_pagamento', 'pago', 'em_escrow', 'contestado'])
    .maybeSingle()
  if (existente?.id) {
    return NextResponse.json({ ok: false, erro: 'ja_existe_pagamento' }, { status: 409 })
  }

  // 1) Busca configuracao financeira para calcular comissao
  const { data: cfg } = await admin
    .from('config_financeiro')
    .select('comissao_padrao_percentual')
    .eq('id', 1)
    .maybeSingle()
  const pct = Number(cfg?.comissao_padrao_percentual ?? 10)
  const comissao = Math.round(valor * pct) / 100
  const liquido = Math.max(0, Math.round((valor - comissao) * 100) / 100)

  // 2) Pre-cria registro em pagamentos para ter id estavel
  const { data: pag, error: errInsert } = await admin
    .from('pagamentos')
    .insert({
      solicitacao_id: sol.id,
      etapa_id: etapa.id,
      cliente_id: sol.cliente_id,
      profissional_id: sol.profissional_id,
      valor_bruto: valor,
      valor_etapa: valor,
      comissao_percentual: pct,
      valor_comissao: comissao,
      valor_liquido_prestador: liquido,
      metodo: 'pix',
      status: 'aguardando_pagamento',
      escrow_accepted_at: new Date().toISOString(),
      escrow_terms_version: 'escrow-v1-2026',
    })
    .select('id')
    .single()

  if (errInsert || !pag) {
    return NextResponse.json(
      { ok: false, erro: 'falha_pre_registro', detalhe: errInsert?.message },
      { status: 500 },
    )
  }

  // 3) Chama Mercado Pago
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  const isPublicHttps = /^https:\/\//.test(appUrl)
  const partes = (perfilCliente?.nome || 'Cliente').trim().split(/\s+/)
  const firstName = partes[0] || 'Cliente'
  const lastName = partes.slice(1).join(' ') || 'Pagador'

  const payloadMp: Record<string, unknown> = {
    transaction_amount: valor,
    payment_method_id: 'pix',
    description: `MaoCerta - ${etapa.tipo || 'etapa'} de "${sol.titulo || 'atendimento'}"`,
    external_reference: `etapa:${pag.id}`,
    payer: {
      email: user.email || `cliente-${pag.id}@maocerta.app`,
      first_name: firstName,
      last_name: lastName,
      identification: { type: 'CPF', number: '19119119100' },
    },
  }
  if (isPublicHttps) {
    payloadMp.notification_url = `${appUrl}/api/webhooks/mercado-pago`
  }

  let mpResp: Response
  try {
    mpResp = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `etapa-${pag.id}`,
      },
      body: JSON.stringify(payloadMp),
    })
  } catch (e) {
    await admin.from('pagamentos').update({ status: 'cancelado' }).eq('id', pag.id)
    return NextResponse.json(
      { ok: false, erro: 'mp_inacessivel', detalhe: (e as Error).message },
      { status: 502 },
    )
  }

  if (!mpResp.ok) {
    const detalhe = await mpResp.text().catch(() => '')
    console.error('[MP] criar pagamento etapa falhou:', mpResp.status, detalhe)
    await admin.from('pagamentos').update({ status: 'cancelado' }).eq('id', pag.id)
    return NextResponse.json(
      { ok: false, erro: 'mp_falhou', mp_status: mpResp.status, detalhe },
      { status: 502 },
    )
  }

  type MpPayment = {
    id: number | string
    point_of_interaction?: {
      transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string }
    }
    date_of_expiration?: string
  }
  const mp = (await mpResp.json()) as MpPayment
  const qr = mp.point_of_interaction?.transaction_data

  await admin
    .from('pagamentos')
    .update({
      mp_payment_id: String(mp.id),
      mp_qr_code_base64: qr?.qr_code_base64 ?? null,
      mp_pix_copia_e_cola: qr?.qr_code ?? null,
      mp_expires_at: mp.date_of_expiration ?? null,
      pix_copia_e_cola: qr?.qr_code ?? null,
    })
    .eq('id', pag.id)

  return NextResponse.json({
    ok: true,
    pagamento_id: pag.id,
    qr_code_base64: qr?.qr_code_base64,
    pix_copia_e_cola: qr?.qr_code,
    ticket_url: qr?.ticket_url,
    expira_em: mp.date_of_expiration,
    valor,
    valor_comissao: comissao,
    valor_liquido_prestador: liquido,
  })
}
