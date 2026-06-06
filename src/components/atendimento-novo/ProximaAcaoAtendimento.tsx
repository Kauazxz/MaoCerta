'use client'

import type { AtendimentoCompleto, CobrancaAtendimento, ItemPlano } from '@/types/atendimento'

type PerfilTipo = 'cliente' | 'profissional'

type Acao = {
  titulo: string
  descricao?: string
  ctaLabel?: string
  destino?: 'plano' | 'pagamentos' | 'historico'
}

function proximaAcao(
  atendimento: AtendimentoCompleto,
  perfil: PerfilTipo,
): Acao {
  const { plano, itens, cobrancas } = atendimento
  if (!plano) {
    return perfil === 'profissional'
      ? {
          titulo: 'Crie o plano de atendimento',
          descricao: 'Comece definindo um modelo (servico simples, por hora, por diaria, etc).',
          destino: 'plano',
          ctaLabel: 'Criar plano',
        }
      : { titulo: 'Aguardando o profissional enviar o plano' }
  }

  // Acoes prioritarias por status de item/cobranca
  const itensAtivos = itens.filter(i => i.status !== 'cancelado')
  const proximoCliente = (it: ItemPlano): Acao | null => {
    switch (it.status) {
      case 'enviado':
        return {
          titulo: `Aceitar proposta: ${it.titulo}`,
          descricao: it.descricao || undefined,
          destino: 'plano',
          ctaLabel: 'Ver proposta',
        }
      case 'executado_pelo_profissional':
        return {
          titulo: `Confirmar execucao: ${it.titulo}`,
          descricao: 'O profissional marcou esta etapa como executada. Confirme ou conteste.',
          destino: 'plano',
          ctaLabel: 'Confirmar',
        }
      default:
        return null
    }
  }
  const proximoProf = (it: ItemPlano): Acao | null => {
    switch (it.status) {
      case 'rascunho':
        return {
          titulo: `Enviar proposta: ${it.titulo}`,
          descricao: 'Item em rascunho aguardando envio para o cliente.',
          destino: 'plano',
          ctaLabel: 'Enviar',
        }
      case 'aceito':
      case 'pronto_para_iniciar':
        return {
          titulo: `Iniciar: ${it.titulo}`,
          destino: 'plano',
          ctaLabel: 'Iniciar',
        }
      case 'em_execucao':
        return {
          titulo: `Marcar como executado: ${it.titulo}`,
          destino: 'plano',
          ctaLabel: 'Marcar executado',
        }
      default:
        return null
    }
  }

  for (const it of itensAtivos) {
    const acao = perfil === 'cliente' ? proximoCliente(it) : proximoProf(it)
    if (acao) return acao
  }

  // Cobrancas pendentes
  const pagamentoPendente = cobrancas.find((c: CobrancaAtendimento) =>
    c.status === 'aguardando_aceite' || c.status === 'pix_gerado' || c.status === 'aguardando_pagamento' || c.status === 'aceita',
  )
  if (pagamentoPendente) {
    if (perfil === 'cliente') {
      if (pagamentoPendente.status === 'aguardando_aceite') {
        return {
          titulo: `Aceitar cobranca: ${pagamentoPendente.titulo}`,
          destino: 'pagamentos',
          ctaLabel: 'Revisar',
        }
      }
      return {
        titulo: `Pagar Pix: ${pagamentoPendente.titulo}`,
        destino: 'pagamentos',
        ctaLabel: 'Ver Pix',
      }
    }
    return {
      titulo: 'Aguardando pagamento do cliente',
      destino: 'pagamentos',
    }
  }

  const todosConcluidos =
    itensAtivos.length > 0 && itensAtivos.every(i => ['concluido', 'confirmado_pelo_cliente'].includes(i.status))
  if (todosConcluidos) {
    return {
      titulo: 'Pronto para conclusao final',
      descricao: 'Falta o termo final (em breve) e a avaliacao.',
      destino: 'historico',
    }
  }

  return { titulo: 'Atendimento em andamento' }
}

type Props = {
  atendimento: AtendimentoCompleto
  perfil: PerfilTipo
  onAcao?: (destino?: Acao['destino']) => void
}

export default function ProximaAcaoAtendimento({ atendimento, perfil, onAcao }: Props) {
  const acao = proximaAcao(atendimento, perfil)
  return (
    <section className="bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/30 dark:to-slate-900 rounded-2xl border border-violet-200 dark:border-violet-900/50 p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300">
        Proxima acao
      </p>
      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">{acao.titulo}</p>
      {acao.descricao && (
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{acao.descricao}</p>
      )}
      {acao.ctaLabel && (
        <button
          type="button"
          onClick={() => onAcao?.(acao.destino)}
          className="mt-3 w-full rounded-xl bg-violet-700 py-2.5 text-sm font-bold text-white hover:bg-violet-800"
        >
          {acao.ctaLabel}
        </button>
      )}
    </section>
  )
}
