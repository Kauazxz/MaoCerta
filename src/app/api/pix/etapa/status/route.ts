import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) {
    return NextResponse.json({ ok: false, erro: 'id_obrigatorio' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, erro: 'nao_autenticado' }, { status: 401 })
  }

  const { data: pag, error } = await supabase
    .from('pagamentos')
    .select('id, status, valor_bruto, valor_comissao, valor_liquido_prestador, pago_em, mp_payment_id, cliente_id, profissional_id')
    .eq('id', id)
    .maybeSingle()
  if (error || !pag) {
    return NextResponse.json({ ok: false, erro: 'nao_encontrado' }, { status: 404 })
  }
  if (pag.cliente_id !== user.id && pag.profissional_id !== user.id) {
    return NextResponse.json({ ok: false, erro: 'sem_permissao' }, { status: 403 })
  }
  return NextResponse.json({ ok: true, ...pag })
}
