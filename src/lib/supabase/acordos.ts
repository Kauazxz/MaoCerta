import { createClient } from './client'
import type {
  AcordoSugerido,
  AcordoComConfirmacoes,
  ConfirmacaoAcordo,
  IntencaoDetectada,
  ResultadoSugestao,
  TipoAcordo,
} from '@/types/acordos'

// Considera "mesma data/hora" se a diferenca e' < 1 minuto (apenas para
// evitar falsos diffs por causa de precisao de segundo/ms).
function mesmaDataHora(a: string | null, b: string | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  const ta = new Date(a).getTime()
  const tb = new Date(b).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b
  return Math.abs(ta - tb) < 60_000
}

// Compara valor com tolerancia de 1 centavo.
function mesmoValor(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) < 0.01
}

function listarMudancas(
  antigo: AcordoSugerido,
  novo: { valor: number | null; data_hora: string | null; observacoes: string | null },
): string[] {
  const m: string[] = []
  if (!mesmoValor(antigo.valor, novo.valor)) {
    const fmt = (v: number | null) => (v == null ? '—' : `R$ ${v.toFixed(2).replace('.', ',')}`)
    m.push(`valor: ${fmt(antigo.valor)} → ${fmt(novo.valor)}`)
  }
  if (!mesmaDataHora(antigo.data_hora, novo.data_hora)) {
    const fmt = (v: string | null) =>
      v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
    m.push(`data/hora: ${fmt(antigo.data_hora)} → ${fmt(novo.data_hora)}`)
  }
  return m
}

export const acordosService = {
  /**
   * Sugere um acordo a partir de uma intencao detectada. Faz dedupe
   * automatico: se ja' existe um acordo ATIVO do MESMO TIPO, decide se:
   *  - e' duplicado (mesmos dados) → nao faz nada
   *  - e' contraproposta (mudou data/valor) → atualiza o existente
   *    e zera as confirmacoes (precisa do aceite dos dois novamente)
   *  - e' acordo novo → INSERT
   */
  async sugerir(
    solicitacaoId: string,
    sugeridoPorId: string,
    mensagemOrigemId: string | null,
    intencao: IntencaoDetectada,
  ): Promise<ResultadoSugestao> {
    const supabase = createClient()

    // 1) Procura acordo ativo do mesmo tipo neste atendimento
    const { data: existentes, error: erroBusca } = await supabase
      .from('acordos_chat_sugeridos')
      .select('*')
      .eq('solicitacao_id', solicitacaoId)
      .eq('tipo', intencao.tipo)
      .in('status', ['aguardando', 'aceito', 'editado'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (erroBusca) {
      console.error('[acordos] busca duplicata falhou', erroBusca)
      return { tipo: 'erro', mensagem: erroBusca.message }
    }

    const existente = (existentes as AcordoSugerido[] | null)?.[0]

    if (existente) {
      const mudancas = listarMudancas(existente, {
        valor: intencao.valor,
        data_hora: intencao.data_hora,
        observacoes: intencao.observacoes,
      })

      if (mudancas.length === 0) {
        // Reafirmacao: nada muda
        return { tipo: 'duplicado', acordo: existente }
      }

      // Contraproposta: zera aceites e atualiza
      const { error: erroDel } = await supabase
        .from('acordos_chat_confirmacoes')
        .delete()
        .eq('acordo_id', existente.id)
      if (erroDel) {
        console.error('[acordos] reset confirmacoes falhou', erroDel)
        return { tipo: 'erro', mensagem: erroDel.message }
      }

      const { data: atualizado, error: erroUpd } = await supabase
        .from('acordos_chat_sugeridos')
        .update({
          valor: intencao.valor,
          data_hora: intencao.data_hora,
          observacoes: intencao.observacoes,
          mensagem_origem_id: mensagemOrigemId,
          sugerido_por_id: sugeridoPorId,
          revisao: existente.revisao + 1,
          ultima_alteracao_em: new Date().toISOString(),
          status: 'editado',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existente.id)
        .select('*')
        .single()

      if (erroUpd) {
        console.error('[acordos] update contraproposta falhou', erroUpd)
        return { tipo: 'erro', mensagem: erroUpd.message }
      }
      return { tipo: 'contraproposta', acordo: atualizado as AcordoSugerido, mudancas }
    }

    // 2) Nao existe acordo ativo do tipo: cria novo
    const { data: criado, error: erroIns } = await supabase
      .from('acordos_chat_sugeridos')
      .insert({
        solicitacao_id: solicitacaoId,
        sugerido_por_id: sugeridoPorId,
        mensagem_origem_id: mensagemOrigemId,
        tipo: intencao.tipo,
        resumo: intencao.resumo,
        data_hora: intencao.data_hora,
        valor: intencao.valor,
        observacoes: intencao.observacoes,
        confianca: intencao.confianca,
      })
      .select('*')
      .single()

    if (erroIns) {
      console.error('[acordos] insert novo falhou', erroIns)
      return { tipo: 'erro', mensagem: erroIns.message }
    }
    return { tipo: 'novo', acordo: criado as AcordoSugerido }
  },

  async listar(solicitacaoId: string): Promise<AcordoComConfirmacoes[]> {
    const supabase = createClient()

    const { data: acordos, error } = await supabase
      .from('acordos_chat_sugeridos')
      .select('*')
      .eq('solicitacao_id', solicitacaoId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[acordos] listar falhou', error)
      return []
    }

    const lista = (acordos as AcordoSugerido[] | null) || []
    if (lista.length === 0) return []

    const ids = lista.map((a) => a.id)
    const { data: confs } = await supabase
      .from('acordos_chat_confirmacoes')
      .select('*')
      .in('acordo_id', ids)

    const confsList = (confs as ConfirmacaoAcordo[] | null) || []

    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('cliente_id, profissional_id')
      .eq('id', solicitacaoId)
      .maybeSingle()

    const clienteId = sol?.cliente_id as string | undefined
    const prestadorId = sol?.profissional_id as string | undefined

    return lista.map((a) => {
      const conf = confsList.filter((c) => c.acordo_id === a.id)
      const aceitouCliente = clienteId
        ? conf.some((c) => c.user_id === clienteId && c.acao === 'aceitou')
        : false
      const aceitouPrestador = prestadorId
        ? conf.some((c) => c.user_id === prestadorId && c.acao === 'aceitou')
        : false
      const recusouAlguem = conf.some((c) => c.acao === 'recusou')
      return { ...a, confirmacoes: conf, aceitouCliente, aceitouPrestador, recusouAlguem }
    })
  },

  async aceitar(acordoId: string, userId: string): Promise<{ ok: boolean; erro?: string }> {
    const supabase = createClient()
    const { error } = await supabase
      .from('acordos_chat_confirmacoes')
      .insert({ acordo_id: acordoId, user_id: userId, acao: 'aceitou' })
    if (error) return { ok: false, erro: error.message }
    return { ok: true }
  },

  async recusar(acordoId: string, userId: string): Promise<{ ok: boolean; erro?: string }> {
    const supabase = createClient()
    const { error: erroConf } = await supabase
      .from('acordos_chat_confirmacoes')
      .insert({ acordo_id: acordoId, user_id: userId, acao: 'recusou' })
    if (erroConf) return { ok: false, erro: erroConf.message }
    const { error: erroUpd } = await supabase
      .from('acordos_chat_sugeridos')
      .update({ status: 'recusado' })
      .eq('id', acordoId)
    if (erroUpd) return { ok: false, erro: erroUpd.message }
    return { ok: true }
  },

  async editar(
    acordoId: string,
    userId: string,
    novosDados: {
      tipo?: TipoAcordo
      resumo?: string
      data_hora?: string | null
      valor?: number | null
      observacoes?: string | null
    },
  ): Promise<{ ok: boolean; erro?: string }> {
    const supabase = createClient()

    // Edicao manual tambem zera aceites e incrementa revisao
    const { data: atual } = await supabase
      .from('acordos_chat_sugeridos')
      .select('revisao')
      .eq('id', acordoId)
      .maybeSingle()

    await supabase.from('acordos_chat_confirmacoes').delete().eq('acordo_id', acordoId)

    const { error: erroUpd } = await supabase
      .from('acordos_chat_sugeridos')
      .update({
        ...novosDados,
        status: 'editado',
        revisao: (atual?.revisao ?? 0) + 1,
        ultima_alteracao_em: new Date().toISOString(),
      })
      .eq('id', acordoId)
    if (erroUpd) return { ok: false, erro: erroUpd.message }

    const { error: erroConf } = await supabase
      .from('acordos_chat_confirmacoes')
      .insert({ acordo_id: acordoId, user_id: userId, acao: 'editou', dados_edicao: novosDados })
    if (erroConf) return { ok: false, erro: erroConf.message }
    return { ok: true }
  },
}
