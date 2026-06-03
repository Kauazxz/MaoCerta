'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { iconeCategoria } from '@/lib/categorias-ui'
import { formatarRelativoPt } from '@/lib/formatar-data'
import { obterLimitesPlano, nomePlano, formatarLimite } from '@/lib/plano-limites'
import { useRealtimeRefresh } from '@/lib/realtime'

type Categoria = { id: number; nome: string }
type Demanda = {
  id: string
  titulo: string
  descricao: string
  status: string
  created_at?: string
  qtdPropostas?: number
}

const MODELOS_TITULO = [
  'Reforma de banheiro completa',
  'Instalar 3 tomadas 220V na garagem',
  'Limpeza profunda antes de mudança',
  'Montar guarda-roupa 6 portas',
  'Manutenção em 2 ar-condicionado split',
]

export default function ClienteDemandasScreen() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [categoriaId, setCategoriaId] = useState<number | ''>('')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [buscaCat, setBuscaCat] = useState('')
  const [plano, setPlano] = useState<string>('free')
  const [tick, setTick] = useState(0)

  const limites = useMemo(() => obterLimitesPlano(plano), [plano])
  const ativas = useMemo(
    () => demandas.filter((d) => d.status === 'aberta' || d.status === 'em_andamento'),
    [demandas],
  )
  const podePublicar = limites.podePublicarDemanda
  const atingiuLimite = !podePublicar || ativas.length >= limites.maxDemandasAtivas

  const categoriasFiltradas = useMemo(() => {
    const q = buscaCat.trim().toLowerCase()
    if (!q) return categorias
    return categorias.filter((c) => c.nome.toLowerCase().includes(q))
  }, [categorias, buscaCat])

  const destaques = useMemo(() => categorias.slice(0, 10), [categorias])

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()
      const { data: categoriasData } = await supabase.from('categorias').select('id, nome').order('nome')
      setCategorias((categoriasData as Categoria[] | null) || [])

      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return

      const [demRes, perfilRes] = await Promise.all([
        supabase
          .from('demandas')
          .select('id, titulo, descricao, status, created_at, propostas(count)')
          .eq('cliente_id', auth.user.id)
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('plano').eq('id', auth.user.id).maybeSingle(),
      ])
      type DemandaRaw = { id: string; titulo: string; descricao: string; status: string; created_at?: string; propostas?: { count: number }[] }
      const lista = ((demRes.data as DemandaRaw[] | null) || []).map((d) => ({
        id: d.id,
        titulo: d.titulo,
        descricao: d.descricao,
        status: d.status,
        created_at: d.created_at,
        qtdPropostas: d.propostas?.[0]?.count ?? 0,
      }))
      setDemandas(lista)
      setPlano((perfilRes.data?.plano as string) || 'free')
    }
    carregar()
  }, [tick])

  // Realtime: qualquer mudanca em demandas ou propostas re-carrega a lista
  useRealtimeRefresh('demandas', () => setTick((n) => n + 1), { key: 'cli-demandas' })
  useRealtimeRefresh('propostas', () => setTick((n) => n + 1), { key: 'cli-demandas-prop' })

  async function publicarDemanda(e: FormEvent) {
    e.preventDefault()
    if (!titulo.trim() || !descricao.trim() || !categoriaId) return
    if (!podePublicar) {
      setAviso(`O plano ${nomePlano(plano)} não permite publicar demandas. Faça upgrade para Básico ou Premium.`)
      return
    }
    if (atingiuLimite) {
      setAviso(
        `Seu plano ${nomePlano(plano)} permite até ${formatarLimite(limites.maxDemandasAtivas)} demanda(s) ativa(s). Conclua, cancele ou faça upgrade.`,
      )
      return
    }
    setAviso(null)
    setSalvando(true)

    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user
    if (!user) {
      setSalvando(false)
      return
    }

    const { data, error } = await supabase
      .from('demandas')
      .insert({
        cliente_id: user.id,
        categoria_id: categoriaId,
        titulo: titulo.trim(),
        descricao: descricao.trim(),
      })
      .select('id, titulo, descricao, status, created_at')
      .single()

    setSalvando(false)
    if (error) {
      setAviso('Falha ao publicar demanda.')
      return
    }

    setDemandas((atual) => [data as Demanda, ...atual])
    setTitulo('')
    setDescricao('')
    setCategoriaId('')
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-50/40 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 pb-10">
      <header className="min-h-[200px] flex items-end bg-gradient-to-br from-purple-700 via-indigo-600 to-blue-600 text-white px-4 pt-8 pb-12 rounded-b-[2rem] shadow-lg">
        <div className="max-w-lg mx-auto space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Cliente</p>
          <h1 className="text-2xl font-bold">Suas demandas</h1>
          <p className="text-sm text-white/88">
            Descreva o que precisa com calma: profissionais da categoria vão aceitar pra abrir um atendimento.
          </p>
          <div className="flex items-center justify-between gap-2 bg-white/15 rounded-2xl px-3 py-2 backdrop-blur-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/65">Plano {nomePlano(plano)}</p>
              <p className="text-sm font-bold">
                {!podePublicar
                  ? 'Não publica demanda'
                  : `${ativas.length} de ${
                      formatarLimite(limites.maxDemandasAtivas)
                    } demanda(s) ativa(s)`}
              </p>
            </div>
            {atingiuLimite && (
              <Link
                href="/cliente/configuracoes/plano"
                className="text-[11px] font-bold bg-white dark:bg-slate-900 text-purple-700 px-3 py-1.5 rounded-xl hover:bg-purple-50"
              >
                Fazer upgrade
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 -mt-6 space-y-4 relative z-10">
        <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-md border border-gray-100 dark:border-slate-800 space-y-4">
          <h2 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Nova demanda pública</h2>

          <div>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-2">Atalho — categorias populares</p>
            <div className="flex flex-wrap gap-2">
              {destaques.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoriaId(cat.id)}
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${
                    categoriaId === cat.id
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow'
                      : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:border-indigo-300'
                  }`}
                >
                  <span>{iconeCategoria(cat.nome)}</span>
                  {cat.nome}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 text-sm">🔎</span>
            <input
              value={buscaCat}
              onChange={(e) => setBuscaCat(e.target.value)}
              placeholder="Buscar em todas as categorias..."
              className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
            />
          </div>

          <form onSubmit={publicarDemanda} className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600 dark:text-slate-400">Categoria</span>
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : '')}
                className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
              >
                <option value="">Selecione a categoria</option>
                {categoriasFiltradas.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nome}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span className="text-xs font-semibold text-gray-600 dark:text-slate-400">Ideias de título</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {MODELOS_TITULO.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTitulo(m)}
                    className="text-[10px] font-medium px-2 py-1 rounded-md bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-100"
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-gray-600 dark:text-slate-400">Título</span>
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Resumo em uma linha"
                className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600 dark:text-slate-400">Descrição</span>
              <textarea
                rows={4}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Local, urgência, materiais que você já tem, horários para visita, fotos se quiser descrever..."
                className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 resize-none"
              />
            </label>
            <button
              type="submit"
              disabled={salvando || atingiuLimite}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-3 rounded-xl text-sm font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {atingiuLimite
                ? `Limite do plano ${nomePlano(plano)} atingido`
                : salvando
                  ? 'Publicando...'
                  : 'Publicar demanda'}
            </button>
            {atingiuLimite && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                Você já tem {ativas.length} demanda(s) ativa(s). Conclua, cancele ou faça upgrade do plano para publicar mais.
              </p>
            )}
          </form>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-md border border-gray-100 dark:border-slate-800 space-y-3">
          <h2 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Minhas demandas</h2>
          {demandas.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-slate-400">Você ainda não publicou. Use os atalhos acima para ir mais rápido.</p>
          )}
          <ul className="space-y-3">
            {demandas.map((item) => (
              <Link
                key={item.id}
                href={`/cliente/demandas/${item.id}`}
                className="block rounded-xl border border-gray-100 dark:border-slate-800 p-4 bg-gradient-to-br from-white to-slate-50/80 dark:from-slate-800 dark:to-slate-900 hover:border-purple-200 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-gray-900 dark:text-slate-100 leading-snug">{item.titulo}</p>
                  <span
                    className={`text-[10px] font-bold uppercase shrink-0 px-2 py-0.5 rounded-full ${
                      item.status === 'aberta'
                        ? 'bg-emerald-50 text-emerald-800'
                        : item.status === 'em_andamento'
                          ? 'bg-blue-50 text-blue-800'
                          : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                    }`}
                  >
                    {item.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-2 leading-relaxed line-clamp-2">{item.descricao}</p>
                <div className="flex items-center justify-between gap-2 mt-3">
                  {item.created_at && (
                    <p className="text-[11px] text-gray-400 dark:text-slate-500">{formatarRelativoPt(item.created_at)}</p>
                  )}
                  <span className="text-[11px] font-semibold text-purple-700">
                    {item.qtdPropostas ?? 0} proposta{(item.qtdPropostas ?? 0) === 1 ? '' : 's'} ›
                  </span>
                </div>
              </Link>
            ))}
          </ul>
        </section>

        {aviso && <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 font-medium">{aviso}</p>}
      </div>
    </main>
  )
}
