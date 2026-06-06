'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { buscarAtendimentoCompleto } from '@/lib/supabase/atendimento-plano'
import {
  adminDispensarTermo,
  buscarTermoFinal,
} from '@/lib/supabase/atendimento-termo'
import HistoricoAtendimentoPanel from '@/components/atendimento-novo/HistoricoAtendimentoPanel'
import type { AtendimentoCompleto, TermoFinal } from '@/types/atendimento'
import { formatarDataPt } from '@/lib/formatar-data'

type RiscoLinha = {
  id: number
  solicitacao_id: string
  titulo: string | null
  descricao: string | null
  payload: Record<string, unknown>
  created_at: string
  ator_id: string | null
}

function valor(v: number | null | undefined) {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type Props = {
  solicitacaoId: string
}

export default function AdminAtendimentoDetalheScreen({ solicitacaoId }: Props) {
  const [atendimento, setAtendimento] = useState<AtendimentoCompleto | null>(null)
  const [termo, setTermo] = useState<TermoFinal | null>(null)
  const [riscos, setRiscos] = useState<RiscoLinha[]>([])
  const [solInfo, setSolInfo] = useState<{
    titulo: string
    status: string
    cliente_nome: string | null
    profissional_nome: string | null
  } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [acaoErro, setAcaoErro] = useState<string | null>(null)
  const [acaoOk, setAcaoOk] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)

  async function carregar() {
    setCarregando(true)
    setErro(null)
    try {
      const supabase = createClient()
      const [a, t, sol, rsk] = await Promise.all([
        buscarAtendimentoCompleto(solicitacaoId),
        buscarTermoFinal(solicitacaoId).catch(() => null),
        supabase
          .from('solicitacoes')
          .select('id, titulo, status, cliente_id, profissional_id, cliente:cliente_id(nome), profissional:profissional_id(nome)')
          .eq('id', solicitacaoId)
          .maybeSingle(),
        supabase
          .from('atendimento_eventos')
          .select('id, solicitacao_id, titulo, descricao, payload, created_at, ator_id')
          .eq('solicitacao_id', solicitacaoId)
          .eq('tipo_evento', 'risco_detectado_chat')
          .order('created_at', { ascending: false }),
      ])
      setAtendimento(a)
      setTermo(t)
      if (sol.data) {
        type SolJoin = {
          titulo: string
          status: string
          cliente?: { nome: string | null } | null
          profissional?: { nome: string | null } | null
        }
        const d = sol.data as unknown as SolJoin
        setSolInfo({
          titulo: d.titulo,
          status: d.status,
          cliente_nome: d.cliente?.nome ?? null,
          profissional_nome: d.profissional?.nome ?? null,
        })
      }
      setRiscos((rsk.data as RiscoLinha[]) || [])
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [solicitacaoId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function dispensar() {
    if (!termo) return
    const motivo = window.prompt('Motivo da dispensa do termo:') || ''
    if (!motivo.trim()) return
    setProcessando(true)
    setAcaoErro(null)
    setAcaoOk(null)
    try {
      await adminDispensarTermo(termo.id, motivo)
      setAcaoOk('Termo dispensado. Atendimento concluido.')
      await carregar()
    } catch (e) {
      setAcaoErro((e as Error).message)
    } finally {
      setProcessando(false)
    }
  }

  const totalPrevisto =
    atendimento?.itens.reduce(
      (acc, it) => acc + Number(it.valor_total_previsto ?? it.valor_unitario ?? 0),
      0,
    ) ?? 0
  const totalPago =
    atendimento?.cobrancas
      .filter(c => ['paga', 'retida', 'liberada'].includes(c.status))
      .reduce((acc, c) => acc + Number(c.valor), 0) ?? 0
  const totalPendente =
    atendimento?.cobrancas
      .filter(c =>
        ['aguardando_aceite', 'aceita', 'pix_gerado', 'aguardando_pagamento'].includes(c.status),
      )
      .reduce((acc, c) => acc + Number(c.valor), 0) ?? 0
  const contestadas =
    atendimento?.cobrancas.filter(c => c.status === 'contestada').length ?? 0

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 px-4 pt-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <header>
          <Link href="/admin/inicio" className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline">
            ← Inicio
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
            Atendimento (admin)
          </h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono break-all">
            {solicitacaoId}
          </p>
        </header>

        {acaoErro && (
          <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {acaoErro}
          </p>
        )}
        {acaoOk && (
          <p className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
            {acaoOk}
          </p>
        )}

        {carregando && <p className="text-sm text-slate-500">Carregando...</p>}
        {erro && <p className="text-sm text-red-700">{erro}</p>}

        {solInfo && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {solInfo.titulo}
            </h2>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Status: <strong>{solInfo.status}</strong>
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Cliente: <strong>{solInfo.cliente_nome || '—'}</strong> · Profissional:{' '}
              <strong>{solInfo.profissional_nome || '—'}</strong>
            </p>
          </section>
        )}

        {atendimento && (
          <section className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-2">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Previsto</p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{valor(totalPrevisto)}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 px-2 py-2">
              <p className="text-[10px] text-emerald-800 uppercase">Pago</p>
              <p className="text-sm font-bold text-emerald-900">{valor(totalPago)}</p>
            </div>
            <div className="rounded-lg bg-amber-50 px-2 py-2">
              <p className="text-[10px] text-amber-900 uppercase">Pendente</p>
              <p className="text-sm font-bold text-amber-900">{valor(totalPendente)}</p>
            </div>
          </section>
        )}

        {(riscos.length > 0 || contestadas > 0 || atendimento?.plano?.status === 'em_disputa') && (
          <section className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl p-4 shadow-sm space-y-2">
            <h2 className="text-sm font-bold text-red-800 dark:text-red-300">⚠️ Alertas</h2>
            {atendimento?.plano?.status === 'em_disputa' && (
              <p className="text-[11px] text-red-700">Plano marcado em disputa.</p>
            )}
            {contestadas > 0 && (
              <p className="text-[11px] text-red-700">
                {contestadas} cobranca(s) contestada(s).
              </p>
            )}
            {riscos.length > 0 && (
              <p className="text-[11px] text-red-700">
                {riscos.length} sinaliz. de risco no chat (pix por fora, contato externo).
              </p>
            )}
          </section>
        )}

        {riscos.length > 0 && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Detecoes de risco no chat
            </h3>
            <ul className="space-y-2">
              {riscos.map(r => (
                <li
                  key={r.id}
                  className="rounded-xl border border-red-200 bg-red-50/40 p-2.5 text-[11px] space-y-1"
                >
                  <p className="font-semibold text-red-900">{r.titulo}</p>
                  {r.descricao && (
                    <p className="text-red-800 italic">&quot;{r.descricao}&quot;</p>
                  )}
                  <p className="text-[10px] text-red-700">{formatarDataPt(r.created_at)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {atendimento?.itens && atendimento.itens.length > 0 && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Itens do plano</h3>
            <ul className="space-y-1.5">
              {atendimento.itens.map(it => (
                <li
                  key={it.id}
                  className="rounded-lg border border-slate-100 dark:border-slate-700 px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate text-slate-700 dark:text-slate-200">
                    <strong>{it.tipo}</strong> · {it.titulo}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">
                    {it.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {atendimento?.cobrancas && atendimento.cobrancas.length > 0 && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Cobrancas</h3>
            <ul className="space-y-1.5">
              {atendimento.cobrancas.map(c => (
                <li
                  key={c.id}
                  className="rounded-lg border border-slate-100 dark:border-slate-700 px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate text-slate-700 dark:text-slate-200">
                    <strong>{c.tipo}</strong> · {c.titulo}
                  </span>
                  <span className="text-slate-900 dark:text-slate-100 font-semibold">
                    {valor(c.valor)} ·{' '}
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">
                      {c.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {termo && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Termo final</h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Status: <strong>{termo.status}</strong>
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Cliente: {termo.confirmado_cliente ? '✓ assinou' : '○ pendente'} · Profissional:{' '}
              {termo.confirmado_profissional ? '✓ assinou' : '○ pendente'}
            </p>
            {termo.hash_relatorio && (
              <p className="text-[10px] text-slate-400 font-mono break-all">
                Hash: {termo.hash_relatorio}
              </p>
            )}
            {!['assinado_ambos', 'confirmado', 'dispensado_por_admin', 'cancelado'].includes(termo.status) && (
              <button
                type="button"
                disabled={processando}
                onClick={dispensar}
                className="w-full mt-2 rounded-xl bg-red-700 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                Dispensar assinatura e encerrar
              </button>
            )}
          </section>
        )}

        {atendimento?.eventos && atendimento.eventos.length > 0 && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Historico (admin ve riscos tambem)
            </h3>
            <HistoricoAtendimentoPanel eventos={atendimento.eventos} />
          </section>
        )}
      </div>
    </main>
  )
}
