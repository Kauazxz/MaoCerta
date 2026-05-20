'use client'

import { useEffect, useState } from 'react'
import type { Etapa, Pagamento } from '@/types'
import { financeiroService } from '@/lib/supabase/financeiro'
import { formatarValorBrl } from '@/lib/formatar-data'
import { labelStatusPagamento, normalizarStatusPagamento } from '@/lib/financeiro/status-pagamento'

type Props = {
  etapa: Etapa
  solicitacaoStatus: string
  meuTipo: 'cliente' | 'profissional'
  pagamento: Pagamento | null
  onAlterado: () => void
}

export default function PagamentoEtapaPanel({
  etapa,
  solicitacaoStatus,
  meuTipo,
  pagamento,
  onAlterado,
}: Props) {
  const [copiou, setCopiou] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarDisputa, setMostrarDisputa] = useState(false)
  const [motivoDisputa, setMotivoDisputa] = useState('')
  const [disputa, setDisputa] = useState<Record<string, unknown> | null>(null)
  const [evidenciaTxt, setEvidenciaTxt] = useState('')
  const [replicaTxt, setReplicaTxt] = useState('')
  const [aceiteEscrow, setAceiteEscrow] = useState(false)
  const [pctComissao, setPctComissao] = useState(10)

  const ativo = solicitacaoStatus === 'aceita' || solicitacaoStatus === 'em_andamento'
  const valorEtapa = Number(etapa.valor_acordado ?? 0)
  const st = pagamento ? normalizarStatusPagamento(pagamento.status) : null

  useEffect(() => {
    let cancel = false
    async function load() {
      if (!pagamento) {
        if (!cancel) setDisputa(null)
        return
      }
      try {
        const d = await financeiroService.getDisputaPorEtapa(etapa.id)
        if (!cancel) setDisputa(d)
      } catch {
        if (!cancel) setDisputa(null)
      }
    }
    void load()
    return () => {
      cancel = true
    }
  }, [pagamento, etapa.id])

  useEffect(() => {
    let cancel = false
    void financeiroService
      .getComissaoPercentual()
      .then((p) => {
        if (!cancel) setPctComissao(Number(p) || 10)
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
  }, [])

  const podePagar =
    meuTipo === 'cliente' &&
    ativo &&
    valorEtapa > 0 &&
    ['agendada', 'em_progresso'].includes(etapa.status)

  async function criarPix() {
    if (!aceiteEscrow) {
      setErro('É necessário aceitar os termos de retenção (escrow) para gerar o Pix.')
      return
    }
    setProcessando(true)
    setErro(null)
    try {
      const r = await financeiroService.criarPagamentoPix(etapa.id, {
        escrowTermsAccepted: true,
        escrowTermsVersion: 'escrow-v1-2026',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      })
      if (!r.ok) {
        setErro(mapErro(r.erro))
        return
      }
      onAlterado()
    } catch (e) {
      console.error(e)
      const msg = (e as Error)?.message || ''
      setErro(`Não foi possível gerar o Pix. ${msg ? `Motivo: ${msg}` : 'Tente de novo.'}`)
    } finally {
      setProcessando(false)
    }
  }

  async function confirmarSandbox() {
    if (!pagamento) return
    setProcessando(true)
    setErro(null)
    try {
      const r = await financeiroService.confirmarPixSandbox(pagamento.id)
      if (!r.ok) {
        setErro(mapErro(r.erro))
        return
      }
      onAlterado()
    } catch (e) {
      console.error(e)
      setErro('Falha ao confirmar pagamento.')
    } finally {
      setProcessando(false)
    }
  }

  async function cancelarQr() {
    if (!pagamento) return
    setProcessando(true)
    setErro(null)
    try {
      const r = await financeiroService.cancelarPixPendente(pagamento.id)
      if (!r.ok) {
        setErro(mapErro(r.erro))
        return
      }
      onAlterado()
    } catch (e) {
      console.error(e)
      setErro('Não foi possível cancelar o código Pix.')
    } finally {
      setProcessando(false)
    }
  }

  async function enviarDisputa() {
    setProcessando(true)
    setErro(null)
    try {
      const r = await financeiroService.abrirDisputa(etapa.id, motivoDisputa)
      if (!r.ok) {
        setErro(mapErro(r.erro))
        return
      }
      setMostrarDisputa(false)
      setMotivoDisputa('')
      onAlterado()
    } catch (e) {
      console.error(e)
      setErro('Não foi possível registrar a contestação.')
    } finally {
      setProcessando(false)
    }
  }

  async function enviarEvidencia() {
    if (!disputa?.id) return
    setProcessando(true)
    setErro(null)
    try {
      const r = await financeiroService.disputaPrestadorEvidencia(String(disputa.id), evidenciaTxt)
      if (!r.ok) {
        setErro(mapErro(r.erro))
        return
      }
      setEvidenciaTxt('')
      onAlterado()
    } catch (e) {
      console.error(e)
      setErro('Não foi possível enviar a evidência.')
    } finally {
      setProcessando(false)
    }
  }

  async function enviarReplica() {
    if (!disputa?.id) return
    setProcessando(true)
    setErro(null)
    try {
      const r = await financeiroService.disputaClienteReplica(String(disputa.id), replicaTxt)
      if (!r.ok) {
        setErro(mapErro(r.erro))
        return
      }
      setReplicaTxt('')
      onAlterado()
    } catch (e) {
      console.error(e)
      setErro('Não foi possível enviar a réplica.')
    } finally {
      setProcessando(false)
    }
  }

  async function copiarPix() {
    if (!pagamento?.pix_copia_e_cola) return
    try {
      await navigator.clipboard.writeText(pagamento.pix_copia_e_cola)
      setCopiou(true)
      setTimeout(() => setCopiou(false), 2000)
    } catch {
      setErro('Não foi possível copiar. Selecione o código manualmente.')
    }
  }

  // Etapa nao cobravel (acordada como gratuita) - nao mostra painel de Pix
  if (etapa.cobravel !== true) {
    return null
  }

  if (valorEtapa <= 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 bg-gray-50/80 px-3 py-2.5">
        <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-snug">
          Esta etapa está marcada como cobrável, mas ainda não tem valor definido.
        </p>
      </div>
    )
  }

  if (!pagamento && meuTipo === 'profissional') {
    return (
      <div className="rounded-xl border border-gray-100 dark:border-slate-800 bg-white/60 px-3 py-2">
        <p className="text-[11px] text-gray-500 dark:text-slate-400">
          Etapa: <strong>{formatarValorBrl(valorEtapa)}</strong> — o cliente paga pela plataforma (Pix). Pagamentos
          externos são moderados (RN18).
        </p>
      </div>
    )
  }

  if (!pagamento && meuTipo === 'cliente') {
    if (!podePagar) return null
    return (
      <div className="rounded-2xl border border-violet-200 dark:border-violet-900/50 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/30 dark:to-slate-900 p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300">Checkout MaoCerta</p>
            <p className="text-sm font-bold text-gray-900 dark:text-slate-100 mt-0.5">{formatarValorBrl(valorEtapa)}</p>
            <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
              O valor fica retido na plataforma (escrow) até a conclusão da etapa e o prazo de contestação. Após isso,
              o repasse é liberado ao prestador.
            </p>
          </div>
          <span className="text-2xl shrink-0" aria-hidden>
            💠
          </span>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/60 px-3 py-2.5 text-[11px] text-gray-700 dark:text-slate-300 space-y-1">
          <p className="font-bold text-gray-800 dark:text-slate-200">Simulador (estimativa)</p>
          <p>
            Etapa: <strong>{formatarValorBrl(valorEtapa)}</strong>
          </p>
          <p>
            Comissão plataforma (~{pctComissao}%):{' '}
            <strong className="text-rose-700 dark:text-rose-400">
              − {formatarValorBrl((valorEtapa * pctComissao) / 100)}
            </strong>
          </p>
          <p>
            Prestador (líq. aprox.):{' '}
            <strong className="text-emerald-800 dark:text-emerald-400">
              {formatarValorBrl(valorEtapa - (valorEtapa * pctComissao) / 100)}
            </strong>
          </p>
          <p className="text-[10px] text-gray-500 dark:text-slate-500">Valores finais aparecem ao gerar o Pix.</p>
        </div>
        <label className="flex items-start gap-2 rounded-xl border border-violet-100 bg-white/80 px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={aceiteEscrow}
            onChange={e => setAceiteEscrow(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-violet-300 text-violet-700"
          />
          <span className="text-[11px] text-gray-700 dark:text-slate-300 leading-relaxed">
            Li e aceito que o pagamento será retido em escrow até aprovação da etapa e que aplicam-se a política de
            disputa e os termos da plataforma (obrigatório para continuar).
          </span>
        </label>
        <button
          type="button"
          disabled={processando || !aceiteEscrow}
          onClick={criarPix}
          className="w-full rounded-xl bg-violet-700 py-3 text-sm font-bold text-white shadow-md transition hover:bg-violet-800 disabled:opacity-50"
        >
          {processando ? 'Gerando…' : 'Pagar etapa com Pix'}
        </button>
        {erro && <p className="text-xs text-red-600 font-medium">{erro}</p>}
      </div>
    )
  }

  if (!pagamento) return null

  const badge = labelStatusPagamento(pagamento.status)
  const expira = pagamento.qr_expires_at ? new Date(pagamento.qr_expires_at).getTime() : null
  const podeCancelarQr =
    meuTipo === 'cliente' &&
    st === 'aguardando_pagamento' &&
    expira &&
    Date.now() < expira &&
    Date.now() - new Date(pagamento.created_at).getTime() <= 15 * 60 * 1000

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900/80 p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">Pagamento desta etapa</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.txt}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-gray-50 dark:bg-slate-800 px-2 py-2">
          <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase">Bruto / etapa</p>
          <p className="text-sm font-bold text-gray-900 dark:text-slate-100">{formatarValorBrl(Number(pagamento.valor_bruto))}</p>
        </div>
        <div className="rounded-lg bg-rose-50/80 px-2 py-2">
          <p className="text-[10px] text-rose-700 uppercase">Plataforma ({Number(pagamento.comissao_percentual)}%)</p>
          <p className="text-sm font-bold text-rose-800">− {formatarValorBrl(Number(pagamento.valor_comissao))}</p>
        </div>
        <div className="rounded-lg bg-emerald-50/80 px-2 py-2">
          <p className="text-[10px] text-emerald-800 uppercase">Prestador (líq.)</p>
          <p className="text-sm font-bold text-emerald-900">
            {formatarValorBrl(Number(pagamento.valor_liquido_prestador))}
          </p>
        </div>
      </div>
      <p className="text-[10px] text-center text-gray-500 dark:text-slate-400">
        Valor para prestador: {formatarValorBrl(Number(pagamento.valor_liquido_prestador))} | Comissão plataforma:{' '}
        {formatarValorBrl(Number(pagamento.valor_comissao))} ({Number(pagamento.comissao_percentual)}%)
      </p>

      {st === 'aguardando_pagamento' && meuTipo === 'cliente' && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-600 dark:text-slate-400">
            <strong>Sandbox / demo:</strong> copie o código ou simule o webhook de confirmação.
          </p>
          {pagamento.qr_expires_at && (
            <p className="text-[10px] text-amber-800">
              QR válido até {new Date(pagamento.qr_expires_at).toLocaleString('pt-BR')} — cancelamento sem ônus em até
              15 min (RF40.3).
            </p>
          )}
          {pagamento.pix_payload_hash && (
            <p className="text-[9px] text-gray-400 dark:text-slate-500 break-all">Hash Pix (rastreio): {pagamento.pix_payload_hash}</p>
          )}
          <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 p-2 max-h-24 overflow-y-auto">
            <code className="text-[10px] leading-tight text-gray-700 dark:text-slate-300 break-all">{pagamento.pix_copia_e_cola}</code>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={copiarPix}
              className="flex-1 rounded-xl border border-violet-300 dark:border-violet-800/60 bg-white dark:bg-slate-900 py-2.5 text-sm font-semibold text-violet-800 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-slate-800"
            >
              {copiou ? 'Copiado!' : 'Copiar código Pix'}
            </button>
            <button
              type="button"
              disabled={processando}
              onClick={confirmarSandbox}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {processando ? '…' : 'Já paguei (simular)'}
            </button>
          </div>
          {podeCancelarQr && (
            <button
              type="button"
              disabled={processando}
              onClick={cancelarQr}
              className="w-full text-xs font-semibold text-gray-600 dark:text-slate-400 underline-offset-2 hover:underline"
            >
              Cancelar QR / código não pago (sem custo)
            </button>
          )}
        </div>
      )}

      {st === 'em_escrow' && (
        <div className="rounded-xl bg-amber-50/90 border border-amber-100 px-3 py-2.5 space-y-1">
          <p className="text-xs font-semibold text-amber-950">Valor em escrow na carteira do prestador</p>
          <p className="text-[11px] text-amber-900/90 leading-relaxed">
            O repasse fica <strong>bloqueado</strong> até ambos confirmarem a conclusão desta etapa (RF43).
          </p>
          {meuTipo === 'cliente' && ativo && (
            <div className="pt-2 border-t border-amber-200/80 mt-2">
              {!mostrarDisputa ? (
                <button
                  type="button"
                  onClick={() => setMostrarDisputa(true)}
                  className="text-[11px] font-semibold text-orange-800 underline-offset-2 hover:underline"
                >
                  Abrir contestação (retenção — RF45)
                </button>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={motivoDisputa}
                    onChange={e => setMotivoDisputa(e.target.value)}
                    rows={2}
                    placeholder="Descreva o problema…"
                    className="w-full text-xs rounded-lg border border-orange-200 px-2 py-1.5"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={processando}
                      onClick={enviarDisputa}
                      className="flex-1 rounded-lg bg-orange-600 py-2 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50"
                    >
                      Registrar disputa
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMostrarDisputa(false)
                        setMotivoDisputa('')
                      }}
                      className="text-xs font-semibold text-gray-600 dark:text-slate-400 px-2"
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {st === 'contestado' && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-950 space-y-2">
          <p className="font-semibold">Em disputa</p>
          {pagamento.dispute_motivo && <p className="mt-1 text-orange-900/90">{pagamento.dispute_motivo}</p>}
          {disputa && (
            <p className="mt-1 text-[10px] text-orange-800/90">Status interno: {String(disputa.status)}</p>
          )}

          {meuTipo === 'profissional' && disputa && String(disputa.status) === 'aguardando_prestador' && (
            <div className="space-y-2 border-t border-orange-200 pt-2">
              <p className="text-[11px] font-semibold">Prazo: 3 dias para evidências (RF45.2)</p>
              <textarea
                value={evidenciaTxt}
                onChange={e => setEvidenciaTxt(e.target.value)}
                rows={2}
                className="w-full text-xs rounded-lg border border-orange-200 px-2 py-1.5 bg-white dark:bg-slate-900"
                placeholder="Descreva provas; anexos pelo suporte se necessário."
              />
              <button
                type="button"
                disabled={processando}
                onClick={enviarEvidencia}
                className="w-full rounded-lg bg-orange-700 py-2 text-xs font-bold text-white"
              >
                Enviar evidências
              </button>
            </div>
          )}

          {meuTipo === 'cliente' && disputa && String(disputa.status) === 'aguardando_cliente' && (
            <div className="space-y-2 border-t border-orange-200 pt-2">
              <p className="text-[11px] font-semibold">Réplica: 2 dias (RF45.2)</p>
              <textarea
                value={replicaTxt}
                onChange={e => setReplicaTxt(e.target.value)}
                rows={2}
                className="w-full text-xs rounded-lg border border-orange-200 px-2 py-1.5 bg-white dark:bg-slate-900"
                placeholder="Sua réplica…"
              />
              <button
                type="button"
                disabled={processando}
                onClick={enviarReplica}
                className="w-full rounded-lg bg-orange-700 py-2 text-xs font-bold text-white"
              >
                Enviar réplica
              </button>
            </div>
          )}
        </div>
      )}

      {st === 'liberado' && (
        <p className="text-xs font-medium text-emerald-800 flex items-center gap-1.5">
          <span>✓</span> Valor liberado para saldo disponível do prestador (RF43.2).
        </p>
      )}

      {meuTipo === 'profissional' && st !== 'aguardando_pagamento' && (
        <p className="text-[11px] text-gray-500 dark:text-slate-400">
          Entradas na carteira apenas por etapas pagas, reembolso admin ou estorno de disputa (RN24).
        </p>
      )}

      {erro && <p className="text-xs text-red-600 font-medium">{erro}</p>}
    </div>
  )
}

function mapErro(c?: string) {
  switch (c) {
    case 'valor_etapa_nao_definido':
      return 'Defina o valor total do serviço antes de pagar.'
    case 'ja_existe_pagamento':
      return 'Já existe um pagamento em andamento para esta etapa.'
    case 'apenas_cliente':
      return 'Apenas o cliente inicia o Pix.'
    case 'etapa_nao_pagavel':
      return 'Esta etapa ainda não aceita pagamento.'
    case 'status_invalido':
      return 'Status do pagamento não permite esta ação.'
    case 'sem_retencao_para_disputa':
      return 'Não há valor retido para contestar.'
    case 'prazo_cancelamento_expirado':
      return 'Prazo de 15 minutos para cancelar sem custo expirou.'
    case 'prazo_disputa_expirado':
      return 'O prazo para abrir contestação nesta etapa já encerrou.'
    case 'escrow_terms_nao_aceitos':
      return 'Aceite os termos de retenção (escrow) para gerar o Pix.'
    case 'carteira_bloqueada':
      return 'Carteira bloqueada por segurança. Contate o suporte.'
    case 'disputa_ja_existe':
      return 'Já existe uma disputa registrada para esta etapa.'
    case 'abaixo_minimo':
      return 'Valor abaixo do mínimo para saque.'
    default:
      return c ? `Erro: ${c}` : 'Operação não permitida.'
  }
}
