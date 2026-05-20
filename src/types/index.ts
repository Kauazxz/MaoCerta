export type UserRole = "cliente" | "profissional";

export interface Profile {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
  telefone?: string;
  created_at: string;
}

export interface Servico {
  id: string;
  categoria: string;
  descricao: string;
  profissional_id: string;
  created_at: string;
}

export interface Demanda {
  id: string;
  titulo: string;
  descricao: string;
  categoria: string;
  cliente_id: string;
  status: "aberta" | "em_andamento" | "concluida" | "cancelada";
  created_at: string;
}

export interface Acordo {
  id: string;
  demanda_id?: string;
  cliente_id: string;
  profissional_id: string;
  valor: number;
  prazo: string;
  status: "pendente" | "aceito" | "recusado" | "concluido";
  created_at: string;
}

// RF30-RF38: Etapas de Atendimento
export type TipoEtapa = "vistoria" | "orcamento" | "execucao";
export type StatusEtapa =
  | "pendente"
  | "agendada"
  | "em_progresso"
  | "finalizada_prestador"
  | "concluida"
  | "contestada"
  | "cancelada";
export type StatusAgendamento = "proposto_prestador" | "proposto_cliente" | "aceito_ambos" | "rejeitado" | "cancelado";

export interface EtapaTipo {
  id: number;
  tipo: TipoEtapa;
  nome: string;
  descricao?: string;
  sequencia: number;
}

export type MomentoCobranca =
  | 'nao_se_aplica'
  | 'antes_da_etapa'
  | 'apos_conclusao_etapa'
  | 'somente_no_final'
  | 'incluido_no_total_final';

export interface Etapa {
  id: string;
  solicitacao_id: string;
  tipo: TipoEtapa;
  sequencia: number;
  status: StatusEtapa;
  valor_acordado?: number | null;
  cobravel: boolean;
  momento_cobranca: MomentoCobranca;
  data_proposta?: string;
  hora_proposta?: string;
  proposto_por?: string;
  cliente_confirmou: boolean;
  profissional_confirmou: boolean;
  data_confirmacao_cliente?: string;
  data_confirmacao_profissional?: string;
  notas_inicial?: string;
  notas_conclusao?: string;
  data_inicio?: string;
  data_conclusao?: string;
  observacoes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgendamentoProposta {
  id: string;
  etapa_id: string;
  solicitacao_id: string;
  data_proposta: string;
  hora_proposta: string;
  proposto_por: string;
  status: StatusAgendamento;
  respondido_por?: string;
  resposta_em?: string;
  motivo_rejeicao?: string;
  created_at: string;
  updated_at: string;
}

export interface CancelamentoEtapa {
  id: string;
  etapa_id: string;
  solicitacao_id: string;
  cancelado_por: string;
  motivo?: string;
  created_at: string;
}

/** RF39–RF45: pagamento Pix por etapa (status padronizados RF39.2) */
export type StatusPagamento =
  | "aguardando_pagamento"
  | "pago"
  | "em_escrow"
  | "liberado"
  | "cancelado"
  | "contestado"
  /** legado migração */
  | "aguardando_pix"
  | "pago_retido"
  | "em_disputa";

export interface Pagamento {
  id: string;
  solicitacao_id: string;
  etapa_id: string;
  cliente_id: string;
  profissional_id: string;
  valor_bruto: number;
  valor_etapa?: number | null;
  comissao_percentual: number;
  valor_comissao: number;
  valor_liquido_prestador: number;
  metodo: string;
  status: StatusPagamento;
  pix_copia_e_cola: string | null;
  pix_txid: string | null;
  pix_payload_hash?: string | null;
  qr_expires_at?: string | null;
  pago_em?: string | null;
  webhook_ref?: string | null;
  dispute_motivo: string | null;
  liberado_em: string | null;
  created_at: string;
  updated_at: string;
}
