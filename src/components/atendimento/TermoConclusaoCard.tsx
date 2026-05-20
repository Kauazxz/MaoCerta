'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarValorBrl, formatarDataPt } from '@/lib/formatar-data'
import type { Etapa } from '@/types'

type Termo = {
  id: string
  solicitacao_id: string
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

type Props = {
  solicitacaoId: string
  meuId: string
  meuPapel: 'cliente' | 'profissional'
  etapas: Etapa[]
  statusAtendimento: string
  /** Dados de contexto pra montar o resumo no momento da criacao */
  clienteNome: string
  prestadorNome: string
  descricaoServico: string
  /** Callback chamado quando o termo e' confirmado pelos dois lados */
  onConcluido?: () => void
}

export default function TermoConclusaoCard({
  solicitacaoId,
  meuId,
  meuPapel,
  etapas,
  statusAtendimento,
  clienteNome,
  prestadorNome,
  descricaoServico,
  onConcluido,
}: Props) {
  const [termo, setTermo] = useState<Termo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [acao, setAcao] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const etapasExecucaoConcluidas = etapas.filter(e => e.tipo === 'execucao' && e.status === 'concluida')
  const podeGerarTermo =
    etapasExecucaoConcluidas.length > 0 &&
    statusAtendimento !== 'concluida' &&
    statusAtendimento !== 'cancelada'

  useEffect(() => {
    let cancel = false
    async function carregar() {
      setCarregando(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('termos_conclusao_atendimento')
        .select('*')
        .eq('solicitacao_id', solicitacaoId)
        .maybeSingle()
      if (!cancel) {
        setTermo((data as Termo | null) || null)
        setCarregando(false)
      }
    }
    void carregar()
    return () => {
      cancel = true
    }
  }, [solicitacaoId])

  async function gerarTermo() {
    setAcao('gerar')
    setErro(null)
    const supabase = createClient()

    const valorTotalSnapshot = etapas
      .filter(e => e.cobravel && e.valor_acordado)
      .reduce((acc, e) => acc + Number(e.valor_acordado || 0), 0)

    const snapshot = etapas.map(e => ({
      tipo: e.tipo,
      sequencia: e.sequencia,
      status: e.status,
      cobravel: e.cobravel,
      valor_acordado: e.valor_acordado,
      observacoes: e.observacoes,
    }))

    const { data, error } = await supabase
      .from('termos_conclusao_atendimento')
      .insert({
        solicitacao_id: solicitacaoId,
        criado_por_id: meuId,
        resumo_servico: descricaoServico,
        valor_total: valorTotalSnapshot > 0 ? valorTotalSnapshot : null,
        etapas_snapshot: snapshot,
      })
      .select('*')
      .single()

    setAcao(null)
    if (error) {
      setErro(error.message)
      return
    }
    setTermo(data as Termo)
  }

  async function confirmar() {
    if (!termo) return
    setAcao('confirmar')
    setErro(null)
    const supabase = createClient()

    const patch = meuPapel === 'cliente'
      ? { confirmado_cliente: true, confirmado_cliente_em: new Date().toISOString() }
      : { confirmado_profissional: true, confirmado_profissional_em: new Date().toISOString() }

    const { data, error } = await supabase
      .from('termos_conclusao_atendimento')
      .update(patch)
      .eq('id', termo.id)
      .select('*')
      .single()

    setAcao(null)
    if (error) {
      setErro(error.message)
      return
    }
    const atualizado = data as Termo
    setTermo(atualizado)

    if (atualizado.confirmado_cliente && atualizado.confirmado_profissional && atualizado.status !== 'confirmado') {
      // Marca termo como confirmado e atendimento como concluido
      await supabase.from('termos_conclusao_atendimento')
        .update({ status: 'confirmado' })
        .eq('id', atualizado.id)
      await supabase.from('solicitacoes')
        .update({ status: 'concluida' })
        .eq('id', solicitacaoId)
      onConcluido?.()
    }
  }

  if (carregando) return null
  if (!podeGerarTermo && !termo) return null

  // Sem termo ainda: oferece criar
  if (!termo) {
    return (
      <section className="rounded-2xl border-2 border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 shadow-md overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Encerramento</p>
          <h2 className="text-base font-bold">Termo de conclusão do serviço</h2>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-emerald-900 dark:text-emerald-100 leading-relaxed">
            Execução concluída. Gere o termo final pra ambos confirmarem o serviço prestado.
            Quando os dois assinarem, o atendimento será marcado como concluído e a avaliação ficará liberada.
          </p>
          {erro && <p className="text-xs text-red-600 dark:text-red-400 font-medium">{erro}</p>}
          <button
            type="button"
            onClick={gerarTermo}
            disabled={acao !== null}
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
          >
            {acao === 'gerar' ? 'Gerando...' : 'Gerar termo final'}
          </button>
        </div>
      </section>
    )
  }

  // Tem termo: mostra resumo + assinaturas
  const valor = termo.valor_total != null ? Number(termo.valor_total) : null
  const ambosConfirmaram = termo.confirmado_cliente && termo.confirmado_profissional
  const meuConfirmado = meuPapel === 'cliente' ? termo.confirmado_cliente : termo.confirmado_profissional
  const outroConfirmado = meuPapel === 'cliente' ? termo.confirmado_profissional : termo.confirmado_cliente

  return (
    <section className="rounded-2xl border-2 border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900 shadow-md overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Termo de conclusão</p>
        <h2 className="text-base font-bold">{ambosConfirmaram ? 'Serviço concluído' : 'Aguardando confirmação'}</h2>
      </div>
      <div className="p-4 space-y-3">
        <div className="rounded-xl bg-gray-50 dark:bg-slate-800 px-3 py-2 space-y-1 text-xs">
          <div className="flex justify-between gap-2">
            <span className="text-gray-500 dark:text-slate-400">Cliente</span>
            <span className="font-semibold text-gray-900 dark:text-slate-100">{clienteNome}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500 dark:text-slate-400">Prestador</span>
            <span className="font-semibold text-gray-900 dark:text-slate-100">{prestadorNome}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500 dark:text-slate-400">Gerado em</span>
            <span className="text-gray-700 dark:text-slate-300">{formatarDataPt(termo.created_at)}</span>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-1">Descrição</p>
          <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{termo.resumo_servico}</p>
        </div>

        {valor != null && valor > 0 && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Valor total acumulado</p>
            <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">{formatarValorBrl(valor)}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className={`rounded-xl px-3 py-2 border ${termo.confirmado_cliente ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-100' : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400'}`}>
            <p className="font-bold uppercase text-[10px]">Cliente</p>
            <p>{termo.confirmado_cliente ? '✓ assinou' : 'aguardando'}</p>
          </div>
          <div className={`rounded-xl px-3 py-2 border ${termo.confirmado_profissional ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-100' : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400'}`}>
            <p className="font-bold uppercase text-[10px]">Prestador</p>
            <p>{termo.confirmado_profissional ? '✓ assinou' : 'aguardando'}</p>
          </div>
        </div>

        {erro && <p className="text-xs text-red-600 dark:text-red-400 font-medium">{erro}</p>}

        {!meuConfirmado && (
          <button
            type="button"
            onClick={confirmar}
            disabled={acao !== null}
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
          >
            {acao === 'confirmar' ? 'Assinando...' : 'Confirmar e assinar'}
          </button>
        )}
        {meuConfirmado && !outroConfirmado && (
          <p className="text-[11px] text-gray-500 dark:text-slate-400 italic text-center">
            Você assinou. Aguardando {meuPapel === 'cliente' ? 'o prestador' : 'o cliente'}.
          </p>
        )}
        {ambosConfirmaram && (
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 text-center">
            ✓ Termo confirmado pelas duas partes. Atendimento concluído.
          </p>
        )}
      </div>
    </section>
  )
}
