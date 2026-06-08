'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useReputacaoBusca } from '@/lib/realtime/hooks'
import { iconeCategoria } from '@/lib/categorias-ui'
import PerfilModal from '@/screens/perfil/PerfilModal'
import CidadeEstadoSelect from '@/components/CidadeEstadoSelect'
import { obterLimitesPlano, nomePlano } from '@/lib/plano-limites'

type Categoria = { id: number; nome: string }

type CategoriaVinculo = { categoria: { id: number; nome: string } | null }

type Prestador = {
  id: string
  nome: string
  avatar_url: string | null
  cidade: string | null
  estado: string | null
  bio: string | null
  experiencia_anos: number | null
  created_at: string
  score_prioridade_busca?: number | null
  categorias: CategoriaVinculo[]
  notaMedia: number | null
  qtdAvaliacoes: number
  atendimentosConcluidos: number
}

function normalizar(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function categoriasPlanas(p: Prestador) {
  return p.categorias.map((c) => c.categoria).filter(Boolean) as { id: number; nome: string }[]
}

function localStr(p: { cidade: string | null; estado: string | null }) {
  return [p.cidade, p.estado].filter(Boolean).join(' - ')
}

function anosNaPlataforma(createdAt: string) {
  const t = new Date(createdAt).getTime()
  if (Number.isNaN(t)) return 'Na MaoCerta'
  const anos = (Date.now() - t) / (365.25 * 24 * 60 * 60 * 1000)
  if (anos < 0.25) return 'Chegou recentemente na MaoCerta'
  if (anos < 1) return 'Há alguns meses na MaoCerta'
  return `Há ${Math.floor(anos)} ano(s) na MaoCerta`
}

function dicaConfianca(p: Prestador) {
  if (p.notaMedia != null && p.notaMedia >= 4.5 && p.qtdAvaliacoes >= 3) {
    return { txt: 'Avaliações excelentes', destaque: true }
  }
  if (p.atendimentosConcluidos >= 15) {
    return { txt: 'Histórico forte de entregas', destaque: true }
  }
  if ((p.score_prioridade_busca ?? 0) >= 5) {
    return { txt: 'Destaque nas buscas', destaque: true }
  }
  return { txt: 'Combine prazos pelo chat', destaque: false }
}

export default function ClienteBuscarScreen() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [prestadores, setPrestadores] = useState<Prestador[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [categoriasPopulares, setCategoriasPopulares] = useState<{ id: number; nome: string; count: number }[]>([])
  const [minhaCidade, setMinhaCidade] = useState<string | null>(null)
  const [minhaUf, setMinhaUf] = useState<string | null>(null)
  const [bloqueados, setBloqueados] = useState<Set<string>>(new Set())

  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState<number | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<string | null>(null)
  const [filtroCidade, setFiltroCidade] = useState<string | null>(null)
  const [ordenacao, setOrdenacao] = useState<'relevancia' | 'avaliacao' | 'demandas' | 'recentes'>('relevancia')

  const [perfilAberto, setPerfilAberto] = useState<string | null>(null)
  const [solicitarPara, setSolicitarPara] = useState<Prestador | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: meu } = await supabase
        .from('profiles')
        .select('cidade, estado')
        .eq('id', user.id)
        .maybeSingle()
      setMinhaCidade(meu?.cidade || null)
      setMinhaUf(meu?.estado || null)
    }

    const [catRes, prestRes, avalRes, atendRes, blocRes] = await Promise.all([
      supabase.from('categorias').select('id, nome').order('nome'),
      supabase
        .from('profiles')
        .select(`
          id, nome, avatar_url, cidade, estado, bio, experiencia_anos, created_at, score_prioridade_busca,
          categorias:profissional_categorias ( categoria:categoria_id ( id, nome ) )
        `)
        .eq('tipo', 'profissional')
        .order('created_at', { ascending: false })
        .limit(150),
      supabase.from('avaliacoes').select('avaliado_id, nota, nota_qualidade, nota_prazo, nota_comunicacao').eq('moderacao_oculto', false),
      supabase.from('solicitacoes').select('profissional_id').eq('status', 'concluida'),
      user
        ? supabase.from('bloqueios').select('bloqueado_id').eq('bloqueador_id', user.id)
        : Promise.resolve({ data: [] }),
    ])

    if (prestRes.error) {
      setErro(`Não foi possível carregar prestadores: ${prestRes.error.message}`)
    }

    type PrestadorRaw = Omit<Prestador, 'notaMedia' | 'qtdAvaliacoes' | 'atendimentosConcluidos'>
    const rawList = ((prestRes.data as unknown as PrestadorRaw[]) || []).filter((p) => p.id !== user?.id)

    type AvalRow = { avaliado_id: string; nota: number; nota_qualidade?: number | null; nota_prazo?: number | null; nota_comunicacao?: number | null }
    const notasPorId: Record<string, number[]> = {}
    for (const a of (avalRes.data as AvalRow[]) || []) {
      const efetiva = (
        Number(a.nota_qualidade ?? a.nota) + Number(a.nota_prazo ?? a.nota) + Number(a.nota_comunicacao ?? a.nota)
      ) / 3
      ;(notasPorId[a.avaliado_id] ||= []).push(efetiva)
    }

    const atendPorId: Record<string, number> = {}
    for (const s of (atendRes.data as { profissional_id: string }[]) || []) {
      atendPorId[s.profissional_id] = (atendPorId[s.profissional_id] || 0) + 1
    }

    const blockedSet = new Set<string>(
      ((blocRes.data as { bloqueado_id: string }[] | null) || []).map((b) => b.bloqueado_id),
    )
    setBloqueados(blockedSet)

    const lista: Prestador[] = rawList
      .filter((p) => !blockedSet.has(p.id))
      .map((p) => {
        const notas = notasPorId[p.id] || []
        const media = notas.length > 0 ? notas.reduce((a, b) => a + b, 0) / notas.length : null
        return {
          ...p,
          notaMedia: media,
          qtdAvaliacoes: notas.length,
          atendimentosConcluidos: atendPorId[p.id] || 0,
          score_prioridade_busca: Number((p as PrestadorRaw & { score_prioridade_busca?: number }).score_prioridade_busca ?? 0),
        }
      })

    const counts: Record<number, { id: number; nome: string; count: number }> = {}
    for (const p of lista) {
      for (const c of categoriasPlanas(p)) {
        if (!counts[c.id]) counts[c.id] = { id: c.id, nome: c.nome, count: 0 }
        counts[c.id].count++
      }
    }
    const top = Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)

    setCategorias((catRes.data as Categoria[]) || [])
    setPrestadores(lista)
    setCategoriasPopulares(top)
    setCarregando(false)
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useReputacaoBusca(carregar)

  const temFiltroAtivo = !!(busca.trim() || filtroCategoria || filtroEstado || filtroCidade)

  const prestadoresFiltrados = useMemo(() => {
    const q = normalizar(busca)
    const cidadeFiltro = filtroCidade ? normalizar(filtroCidade) : ''
    const estadoFiltro = filtroEstado || ''

    let lista = prestadores.filter((p) => {
      if (filtroCategoria && !p.categorias.some((c) => c.categoria?.id === filtroCategoria)) return false
      if (estadoFiltro && (p.estado || '').toUpperCase() !== estadoFiltro) return false
      if (cidadeFiltro && !normalizar(p.cidade || '').includes(cidadeFiltro)) return false
      if (q) {
        const blob = normalizar(
          [p.nome, p.bio || '', p.cidade || '', p.estado || '', ...categoriasPlanas(p).map((c) => c.nome)].join(' '),
        )
        if (!blob.includes(q)) return false
      }
      return true
    })

    if (ordenacao === 'avaliacao') {
      lista = lista.slice().sort((a, b) => (b.notaMedia ?? -1) - (a.notaMedia ?? -1))
    } else if (ordenacao === 'demandas') {
      lista = lista.slice().sort((a, b) => b.atendimentosConcluidos - a.atendimentosConcluidos)
    } else if (ordenacao === 'recentes') {
      lista = lista.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))
    } else {
      const cidadeBase = normalizar(minhaCidade || '')
      lista = lista.slice().sort((a, b) => {
        const aMatch = cidadeBase && normalizar(a.cidade || '').includes(cidadeBase) ? 1 : 0
        const bMatch = cidadeBase && normalizar(b.cidade || '').includes(cidadeBase) ? 1 : 0
        if (aMatch !== bMatch) return bMatch - aMatch
        if (a.atendimentosConcluidos !== b.atendimentosConcluidos)
          return b.atendimentosConcluidos - a.atendimentosConcluidos
        const sa = a.score_prioridade_busca ?? 0
        const sb = b.score_prioridade_busca ?? 0
        if (sa !== sb) return sb - sa
        return (b.notaMedia ?? -1) - (a.notaMedia ?? -1)
      })
    }

    return lista
  }, [prestadores, busca, filtroCategoria, filtroEstado, filtroCidade, ordenacao, minhaCidade])

  const sugestoes = useMemo(() => prestadoresFiltrados.slice(0, 5), [prestadoresFiltrados])

  const pertoDeMim = useMemo(() => {
    if (!minhaCidade) return []
    const c = normalizar(minhaCidade)
    return prestadores.filter((p) => normalizar(p.cidade || '').includes(c)).slice(0, 5)
  }, [prestadores, minhaCidade])

  function limparFiltros() {
    setBusca('')
    setFiltroCategoria(null)
    setFiltroEstado(null)
    setFiltroCidade(null)
    setOrdenacao('relevancia')
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-50/40 via-white to-white dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 pb-10">
      <header className="min-h-[200px] flex items-end bg-gradient-to-br from-purple-700 via-indigo-600 to-blue-600 text-white px-4 pt-8 pb-12 rounded-b-[2rem] shadow-lg">
        <div className="max-w-lg mx-auto space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Encontre o profissional certo</p>
          <h1 className="text-2xl font-bold">Buscar prestadores</h1>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/55 text-sm">🔎</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, categoria ou descrição"
              className="w-full rounded-2xl bg-white/15 border border-white/25 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/55 focus:outline-none focus:ring-2 focus:ring-white/40"
            />
          </div>
          <select
            value={filtroCategoria ?? ''}
            onChange={(e) => setFiltroCategoria(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-2xl bg-white/15 border border-white/25 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            <option value="" className="bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100">
              Todas as categorias
            </option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100">
                {c.nome}
              </option>
            ))}
          </select>
          <CidadeEstadoSelect
            estado={filtroEstado}
            cidade={filtroCidade}
            onChange={({ estado, cidade }) => {
              setFiltroEstado(estado)
              setFiltroCidade(cidade)
            }}
            classeBaseInput="mt-1 w-full bg-white/15 border border-white/25 rounded-2xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
            rotuloEstado=""
            rotuloCidade=""
          />
          {temFiltroAtivo && (
            <button
              type="button"
              onClick={limparFiltros}
              className="text-xs font-semibold text-white/85 hover:text-white underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 -mt-6 space-y-5 relative z-10">
        {erro && <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-2xl p-3">{erro}</p>}

        {carregando && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow border border-gray-100 dark:border-slate-800 flex items-center gap-3">
            <span className="inline-block w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600 dark:text-slate-400">Carregando prestadores...</p>
          </div>
        )}

        {!carregando && (
          <>
            <section className="bg-white dark:bg-slate-900 rounded-2xl p-1 border border-gray-100 dark:border-slate-800 shadow-sm grid grid-cols-4 gap-1">
              <BotaoOrdem ativo={ordenacao === 'relevancia'} onClick={() => setOrdenacao('relevancia')}>Relevância</BotaoOrdem>
              <BotaoOrdem ativo={ordenacao === 'avaliacao'} onClick={() => setOrdenacao('avaliacao')}>★ Nota</BotaoOrdem>
              <BotaoOrdem ativo={ordenacao === 'demandas'} onClick={() => setOrdenacao('demandas')}>Demandas</BotaoOrdem>
              <BotaoOrdem ativo={ordenacao === 'recentes'} onClick={() => setOrdenacao('recentes')}>Recentes</BotaoOrdem>
            </section>

            {!temFiltroAtivo && (
              <>
                {categoriasPopulares.length > 0 && (
                  <Secao titulo="Categorias populares">
                    <div className="flex flex-wrap gap-2">
                      {categoriasPopulares.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setFiltroCategoria(c.id)}
                          className="bg-white dark:bg-slate-900 border border-purple-100 dark:border-purple-900/40 rounded-full px-3 py-1.5 text-xs font-semibold text-purple-800 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-slate-800 flex items-center gap-1.5 shadow-sm"
                        >
                          <span>{iconeCategoria(c.nome)}</span>
                          <span>{c.nome}</span>
                          <span className="text-[10px] text-purple-400 font-normal">({c.count})</span>
                        </button>
                      ))}
                    </div>
                  </Secao>
                )}

                {pertoDeMim.length > 0 && (
                  <Secao titulo={`Perto de você · ${minhaCidade}${minhaUf ? ' - ' + minhaUf : ''}`}>
                    <ListaPrestadores
                      prestadores={pertoDeMim}
                      onVerPerfil={setPerfilAberto}
                      onSolicitar={setSolicitarPara}
                    />
                  </Secao>
                )}
              </>
            )}

            <Secao titulo={temFiltroAtivo ? `${prestadoresFiltrados.length} resultado(s)` : 'Todos os prestadores'}>
              {prestadoresFiltrados.length > 0 ? (
                <ListaPrestadores
                  prestadores={prestadoresFiltrados}
                  onVerPerfil={setPerfilAberto}
                  onSolicitar={setSolicitarPara}
                />
              ) : temFiltroAtivo ? (
                <>
                  <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm text-center space-y-2">
                    <p className="text-4xl">🤷</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">Nenhum prestador encontrado</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
                      Tente trocar a categoria, mudar a cidade ou usar termos mais gerais.
                    </p>
                  </section>
                  {sugestoes.length > 0 && (
                    <Secao titulo="Talvez você se interesse">
                      <ListaPrestadores
                        prestadores={sugestoes}
                        onVerPerfil={setPerfilAberto}
                        onSolicitar={setSolicitarPara}
                      />
                    </Secao>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-400 dark:text-slate-500 px-1">Sem prestadores cadastrados ainda.</p>
              )}
            </Secao>
          </>
        )}

        {bloqueados.size > 0 && (
          <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center px-4">
            {bloqueados.size} prestador(es) bloqueado(s) por você não aparecem aqui.
          </p>
        )}
      </div>

      <PerfilModal
        perfilId={perfilAberto || ''}
        aberto={!!perfilAberto}
        onFechar={() => setPerfilAberto(null)}
        rotulo="Prestador"
      />

      {solicitarPara && (
        <SolicitarServicoModal prestador={solicitarPara} onFechar={() => setSolicitarPara(null)} />
      )}
    </main>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest px-1">{titulo}</h2>
      {children}
    </section>
  )
}

function BotaoOrdem({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] font-semibold py-2 rounded-xl transition-colors ${
        ativo ? 'bg-purple-700 text-white' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 dark:bg-slate-800'
      }`}
    >
      {children}
    </button>
  )
}

function ListaPrestadores({
  prestadores,
  onVerPerfil,
  onSolicitar,
}: {
  prestadores: Prestador[]
  onVerPerfil: (id: string) => void
  onSolicitar: (p: Prestador) => void
}) {
  return (
    <ul className="space-y-2">
      {prestadores.map((p) => (
        <CardPrestador
          key={p.id}
          prestador={p}
          onVerPerfil={() => onVerPerfil(p.id)}
          onSolicitar={() => onSolicitar(p)}
        />
      ))}
    </ul>
  )
}

function CardPrestador({
  prestador,
  onVerPerfil,
  onSolicitar,
}: {
  prestador: Prestador
  onVerPerfil: () => void
  onSolicitar: () => void
}) {
  const cats = categoriasPlanas(prestador)
  const principal = cats[0]

  return (
    <li className="bg-white dark:bg-slate-900/90 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="p-4 flex gap-3">
        <div className="w-14 h-14 shrink-0 rounded-full bg-gradient-to-br from-purple-200 to-indigo-200 flex items-center justify-center text-base font-bold text-purple-900 overflow-hidden">
          {prestador.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={prestador.avatar_url} alt={prestador.nome} className="w-full h-full object-cover" />
          ) : (
            <span>{(prestador.nome || '?').slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{prestador.nome}</p>
          {principal && (
            <p className="text-[11px] text-purple-700 font-semibold truncate">
              {iconeCategoria(principal.nome)} {principal.nome}
              {cats.length > 1 && <span className="text-gray-400 dark:text-slate-500 font-normal"> +{cats.length - 1}</span>}
            </p>
          )}
          <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-slate-400 flex-wrap">
            {(prestador.cidade || prestador.estado) && <span>📍 {localStr(prestador)}</span>}
            <span className="text-amber-500">
              ★{' '}
              {prestador.notaMedia != null ? (
                <span className="text-gray-700 dark:text-slate-300 font-semibold">{prestador.notaMedia.toFixed(1)}</span>
              ) : (
                <span className="text-gray-400 dark:text-slate-500">novo</span>
              )}
              {prestador.notaMedia != null && prestador.notaMedia >= 4.5 && prestador.qtdAvaliacoes >= 5 && (
                <span className="ml-1 text-[9px] font-bold uppercase text-amber-900 bg-amber-100 px-1 rounded">
                  Top
                </span>
              )}
            </span>
            <span className="text-emerald-700">{prestador.atendimentosConcluidos} ✓</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {anosNaPlataforma(prestador.created_at)}
            </span>
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900/50">
              {prestador.atendimentosConcluidos} trabalho(s) concluído(s) na plataforma
            </span>
            {(() => {
              const d = dicaConfianca(prestador)
              return (
                <span
                  className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${
                    d.destaque
                      ? 'bg-violet-100 dark:bg-violet-950/50 text-violet-900 dark:text-violet-200 border-violet-200 dark:border-violet-800'
                      : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700'
                  }`}
                >
                  {d.txt}
                </span>
              )
            })()}
          </div>
        </div>
      </div>
      <div className="flex border-t border-gray-100 dark:border-slate-800">
        <button
          type="button"
          onClick={onVerPerfil}
          className="flex-1 text-xs font-semibold py-3 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 dark:bg-slate-800"
        >
          Ver perfil
        </button>
        <span className="w-px bg-gray-100 dark:bg-slate-800" />
        <button
          type="button"
          onClick={onSolicitar}
          className="flex-1 text-xs font-bold py-3 text-purple-700 hover:bg-purple-50"
        >
          Solicitar serviço
        </button>
      </div>
    </li>
  )
}

function SolicitarServicoModal({
  prestador,
  onFechar,
}: {
  prestador: Prestador
  onFechar: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!titulo.trim() || !descricao.trim() || enviando) return
    setEnviando(true)
    setAviso(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setAviso({ tipo: 'erro', texto: 'Faça login pra enviar a solicitação.' })
      setEnviando(false)
      return
    }

    // RF27 — limite de negociações fora da demanda
    const { data: meu } = await supabase.from('profiles').select('plano').eq('id', user.id).maybeSingle()
    const limites = obterLimitesPlano(meu?.plano as string | undefined)
    const { count } = await supabase
      .from('solicitacoes')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', user.id)
      .is('demanda_origem_id', null)
      .in('status', ['pendente', 'aceita', 'em_andamento'])
    if ((count ?? 0) >= limites.maxNegociacoesForaDemanda) {
      setEnviando(false)
      setAviso({
        tipo: 'erro',
        texto: `Você já tem ${count} negociação(ões) ativa(s) fora de demanda. Limite do plano ${nomePlano(meu?.plano)}: ${limites.maxNegociacoesForaDemanda}.`,
      })
      return
    }

    const { error } = await supabase.from('solicitacoes').insert({
      cliente_id: user.id,
      profissional_id: prestador.id,
      titulo: titulo.trim(),
      descricao: descricao.trim(),
    })
    setEnviando(false)
    if (error) {
      setAviso({ tipo: 'erro', texto: `Falha: ${error.message}` })
      return
    }
    setAviso({ tipo: 'ok', texto: 'Solicitação enviada. O prestador vai responder em Pedidos.' })
    setTitulo('')
    setDescricao('')
    setTimeout(onFechar, 1400)
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onFechar}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 dark:border-slate-800 px-4 py-3 flex items-center justify-between rounded-t-3xl">
          <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Solicitar serviço</p>
          <button
            type="button"
            onClick={onFechar}
            className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 dark:bg-slate-800 flex items-center justify-center text-gray-500 dark:text-slate-400"
          >
            ✕
          </button>
        </div>

        <form onSubmit={enviar} className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-base font-bold text-purple-900 overflow-hidden">
              {prestador.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={prestador.avatar_url} alt={prestador.nome} className="w-full h-full object-cover" />
              ) : (
                <span>{prestador.nome.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-slate-400">Para</p>
              <p className="text-sm font-bold text-gray-900 dark:text-slate-100">{prestador.nome}</p>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide">Título</span>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Trocar resistência do chuveiro"
              required
              maxLength={120}
              className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide">Descrição</span>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva o problema, materiais, preferência de horário..."
              required
              rows={4}
              className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            />
          </label>

          {aviso && (
            <p
              className={`text-xs rounded-2xl p-3 font-medium ${
                aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {aviso.texto}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full bg-purple-700 text-white font-semibold py-3 rounded-2xl text-sm hover:bg-purple-800 disabled:opacity-50"
          >
            {enviando ? 'Enviando...' : 'Enviar solicitação'}
          </button>
        </form>
      </div>
    </div>
  )
}
