import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'

type PagamentoRow = {
  id: string
  mp_payment_id: string | null
  pix_txid: string | null
  status: string
  valor_bruto: number
  valor_comissao: number
  valor_liquido_prestador: number
  pago_em: string | null
  created_at: string
  cliente_id: string
  profissional_id: string
}

type MpInfo = {
  id?: number | string
  status?: string
  status_detail?: string
  transaction_amount?: number
  external_reference?: string
  date_created?: string
  date_approved?: string
  payer?: { email?: string; first_name?: string; last_name?: string }
  collector_id?: number
  description?: string
  error?: string
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, erro: 'nao_autenticado' }, { status: 401 })
  }

  // Confirma que e' admin
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

  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN || ''
  const tokenPrefixo = token ? token.slice(0, 12) : ''
  const tokenTipo = token.startsWith('APP_USR-')
    ? 'producao'
    : token.startsWith('TEST-')
      ? 'sandbox'
      : token
        ? 'desconhecido'
        : 'ausente'

  // Pega os ultimos pagamentos de etapa
  const { data: pags } = await admin
    .from('pagamentos')
    .select(
      'id, mp_payment_id, pix_txid, status, valor_bruto, valor_comissao, valor_liquido_prestador, pago_em, created_at, cliente_id, profissional_id',
    )
    .order('created_at', { ascending: false })
    .limit(20)

  const linhas: Array<{
    pagamento: PagamentoRow
    cliente_email: string | null
    profissional_email: string | null
    mp: MpInfo | null
    inconsistencia: string | null
  }> = []

  // Pega emails dos cliente/profissional pra mostrar
  const userIds = new Set<string>()
  for (const p of (pags as PagamentoRow[] | null) || []) {
    userIds.add(p.cliente_id)
    userIds.add(p.profissional_id)
  }
  const { data: perfis } = await admin
    .from('profiles')
    .select('id, email, nome')
    .in('id', Array.from(userIds))
  const emailDe = new Map<string, string>()
  for (const r of (perfis as Array<{ id: string; email: string | null; nome: string | null }> | null) || []) {
    emailDe.set(r.id, r.email || r.nome || r.id)
  }

  for (const p of (pags as PagamentoRow[] | null) || []) {
    let mp: MpInfo | null = null
    if (p.mp_payment_id && token) {
      try {
        const r = await fetch(`https://api.mercadopago.com/v1/payments/${p.mp_payment_id}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        if (r.ok) {
          mp = (await r.json()) as MpInfo
        } else {
          mp = { error: `mp_status_${r.status}` }
        }
      } catch (e) {
        mp = { error: (e as Error).message }
      }
    }

    let inconsistencia: string | null = null
    if (mp?.status === 'approved' && p.status === 'aguardando_pagamento') {
      inconsistencia = 'aprovado_no_mp_mas_pendente_no_banco'
    } else if (mp?.error) {
      inconsistencia = `mp_inacessivel:${mp.error}`
    } else if (mp && Number(mp.transaction_amount || 0) !== Number(p.valor_bruto)) {
      inconsistencia = 'valor_divergente'
    }

    linhas.push({
      pagamento: p,
      cliente_email: emailDe.get(p.cliente_id) || null,
      profissional_email: emailDe.get(p.profissional_id) || null,
      mp,
      inconsistencia,
    })
  }

  return NextResponse.json({
    ok: true,
    token: { prefixo: tokenPrefixo, tipo: tokenTipo, presente: !!token },
    total: linhas.length,
    linhas,
  })
}
