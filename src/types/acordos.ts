export type TipoAcordo =
  | 'vistoria'
  | 'consulta'
  | 'orcamento'
  | 'agendamento'
  | 'execucao'
  | 'conclusao'
  | 'cancelamento'

export type StatusAcordo =
  | 'aguardando'
  | 'aceito'
  | 'recusado'
  | 'editado'
  | 'convertido'
  | 'expirado'

export type AcaoConfirmacao = 'aceitou' | 'recusou' | 'editou'

export type AcordoSugerido = {
  id: string
  solicitacao_id: string
  mensagem_origem_id: string | null
  sugerido_por_id: string
  tipo: TipoAcordo
  resumo: string
  data_hora: string | null
  valor: number | null
  observacoes: string | null
  status: StatusAcordo
  convertido_em: string | null
  convertido_tipo: 'etapa' | 'agendamento' | 'cancelamento' | 'conclusao' | null
  confianca: number
  revisao: number
  ultima_alteracao_em: string
  created_at: string
  updated_at: string
}

export type ResultadoSugestao =
  | { tipo: 'novo'; acordo: AcordoSugerido }
  | { tipo: 'contraproposta'; acordo: AcordoSugerido; mudancas: string[] }
  | { tipo: 'duplicado'; acordo: AcordoSugerido }
  | { tipo: 'erro'; mensagem: string }

export type ConfirmacaoAcordo = {
  id: string
  acordo_id: string
  user_id: string
  acao: AcaoConfirmacao
  dados_edicao: Record<string, unknown> | null
  created_at: string
}

export type AcordoComConfirmacoes = AcordoSugerido & {
  confirmacoes: ConfirmacaoAcordo[]
  aceitouCliente: boolean
  aceitouPrestador: boolean
  recusouAlguem: boolean
}

export type TipoEventoModeracao =
  | 'telefone'
  | 'whatsapp'
  | 'email'
  | 'link_externo'
  | 'pagamento_externo'
  | 'outro'

export type EventoModeracao = {
  id: string
  solicitacao_id: string
  mensagem_id: string | null
  autor_id: string
  tipo: TipoEventoModeracao
  trecho_detectado: string | null
  severidade: number
  revisado: boolean
  created_at: string
}

export type TermoConclusao = {
  id: string
  solicitacao_id: string
  criado_por_id: string
  resumo_servico: string
  valor_total: number | null
  etapas_snapshot: unknown
  confirmado_cliente: boolean
  confirmado_cliente_em: string | null
  confirmado_profissional: boolean
  confirmado_profissional_em: string | null
  status: 'aguardando' | 'confirmado' | 'cancelado'
  created_at: string
  updated_at: string
}

/**
 * Resultado da deteccao do detector (Fase 1, regex)
 */
export type IntencaoDetectada = {
  tipo: TipoAcordo
  resumo: string
  data_hora: string | null
  valor: number | null
  observacoes: string | null
  confianca: number // 0-100
}
