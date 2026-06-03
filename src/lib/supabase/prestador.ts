import { createClient } from '@/lib/supabase/client'
import { Etapa, AgendamentoProposta, CancelamentoEtapa } from '@/types'

export type StatusAtendimento = 'aceita' | 'em_andamento' | 'concluida' | 'cancelada'

export type ClienteResumo = {
  id: string
  nome: string
  telefone: string | null
  avatar_url: string | null
}

export type Atendimento = {
  id: string
  titulo: string
  descricao: string
  status: StatusAtendimento
  created_at: string
  updated_at: string
  cliente: ClienteResumo | null
}

export type WalletTransaction = {
  id: string
  tipo: string
  valor: number
  descricao: string
  referencia: string | null
  etapa_id?: string | null
  bloqueado_ate?: string | null
  created_at: string
}

export type Saque = {
  id: string
  valor: number
  status: 'pendente' | 'processado' | 'cancelado'
  observacao: string | null
  metodo?: string | null
  anti_fraude_status?: string | null
  created_at: string
  processado_em: string | null
}

const SELECT_ATENDIMENTO = `
  id, titulo, descricao, status, created_at, updated_at,
  cliente:cliente_id (id, nome, telefone, avatar_url)
`

export const prestadorService = {
  async getAtendimentosEmAndamento(userId: string): Promise<Atendimento[]> {
    const { data, error } = await createClient()
      .from('solicitacoes')
      .select(SELECT_ATENDIMENTO)
      .eq('profissional_id', userId)
      .in('status', ['aceita', 'em_andamento'])
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data as unknown as Atendimento[]) || []
  },

  async getHistoricoAtendimentos(userId: string): Promise<Atendimento[]> {
    const { data, error } = await createClient()
      .from('solicitacoes')
      .select(SELECT_ATENDIMENTO)
      .eq('profissional_id', userId)
      .in('status', ['concluida', 'cancelada'])
      .order('updated_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return (data as unknown as Atendimento[]) || []
  },

  async iniciarAtendimento(id: string) {
    const { error } = await createClient()
      .from('solicitacoes')
      .update({ status: 'em_andamento', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async concluirAtendimento(id: string) {
    const { error } = await createClient()
      .from('solicitacoes')
      .update({ status: 'concluida', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async getWallet(userId: string): Promise<{ saldo: number; saldo_bloqueado?: number } | null> {
    const { data, error } = await createClient()
      .from('wallets')
      .select('saldo, saldo_bloqueado')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data as { saldo: number; saldo_bloqueado?: number } | null
  },

  async getWalletTransactions(userId: string): Promise<WalletTransaction[]> {
    const { data, error } = await createClient()
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    return (data as WalletTransaction[]) || []
  },

  async getSaques(userId: string): Promise<Saque[]> {
    const { data, error } = await createClient()
      .from('saques')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as Saque[]) || []
  },

  async solicitarSaque(_userId: string, valor: number, observacao?: string) {
    const { data, error } = await createClient().rpc('fn_solicitar_saque', {
      p_valor: valor,
      p_observacao: observacao ?? null,
    })
    if (error) throw error
    const row = data as { ok?: boolean; erro?: string; saque_id?: string }
    if (row && row.ok === false) {
      const err = new Error(row.erro || 'saque_negado')
      ;(err as Error & { codigo?: string }).codigo = row.erro
      throw err
    }
    return { id: row?.saque_id }
  },

  async getChavePix(userId: string): Promise<{ chave: string | null; tipo: string | null }> {
    const { data, error } = await createClient()
      .from('profiles')
      .select('chave_pix, tipo_chave_pix')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw error
    const row = data as { chave_pix?: string | null; tipo_chave_pix?: string | null } | null
    return { chave: row?.chave_pix ?? null, tipo: row?.tipo_chave_pix ?? null }
  },

  async salvarChavePix(userId: string, chave: string, tipo: string) {
    const { error } = await createClient()
      .from('profiles')
      .update({ chave_pix: chave.trim(), tipo_chave_pix: tipo })
      .eq('id', userId)
    if (error) throw error
  },

  async cancelarSaque(id: string) {
    const { error } = await createClient()
      .from('saques')
      .update({ status: 'cancelado' })
      .eq('id', id)
    if (error) throw error
  },

  // ========================================================================
  // RF30-RF38: Gerenciamento de Etapas
  // ========================================================================

  async getEtapasAtendimento(solicitacaoId: string): Promise<Etapa[]> {
    const { data, error } = await createClient()
      .from('etapas_atendimento')
      .select('*')
      .eq('solicitacao_id', solicitacaoId)
      .order('sequencia', { ascending: true })
    if (error) throw error
    return (data as Etapa[]) || []
  },

  async getEtapaDetalhes(etapaId: string): Promise<Etapa | null> {
    const { data, error } = await createClient()
      .from('etapas_atendimento')
      .select('*')
      .eq('id', etapaId)
      .maybeSingle()
    if (error) throw error
    return (data as Etapa) || null
  },

  async atualizarStatusEtapa(etapaId: string, novoStatus: Etapa['status'], notas?: string) {
    const update: Record<string, any> = { 
      status: novoStatus,
      updated_at: new Date().toISOString()
    }
    if (notas) update.notas_conclusao = notas
    
    const { error } = await createClient()
      .from('etapas_atendimento')
      .update(update)
      .eq('id', etapaId)
    if (error) throw error
  },

  async iniciarEtapa(etapaId: string, notas?: string) {
    const { error } = await createClient()
      .from('etapas_atendimento')
      .update({
        status: 'em_progresso',
        notas_inicial: notas || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', etapaId)
    if (error) throw error
  },

  async concluirEtapa(etapaId: string, notas?: string) {
    const { error } = await createClient()
      .from('etapas_atendimento')
      .update({
        status: 'concluida',
        notas_conclusao: notas || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', etapaId)
    if (error) throw error
  },

  async confirmarEtapaCliente(etapaId: string) {
    const { error } = await createClient()
      .from('etapas_atendimento')
      .update({
        cliente_confirmou: true,
        data_confirmacao_cliente: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', etapaId)
    if (error) throw error
  },

  async confirmarEtapaProfissional(etapaId: string) {
    const { error } = await createClient()
      .from('etapas_atendimento')
      .update({
        profissional_confirmou: true,
        data_confirmacao_profissional: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', etapaId)
    if (error) throw error
  },

  // RF36: Proposta de data/horário (status inicial conforme quem propõe — RF37)
  async propostaAgendamento(
    etapaId: string,
    solicitacaoId: string,
    dataProposta: string,
    horaProposta: string,
    propostoPor: string,
    quemPropoe: 'cliente' | 'profissional'
  ): Promise<string> {
    const statusInicial =
      quemPropoe === 'cliente' ? 'proposto_cliente' : 'proposto_prestador'
    const { data, error } = await createClient()
      .from('agendamento_propostas')
      .insert({
        etapa_id: etapaId,
        solicitacao_id: solicitacaoId,
        data_proposta: dataProposta,
        hora_proposta: horaProposta,
        proposto_por: propostoPor,
        status: statusInicial
      })
      .select('id')
      .single()
    if (error) throw error
    return data?.id || ''
  },

  async getAgendamentoPropostas(etapaId: string): Promise<AgendamentoProposta[]> {
    const { data, error } = await createClient()
      .from('agendamento_propostas')
      .select('*')
      .eq('etapa_id', etapaId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as AgendamentoProposta[]) || []
  },

  // RF37: Aceite mútuo de agendamento
  async aceitarAgendamento(agendamentoId: string, respondidoPor: string) {
    const supabase = createClient()
    
    // Pega a proposta atual
    const { data: proposta, error: erroGet } = await supabase
      .from('agendamento_propostas')
      .select('*')
      .eq('id', agendamentoId)
      .maybeSingle()
    
    if (erroGet) throw erroGet
    if (!proposta) throw new Error('Proposta não encontrada')

    // Se ainda não foi respondida, marca como proposto pelo outro lado
    const novoStatus = proposta.status === 'proposto_prestador' 
      ? 'proposto_cliente'
      : proposta.status === 'proposto_cliente'
        ? 'aceito_ambos'
        : proposta.status

    const { error } = await supabase
      .from('agendamento_propostas')
      .update({
        status: novoStatus,
        respondido_por: respondidoPor,
        resposta_em: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', agendamentoId)
    if (error) throw error
  },

  async rejeitarAgendamento(agendamentoId: string, respondidoPor: string, motivo?: string) {
    const { error } = await createClient()
      .from('agendamento_propostas')
      .update({
        status: 'rejeitado',
        respondido_por: respondidoPor,
        resposta_em: new Date().toISOString(),
        motivo_rejeicao: motivo || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', agendamentoId)
    if (error) throw error
  },

  async cancelarAgendamento(agendamentoId: string, respondidoPor: string) {
    const { error } = await createClient()
      .from('agendamento_propostas')
      .update({
        status: 'cancelado',
        respondido_por: respondidoPor,
        resposta_em: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', agendamentoId)
    if (error) throw error
  },

  // RF38: Registrar cancelamentos durante o fluxo
  async cancelarEtapa(etapaId: string, solicitacaoId: string, canceladoPor: string, motivo?: string): Promise<string> {
    const supabase = createClient()
    
    // Marca etapa como cancelada
    const { error: erroUpdate } = await supabase
      .from('etapas_atendimento')
      .update({
        status: 'cancelada',
        updated_at: new Date().toISOString()
      })
      .eq('id', etapaId)
    if (erroUpdate) throw erroUpdate

    // Registra motivo do cancelamento
    const { data, error: erroInsert } = await supabase
      .from('cancelamento_etapas')
      .insert({
        etapa_id: etapaId,
        solicitacao_id: solicitacaoId,
        cancelado_por: canceladoPor,
        motivo: motivo || null
      })
      .select('id')
      .single()
    if (erroInsert) throw erroInsert
    return data?.id || ''
  },

  async getCancelamentosEtapa(etapaId: string): Promise<CancelamentoEtapa[]> {
    const { data, error } = await createClient()
      .from('cancelamento_etapas')
      .select('*')
      .eq('etapa_id', etapaId)
    if (error) throw error
    return (data as CancelamentoEtapa[]) || []
  },
}
