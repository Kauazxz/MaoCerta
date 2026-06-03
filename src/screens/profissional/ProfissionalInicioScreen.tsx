'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { nomePlano } from '@/lib/plano-limites'
import {
  useSolicitacoesPrestador,
  usePropostasPrestador,
  useCarteiraPrestador,
  useDemandasPublicas,
} from '@/lib/realtime/hooks'
import OnboardingChecklist from '@/components/onboarding/OnboardingChecklist'

type Resumo = {
  userId: string | null
  nome: string
  avatarUrl: string | null
  plano: string
  cidade: string | null
  bio: string | null
  nCategorias: number
  nServicos: number
  nSolicitacoesPendentes: number
  nSolicitacoesTotal: number
  nPropostas: number
  nDemandasAbertas: number
  nAtendimentosAtivos: number
  saldoCarteira: number
  valorEmEscrow: number
}

function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

function formatarReais(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const linksPainel = [
  {
    href: '/profissional/atendimentos',
    titulo: 'Atendimentos',
    descricao: 'Acompanhe os trabalhos aceitos e em andamento',
    icone: '🤝',
    dica: (r: Resumo) =>
      r.nAtendimentosAtivos === 0
        ? 'Nenhum atendimento ativo no momento'
        : `${r.nAtendimentosAtivos} atendimento(s) em andamento`,
  },
  {
    href: '/profissional/carteira',
    titulo: 'Carteira interna',
    descricao: 'Saldo, movimentações e solicitação de saque',
    icone: '💰',
    dica: (r: Resumo) => `Saldo atual: ${formatarReais(r.saldoCarteira)}`,
  },
  {
    href: '/profissional/servicos',
    titulo: 'Categorias e serviços',
    descricao: 'Defina onde você atua e quais serviços oferece',
    icone: '🛠️',
    dica: (r: Resumo) =>
      r.nCategorias === 0 && r.nServicos === 0
        ? 'Comece por aqui — escolha áreas e cadastre serviços'
        : `${r.nCategorias} área(s) · ${r.nServicos} serviço(s)`,
  },
  {
    href: '/profissional/demandas',
    titulo: 'Demandas públicas',
    descricao: 'Veja oportunidades abertas e envie propostas',
    icone: '📋',
    dica: (r: Resumo) =>
      r.nDemandasAbertas === 0
        ? 'Veja também exemplos na página'
        : `${r.nDemandasAbertas} demanda(s) aberta(s) agora`,
  },
  {
    href: '/profissional/solicitacoes',
    titulo: 'Solicitações recebidas',
    descricao: 'Pedidos diretos enviados por clientes',
    icone: '📥',
    dica: (r: Resumo) =>
      r.nSolicitacoesPendentes > 0
        ? `${r.nSolicitacoesPendentes} pendente(s) — responda rápido`
        : r.nSolicitacoesTotal > 0
          ? `${r.nSolicitacoesTotal} no histórico`
          : 'Nenhuma ainda — compartilhe seu ID na busca do cliente',
  },
  {
    href: '/profissional/configuracoes/conta',
    titulo: 'Perfil profissional',
    descricao: 'Atualize bio, experiência e histórico',
    icone: '👤',
    dica: (r: Resumo) => (r.bio && r.bio.length > 30 ? 'Bio preenchida ✓' : 'Complete sua bio para se destacar'),
  },
] as const

const resumoVazio: Resumo = {
  userId: null,
  nome: '',
  avatarUrl: null,
  plano: 'free',
  cidade: null,
  bio: null,
  nCategorias: 0,
  nServicos: 0,
  nSolicitacoesPendentes: 0,
  nSolicitacoesTotal: 0,
  nPropostas: 0,
  nDemandasAbertas: 0,
  nAtendimentosAtivos: 0,
  saldoCarteira: 0,
  valorEmEscrow: 0,
}

export default function ProfissionalInicioScreen() {
  const [carregando, setCarregando] = useState(true)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [copiouId, setCopiouId] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user

    if (!user) {
      setResumo({ ...resumoVazio, nome: 'Profissional' })
      setCarregando(false)
      return
    }
    setUserId(user.id)

    const [
      perfilRes,
      catRes,
      servRes,
      solPendRes,
      solTotRes,
      propRes,
      demRes,
      atendAtivosRes,
      walletRes,
      escrowRes,
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('nome, avatar_url, plano, cidade, bio')
        .eq('id', user.id)
        .maybeSingle(),
      supabase.from('profissional_categorias').select('categoria_id', { count: 'exact', head: true }).eq('profissional_id', user.id),
      supabase.from('servicos').select('id', { count: 'exact', head: true }).eq('profissional_id', user.id),
      supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('profissional_id', user.id)
        .eq('status', 'pendente'),
      supabase.from('solicitacoes').select('id', { count: 'exact', head: true }).eq('profissional_id', user.id),
      supabase.from('propostas').select('id', { count: 'exact', head: true }).eq('profissional_id', user.id),
      supabase.from('demandas').select('id', { count: 'exact', head: true }).eq('status', 'aberta'),
      supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('profissional_id', user.id)
        .in('status', ['aceita', 'em_andamento']),
      supabase.from('wallets').select('saldo').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('pagamentos')
        .select('valor_liquido_prestador')
        .eq('profissional_id', user.id)
        .eq('status', 'em_escrow'),
    ])

    const p = perfilRes.data
    const escrowRows = (escrowRes.data as { valor_liquido_prestador: number }[] | null) || []
    const valorEmEscrow = escrowRows.reduce((a, row) => a + Number(row.valor_liquido_prestador || 0), 0)
    setResumo({
      userId: user.id,
      nome: p?.nome || (user.user_metadata as { nome?: string })?.nome || user.email?.split('@')[0] || 'Profissional',
      avatarUrl: p?.avatar_url || null,
      plano: (p?.plano as string) || 'free',
      cidade: p?.cidade || null,
      bio: p?.bio || null,
      nCategorias: catRes.count ?? 0,
      nServicos: servRes.count ?? 0,
      nSolicitacoesPendentes: solPendRes.count ?? 0,
      nSolicitacoesTotal: solTotRes.count ?? 0,
      nPropostas: propRes.count ?? 0,
      nDemandasAbertas: demRes.count ?? 0,
      nAtendimentosAtivos: atendAtivosRes.count ?? 0,
      saldoCarteira: Number(walletRes.data?.saldo ?? 0),
      valorEmEscrow,
    })
    setCarregando(false)
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  // Realtime: refaz contadores quando algo relevante muda
  useSolicitacoesPrestador(userId, () => void carregar())
  usePropostasPrestador(userId, () => void carregar())
  useCarteiraPrestador(userId, () => void carregar())
  useDemandasPublicas(() => void carregar())

  const r = resumo
  const d = r ?? resumoVazio

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-emerald-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 pb-12">
      <div className="min-h-[200px] flex items-end bg-gradient-to-br from-emerald-700 via-teal-600 to-cyan-600 text-white px-4 pt-8 pb-12 rounded-b-[2rem] shadow-lg">
        <div className="max-w-lg mx-auto">
          {carregando && (
            <div className="flex items-center gap-4 animate-pulse">
              <div className="w-20 h-20 rounded-2xl bg-white/20" />
              <div className="flex-1 space-y-2">
                <div className="h-6 bg-white/20 rounded w-48" />
                <div className="h-4 bg-white/15 rounded w-32" />
              </div>
            </div>
          )}
          {!carregando && r && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="relative shrink-0">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl ring-4 ring-white/25 shadow-lg overflow-hidden bg-white/10 flex items-center justify-center text-2xl sm:text-3xl font-bold">
                  {r.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white">{iniciais(r.nome) || '🛠️'}</span>
                  )}
                </div>
                <Link
                  href="/profissional/configuracoes/conta"
                  className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-white dark:bg-slate-900 text-emerald-800 text-sm font-bold shadow-md flex items-center justify-center hover:bg-emerald-50 border border-emerald-100"
                  title="Alterar foto e dados"
                >
                  ✎
                </Link>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Painel</p>
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight truncate">Olá, {r.nome.split(' ')[0]}</h1>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/20 text-white border border-white/25">
                    Plano {nomePlano(r.plano)}
                  </span>
                  {r.cidade && (
                    <span className="text-xs text-white/85 flex items-center gap-1">
                      <span aria-hidden>📍</span> {r.cidade}
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/80 leading-snug line-clamp-2">
                  {r.bio?.trim()
                    ? r.bio.trim()
                    : 'Complete seu perfil e suas categorias para aparecer melhor para os clientes.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-8 space-y-4 relative z-10">
        <section className={`grid grid-cols-2 gap-2 ${carregando ? 'opacity-60' : ''}`}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-md border border-gray-100 dark:border-slate-800 text-center">
            <p className="text-2xl font-bold text-emerald-700">{carregando ? '—' : d.nServicos}</p>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mt-1">Serviços</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-md border border-gray-100 dark:border-slate-800 text-center">
            <p className="text-2xl font-bold text-teal-700">{carregando ? '—' : d.nCategorias}</p>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mt-1">Áreas</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-md border border-gray-100 dark:border-slate-800 text-center">
            <p className="text-2xl font-bold text-violet-700">{carregando ? '—' : d.nPropostas}</p>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mt-1">Propostas enviadas</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-md border border-gray-100 dark:border-slate-800 text-center">
            <p className="text-2xl font-bold text-amber-700">{carregando ? '—' : d.nSolicitacoesPendentes}</p>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mt-1">Solicitações novas</p>
          </div>
        </section>

        {!carregando && d.userId && (
          <OnboardingChecklist
            variant="profissional"
            perfilCompleto={!!(d.cidade && d.bio && d.bio.trim().length > 20)}
            temCategorias={d.nCategorias > 0}
            temServicos={d.nServicos > 0}
            temMovimento={d.nPropostas > 0 || d.nSolicitacoesTotal > 0}
          />
        )}

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900/80 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">Saldo disponível</p>
            <p className="text-xl font-bold text-emerald-900 dark:text-emerald-200 mt-1">{formatarReais(d.saldoCarteira)}</p>
            <Link href="/profissional/carteira" className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mt-2 inline-block">
              Ver carteira →
            </Link>
          </div>
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase text-amber-900 dark:text-amber-200">Em escrow (etapas)</p>
            <p className="text-xl font-bold text-amber-950 dark:text-amber-100 mt-1">{formatarReais(d.valorEmEscrow)}</p>
            <p className="text-[10px] text-amber-900/80 dark:text-amber-200/90 mt-1 leading-snug">
              Valor retido até confirmações e prazo de contestação.
            </p>
          </div>
        </section>

        <p className="text-center text-xs text-gray-500 dark:text-slate-400">
          {carregando ? 'Atualizando marketplace…' : `${d.nDemandasAbertas} demanda(s) pública(s) aberta(s) agora.`}
        </p>

        <section className="space-y-3 pt-2">
          <h2 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest px-1">Atalhos</h2>
          {linksPainel.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group bg-white dark:bg-slate-900 rounded-2xl p-4 flex items-center gap-4 shadow-sm border border-gray-100 dark:border-slate-800 hover:border-emerald-200 hover:shadow-md transition-all"
            >
              <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center text-xl shadow-inner border border-emerald-100/80 group-hover:scale-105 transition-transform">
                {item.icone}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-slate-100">{item.titulo}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{item.descricao}</p>
                <p className="text-[11px] font-semibold text-emerald-700 mt-1.5 truncate">
                  {carregando ? 'Carregando…' : item.dica(d)}
                </p>
              </div>
              <span className="text-emerald-600 text-xl font-light shrink-0 group-hover:translate-x-0.5 transition-transform">›</span>
            </Link>
          ))}
        </section>

        {d.userId && (
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-sm p-4 mt-4">
            <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Seu ID para solicitações diretas</p>
            <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
              O cliente cola este código em <strong>Buscar e solicitar</strong> para o pedido cair em{' '}
              <strong>Solicitações recebidas</strong>.
            </p>
            <div className="mt-3 flex gap-2 items-stretch">
              <code className="flex-1 text-[11px] bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-2 break-all text-gray-800 dark:text-slate-200 font-mono leading-snug">
                {d.userId}
              </code>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(d.userId!)
                    setCopiouId(true)
                    setTimeout(() => setCopiouId(false), 2000)
                  } catch {
                    setCopiouId(false)
                  }
                }}
                className="shrink-0 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
              >
                {copiouId ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </section>
        )}

        <section className="rounded-2xl bg-emerald-900/5 border border-emerald-100 p-4 mt-4">
          <p className="text-xs font-semibold text-emerald-900">Dica</p>
          <p className="text-xs text-gray-600 dark:text-slate-400 mt-1 leading-relaxed">
            Mantenha <strong>categorias</strong> e <strong>serviços</strong> atualizados e responda solicitações em até 24 h
            para melhorar sua reputação quando o módulo de avaliações estiver ativo.
          </p>
        </section>
      </div>
    </main>
  )
}
