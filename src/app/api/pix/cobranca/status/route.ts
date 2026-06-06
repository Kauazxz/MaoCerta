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

  // RLS de cobrancas_atendimento ja filtra por participante
  const { data: cob, error } = await supabase
    .from('cobrancas_atendimento')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  }
  if (!cob) {
    return NextResponse.json({ ok: false, erro: 'cobranca_invalida' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, cobranca: cob })
}
