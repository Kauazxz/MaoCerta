'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatarDataPt } from '@/lib/formatar-data'

type MpInfo = {
  id?: number | string
  status?: string
  status_detail?: string
  transaction_amount?: number
  external_reference?: string
  date_created?: string
  date_approved?: string
  payer?: { email?: string; first_name?: string; last_name?: string }
  collector_id?: number
  description?: string
  error?: string
}

type Linha = {
  pagamento: {
    id: string
    mp_payment_id: string | null
    pix_txid: string | null
    status: string
    valor_bruto: number
    valor_comissao: number
    valor_liquido_prestador: number
    pago_em: string | null
    created_at: string
    cliente_id: string
    profissional_id: string
  }
  cliente_email: string | null
  profissional_email: string | null
  mp: MpInfo | null
  inconsistencia: string | null
}

type Resposta = {
  ok: boolean
  token?: { prefixo: string; tipo: string; presente: boolean }
  total?: number
  linhas?: Linha[]
  erro?: string
}

function valor(v: number | undefined | null) {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function corStatus(s: string | undefined) {
  switch (s) {
    case 'approved':
    case 'em_escrow':
    case 'liberado':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200'
    case 'pending':
    case 'aguardando_pagamento':
      return 'bg-amber-50 text-amber-900 border-amber-200'
    case 'rejected':
    case 'cancelled':
    case 'cancelado':
      return 'bg-red-50 text-red-700 border-red-200'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

export default function AdminDiagnosticoPixScreen() {
  const [carregando, setCarregando] = useState(true)
  const [resp, setResp] = useState<Resposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [acaoEmId, setAcaoEmId] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  async function carregar() {
    setCarregando(true)
    setErro(null)
    try {
      const r = await fetch('/api/admin/pix/diagnosticar', { cache: 'no-store' })
      const data = (await r.json()) as Resposta
      if (!r.ok || !data.ok) {
        setErro(data.erro || 'falha')
        return
      }
      setResp(data)
    } catch (e) {
      console.error(e)
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [])

  async function forcarConfirmacao(id: string) {
    setAcaoEmId(id)
    setAviso(null)
    try {
      const r = await fetch('/api/admin/pix/forcar-confirmacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagamento_id: id }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || data?.ok === false) {
        setAviso({ tipo: 'erro', texto: `Falha: ${data?.erro || r.status}` })
        return
      }
      setAviso({
        tipo: 'ok',
        texto: 'Pagamento confirmado manualmente. Saldo da plataforma e prestador atualizados.',
      })
      await carregar()
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message })
    } finally {
      setAcaoEmId(null)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 px-4 pt-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <header>
          <Link href="/admin/inicio" className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline">
            ← Inicio
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
            Diagnostico Pix - rastrear pagamento sumido
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Mostra os ultimos 20 pagamentos do banco e o estado real no Mercado Pago lado a lado.
          </p>
        </header>

        {aviso && (
          <div
            className={`rounded-xl px-3 py-2.5 text-xs font-medium border ${
              aviso.tipo === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {aviso.texto}
          </div>
        )}

        {resp?.token && (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Mercado Pago - token configurado no servidor
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  resp.token.tipo === 'producao'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : resp.token.tipo === 'sandbox'
                      ? 'bg-amber-50 text-amber-900 border-amber-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                }`}
              >
                {resp.token.tipo}
              </span>
              <code className="text-[11px] text-slate-700 dark:text-slate-300">{resp.token.prefixo || '— ausente —'}...</code>
            </div>
            {resp.token.tipo === 'sandbox' && (
              <p className="text-[11px] text-amber-900 leading-relaxed">
                <strong>Atencao:</strong> o token e de SANDBOX (TEST-...). Os QR Codes gerados aceitam
                pagamento de cartoes/Pix de teste mas <strong>nao recebem dinheiro real</strong>. Se o
                cliente pagou de verdade e sumiu, a chave Pix do QR pertence a uma conta de teste do MP.
                Troque para um token APP_USR-... em <code>MERCADO_PAGO_ACCESS_TOKEN</code> no Vercel.
              </p>
            )}
            {resp.token.tipo === 'producao' && (
              <p className="text-[11px] text-emerald-900 leading-relaxed">
                Token de producao. Se o cliente pagou e o saldo no Mercado Pago nao reflete, conferir
                em qual conta MP o token foi gerado (collector_id de cada pagamento abaixo).
              </p>
            )}
            {resp.token.tipo === 'ausente' && (
              <p className="text-[11px] text-red-700">
                Nenhum token configurado. Defina <code>MERCADO_PAGO_ACCESS_TOKEN</code> no Vercel.
              </p>
            )}
          </section>
        )}

        <button
          type="button"
          onClick={() => void carregar()}
          disabled={carregando}
          className="w-full rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 py-2.5 text-sm font-bold disabled:opacity-50"
        >
          {carregando ? 'Carregando...' : 'Recarregar diagnostico'}
        </button>

        {erro && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            Erro: {erro}
          </div>
        )}

        {!carregando && resp?.linhas && resp.linhas.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum pagamento de etapa registrado ainda.</p>
        )}

        {!carregando && resp?.linhas && resp.linhas.length > 0 && (
          <ul className="space-y-3">
            {resp.linhas.map(l => {
              const p = l.pagamento
              const mp = l.mp
              const inconsistente = !!l.inconsistencia
              return (
                <li
                  key={p.id}
                  className={`rounded-2xl border p-4 shadow-sm space-y-3 ${
                    inconsistente
                      ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {formatarDataPt(p.created_at)}
                      </p>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{valor(p.valor_bruto)}</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        Cliente: <strong>{l.cliente_email || p.cliente_id}</strong>
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        Prestador: <strong>{l.profissional_email || p.profissional_id}</strong>
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">no banco</p>
                      <span
                        className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${corStatus(p.status)}`}
                      >
                        {p.status}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-[11px] space-y-1">
                    <p className="text-slate-500 dark:text-slate-400 uppercase text-[9px] tracking-wider">
                      Mercado Pago
                    </p>
                    {!p.mp_payment_id && (
                      <p className="text-red-700">
                        Pagamento sem <code>mp_payment_id</code> - foi gerado pelo fluxo sandbox antigo, nunca passou pelo MP real.
                      </p>
                    )}
                    {p.mp_payment_id && !mp && (
                      <p className="text-slate-500 dark:text-slate-400">Consultando...</p>
                    )}
                    {mp?.error && <p className="text-red-700">Erro ao consultar MP: {mp.error}</p>}
                    {mp && !mp.error && (
                      <>
                        <p>
                          <strong>mp_id:</strong>{' '}
                          <code className="text-slate-700 dark:text-slate-200">{String(mp.id ?? p.mp_payment_id)}</code>
                        </p>
                        <p>
                          <strong>status MP:</strong>{' '}
                          <span
                            className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${corStatus(mp.status)}`}
                          >
                            {mp.status || '—'}
                          </span>{' '}
                          <span className="text-slate-500 dark:text-slate-400">{mp.status_detail}</span>
                        </p>
                        <p>
                          <strong>Valor MP:</strong> {valor(mp.transaction_amount)}
                        </p>
                        {mp.collector_id && (
                          <p>
                            <strong>Conta recebedora (collector_id):</strong>{' '}
                            <code className="text-slate-700 dark:text-slate-200">{String(mp.collector_id)}</code>
                          </p>
                        )}
                        {mp.payer?.email && (
                          <p>
                            <strong>Pagador (MP):</strong> {mp.payer.email}
                          </p>
                        )}
                        {mp.date_approved && (
                          <p>
                            <strong>Aprovado em:</strong> {new Date(mp.date_approved).toLocaleString('pt-BR')}
                          </p>
                        )}
                        {mp.external_reference && (
                          <p>
                            <strong>external_reference:</strong>{' '}
                            <code className="text-slate-700 dark:text-slate-200">{mp.external_reference}</code>
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {l.inconsistencia && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 space-y-2">
                      <p>
                        <strong>Inconsistencia:</strong> {l.inconsistencia}
                      </p>
                      {l.inconsistencia === 'aprovado_no_mp_mas_pendente_no_banco' && (
                        <>
                          <p>
                            O Mercado Pago confirma o pagamento mas o webhook nao chegou. Confirmar manualmente roda
                            <code> fn_pagamento_etapa_confirmado</code>: credita comissao na plataforma e libera o
                            valor liquido em escrow para o prestador.
                          </p>
                          <button
                            type="button"
                            disabled={acaoEmId === p.id}
                            onClick={() => void forcarConfirmacao(p.id)}
                            className="w-full rounded-lg bg-emerald-700 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            {acaoEmId === p.id ? 'Confirmando...' : 'Forcar confirmacao'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
