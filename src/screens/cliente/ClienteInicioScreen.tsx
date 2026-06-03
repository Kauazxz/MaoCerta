'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { iconeCategoria } from '@/lib/categorias-ui'
import { formatarRelativoPt } from '@/lib/formatar-data'
import { useDemandasCliente, useSolicitacoesCliente, usePropostasCliente } from '@/lib/realtime/hooks'
import OnboardingChecklist from '@/components/onboarding/OnboardingChecklist'

type Resumo = {
  userId: string | null
  nome: string
  avatarUrl: string | null
  cidade: string | null
  nAtivas: number
  nConcluidas: number
  nDemandas: number
}

type SolicitacaoItem = {
  id: string
  titulo: string
  status: string
  updated_at: string
  profissional: { id: string; nome: string; avatar_url: string | null } | null
}


type CategoriaContratada = { categoria_id: number; nome: string; count: number }

type PrestadorRecomendado = {
  id: string
  nome: string
  avatar_url: string | null
  cidade: string | null
  categoriaPrincipal?: string
}

const resumoVazio: Resumo = {
  userId: null,
  nome: '',
  avatarUrl: null,
  cidade: null,
  nAtivas: 0,
  nConcluidas: 0,
  nDemandas: 0,
}

function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

function badgeStatus(status: string) {
  switch (status) {
    case 'aceita':
      return { label: 'Aceito', className: 'bg-emerald-100 text-emerald-800' }
    case 'em_andamento':
      return { label: 'Em andamento', className: 'bg-blue-100 text-blue-800' }
    case 'pendente':
      return { label: 'Aguardando', className: 'bg-amber-100 text-amber-900' }
    default:
      return { label: status, className: 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300' }
  }
}

export default function ClienteInicioScreen() {
  const [carregando, setCarregando] = useState(true)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [ativas, setAtivas] = useState<SolicitacaoItem[]>([])
  const [historico, setHistorico] = useState<SolicitacaoItem[]>([])
  const [recomendados, setRecomendados] = useState<PrestadorRecomendado[]>([])
  const [categoriasMinhas, setCategoriasMinhas] = useState<CategoriaContratada[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    carregar()
  }, [])

  // Realtime: contadores e listas atualizam quando algo da minha conta muda
  useDemandasCliente(userId, () => void carregar())
  useSolicitacoesCliente(userId, () => void carregar())
  usePropostasCliente(() => void carregar())

  async function carregar() {
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user

    if (!user) {
      setResumo({ ...resumoVazio, nome: 'Cliente' })
      setCarregando(false)
      return
    }

    const [perfilRes, solRes, demRes, prestRes, catRes] = await Promise.all([
      supabase.from('profiles').select('nome, avatar_url, cidade').eq('id', user.id).maybeSingle(),
      supabase
        .from('solicitacoes')
        .select(`
          id, titulo, status, updated_at,
          profissional:profissional_id ( id, nome, avatar_url )
        `)
        .eq('cliente_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(20),
      supabase.from('demandas').select('id', { count: 'exact', head: true }).eq('cliente_id', user.id),
      supabase
        .from('profiles')
        .select(`
          id, nome, avatar_url, cidade,
          categorias:profissional_categorias ( categoria:categoria_id ( id, nome ) )
        `)
        .eq('tipo', 'profissional')
        .neq('id', user.id)
        .order('created_at', { ascending: false })
        .limit(60),
      supabase.from('categorias').select('id, nome'),
    ])

    const p = perfilRes.data
    const todasSol = ((solRes.data as unknown as SolicitacaoItem[]) || [])
    const ativasLista = todasSol.filter((s) => s.status === 'aceita' || s.status === 'em_andamento' || s.status === 'pendente').slice(0, 5)
    const histLista = todasSol.filter((s) => s.status === 'concluida' || s.status === 'cancelada').slice(0, 5)

    // categorias contratadas pelo cliente (a partir do histórico) — usado pra recomendar
    const idsPrestContratados = new Set<string>(
      todasSol
        .map((s) => s.profissional?.id)
        .filter((id): id is string => !!id),
    )

    type PrestadorRaw = {
      id: string
      nome: string
      avatar_url: string | null
      cidade: string | null
      categorias: { categoria: { id: number; nome: string } | null }[]
    }
    const todosPrestadores = (prestRes.data as unknown as PrestadorRaw[]) || []

    // categorias que o cliente já contratou
    const idCatContratadas = new Set<number>()
    for (const pr of todosPrestadores) {
      if (idsPrestContratados.has(pr.id)) {
        for (const c of pr.categorias) {
          if (c.categoria) idCatContratadas.add(c.categoria.id)
        }
      }
    }
    const minhasCats: CategoriaContratada[] = Array.from(idCatContratadas)
      .map((id) => {
        const cat = (catRes.data as { id: number; nome: string }[] | null)?.find((c) => c.id === id)
        return cat ? { categoria_id: id, nome: cat.nome, count: 1 } : null
      })
      .filter(Boolean) as CategoriaContratada[]

    // Recomendações: prestadores que cobrem categorias já contratadas (e não são quem ele já contratou)
    let recomendacoes: PrestadorRecomendado[] = []
    if (idCatContratadas.size > 0) {
      recomendacoes = todosPrestadores
        .filter((pr) => !idsPrestContratados.has(pr.id))
        .filter((pr) => pr.categorias.some((c) => c.categoria && idCatContratadas.has(c.categoria.id)))
        .slice(0, 4)
        .map((pr) => ({
          id: pr.id,
          nome: pr.nome,
          avatar_url: pr.avatar_url,
          cidade: pr.cidade,
          categoriaPrincipal: pr.categorias[0]?.categoria?.nome,
        }))
    }
    // Sem histórico ou sem suficientes → fallback pra ativos recentes
    if (recomendacoes.length < 4) {
      const faltam = 4 - recomendacoes.length
      const idsJa = new Set(recomendacoes.map((r) => r.id))
      const fallback = todosPrestadores
        .filter((pr) => !idsJa.has(pr.id) && !idsPrestContratados.has(pr.id))
        .slice(0, faltam)
        .map((pr) => ({
          id: pr.id,
          nome: pr.nome,
          avatar_url: pr.avatar_url,
          cidade: pr.cidade,
          categoriaPrincipal: pr.categorias[0]?.categoria?.nome,
        }))
      recomendacoes = [...recomendacoes, ...fallback]
    }

    setUserId(user.id)
    setResumo({
      userId: user.id,
      nome: p?.nome || (user.user_metadata as { nome?: string })?.nome || user.email?.split('@')[0] || 'Cliente',
      avatarUrl: p?.avatar_url || null,
      cidade: p?.cidade || null,
      nAtivas: ativasLista.length,
      nConcluidas: histLista.filter((s) => s.status === 'concluida').length,
      nDemandas: demRes.count ?? 0,
    })
    setAtivas(ativasLista)
    setHistorico(histLista)
    setRecomendados(recomendacoes)
    setCategoriasMinhas(minhasCats)
    setCarregando(false)
  }

  const r = resumo
  const d = r ?? resumoVazio

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-purple-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 pb-12">
      <div className="min-h-[200px] flex items-end bg-gradient-to-br from-purple-700 via-indigo-600 to-blue-600 text-white px-4 pt-8 pb-12 rounded-b-[2rem] shadow-lg">
        <div className="max-w-lg mx-auto space-y-4">
          {carregando && (
            <div className="flex items-center gap-4 animate-pulse">
              <div className="w-16 h-16 rounded-2xl bg-white/20" />
              <div className="flex-1 space-y-2">
                <div className="h-5 bg-white/20 rounded w-40" />
                <div className="h-3 bg-white/15 rounded w-24" />
              </div>
            </div>
          )}

          {!carregando && r && (
            <>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl ring-4 ring-white/25 shadow-lg overflow-hidden bg-white/10 flex items-center justify-center text-xl font-bold">
                  {r.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span>{iniciais(r.nome) || '👋'}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Olá,</p>
                  <h1 className="text-xl font-bold leading-tight truncate">{r.nome.split(' ')[0]}</h1>
                  {r.cidade && (
                    <p className="text-xs text-white/80 mt-0.5">📍 {r.cidade}</p>
                  )}
                </div>
              </div>

              <Link
                href="/cliente/buscar"
                className="block bg-white dark:bg-slate-900 rounded-2xl px-4 py-3 shadow-lg hover:shadow-xl transition-shadow"
              >
                <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">Comece por aqui</p>
                <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mt-0.5">O que você precisa hoje?</p>
                <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">🔎 Buscar prestadores · filtros · localização</p>
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-8 space-y-5 relative z-10">
        {/* Stats curtos */}
        <section className="grid grid-cols-3 gap-2">
          <CardStat valor={d.nAtivas} label="Ativas" cor="text-emerald-700" carregando={carregando} />
          <CardStat valor={d.nConcluidas} label="Concluídas" cor="text-blue-700" carregando={carregando} />
          <CardStat valor={d.nDemandas} label="Demandas" cor="text-violet-700" carregando={carregando} />
        </section>

        {!carregando && r?.userId && (
          <OnboardingChecklist
            variant="cliente"
            perfilCompleto={!!(r.cidade && r.nome && r.nome.length > 1)}
            temDemanda={r.nDemandas > 0}
            temAtendimento={r.nAtivas + r.nConcluidas > 0}
          />
        )}

        {/* Solicitações em andamento */}
        <Secao titulo="Suas solicitações em andamento" linkVerTodos="/cliente/atendimentos">
          {carregando && <PlaceholderCard />}
          {!carregando && ativas.length === 0 && (
            <CardVazio
              emoji="🤝"
              titulo="Nada em andamento"
              texto="Quando algum prestador aceitar uma demanda ou solicitação sua, aparece aqui."
            />
          )}
          {!carregando && ativas.length > 0 && (
            <ul className="space-y-2">
              {ativas.map((s) => {
                const badge = badgeStatus(s.status)
                const prest = s.profissional
                return (
                  <Link
                    key={s.id}
                    href={`/cliente/atendimentos/${s.id}`}
                    className="block bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm p-4 hover:border-purple-200 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-200 to-indigo-200 flex items-center justify-center text-sm font-bold text-purple-900 overflow-hidden">
                        {prest?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={prest.avatar_url} alt={prest.nome} className="w-full h-full object-cover" />
                        ) : (
                          (prest?.nome || '?').slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{s.titulo}</p>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${badge.className}`}>
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                          {prest ? prest.nome : 'Aguardando prestador'} · {formatarRelativoPt(s.updated_at)}
                        </p>
                      </div>
                      <span className="text-purple-600 text-sm">›</span>
                    </div>
                  </Link>
                )
              })}
            </ul>
          )}
        </Secao>

        {/* Prestadores recomendados */}
        <Secao titulo="Prestadores recomendados pra você" linkVerTodos="/cliente/buscar">
          {carregando && <PlaceholderCard />}
          {!carregando && recomendados.length === 0 && (
            <CardVazio emoji="👀" titulo="Sem recomendações ainda" texto="Faça sua primeira busca pra a gente entender seu perfil." />
          )}
          {!carregando && recomendados.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {recomendados.map((p) => (
                <Link
                  key={p.id}
                  href="/cliente/buscar"
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm p-3 hover:border-purple-200 flex flex-col items-center text-center"
                >
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-200 to-indigo-200 flex items-center justify-center text-base font-bold text-purple-900 overflow-hidden mb-2">
                    {p.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatar_url} alt={p.nome} className="w-full h-full object-cover" />
                    ) : (
                      <span>{p.nome.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate w-full">{p.nome}</p>
                  {p.categoriaPrincipal && (
                    <p className="text-[10px] text-purple-700 font-semibold mt-0.5 truncate w-full">
                      {iconeCategoria(p.categoriaPrincipal)} {p.categoriaPrincipal}
                    </p>
                  )}
                  {p.cidade && (
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 truncate w-full">📍 {p.cidade}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </Secao>

        {/* Categorias minhas */}
        {!carregando && categoriasMinhas.length > 0 && (
          <Secao titulo="Categorias que você já contratou">
            <div className="flex flex-wrap gap-2">
              {categoriasMinhas.map((c) => (
                <Link
                  key={c.categoria_id}
                  href="/cliente/buscar"
                  className="bg-purple-50 border border-purple-200 rounded-full px-3 py-1.5 text-xs font-semibold text-purple-800 hover:bg-purple-100 flex items-center gap-1.5"
                >
                  <span>{iconeCategoria(c.nome)}</span>
                  <span>{c.nome}</span>
                </Link>
              ))}
            </div>
          </Secao>
        )}

        {/* Histórico recente */}
        {!carregando && historico.length > 0 && (
          <Secao titulo="Atendimentos recentes" linkVerTodos="/cliente/atendimentos">
            <ul className="space-y-2">
              {historico.map((s) => {
                const concluida = s.status === 'concluida'
                return (
                  <Link
                    key={s.id}
                    href={`/cliente/atendimentos/${s.id}`}
                    className="block bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm p-4 hover:border-purple-200"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-lg ${concluida ? 'text-emerald-600' : 'text-red-600'}`}>
                        {concluida ? '✅' : '✖️'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{s.titulo}</p>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400">
                          {s.profissional?.nome || 'Sem prestador'} · {formatarRelativoPt(s.updated_at)}
                        </p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </ul>
          </Secao>
        )}

        {/* Atalhos de fim */}
        <section className="grid grid-cols-2 gap-2 pt-2">
          <Atalho href="/cliente/demandas" icone="📋" titulo="Minhas demandas" descricao="Pedidos abertos para todos os prestadores" />
          <Atalho href="/cliente/atendimentos" icone="🤝" titulo="Atendimentos" descricao="Conversas em andamento" />
        </section>
      </div>
    </main>
  )
}

function Secao({
  titulo,
  linkVerTodos,
  children,
}: {
  titulo: string
  linkVerTodos?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest">{titulo}</h2>
        {linkVerTodos && (
          <Link href={linkVerTodos} className="text-[11px] font-semibold text-purple-700 hover:text-purple-900">
            Ver todos ›
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function CardStat({
  valor,
  label,
  cor,
  carregando,
}: {
  valor: number
  label: string
  cor: string
  carregando: boolean
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-md border border-gray-100 dark:bg-slate-900/80 dark:border-slate-800 text-center">
      <p className={`text-2xl font-bold ${cor}`}>{carregando ? '—' : valor}</p>
      <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mt-1">{label}</p>
    </div>
  )
}

function CardVazio({ emoji, titulo, texto }: { emoji: string; titulo: string; texto: string }) {
  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-gray-100 dark:border-slate-800 shadow-sm text-center space-y-1">
      <p className="text-3xl">{emoji}</p>
      <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">{titulo}</p>
      <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">{texto}</p>
    </section>
  )
}

function PlaceholderCard() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-800 animate-pulse">
      <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-32" />
      <div className="h-3 bg-gray-100 dark:bg-slate-800 rounded w-48 mt-2" />
    </div>
  )
}

function Atalho({
  href,
  icone,
  titulo,
  descricao,
}: {
  href: string
  icone: string
  titulo: string
  descricao: string
}) {
  return (
    <Link
      href={href}
      className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 shadow-sm hover:border-purple-200 hover:shadow-md transition-all"
    >
      <span className="text-2xl">{icone}</span>
      <p className="text-sm font-bold text-gray-900 dark:text-slate-100 mt-2">{titulo}</p>
      <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 leading-tight">{descricao}</p>
    </Link>
  )
}
