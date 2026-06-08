import { createClient } from '@/lib/supabase/client'

export type AvaliacaoReputacao = {
  id: string
  nota: number
  comentario: string
  created_at: string
  avaliador_nome: string
  servico: string
}

export type ReputacaoPainel = {
  notaMedia: number
  totalAvaliacoes: number
  concluidos: number
  taxaSecundaria: number
  tipo: 'cliente' | 'profissional' | 'administrador'
  avaliacoes: AvaliacaoReputacao[]
}

export type NotaResumo = {
  notaMedia: number | null
  totalAvaliacoes: number
}

type AvaliacaoRow = {
  nota: number
  nota_qualidade?: number | null
  nota_prazo?: number | null
  nota_comunicacao?: number | null
}

type RpcResposta = {
  ok: boolean
  erro?: string
  nota_media?: number
  total_avaliacoes?: number
  concluidos?: number
  taxa_secundaria?: number
  tipo?: string
  avaliacoes?: AvaliacaoReputacao[]
}

export function calcularNotaEfetiva(row: AvaliacaoRow): number {
  return (
    Number(row.nota_qualidade ?? row.nota)
    + Number(row.nota_prazo ?? row.nota)
    + Number(row.nota_comunicacao ?? row.nota)
  ) / 3
}

function resumoDasNotas(rows: AvaliacaoRow[]): NotaResumo {
  if (!rows.length) return { notaMedia: null, totalAvaliacoes: 0 }
  const notas = rows.map(calcularNotaEfetiva)
  const soma = notas.reduce((acc, n) => acc + n, 0)
  return { notaMedia: soma / notas.length, totalAvaliacoes: rows.length }
}

async function buscarNotaResumoFallback(userId: string): Promise<NotaResumo> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('avaliacoes')
    .select('nota, nota_qualidade, nota_prazo, nota_comunicacao')
    .eq('avaliado_id', userId)
    .eq('moderacao_oculto', false)

  if (error) {
    console.error('[reputacao] fallback nota', error.message)
    return { notaMedia: null, totalAvaliacoes: 0 }
  }

  return resumoDasNotas((data as AvaliacaoRow[]) ?? [])
}

async function buscarReputacaoFallback(userId: string, limite: number): Promise<ReputacaoPainel | null> {
  const supabase = createClient()

  const [perfilRes, avalRes, avalListaRes, solRes] = await Promise.all([
    supabase.from('profiles').select('tipo').eq('id', userId).maybeSingle(),
    supabase
      .from('avaliacoes')
      .select('nota, nota_qualidade, nota_prazo, nota_comunicacao')
      .eq('avaliado_id', userId)
      .eq('moderacao_oculto', false),
    supabase
      .from('avaliacoes')
      .select(`
        id, nota, nota_qualidade, nota_prazo, nota_comunicacao, comentario, created_at,
        avaliador:avaliador_id ( nome ),
        atendimento:atendimento_id ( titulo )
      `)
      .eq('avaliado_id', userId)
      .eq('moderacao_oculto', false)
      .not('comentario', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limite),
    supabase.from('solicitacoes').select('status, cliente_id, profissional_id'),
  ])

  const tipo = (perfilRes.data?.tipo as ReputacaoPainel['tipo']) ?? 'cliente'
  const resumo = resumoDasNotas((avalRes.data as AvaliacaoRow[]) ?? [])

  const solicitacoes = (solRes.data as { status: string; cliente_id: string; profissional_id: string }[]) ?? []
  const concluidos =
    tipo === 'profissional'
      ? solicitacoes.filter((s) => s.profissional_id === userId && s.status === 'concluida').length
      : solicitacoes.filter((s) => s.cliente_id === userId && s.status === 'concluida').length

  let taxaSecundaria = 0
  if (tipo === 'profissional') {
    taxaSecundaria = 100
  } else {
    const doCliente = solicitacoes.filter((s) => s.cliente_id === userId)
    const total = doCliente.filter((s) =>
      ['cancelada', 'concluida', 'em_andamento', 'aceita', 'pendente'].includes(s.status),
    ).length
    const canceladas = doCliente.filter((s) => s.status === 'cancelada').length
    taxaSecundaria = total > 0 ? Math.round((100 * canceladas) / total) : 0
  }

  type AvalListaRow = {
    id: string
    nota: number
    nota_qualidade?: number | null
    nota_prazo?: number | null
    nota_comunicacao?: number | null
    comentario: string | null
    created_at: string
    avaliador: { nome: string } | null
    atendimento: { titulo: string } | null
  }

  const avaliacoes: AvaliacaoReputacao[] = ((avalListaRes.data as unknown as AvalListaRow[]) ?? [])
    .filter((a) => a.comentario && a.comentario.trim().length > 0)
    .map((a) => ({
      id: a.id,
      nota: calcularNotaEfetiva(a),
      comentario: a.comentario as string,
      created_at: a.created_at,
      avaliador_nome: a.avaliador?.nome ?? 'Usuário',
      servico: a.atendimento?.titulo ?? 'Atendimento',
    }))

  return {
    notaMedia: resumo.notaMedia ?? 0,
    totalAvaliacoes: resumo.totalAvaliacoes,
    concluidos,
    taxaSecundaria,
    tipo,
    avaliacoes,
  }
}

export async function buscarNotaResumo(userId: string): Promise<NotaResumo> {
  const painel = await buscarReputacao(userId, 1)
  if (painel) {
    return {
      notaMedia: painel.totalAvaliacoes > 0 ? painel.notaMedia : null,
      totalAvaliacoes: painel.totalAvaliacoes,
    }
  }
  return buscarNotaResumoFallback(userId)
}

export async function buscarReputacao(userId: string, limite = 20): Promise<ReputacaoPainel | null> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('fn_reputacao_buscar', {
    p_user_id: userId,
    p_limite: limite,
  })

  if (!error) {
    const res = data as RpcResposta | null
    if (res?.ok) {
      return {
        notaMedia: Number(res.nota_media ?? 0),
        totalAvaliacoes: Number(res.total_avaliacoes ?? 0),
        concluidos: Number(res.concluidos ?? 0),
        taxaSecundaria: Number(res.taxa_secundaria ?? 0),
        tipo: (res.tipo as ReputacaoPainel['tipo']) ?? 'cliente',
        avaliacoes: (res.avaliacoes as AvaliacaoReputacao[]) ?? [],
      }
    }
  } else {
    console.warn('[reputacao] RPC indisponível, usando fallback:', error.message)
  }

  return buscarReputacaoFallback(userId, limite)
}
