import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'

type Body = { cobranca_id?: string }

type CobrancaRow = {
  id: string
  solicitacao_id: string
  item_id: string | null
  plano_id: string | null
  tipo: string
  titulo: string
  descricao: string | null
  valor: number
  status: string
  mp_payment_id: string | null
  mp_external_reference: string | null
  pix_qr_code: string | null
  pix_qr_code_base64: string | null
  pix_copia_cola: string | null
  pix_expira_em: string | null
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body
  const id = body.cobranca_id
  if (!id) {
    return NextResponse.json({ ok: false, erro: 'cobranca_id_obrigatorio' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, erro: 'nao_autenticado' }, { status: 401 })
  }

  const admin = createServiceRoleClient()
  if (!admin) {
    return NextResponse.json({ ok: false, erro: 'service_role_nao_configurado' }, { status: 503 })
  }

  // Busca cobranca + valida que caller e' cliente da solicitacao
  const { data: cob } = await admin
    .from('cobrancas_atendimento')
    .select(
      'id, solicitacao_id, item_id, plano_id, tipo, titulo, descricao, valor, status, mp_payment_id, mp_external_reference, pix_qr_code, pix_qr_code_base64, pix_copia_cola, pix_expira_em',
    )
    .eq('id', id)
    .maybeSingle()
  if (!cob) {
    return NextResponse.json({ ok: false, erro: 'cobranca_invalida' }, { status: 404 })
  }
  const cobranca = cob as CobrancaRow

  const { data: sol } = await admin
    .from('solicitacoes')
    .select('id, cliente_id, titulo')
    .eq('id', cobranca.solicitacao_id)
    .maybeSingle()
  if (!sol) {
    return NextResponse.json({ ok: false, erro: 'solicitacao_invalida' }, { status: 404 })
  }
  if (sol.cliente_id !== user.id) {
    return NextResponse.json({ ok: false, erro: 'apenas_cliente' }, { status: 403 })
  }

  // Pre-checagem de status
  if (cobranca.status === 'paga' || cobranca.status === 'retida' || cobranca.status === 'liberada') {
    return NextResponse.json({ ok: false, erro: 'cobranca_ja_paga' }, { status: 409 })
  }
  if (cobranca.status === 'cancelada' || cobranca.status === 'expirada') {
    return NextResponse.json({ ok: false, erro: 'cobranca_inativa' }, { status: 409 })
  }
  if (cobranca.status === 'aguardando_aceite') {
    return NextResponse.json({ ok: false, erro: 'aceite_pendente' }, { status: 409 })
  }

  // Idempotencia: se ja temos Pix valido, devolve sem chamar o MP de novo.
  const expiroumsg = cobranca.pix_expira_em && new Date(cobranca.pix_expira_em).getTime() < Date.now()
  if (
    (cobranca.status === 'pix_gerado' || cobranca.status === 'aguardando_pagamento') &&
    cobranca.mp_payment_id &&
    !expiroumsg
  ) {
    return NextResponse.json({
      ok: true,
      reutilizado: true,
      cobranca_id: cobranca.id,
      mp_payment_id: cobranca.mp_payment_id,
      pix_qr_code_base64: cobranca.pix_qr_code_base64,
      pix_copia_cola: cobranca.pix_copia_cola,
      pix_expira_em: cobranca.pix_expira_em,
    })
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN
  if (!accessToken) {
    return NextResponse.json({ ok: false, erro: 'mp_nao_configurado' }, { status: 503 })
  }

  // Garante external_reference unico antes de chamar MP (evita duplicidade
  // em race condition: dois clicks simultaneos).
  const externalRef = `cobranca:${cobranca.id}`
  if (cobranca.mp_external_reference !== externalRef) {
    const { error: errSet } = await admin
      .from('cobrancas_atendimento')
      .update({ mp_external_reference: externalRef, updated_at: new Date().toISOString() })
      .eq('id', cobranca.id)
      .is('mp_external_reference', null)
    if (errSet) {
      return NextResponse.json(
        { ok: false, erro: 'falha_external_reference', detalhe: errSet.message },
        { status: 500 },
      )
    }
  }

  // Busca perfil do pagador
  const { data: perfil } = await admin
    .from('profiles')
    .select('nome, email')
    .eq('id', user.id)
    .maybeSingle()
  const nomePartes = (perfil?.nome || 'Cliente').trim().split(/\s+/)
  const firstName = nomePartes[0] || 'Cliente'
  const lastName = nomePartes.slice(1).join(' ') || 'Pagador'

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  const isPublicHttps = /^https:\/\//.test(appUrl)

  const payload: Record<string, unknown> = {
    transaction_amount: Number(cobranca.valor),
    payment_method_id: 'pix',
    description: `MaoCerta - ${cobranca.tipo} de "${sol.titulo || 'atendimento'}"`,
    external_reference: externalRef,
    payer: {
      email: user.email || perfil?.email || `cliente-${cobranca.id}@maocerta.app`,
      first_name: firstName,
      last_name: lastName,
      identification: { type: 'CPF', number: '19119119100' },
    },
  }
  if (isPublicHttps) {
    payload.notification_url = `${appUrl}/api/webhooks/mercado-pago`
  }

  let mpResp: Response
  try {
    mpResp = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        // Idempotency key estavel garante que clicks duplicados na mesma
        // cobranca nao criem dois pagamentos no MP.
        'X-Idempotency-Key': `cobranca-${cobranca.id}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: 'mp_inacessivel', detalhe: (e as Error).message },
      { status: 502 },
    )
  }

  if (!mpResp.ok) {
    const detalhe = await mpResp.text().catch(() => '')
    console.error('[MP] criar pagamento cobranca falhou:', mpResp.status, detalhe)
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

  const { error: errUpd } = await admin
    .from('cobrancas_atendimento')
    .update({
      status: 'pix_gerado',
      mp_payment_id: String(mp.id),
      pix_qr_code: qr?.qr_code ?? null,
      pix_qr_code_base64: qr?.qr_code_base64 ?? null,
      pix_copia_cola: qr?.qr_code ?? null,
      pix_expira_em: mp.date_of_expiration ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cobranca.id)
  if (errUpd) {
    console.error('[cobranca] falha update pos-MP:', errUpd)
  }

  // Registra evento pix_gerado no historico
  await admin.rpc('fn_criar_evento_atendimento', {
    p_solicitacao_id: cobranca.solicitacao_id,
    p_tipo_evento: 'pix_gerado',
    p_titulo: `Pix gerado para ${cobranca.titulo}`,
    p_descricao: null,
    p_ator_tipo: 'sistema',
    p_ator_id: user.id,
    p_plano_id: cobranca.plano_id,
    p_item_id: cobranca.item_id,
    p_cobranca_id: cobranca.id,
    p_pagamento_id: null,
    p_payload: { mp_payment_id: String(mp.id), valor: cobranca.valor },
    p_visibilidade: 'participantes',
  })

  return NextResponse.json({
    ok: true,
    cobranca_id: cobranca.id,
    mp_payment_id: String(mp.id),
    pix_qr_code_base64: qr?.qr_code_base64,
    pix_copia_cola: qr?.qr_code,
    pix_expira_em: mp.date_of_expiration,
    valor: cobranca.valor,
  })
}
