import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'

type PerfilResumo = {
  id: string
  nome: string | null
  avatar_url: string | null
  tipo: string | null
  plano: string | null
}

function perfilDe(map: Map<string, PerfilResumo>, id: unknown): PerfilResumo | null {
  return typeof id === 'string' ? map.get(id) ?? null : null
}

function numero(valor: unknown): number {
  const n = Number(valor ?? 0)
  return Number.isFinite(n) ? n : 0
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor : null
}

export async function GET() {
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

  const [pagRes, planoRes, walletRes, disputaRes] = await Promise.all([
    admin.from('pagamentos').select('*').order('created_at', { ascending: false }).limit(120),
    admin.from('pagamentos_plano').select('*').order('created_at', { ascending: false }).limit(120),
    admin.from('wallet_transactions').select('*').order('created_at', { ascending: false }).limit(120),
    admin.from('disputas').select('*').order('created_at', { ascending: false }).limit(80),
  ])

  const erro = pagRes.error || planoRes.error || walletRes.error || disputaRes.error
  if (erro) {
    return NextResponse.json({ ok: false, erro: erro.message }, { status: 500 })
  }

  const pagamentosRaw = (pagRes.data || []) as Record<string, unknown>[]
  const planosRaw = (planoRes.data || []) as Record<string, unknown>[]
  const walletRaw = (walletRes.data || []) as Record<string, unknown>[]
  const { data: cobrancasData } = await admin
    .from('cobrancas_atendimento')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(120)
  const cobrancasRaw = (cobrancasData || []) as Record<string, unknown>[]

  const solicitacaoIds = Array.from(new Set(
    cobrancasRaw
      .map((c) => texto(c.solicitacao_id))
      .filter((id): id is string => !!id),
  ))

  const solicitacoesMap = new Map<string, { cliente_id: string | null; profissional_id: string | null }>()
  if (solicitacaoIds.length > 0) {
    const { data: solicitacoes } = await admin
      .from('solicitacoes')
      .select('id, cliente_id, profissional_id')
      .in('id', solicitacaoIds)

    for (const s of (solicitacoes as Array<{ id: string; cliente_id: string | null; profissional_id: string | null }> | null) || []) {
      solicitacoesMap.set(s.id, { cliente_id: s.cliente_id, profissional_id: s.profissional_id })
    }
  }

  const ids = new Set<string>()
  for (const p of pagamentosRaw) {
    if (typeof p.cliente_id === 'string') ids.add(p.cliente_id)
    if (typeof p.profissional_id === 'string') ids.add(p.profissional_id)
  }
  for (const p of planosRaw) {
    if (typeof p.user_id === 'string') ids.add(p.user_id)
  }
  for (const tx of walletRaw) {
    if (typeof tx.user_id === 'string') ids.add(tx.user_id)
  }
  for (const c of cobrancasRaw) {
    const solicitacao = solicitacoesMap.get(texto(c.solicitacao_id) || '')
    if (solicitacao?.cliente_id) ids.add(solicitacao.cliente_id)
    if (solicitacao?.profissional_id) ids.add(solicitacao.profissional_id)
  }

  const perfisMap = new Map<string, PerfilResumo>()
  if (ids.size > 0) {
    const { data: perfis, error: perfisError } = await admin
      .from('profiles')
      .select('id, nome, avatar_url, tipo, plano')
      .in('id', Array.from(ids))

    if (perfisError) {
      return NextResponse.json({ ok: false, erro: perfisError.message }, { status: 500 })
    }

    for (const p of (perfis as PerfilResumo[] | null) || []) {
      perfisMap.set(p.id, p)
    }
  }

  const pagamentos = pagamentosRaw.map((p) => {
    const valorBruto = numero(p.valor_bruto)
    const valorComissao = numero(p.valor_comissao)
    return {
      id: String(p.id),
      solicitacao_id: texto(p.solicitacao_id) || '',
      etapa_id: texto(p.etapa_id),
      cliente_id: texto(p.cliente_id) || '',
      profissional_id: texto(p.profissional_id) || '',
      valor_bruto: valorBruto,
      valor_comissao: valorComissao,
      valor_liquido_prestador: numero(p.valor_liquido_prestador) || Math.max(valorBruto - valorComissao, 0),
      status: texto(p.status) || 'desconhecido',
      metodo: texto(p.metodo) || 'pix',
      mp_payment_id: texto(p.mp_payment_id),
      pix_txid: texto(p.pix_txid),
      created_at: texto(p.created_at) || new Date().toISOString(),
      pago_em: texto(p.pago_em),
      liberado_em: texto(p.liberado_em),
      cliente: perfilDe(perfisMap, p.cliente_id),
      profissional: perfilDe(perfisMap, p.profissional_id),
    }
  })

  const pagamentoIds = new Set(pagamentosRaw.map((p) => texto(p.id)).filter(Boolean))
  const pagamentosDeCobrancas = cobrancasRaw
    .filter((c) => {
      const pagamentoId = texto(c.pagamento_id)
      return !pagamentoId || !pagamentoIds.has(pagamentoId)
    })
    .map((c) => {
      const solicitacaoId = texto(c.solicitacao_id) || ''
      const solicitacao = solicitacoesMap.get(solicitacaoId)
      const valorBruto = numero(c.valor_bruto) || numero(c.valor)
      const valorComissao = numero(c.valor_taxa_plataforma)
      const clienteId = solicitacao?.cliente_id || ''
      const profissionalId = solicitacao?.profissional_id || ''
      return {
        id: `cobranca:${String(c.id)}`,
        solicitacao_id: solicitacaoId,
        etapa_id: texto(c.item_id),
        cliente_id: clienteId,
        profissional_id: profissionalId,
        valor_bruto: valorBruto,
        valor_comissao: valorComissao,
        valor_liquido_prestador: numero(c.valor_liquido_profissional) || Math.max(valorBruto - valorComissao, 0),
        status: texto(c.status) || 'desconhecido',
        metodo: 'pix',
        mp_payment_id: texto(c.mp_payment_id),
        pix_txid: texto(c.mp_external_reference),
        created_at: texto(c.created_at) || new Date().toISOString(),
        pago_em: texto(c.pago_em),
        liberado_em: texto(c.liberado_em),
        cliente: perfilDe(perfisMap, clienteId),
        profissional: perfilDe(perfisMap, profissionalId),
      }
    })

  const planos = planosRaw.map((p) => ({
    id: String(p.id),
    user_id: texto(p.user_id) || '',
    plano_alvo: texto(p.plano_alvo) || 'free',
    valor: numero(p.valor),
    status: texto(p.status) || 'desconhecido',
    mp_payment_id: texto(p.mp_payment_id),
    created_at: texto(p.created_at) || new Date().toISOString(),
    pago_em: texto(p.pago_em),
    user: perfilDe(perfisMap, p.user_id),
  }))

  const wallet = walletRaw.map((tx) => ({
    id: String(tx.id),
    user_id: texto(tx.user_id) || '',
    tipo: texto(tx.tipo) || 'credito',
    valor: numero(tx.valor),
    descricao: texto(tx.descricao) || 'Transação de carteira',
    referencia: texto(tx.referencia),
    created_at: texto(tx.created_at) || new Date().toISOString(),
    user: perfilDe(perfisMap, tx.user_id),
  }))

  return NextResponse.json({
    ok: true,
    pagamentos: [...pagamentos, ...pagamentosDeCobrancas]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    planos,
    wallet,
    disputas: disputaRes.data || [],
  })
}
