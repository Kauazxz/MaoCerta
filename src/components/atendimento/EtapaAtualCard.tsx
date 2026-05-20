'use client'

import { useState } from 'react'
import type { Etapa } from '@/types'
import { etapasService } from '@/lib/supabase/etapas'
import { formatarValorBrl } from '@/lib/formatar-data'

type Props = {
  etapa: Etapa | null
  meuPapel: 'cliente' | 'profissional'
  onAlterado: () => void
  onAbrirFluxo?: () => void
}

const TIPOS_LABEL: Record<string, { titulo: string; icone: string }> = {
  vistoria: { titulo: 'Vistoria / Consulta', icone: '🔍' },
  orcamento: { titulo: 'Orçamento', icone: '💰' },
  execucao: { titulo: 'Execução', icone: '🛠️' },
}

const STATUS_LABEL: Record<string, { texto: string; cor: string }> = {
  pendente:              { texto: 'Pendente',                cor: 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300' },
  agendada:              { texto: 'Agendada',                cor: 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200' },
  em_progresso:          { texto: 'Em andamento',            cor: 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200' },
  finalizada_prestador:  { texto: 'Aguardando você',         cor: 'bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-200' },
  concluida:             { texto: 'Concluída',               cor: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200' },
  contestada:            { texto: 'Contestada',              cor: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300' },
  cancelada:             { texto: 'Cancelada',               cor: 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400' },
}

export default function EtapaAtualCard({ etapa, meuPapel, onAlterado, onAbrirFluxo }: Props) {
  const [acao, setAcao] = useState<null | string>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [motivoContestacao, setMotivoContestacao] = useState('')
  const [contestando, setContestando] = useState(false)

  if (!etapa) {
    return (
      <div className="rounded-2xl border border-dashed border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 p-5 text-center space-y-2">
        <p className="text-2xl">💬</p>
        <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">
          Aguardando acordos
        </p>
        <p className="text-xs text-purple-800 dark:text-purple-200 leading-relaxed max-w-sm mx-auto">
          {meuPapel === 'profissional'
            ? 'Combine pelo chat o que e como vai ser executado. Cada acordo aceito vira uma etapa do atendimento.'
            : 'Combine pelo chat com o prestador. Cada acordo aceito (vistoria, orçamento, execução, agendamento) vira uma etapa aqui.'}
        </p>
      </div>
    )
  }

  const tipoInfo = TIPOS_LABEL[etapa.tipo] || { titulo: etapa.tipo, icone: '📋' }
  const statusInfo = STATUS_LABEL[etapa.status] || { texto: etapa.status, cor: 'bg-gray-100 text-gray-700' }
  const valor = Number(etapa.valor_acordado || 0)
  const ehCobravel = etapa.cobravel === true && valor > 0

  async function executar(fn: () => Promise<{ ok: boolean; erro?: string }>, nome: string) {
    setAcao(nome)
    setErro(null)
    const r = await fn()
    setAcao(null)
    if (!r.ok) {
      setErro(r.erro || 'Falha')
      return
    }
    onAlterado()
  }

  const podeIniciar = meuPapel === 'profissional' && (etapa.status === 'pendente' || etapa.status === 'agendada')
  const podeFinalizar = meuPapel === 'profissional' && etapa.status === 'em_progresso'
  const podeAceitar = meuPapel === 'cliente' && etapa.status === 'finalizada_prestador'

  return (
    <section className="rounded-2xl border border-purple-200 dark:border-purple-900/60 bg-white dark:bg-slate-900 shadow-md overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/40 dark:to-indigo-950/40 border-b border-purple-100 dark:border-purple-900/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0" aria-hidden>{tipoInfo.icone}</span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-purple-700 dark:text-purple-300">Etapa atual</p>
            <p className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{tipoInfo.titulo}</p>
          </div>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${statusInfo.cor} shrink-0`}>
          {statusInfo.texto}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {ehCobravel ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-slate-400">Valor da etapa</span>
            <span className="font-bold text-gray-900 dark:text-slate-100">{formatarValorBrl(valor)}</span>
          </div>
        ) : (
          <p className="text-[11px] text-gray-500 dark:text-slate-400 italic">
            Etapa sem cobrança — não gera Pix.
          </p>
        )}

        {etapa.notas_conclusao && etapa.status === 'finalizada_prestador' && (
          <div className="rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/40 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 mb-1">Nota do prestador</p>
            <p className="text-xs text-purple-900 dark:text-purple-100 leading-relaxed whitespace-pre-wrap">{etapa.notas_conclusao}</p>
          </div>
        )}

        {erro && <p className="text-xs text-red-600 dark:text-red-400 font-medium">{erro}</p>}

        {podeIniciar && (
          <button
            type="button"
            onClick={() => executar(() => etapasService.iniciar(etapa.id), 'iniciar')}
            disabled={acao !== null}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
          >
            {acao === 'iniciar' ? 'Iniciando...' : `▶ Iniciar ${tipoInfo.titulo.toLowerCase()}`}
          </button>
        )}

        {podeFinalizar && !contestando && (
          <button
            type="button"
            onClick={() => executar(() => etapasService.finalizarPrestador(etapa.id), 'finalizar')}
            disabled={acao !== null}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
          >
            {acao === 'finalizar' ? 'Finalizando...' : `✓ Finalizar ${tipoInfo.titulo.toLowerCase()}`}
          </button>
        )}

        {podeAceitar && !contestando && (
          <div className="space-y-2">
            <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">
              O prestador marcou esta etapa como finalizada. Você pode aceitar a conclusão{ehCobravel ? ' e gerar o Pix de pagamento' : ''}, ou contestar se algo está errado.
            </p>
            <button
              type="button"
              onClick={() => executar(() => etapasService.aceitarConclusao(etapa.id), 'aceitar')}
              disabled={acao !== null}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
            >
              {acao === 'aceitar' ? 'Aceitando...' : `✓ Aceitar conclusão${ehCobravel ? ' e pagar' : ''}`}
            </button>
            <button
              type="button"
              onClick={() => setContestando(true)}
              className="w-full bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 font-semibold py-2 rounded-xl text-sm hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              Contestar / pedir revisão
            </button>
          </div>
        )}

        {contestando && (
          <div className="space-y-2">
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Motivo da contestação</span>
              <textarea
                rows={3}
                value={motivoContestacao}
                onChange={(e) => setMotivoContestacao(e.target.value)}
                placeholder="Descreva o que não está conforme combinado..."
                className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm resize-none"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => executar(() => etapasService.contestar(etapa.id, motivoContestacao), 'contestar')}
                disabled={acao !== null || !motivoContestacao.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-xl text-sm disabled:opacity-50"
              >
                {acao === 'contestar' ? 'Enviando...' : 'Enviar contestação'}
              </button>
              <button
                type="button"
                onClick={() => { setContestando(false); setMotivoContestacao(''); setErro(null) }}
                className="px-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 font-semibold rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                Voltar
              </button>
            </div>
          </div>
        )}

        {onAbrirFluxo && (
          <button
            type="button"
            onClick={onAbrirFluxo}
            className="w-full text-[11px] font-semibold text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-200 pt-1"
          >
            Ver fluxo completo →
          </button>
        )}
      </div>
    </section>
  )
}
