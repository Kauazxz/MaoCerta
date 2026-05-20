import { createClient } from './client'
import type {
  AcordoSugerido,
  AcordoComConfirmacoes,
  ConfirmacaoAcordo,
  IntencaoDetectada,
  TipoAcordo,
} from '@/types/acordos'

export const acordosService = {
  async sugerir(
    solicitacaoId: string,
    sugeridoPorId: string,
    mensagemOrigemId: string | null,
    intencao: IntencaoDetectada,
  ): Promise<AcordoSugerido | null> {
    const supabase = createClient()
    const { data, error } = await supabase
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
    if (error) {
      console.error('[acordos] sugerir falhou', error)
      return null
    }
    return data as AcordoSugerido
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
    novosDados: { tipo?: TipoAcordo; resumo?: string; data_hora?: string | null; valor?: number | null; observacoes?: string | null },
  ): Promise<{ ok: boolean; erro?: string }> {
    const supabase = createClient()
    const { error: erroUpd } = await supabase
      .from('acordos_chat_sugeridos')
      .update({ ...novosDados, status: 'editado' })
      .eq('id', acordoId)
    if (erroUpd) return { ok: false, erro: erroUpd.message }
    const { error: erroConf } = await supabase
      .from('acordos_chat_confirmacoes')
      .insert({ acordo_id: acordoId, user_id: userId, acao: 'editou', dados_edicao: novosDados })
    if (erroConf) return { ok: false, erro: erroConf.message }
    return { ok: true }
  },
}
