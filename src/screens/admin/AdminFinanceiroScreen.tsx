'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { financeiroService } from '@/lib/supabase/financeiro'
import { formatarDataPt, formatarRelativoPt, formatarValorBrl } from '@/lib/formatar-data'
import { labelStatusPagamento } from '@/lib/financeiro/status-pagamento'

type PerfilResumo = {
  id: string
  nome: string | null
  email: string | null
  avatar_url: string | null
  tipo: string | null
  plano: string | null
}

type DisputaRow = {
  id: string
  etapa_id: string
  solicitacao_id: string
  status: string
  motivo: string | null
  created_at: string
}

type PagamentoServico = {
  id: string
  solicitacao_id: string
  etapa_id: string | null
  cliente_id: string
  profissional_id: string
  valor_bruto: number
  valor_comissao: number
  valor_liquido_prestador: number
  status: string
  metodo: string | null
  mp_payment_id: string | null
  pix_txid: string | null
  created_at: string
  pago_em: string | null
  liberado_em: string | null
  cliente: PerfilResumo | null
  profissional: PerfilResumo | null
}

type PagamentoPlano = {
  id: string
  user_id: string
  plano_alvo: string
  valor: number
  status: string
  mp_payment_id: string | null
  created_at: string
  pago_em: string | null
  user: PerfilResumo | null
}

type WalletTx = {
  id: string
  user_id: string
  tipo: string
  valor: number
  descricao: string
  referencia: string | null
  created_at: string
  user: PerfilResumo | null
}

type Aba = 'servicos' | 'planos' | 'carteira' | 'disputas'

const card = 'bg-white dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800/70 shadow-sm dark:shadow-none'

function nomePlano(plano: string | null | undefined) {
  if (plano === 'basico') return 'Pro'
  if (plano === 'premium') return 'Premium Pro'
  return 'Free'
}

function iniciais(nome: string | null | undefined) {
  const base = nome?.trim() || 'Usuário'
  return base
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('')
}

function Avatar({ perfil }: { perfil: PerfilResumo | null }) {
  if (perfil?.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={perfil.avatar_url}
        alt={perfil.nome || 'Usuário'}
        className="h-10 w-10 rounded-full object-cover bg-slate-100 dark:bg-slate-800"
      />
    )
  }

  return (
    <div className="h-10 w-10 rounded-full bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-200 flex items-center justify-center text-xs font-black">
      {iniciais(perfil?.nome)}
    </div>
  )
}

function PerfilLinha({ perfil, rotulo }: { perfil: PerfilResumo | null; rotulo: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar perfil={perfil} />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{rotulo}</p>
        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{perfil?.nome || 'Usuário não encontrado'}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {[perfil?.email, perfil?.tipo, nomePlano(perfil?.plano)].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  )
}

function StatusBadge({ status, tipo = 'pagamento' }: { status: string; tipo?: 'pagamento' | 'plano' | 'wallet' | 'disputa' }) {
  if (tipo === 'pagamento') {
    const label = labelStatusPagamento(status)
    return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${label.cls}`}>{label.txt}</span>
  }

  const cls =
    status === 'pago' || status === 'credito' || status === 'liberada'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : status === 'cancelado' || status === 'expirado' || status === 'debito' || status === 'estornada'
        ? 'bg-rose-50 text-rose-800 border-rose-200'
        : 'bg-amber-50 text-amber-900 border-amber-200'

  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}>{status}</span>
}

export default function AdminFinanceiroScreen() {
  const [aba, setAba] = useState<Aba>('servicos')
  const [disputas, setDisputas] = useState<DisputaRow[]>([])
  const [pagamentos, setPagamentos] = useState<PagamentoServico[]>([])
  const [planos, setPlanos] = useState<PagamentoPlano[]>([])
  const [walletTx, setWalletTx] = useState<WalletTx[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [procMsg, setProcMsg] = useState<string | null>(null)
  const [procLoading, setProcLoading] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setMsg(null)
    try {
      const supabase = createClient()
      const [dRes, pRes, ppRes, wtRes] = await Promise.all([
        supabase.from('disputas').select('*').order('created_at', { ascending: false }).limit(60),
        supabase
          .from('pagamentos')
          .select(`
            id, solicitacao_id, etapa_id, cliente_id, profissional_id,
            valor_bruto, valor_comissao, valor_liquido_prestador,
            status, metodo, mp_payment_id, pix_txid, created_at, pago_em, liberado_em,
            cliente:cliente_id ( id, nome, email, avatar_url, tipo, plano ),
            profissional:profissional_id ( id, nome, email, avatar_url, tipo, plano )
          `)
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('pagamentos_plano')
          .select(`
            id, user_id, plano_alvo, valor, status, mp_payment_id, created_at, pago_em,
            user:user_id ( id, nome, email, avatar_url, tipo, plano )
          `)
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('wallet_transactions')
          .select(`
            id, user_id, tipo, valor, descricao, referencia, created_at,
            user:user_id ( id, nome, email, avatar_url, tipo, plano )
          `)
          .order('created_at', { ascending: false })
          .limit(80),
      ])
      if (dRes.error) throw dRes.error
      if (pRes.error) throw pRes.error
      if (ppRes.error) throw ppRes.error
      if (wtRes.error) throw wtRes.error
      setDisputas((dRes.data as DisputaRow[]) || [])
      setPagamentos((pRes.data as unknown as PagamentoServico[]) || [])
      setPlanos((ppRes.data as unknown as PagamentoPlano[]) || [])
      setWalletTx((wtRes.data as unknown as WalletTx[]) || [])
    } catch (e) {
      console.error(e)
      setMsg('Sem permissão ou erro ao carregar dados financeiros. Verifique se a migration de RLS admin foi aplicada.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel(`admin-financeiro:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagamentos' }, () => void carregar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagamentos_plano' }, () => void carregar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions' }, () => void carregar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disputas' }, () => void carregar())
      .subscribe()

    return () => {
      void supabase.removeChannel(canal)
    }
  }, [carregar])

  async function processarLiberacoes() {
    setProcMsg(null)
    setProcLoading(true)
    try {
      const r = await financeiroService.processarLiberacoesAgendadas()
      if (!r.ok) {
        setProcMsg(r.erro || 'Falha')
        return
      }
      const n = typeof r.processados === 'number' ? r.processados : 0
      setProcMsg(`Processados: ${n} repasse(s) agendado(s).`)
      await carregar()
    } catch (e) {
      console.error(e)
      setProcMsg('Erro ao chamar RPC. Verifique permissão admin e migrations financeiras.')
    } finally {
      setProcLoading(false)
    }
  }

  async function resolver(etapaId: string, acao: 'liberar' | 'estornar') {
    setMsg(null)
    try {
      const r = await financeiroService.resolverDisputaAdmin(etapaId, acao)
      if (!r.ok) {
        setMsg(r.erro || 'Falha')
        return
      }
      setMsg(acao === 'liberar' ? 'Repasse liberado.' : 'Estorno registrado.')
      await carregar()
    } catch (e) {
      console.error(e)
      setMsg('Erro ao resolver disputa.')
    }
  }

  const resumo = useMemo(() => {
    const pagamentosConfirmados = pagamentos.filter((p) =>
      ['pago', 'pago_retido', 'em_escrow', 'liberado'].includes(p.status),
    )
    const planosPagos = planos.filter((p) => p.status === 'pago')
    const creditos = walletTx.filter((tx) => tx.tipo === 'credito').reduce((acc, tx) => acc + Number(tx.valor || 0), 0)
    const debitos = walletTx.filter((tx) => tx.tipo === 'debito').reduce((acc, tx) => acc + Number(tx.valor || 0), 0)
    return {
      brutoServicos: pagamentosConfirmados.reduce((acc, p) => acc + Number(p.valor_bruto || 0), 0),
      comissoes: pagamentosConfirmados.reduce((acc, p) => acc + Number(p.valor_comissao || 0), 0),
      planos: planosPagos.reduce((acc, p) => acc + Number(p.valor || 0), 0),
      carteiraLiquida: creditos - debitos,
      disputasAbertas: disputas.filter((d) =>
        ['aberta', 'aguardando_prestador', 'aguardando_cliente', 'em_analise'].includes(d.status),
      ).length,
    }
  }, [pagamentos, planos, walletTx, disputas])

  const disputasAbertas = disputas.filter(d =>
    ['aberta', 'aguardando_prestador', 'aguardando_cliente', 'em_analise'].includes(d.status),
  )

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50/40 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 pb-24">
      <header className="min-h-[210px] flex items-end bg-gradient-to-br from-amber-700 via-orange-600 to-red-600 text-white px-4 pt-8 pb-12 rounded-b-[2rem] shadow-lg">
        <div className="max-w-6xl mx-auto w-full space-y-2">
          <Link href="/admin/inicio" className="text-xs font-semibold text-white/75 hover:text-white">
            ← Início
          </Link>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">Painel administrativo</p>
          <h1 className="text-2xl font-bold">Financeiro</h1>
          <p className="text-sm text-white/85 leading-relaxed max-w-2xl">
            Controle de pagamentos, comissões, compras de plano, transações de carteira e disputas.
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 -mt-7 space-y-4 relative z-10">
        {msg && (
          <p className="text-sm rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 text-amber-900 dark:text-amber-100">
            {msg}
          </p>
        )}

        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <ResumoCard titulo="Serviços pagos" valor={resumo.brutoServicos} carregando={carregando} />
          <ResumoCard titulo="Comissões" valor={resumo.comissoes} carregando={carregando} destaque />
          <ResumoCard titulo="Planos pagos" valor={resumo.planos} carregando={carregando} />
          <ResumoCard titulo="Carteira líquida" valor={resumo.carteiraLiquida} carregando={carregando} />
          <ResumoCard titulo="Disputas abertas" valorTexto={String(resumo.disputasAbertas)} carregando={carregando} alerta={resumo.disputasAbertas > 0} />
        </section>

        <section className={`${card} p-4 space-y-3`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Rotinas financeiras</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Libera repasses em escrow com prazo vencido e atualiza a carteira do profissional.
              </p>
            </div>
            <button
              type="button"
              disabled={procLoading}
              onClick={() => void processarLiberacoes()}
              className="rounded-xl bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-bold text-white dark:text-slate-950 disabled:opacity-50 hover:bg-slate-800 dark:hover:bg-white"
            >
              {procLoading ? 'Processando...' : 'Processar liberações'}
            </button>
          </div>
          {procMsg && <p className="text-xs text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">{procMsg}</p>}
        </section>

        <nav className={`${card} p-1 grid grid-cols-2 lg:grid-cols-4 gap-1`}>
          <AbaButton ativa={aba === 'servicos'} onClick={() => setAba('servicos')} label="Pagamentos" contador={pagamentos.length} />
          <AbaButton ativa={aba === 'planos'} onClick={() => setAba('planos')} label="Planos" contador={planos.length} />
          <AbaButton ativa={aba === 'carteira'} onClick={() => setAba('carteira')} label="Carteira" contador={walletTx.length} />
          <AbaButton ativa={aba === 'disputas'} onClick={() => setAba('disputas')} label="Disputas" contador={disputasAbertas.length} />
        </nav>

        {carregando && <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">Carregando financeiro...</p>}

        {!carregando && aba === 'servicos' && (
          <section className="space-y-3">
            {pagamentos.length === 0 && <Empty texto="Nenhum pagamento de serviço encontrado." />}
            {pagamentos.map((p) => (
              <article key={p.id} className={`${card} p-4 space-y-4`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={p.status} />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{p.metodo || 'pix'}</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      Criado {formatarRelativoPt(p.created_at)} · {p.pago_em ? `Pago em ${formatarDataPt(p.pago_em)}` : 'Pagamento ainda não confirmado'}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono break-all">
                      Solicitação: {p.solicitacao_id} {p.mp_payment_id ? `· MP ${p.mp_payment_id}` : p.pix_txid ? `· Pix ${p.pix_txid}` : ''}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-right">
                    <ValorMini label="Bruto" valor={p.valor_bruto} />
                    <ValorMini label="Comissão" valor={p.valor_comissao} destaque />
                    <ValorMini label="Prestador" valor={p.valor_liquido_prestador} />
                  </div>
                </div>
                <div className="grid lg:grid-cols-2 gap-3">
                  <PerfilLinha perfil={p.cliente} rotulo="Cliente pagador" />
                  <PerfilLinha perfil={p.profissional} rotulo="Profissional recebedor" />
                </div>
              </article>
            ))}
          </section>
        )}

        {!carregando && aba === 'planos' && (
          <section className="space-y-3">
            {planos.length === 0 && <Empty texto="Nenhuma compra de plano encontrada." />}
            {planos.map((p) => (
              <article key={p.id} className={`${card} p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
                <PerfilLinha perfil={p.user} rotulo="Conta que comprou plano" />
                <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                  <div className="text-left lg:text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Plano comprado</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{nomePlano(p.plano_alvo)}</p>
                    <p className="text-[10px] text-slate-400">{p.pago_em ? `Pago em ${formatarDataPt(p.pago_em)}` : `Criado ${formatarRelativoPt(p.created_at)}`}</p>
                  </div>
                  <StatusBadge status={p.status} tipo="plano" />
                  <p className="text-lg font-black text-slate-900 dark:text-slate-100">{formatarValorBrl(Number(p.valor || 0))}</p>
                </div>
              </article>
            ))}
          </section>
        )}

        {!carregando && aba === 'carteira' && (
          <section className="space-y-3">
            {walletTx.length === 0 && <Empty texto="Nenhuma transação de carteira encontrada." />}
            {walletTx.map((tx) => (
              <article key={tx.id} className={`${card} p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
                <PerfilLinha perfil={tx.user} rotulo="Conta da carteira" />
                <div className="min-w-0 lg:text-right">
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <StatusBadge status={tx.tipo} tipo="wallet" />
                    <p className={`text-lg font-black ${tx.tipo === 'credito' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                      {tx.tipo === 'credito' ? '+' : '-'} {formatarValorBrl(Number(tx.valor || 0))}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-1">{tx.descricao}</p>
                  <p className="text-[10px] text-slate-400 font-mono break-all">
                    {formatarDataPt(tx.created_at)} {tx.referencia ? `· Ref ${tx.referencia}` : ''}
                  </p>
                </div>
              </article>
            ))}
          </section>
        )}

        {!carregando && aba === 'disputas' && (
          <section className="space-y-3">
            {disputasAbertas.length === 0 && <Empty texto="Nenhuma disputa pendente." />}
            {disputasAbertas.map(d => (
              <article key={d.id} className="rounded-2xl border border-orange-200 dark:border-orange-900 bg-orange-50/90 dark:bg-orange-950/25 p-4 space-y-3 shadow-sm">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <StatusBadge status={d.status} tipo="disputa" />
                    <p className="text-sm font-bold text-orange-950 dark:text-orange-100 mt-2">{d.motivo || 'Sem motivo informado'}</p>
                    <p className="text-[10px] text-orange-800 dark:text-orange-300 font-mono break-all mt-1">
                      Etapa: {d.etapa_id} · Solicitação: {d.solicitacao_id}
                    </p>
                  </div>
                  <p className="text-[11px] text-orange-800 dark:text-orange-300">{formatarDataPt(d.created_at)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => resolver(d.etapa_id, 'liberar')}
                    className="rounded-xl bg-emerald-700 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"
                  >
                    Liberar prestador
                  </button>
                  <button
                    type="button"
                    onClick={() => resolver(d.etapa_id, 'estornar')}
                    className="rounded-xl bg-red-700 py-2.5 text-xs font-bold text-white hover:bg-red-800"
                  >
                    Estornar cliente
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}

function ResumoCard({
  titulo, valor, valorTexto, carregando, destaque = false, alerta = false,
}: {
  titulo: string
  valor?: number
  valorTexto?: string
  carregando: boolean
  destaque?: boolean
  alerta?: boolean
}) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{titulo}</p>
      <p className={`text-xl lg:text-2xl font-black mt-2 tabular-nums ${
        alerta ? 'text-orange-700 dark:text-orange-300' : destaque ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100'
      }`}>
        {carregando ? '—' : valorTexto ?? formatarValorBrl(Number(valor || 0))}
      </p>
    </div>
  )
}

function AbaButton({ ativa, onClick, label, contador }: { ativa: boolean; onClick: () => void; label: string; contador: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${
        ativa
          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {label} <span className="opacity-70">({contador})</span>
    </button>
  )
}

function ValorMini({ label, valor, destaque = false }: { label: string; valor: number; destaque?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-xs font-black ${destaque ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100'}`}>
        {formatarValorBrl(Number(valor || 0))}
      </p>
    </div>
  )
}

function Empty({ texto }: { texto: string }) {
  return (
    <div className={`${card} p-6 text-center text-sm text-slate-500 dark:text-slate-400`}>
      {texto}
    </div>
  )
}
