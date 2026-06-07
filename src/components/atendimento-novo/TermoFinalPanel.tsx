'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  assinarTermoFinal,
  buscarMinhaAvaliacao,
  buscarTermoFinal,
  encerrarPorInercia,
  gerarTermoFinal,
} from '@/lib/supabase/atendimento-termo'
import type { AtendimentoCompleto, AvaliacaoAtendimento, TermoFinal } from '@/types/atendimento'
import AvaliacaoModal from './AvaliacaoModal'

function valor(v: number | null | undefined) {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type Props = {
  atendimento: AtendimentoCompleto
  perfil: 'cliente' | 'profissional'
  solicitacaoId: string
  onAlterado: () => void
}

export default function TermoFinalPanel({ atendimento, perfil, solicitacaoId, onAlterado }: Props) {
  const [termo, setTermo] = useState<TermoFinal | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [aceiteCliente, setAceiteCliente] = useState(false)
  const [minhaAvaliacao, setMinhaAvaliacao] = useState<AvaliacaoAtendimento | null>(null)
  const [modalAvaliacao, setModalAvaliacao] = useState(false)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const t = await buscarTermoFinal(solicitacaoId)
      setTermo(t)
      const av = await buscarMinhaAvaliacao(solicitacaoId).catch(() => null)
      setMinhaAvaliacao(av)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [solicitacaoId])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  // Re-puxa termo + avaliacao toda vez que o atendimento receber novos
  // eventos no realtime (ex: outro lado assinou). Isso garante que a
  // tela do profissional fica em sincronia com a do cliente sem F5.
  useEffect(() => {
    void recarregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atendimento.eventos.length, atendimento.plano?.status])

  const itensObrigatoriosAbertos = atendimento.itens.filter(
    i => i.obrigatorio && !['concluido', 'cancelado', 'confirmado_pelo_cliente'].includes(i.status),
  )
  const cobrancasPendentes = atendimento.cobrancas.filter(
    c => !['paga', 'retida', 'liberada', 'cancelada', 'expirada'].includes(c.status),
  )
  const emDisputa = atendimento.plano?.status === 'em_disputa'
  const podeGerar =
    perfil === 'profissional' &&
    itensObrigatoriosAbertos.length === 0 &&
    cobrancasPendentes.length === 0 &&
    !emDisputa

  async function gerar() {
    setProcessando(true)
    setErro(null)
    setAviso(null)
    try {
      await gerarTermoFinal(solicitacaoId)
      setAviso('Termo gerado. Cliente precisa assinar para concluir.')
      await recarregar()
      onAlterado()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setProcessando(false)
    }
  }

  async function assinar() {
    if (!termo) return
    if (perfil === 'cliente' && !aceiteCliente) {
      setErro('Confirme que leu o termo antes de assinar.')
      return
    }
    setProcessando(true)
    setErro(null)
    try {
      const novo = await assinarTermoFinal(termo.id)
      if (novo === 'assinado_ambos') {
        setAviso('Atendimento concluido! Falta apenas a avaliacao.')
        setModalAvaliacao(true)
      } else {
        setAviso('Assinatura registrada. Falta o outro lado assinar.')
      }
      await recarregar()
      onAlterado()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setProcessando(false)
    }
  }

  if (carregando) {
    return <p className="text-sm text-slate-500 text-center mt-4">Carregando termo...</p>
  }

  // Sem termo ainda
  if (!termo) {
    return (
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-sm">
        <header>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Termo final</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Gerado pelo profissional quando todos os itens e cobrancas estiverem fechados.
          </p>
        </header>
        {itensObrigatoriosAbertos.length > 0 && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
            Ainda ha {itensObrigatoriosAbertos.length} item(ns) obrigatorio(s) em aberto.
          </p>
        )}
        {cobrancasPendentes.length > 0 && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
            {cobrancasPendentes.length} cobranca(s) ainda nao foram pagas.
          </p>
        )}
        {emDisputa && (
          <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
            Plano em disputa. Resolva antes de gerar o termo.
          </p>
        )}
        {perfil === 'profissional' && (
          <button
            type="button"
            disabled={!podeGerar || processando}
            onClick={gerar}
            className="w-full rounded-xl bg-violet-700 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {processando ? 'Gerando...' : 'Gerar termo final'}
          </button>
        )}
        {perfil === 'cliente' && (
          <p className="text-[11px] text-slate-500">Aguardando o profissional gerar o termo final.</p>
        )}
        {erro && <p className="text-xs text-red-600 font-medium">{erro}</p>}
        {aviso && <p className="text-xs text-emerald-700 font-medium">{aviso}</p>}
      </section>
    )
  }

  // Termo existente: mostra status + assinaturas
  const concluido = termo.status === 'assinado_ambos' || termo.status === 'dispensado_por_admin' || termo.status === 'confirmado'
  const meusFlags = perfil === 'cliente' ? termo.confirmado_cliente : termo.confirmado_profissional

  return (
    <>
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-sm">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Termo final</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {termo.resumo_servico}
            </p>
          </div>
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              concluido
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-900 border-amber-200'
            }`}
          >
            {termo.status}
          </span>
        </header>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-1.5">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Total pago</p>
            <p className="font-bold text-slate-900 dark:text-slate-100">{valor(termo.valor_total)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-1.5">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Hash</p>
            <p className="font-mono text-[10px] text-slate-700 dark:text-slate-200 truncate">
              {termo.hash_relatorio || '—'}
            </p>
          </div>
        </div>

        {termo.html_relatorio && (
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">
              Ver relatorio completo
            </summary>
            <div
              className="mt-2 rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-[11px] leading-relaxed prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: termo.html_relatorio }}
            />
          </details>
        )}

        <ul className="text-[11px] space-y-1">
          <li className="flex items-center gap-2">
            <span className={termo.confirmado_cliente ? 'text-emerald-700' : 'text-slate-400'}>
              {termo.confirmado_cliente ? '✓' : '○'}
            </span>
            <span className="text-slate-700 dark:text-slate-300">
              Cliente {termo.confirmado_cliente ? 'assinou' : 'aguardando assinatura'}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className={termo.confirmado_profissional ? 'text-emerald-700' : 'text-slate-400'}>
              {termo.confirmado_profissional ? '✓' : '○'}
            </span>
            <span className="text-slate-700 dark:text-slate-300">
              Profissional {termo.confirmado_profissional ? 'assinou' : 'aguardando'}
            </span>
          </li>
        </ul>

        {!concluido && !meusFlags && (
          <>
            {perfil === 'cliente' && (
              <label className="flex items-start gap-2 rounded-xl border border-violet-100 bg-violet-50/40 dark:bg-violet-950/20 px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aceiteCliente}
                  onChange={e => setAceiteCliente(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                  Li o termo, conferi os itens e pagamentos, e confirmo a conclusao do atendimento.
                </span>
              </label>
            )}
            <button
              type="button"
              disabled={processando || (perfil === 'cliente' && !aceiteCliente)}
              onClick={assinar}
              className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {processando ? 'Assinando...' : 'Assinar termo'}
            </button>
          </>
        )}

        {/* Inercia: profissional ja assinou, cliente nao. Mostra contagem e
            libera botao apos 7 dias. */}
        {!concluido && perfil === 'profissional' && termo.confirmado_profissional && !termo.confirmado_cliente && (() => {
          const dias = Math.floor(
            (Date.now() - new Date(termo.created_at).getTime()) / (1000 * 60 * 60 * 24),
          )
          const falta = Math.max(0, 7 - dias)
          if (falta === 0) {
            return (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2 text-[11px] text-amber-900">
                <p>
                  Cliente nao assinou em {dias} dias. Voce pode encerrar o atendimento por
                  inercia e liberar seu saldo.
                </p>
                <button
                  type="button"
                  disabled={processando}
                  onClick={async () => {
                    setProcessando(true)
                    setErro(null)
                    try {
                      await encerrarPorInercia(termo.id)
                      setAviso('Atendimento encerrado por inercia. Saldo liberado.')
                      await recarregar()
                      onAlterado()
                    } catch (e) {
                      setErro((e as Error).message)
                    } finally {
                      setProcessando(false)
                    }
                  }}
                  className="w-full rounded-lg bg-amber-700 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {processando ? 'Encerrando...' : 'Encerrar por inercia'}
                </button>
              </div>
            )
          }
          return (
            <p className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
              Cliente nao assinou ainda. Em {falta} {falta === 1 ? 'dia' : 'dias'} voce
              podera encerrar por inercia e liberar seu saldo.
            </p>
          )
        })()}

        {concluido && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 space-y-2">
            <p>Atendimento concluido com sucesso.</p>
            {minhaAvaliacao ? (
              <p>
                Voce avaliou em <strong>{minhaAvaliacao.nota}/5</strong>.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setModalAvaliacao(true)}
                className="w-full rounded-lg bg-emerald-700 py-2 text-xs font-bold text-white"
              >
                Avaliar {perfil === 'cliente' ? 'o profissional' : 'o cliente'}
              </button>
            )}
          </div>
        )}

        {erro && <p className="text-xs text-red-600 font-medium">{erro}</p>}
        {aviso && <p className="text-xs text-emerald-700 font-medium">{aviso}</p>}
      </section>

      <AvaliacaoModal
        aberto={modalAvaliacao}
        solicitacaoId={solicitacaoId}
        perfil={perfil}
        onFechar={() => setModalAvaliacao(false)}
        onAvaliado={() => {
          setModalAvaliacao(false)
          void recarregar()
        }}
      />
    </>
  )
}
