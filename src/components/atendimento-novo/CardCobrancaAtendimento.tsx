'use client'

import { useEffect, useRef, useState } from 'react'
import {
  aceitarCobranca,
  conferirPagamentoNoMP,
  consultarStatusPixCobranca,
  gerarPixCobranca,
  recusarCobranca,
} from '@/lib/supabase/atendimento-cobrancas'
import type { CobrancaAtendimento, StatusCobranca } from '@/types/atendimento'

function valor(v: number | null | undefined) {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const STATUS_LABEL: Record<StatusCobranca, string> = {
  rascunho: 'Rascunho',
  aguardando_aceite: 'Aguardando aceite',
  aceita: 'Aceita - gerar Pix',
  pix_gerado: 'Pix gerado',
  aguardando_pagamento: 'Aguardando pagamento',
  paga: 'Paga',
  retida: 'Retida',
  liberada: 'Liberada',
  contestada: 'Contestada',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
}

const STATUS_CLS: Partial<Record<StatusCobranca, string>> = {
  aguardando_aceite: 'bg-amber-50 text-amber-900 border-amber-200',
  aceita: 'bg-blue-50 text-blue-900 border-blue-200',
  pix_gerado: 'bg-amber-50 text-amber-900 border-amber-200',
  aguardando_pagamento: 'bg-amber-50 text-amber-900 border-amber-200',
  paga: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  liberada: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  contestada: 'bg-orange-50 text-orange-900 border-orange-200',
  cancelada: 'bg-slate-100 text-slate-700 border-slate-200',
  expirada: 'bg-slate-100 text-slate-700 border-slate-200',
}

type Props = {
  cobranca: CobrancaAtendimento
  perfil: 'cliente' | 'profissional'
  onAlterado: () => void
}

export default function CardCobrancaAtendimento({ cobranca, perfil, onAlterado }: Props) {
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [copiou, setCopiou] = useState(false)
  const [qrLocal, setQrLocal] = useState<{ base64: string | null; copia: string | null } | null>(null)
  const [conferindo, setConferindo] = useState(false)
  const [avisoConfere, setAvisoConfere] = useState<string | null>(null)
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const cls = STATUS_CLS[cobranca.status] || 'bg-slate-100 text-slate-700 border-slate-200'
  const aguardandoPix =
    cobranca.status === 'pix_gerado' || cobranca.status === 'aguardando_pagamento'

  async function conferirPagamento(silencioso = false) {
    if (!aguardandoPix) return
    if (!silencioso) setConferindo(true)
    if (!silencioso) setAvisoConfere(null)
    try {
      const r = await conferirPagamentoNoMP(cobranca.id)
      if (r.aprovado) {
        setAvisoConfere('Pagamento confirmado!')
        onAlterado()
      } else if (!silencioso) {
        setAvisoConfere(
          r.mensagem ||
            `Mercado Pago ainda nao confirmou (status: ${r.mp_status || 'desconhecido'}).`,
        )
      }
    } catch (e) {
      if (!silencioso) setAvisoConfere((e as Error).message)
    } finally {
      if (!silencioso) setConferindo(false)
    }
  }

  // Auto-check periodico (15s) enquanto a cobranca esta esperando o Pix.
  // Para o usuario que acabou de pagar e ficou na tela, a confirmacao
  // entra sozinha sem precisar clicar nada.
  useEffect(() => {
    if (!aguardandoPix) {
      if (autoTimer.current) {
        clearInterval(autoTimer.current)
        autoTimer.current = null
      }
      return
    }
    autoTimer.current = setInterval(() => {
      void conferirPagamento(true)
    }, 15_000)
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aguardandoPix, cobranca.id])

  async function executar(fn: () => Promise<unknown>) {
    setProcessando(true)
    setErro(null)
    try {
      await fn()
      onAlterado()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setProcessando(false)
    }
  }

  async function gerarPix() {
    setProcessando(true)
    setErro(null)
    try {
      const r = await gerarPixCobranca(cobranca.id)
      setQrLocal({ base64: r.pix_qr_code_base64, copia: r.pix_copia_cola })
      onAlterado()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setProcessando(false)
    }
  }

  async function copiar() {
    const txt = qrLocal?.copia || cobranca.pix_copia_cola
    if (!txt) return
    await navigator.clipboard.writeText(txt)
    setCopiou(true)
    setTimeout(() => setCopiou(false), 2000)
  }

  async function refrescarStatus() {
    try {
      await consultarStatusPixCobranca(cobranca.id)
      onAlterado()
    } catch {
      // sem op - quem fica de olho e' o realtime na F2
    }
  }

  const qrBase64 = qrLocal?.base64 || cobranca.pix_qr_code_base64
  const qrCopia = qrLocal?.copia || cobranca.pix_copia_cola
  const mostraQr = (cobranca.status === 'pix_gerado' || cobranca.status === 'aguardando_pagamento') && qrBase64

  return (
    <article className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-3">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {cobranca.tipo}
          </p>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{cobranca.titulo}</h3>
          <p className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
            {valor(cobranca.valor)}
          </p>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cls}`}>
          {STATUS_LABEL[cobranca.status]}
        </span>
      </header>

      {/* CLIENTE - aceitar / recusar cobranca em aguardando_aceite */}
      {perfil === 'cliente' && cobranca.status === 'aguardando_aceite' && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={processando}
            onClick={() => executar(() => aceitarCobranca(cobranca.id))}
            className="flex-1 rounded-xl bg-emerald-700 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            Aceitar cobranca
          </button>
          <button
            type="button"
            disabled={processando}
            onClick={() => {
              const motivo = window.prompt('Motivo da recusa:') || ''
              if (motivo.trim()) void executar(() => recusarCobranca(cobranca.id, motivo))
            }}
            className="flex-1 rounded-xl border border-red-200 bg-white py-2 text-xs font-bold text-red-700 disabled:opacity-50"
          >
            Recusar
          </button>
        </div>
      )}

      {/* CLIENTE - gerar pix em aceita */}
      {perfil === 'cliente' && cobranca.status === 'aceita' && (
        <button
          type="button"
          disabled={processando}
          onClick={gerarPix}
          className="w-full rounded-xl bg-violet-700 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {processando ? 'Gerando Pix...' : 'Gerar Pix para pagar'}
        </button>
      )}

      {/* QR Pix gerado */}
      {mostraQr && (
        <div className="space-y-2">
          {qrBase64 && (
            <div className="flex justify-center bg-white rounded-xl p-3 border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${qrBase64}`}
                alt="QR Code Pix"
                width={220}
                height={220}
                className="rounded"
              />
            </div>
          )}
          {qrCopia && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 max-h-24 overflow-y-auto">
              <code className="text-[10px] leading-tight text-slate-700 break-all">{qrCopia}</code>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void conferirPagamento(false)}
              disabled={conferindo}
              className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {conferindo ? 'Verificando...' : 'Ja paguei - verificar agora'}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copiar}
                className="flex-1 rounded-xl border border-violet-300 bg-white py-2 text-xs font-bold text-violet-800"
              >
                {copiou ? 'Copiado!' : 'Copiar codigo Pix'}
              </button>
              <button
                type="button"
                onClick={refrescarStatus}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Atualizar
              </button>
            </div>
          </div>
          {avisoConfere && (
            <p className="text-[11px] text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5">
              {avisoConfere}
            </p>
          )}
          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
            Confirmacao automatica a cada 15s
          </p>
        </div>
      )}

      {erro && <p className="text-xs text-red-600 font-medium">Erro: {erro}</p>}
    </article>
  )
}
