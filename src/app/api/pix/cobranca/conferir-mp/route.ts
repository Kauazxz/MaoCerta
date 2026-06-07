import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'

/**
 * Consulta o status real do pagamento no Mercado Pago e, se aprovado,
 * forca a confirmacao da cobranca (mesmo que o webhook nao tenha chegado).
 *
 * Usado pelo CardCobrancaAtendimento via botao "Ja paguei - verificar".
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { cobranca_id?: string }
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

  const { data: cob } = await admin
    .from('cobrancas_atendimento')
    .select('id, solicitacao_id, mp_payment_id, status, valor')
    .eq('id', id)
    .maybeSingle()
  if (!cob) {
    return NextResponse.json({ ok: false, erro: 'cobranca_invalida' }, { status: 404 })
  }

  // Valida participante (cliente OU profissional ou admin via RLS implicita)
  const { data: sol } = await admin
    .from('solicitacoes')
    .select('cliente_id, profissional_id')
    .eq('id', cob.solicitacao_id)
    .maybeSingle()
  if (!sol || (sol.cliente_id !== user.id && sol.profissional_id !== user.id)) {
    const { data: perfil } = await supabase
      .from('profiles')
      .select('tipo')
      .eq('id', user.id)
      .maybeSingle()
    if (!perfil || perfil.tipo !== 'administrador') {
      return NextResponse.json({ ok: false, erro: 'sem_permissao' }, { status: 403 })
    }
  }

  // Ja confirmada? Retorna logo
  if (cob.status === 'paga' || cob.status === 'retida' || cob.status === 'liberada') {
    return NextResponse.json({ ok: true, ja_paga: true, status: cob.status })
  }

  if (!cob.mp_payment_id) {
    return NextResponse.json(
      { ok: false, erro: 'sem_mp_payment_id', dica: 'Cobranca sem Pix gerado ainda.' },
      { status: 400 },
    )
  }

  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json({ ok: false, erro: 'token_mp_ausente' }, { status: 503 })
  }

  // Consulta no MP
  let mpStatus = ''
  let mpStatusDetail = ''
  try {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${cob.mp_payment_id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!r.ok) {
      const detalhe = await r.text().catch(() => '')
      return NextResponse.json(
        { ok: false, erro: 'mp_inacessivel', mp_status: r.status, detalhe },
        { status: 502 },
      )
    }
    const mp = (await r.json()) as { status?: string; status_detail?: string }
    mpStatus = mp.status || ''
    mpStatusDetail = mp.status_detail || ''
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: 'mp_inacessivel', detalhe: (e as Error).message },
      { status: 502 },
    )
  }

  if (mpStatus !== 'approved') {
    return NextResponse.json({
      ok: true,
      aprovado: false,
      mp_status: mpStatus,
      mp_status_detail: mpStatusDetail,
      mensagem:
        mpStatus === 'pending'
          ? 'O Mercado Pago ainda nao reconciliou o pagamento. Aguarde alguns minutos e tente de novo.'
          : `Status atual no Mercado Pago: ${mpStatus}.`,
    })
  }

  // Aprovado no MP — confirma cobranca via RPC (idempotente)
  const { data: rpcData, error } = await admin.rpc('fn_marcar_cobranca_paga', {
    p_cobranca_id: cob.id,
    p_mp_payment_id: cob.mp_payment_id,
  })
  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, aprovado: true, confirmacao: rpcData })
}
