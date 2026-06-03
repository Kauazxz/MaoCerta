import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { pagamento_id?: string }
  const id = body.pagamento_id
  if (!id) {
    return NextResponse.json({ ok: false, erro: 'pagamento_id_obrigatorio' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, erro: 'nao_autenticado' }, { status: 401 })
  }
  const { data: perfil } = await supabase
    .from('profiles')
    .select('tipo')
    .eq('id', user.id)
    .maybeSingle()
  if (!perfil || perfil.tipo !== 'administrador') {
    return NextResponse.json({ ok: false, erro: 'apenas_admin' }, { status: 403 })
  }

  const admin = createServiceRoleClient()
  if (!admin) {
    return NextResponse.json({ ok: false, erro: 'service_role_nao_configurado' }, { status: 503 })
  }

  // Antes de confirmar, valida no MP que o pagamento esta approved
  const { data: pag } = await admin
    .from('pagamentos')
    .select('id, mp_payment_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!pag) {
    return NextResponse.json({ ok: false, erro: 'pagamento_invalido' }, { status: 404 })
  }
  if (!pag.mp_payment_id) {
    return NextResponse.json({ ok: false, erro: 'sem_mp_payment_id' }, { status: 400 })
  }

  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN || ''
  if (!token) {
    return NextResponse.json({ ok: false, erro: 'token_mp_ausente' }, { status: 503 })
  }
  try {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${pag.mp_payment_id}`, {
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
    const mp = (await r.json()) as { status?: string }
    if (mp.status !== 'approved') {
      return NextResponse.json(
        { ok: false, erro: 'mp_nao_aprovado', mp_status: mp.status },
        { status: 409 },
      )
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: 'mp_inacessivel', detalhe: (e as Error).message },
      { status: 502 },
    )
  }

  const { data: rpcData, error } = await admin.rpc('fn_pagamento_etapa_confirmado', {
    p_pagamento_id: id,
  })
  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, resultado: rpcData })
}
