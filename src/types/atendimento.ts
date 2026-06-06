// Tipos do novo motor de atendimento (F1).
// Espelha as tabelas da migration 054 e o retorno das RPCs da 055.

export type ModeloPlano =
  | 'servico_simples'
  | 'pagamento_antes'
  | 'pagamento_depois'
  | 'por_hora'
  | 'por_diaria'
  | 'por_etapa'
  | 'personalizado'

export type StatusPlano =
  | 'rascunho'
  | 'em_negociacao'
  | 'ativo'
  | 'concluido'
  | 'cancelado'
  | 'em_disputa'

export type TipoItem =
  | 'vistoria'
  | 'servico'
  | 'diaria'
  | 'hora'
  | 'etapa'
  | 'extra'
  | 'sinal'
  | 'final'
  | 'ajuste'

export type UnidadeItem = 'fixa' | 'hora' | 'dia' | 'etapa' | 'extra'

export type MomentoPagamento =
  | 'antes'
  | 'depois'
  | 'por_confirmacao'
  | 'final'
  | 'sem_cobranca'

export type StatusItem =
  | 'rascunho'
  | 'enviado'
  | 'aceito'
  | 'recusado'
  | 'aguardando_pagamento'
  | 'pago'
  | 'pronto_para_iniciar'
  | 'em_execucao'
  | 'executado_pelo_profissional'
  | 'aguardando_confirmacao_cliente'
  | 'confirmado_pelo_cliente'
  | 'aguardando_pagamento_final'
  | 'concluido'
  | 'contestado'
  | 'cancelado'

export type TipoCobranca =
  | 'vistoria'
  | 'sinal'
  | 'base'
  | 'diaria'
  | 'hora'
  | 'etapa'
  | 'extra'
  | 'final'
  | 'ajuste'

export type StatusCobranca =
  | 'rascunho'
  | 'aguardando_aceite'
  | 'aceita'
  | 'pix_gerado'
  | 'aguardando_pagamento'
  | 'paga'
  | 'retida'
  | 'liberada'
  | 'contestada'
  | 'cancelada'
  | 'expirada'

export type AtorTipo = 'cliente' | 'profissional' | 'admin' | 'sistema'

export type VisibilidadeEvento = 'participantes' | 'admin' | 'sistema'

export type TipoEvento =
  | 'solicitacao_criada'
  | 'profissional_aceitou'
  | 'profissional_recusou'
  | 'mensagem_enviada'
  | 'plano_criado'
  | 'item_enviado'
  | 'item_aceito_cliente'
  | 'item_recusado_cliente'
  | 'item_alterado'
  | 'cobranca_criada'
  | 'cobranca_extra_criada'
  | 'cobranca_aceita'
  | 'cobranca_recusada'
  | 'pix_gerado'
  | 'pagamento_confirmado'
  | 'pagamento_liberado'
  | 'item_iniciado'
  | 'item_executado_profissional'
  | 'item_confirmado_cliente'
  | 'item_contestado'
  | 'termo_gerado'
  | 'termo_assinado_cliente'
  | 'avaliacao_realizada'
  | 'atendimento_concluido'
  | 'atendimento_cancelado'
  | 'disputa_aberta'
  | 'decisao_admin'
  | 'risco_detectado_chat'
  | 'pronto_para_termo_final'

export interface PlanoAtendimento {
  id: string
  solicitacao_id: string
  titulo: string
  descricao: string | null
  modelo: ModeloPlano
  status: StatusPlano
  criado_por: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ItemPlano {
  id: string
  plano_id: string
  solicitacao_id: string
  tipo: TipoItem
  titulo: string
  descricao: string | null
  ordem: number
  unidade: UnidadeItem
  quantidade_prevista: number | null
  quantidade_realizada: number | null
  valor_unitario: number | null
  valor_total_previsto: number | null
  valor_total_final: number | null
  momento_pagamento: MomentoPagamento
  requer_pagamento_para_iniciar: boolean
  requer_confirmacao_cliente_para_cobrar: boolean
  permite_extra: boolean
  obrigatorio: boolean
  status: StatusItem
  inicio_previsto: string | null
  fim_previsto: string | null
  inicio_real: string | null
  fim_real: string | null
  aceito_cliente_at: string | null
  aceito_profissional_at: string | null
  confirmado_cliente_at: string | null
  confirmado_profissional_at: string | null
  exclusao_solicitada_por: string | null
  exclusao_solicitada_em: string | null
  exclusao_motivo: string | null
  criado_por: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CobrancaAtendimento {
  id: string
  solicitacao_id: string
  plano_id: string | null
  item_id: string | null
  pagamento_id: string | null
  tipo: TipoCobranca
  titulo: string
  descricao: string | null
  valor: number
  valor_bruto: number | null
  taxa_plataforma_percentual: number | null
  valor_taxa_plataforma: number | null
  valor_liquido_profissional: number | null
  moeda: string
  status: StatusCobranca
  requer_aceite_cliente: boolean
  requer_aceite_profissional: boolean
  aceite_cliente_at: string | null
  aceite_profissional_at: string | null
  mp_payment_id: string | null
  mp_external_reference: string | null
  pix_qr_code: string | null
  pix_qr_code_base64: string | null
  pix_copia_cola: string | null
  pix_expira_em: string | null
  pago_em: string | null
  liberado_em: string | null
  retido_em: string | null
  contestado_em: string | null
  motivo_recusa: string | null
  criado_por: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface EventoAtendimento {
  id: number
  solicitacao_id: string
  plano_id: string | null
  item_id: string | null
  cobranca_id: string | null
  pagamento_id: string | null
  ator_id: string | null
  ator_tipo: AtorTipo
  tipo_evento: TipoEvento | string
  titulo: string | null
  descricao: string | null
  payload: Record<string, unknown>
  visibilidade: VisibilidadeEvento
  created_at: string
}

export interface AtendimentoCompleto {
  plano: PlanoAtendimento | null
  itens: ItemPlano[]
  cobrancas: CobrancaAtendimento[]
  eventos: EventoAtendimento[]
}

export type StatusTermo =
  | 'aguardando'
  | 'aguardando_assinatura_cliente'
  | 'assinado_cliente'
  | 'assinado_ambos'
  | 'confirmado'
  | 'dispensado_por_admin'
  | 'cancelado'

export interface TermoFinal {
  id: string
  solicitacao_id: string
  plano_id: string | null
  criado_por_id: string
  resumo_servico: string
  valor_total: number | null
  status: StatusTermo
  confirmado_cliente: boolean
  confirmado_cliente_em: string | null
  confirmado_profissional: boolean
  confirmado_profissional_em: string | null
  dispensado_por_admin_at: string | null
  dispensado_por_admin_id: string | null
  dispensado_por_admin_motivo: string | null
  html_relatorio: string | null
  pdf_url: string | null
  hash_relatorio: string | null
  snapshot_atendimento: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface AvaliacaoAtendimento {
  id: string
  atendimento_id: string
  avaliador_id: string
  avaliado_id: string
  nota: number
  comentario: string | null
  created_at: string
}
