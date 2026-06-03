'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { iconeCategoria } from '@/lib/categorias-ui'
import { nomePlano, obterLimitesPlano } from '@/lib/plano-limites'

type Categoria = { id: number; nome: string }
type Servico = { id: string; descricao: string; categoria_id: number; valor_hora: number | null }

const DICAS_SERVICO = [
  'Instalação residencial com garantia',
  'Orçamento sem compromisso com visita técnica',
  'Atendimento em horário comercial e fins de semana',
  'Materiais de primeira linha ou à combinar',
  'Equipe com EPI e nota fiscal',
]

export default function ProfissionalServicosScreen() {
  const [plano, setPlano] = useState('free')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [buscaCat, setBuscaCat] = useState('')
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<number[]>([])
  const [servicos, setServicos] = useState<Servico[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const [categoriaId, setCategoriaId] = useState<number | ''>('')
  const [descricao, setDescricao] = useState('')
  const [valorHora, setValorHora] = useState('')
  const limites = useMemo(() => obterLimitesPlano(plano), [plano])

  const categoriasVisiveis = useMemo(() => {
    const q = buscaCat.trim().toLowerCase()
    if (!q) return categorias
    return categorias.filter((c) => c.nome.toLowerCase().includes(q))
  }, [categorias, buscaCat])

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()
      const { data: auth } = await supabase.auth.getUser()
      const user = auth.user

      const { data: categoriasData } = await supabase.from('categorias').select('id, nome').order('nome')
      setCategorias((categoriasData as Categoria[] | null) || [])

      if (!user) {
        setCarregando(false)
        return
      }

      const { data: perfil } = await supabase.from('profiles').select('plano').eq('id', user.id).maybeSingle()
      setPlano(perfil?.plano || 'free')

      const { data: categoriasProf } = await supabase
        .from('profissional_categorias')
        .select('categoria_id')
        .eq('profissional_id', user.id)
      setCategoriasSelecionadas((categoriasProf || []).map((c: { categoria_id: number }) => c.categoria_id))

      const { data: servicosData } = await supabase
        .from('servicos')
        .select('id, descricao, categoria_id, valor_hora')
        .eq('profissional_id', user.id)
        .order('created_at', { ascending: false })
      setServicos((servicosData as Servico[] | null) || [])
      setCarregando(false)
    }

    carregar()
  }, [])

  async function alternarCategoria(catId: number) {
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user
    if (!user) return

    const jaTem = categoriasSelecionadas.includes(catId)
    if (!jaTem && categoriasSelecionadas.length >= limites.maxCategorias) {
      setAviso(`Seu plano ${nomePlano(plano)} permite até ${limites.maxCategorias} categorias.`)
      return
    }

    setAviso(null)
    if (jaTem) {
      await supabase
        .from('profissional_categorias')
        .delete()
        .eq('profissional_id', user.id)
        .eq('categoria_id', catId)
      setCategoriasSelecionadas((atual) => atual.filter((id) => id !== catId))
      return
    }

    const { error } = await supabase.from('profissional_categorias').insert({ profissional_id: user.id, categoria_id: catId })
    if (error) {
      setAviso('Não foi possível salvar a categoria. Verifique se a migration foi aplicada.')
      return
    }
    setCategoriasSelecionadas((atual) => [...atual, catId])
  }

  async function criarServico(e: FormEvent) {
    e.preventDefault()
    setAviso(null)
    if (!categoriaId || !descricao.trim()) return
    if (servicos.length >= limites.maxServicos) {
      setAviso(`Seu plano ${nomePlano(plano)} permite até ${limites.maxServicos} serviços.`)
      return
    }

    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user
    if (!user) return

    setSalvando(true)
    const valor = valorHora.trim() ? Number(valorHora.replace(',', '.')) : null
    const { data, error } = await supabase
      .from('servicos')
      .insert({
        profissional_id: user.id,
        categoria_id: categoriaId,
        descricao: descricao.trim(),
        valor_hora: Number.isFinite(valor as number) ? valor : null,
      })
      .select('id, descricao, categoria_id, valor_hora')
      .single()

    setSalvando(false)

    if (error) {
      setAviso('Não foi possível criar o serviço.')
      return
    }

    setServicos((atual) => [data as Servico, ...atual])
    setDescricao('')
    setValorHora('')
    setCategoriaId('')
  }

  async function removerServico(id: string) {
    const supabase = createClient()
    const { error } = await supabase.from('servicos').delete().eq('id', id)
    if (error) {
      setAviso('Não foi possível remover este serviço.')
      return
    }
    setServicos((atual) => atual.filter((item) => item.id !== id))
  }

  function nomeCategoria(id: number) {
    return categorias.find((c) => c.id === id)?.nome || 'Categoria'
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-950 pb-10">
      <header className="min-h-[200px] flex items-end bg-gradient-to-br from-emerald-700 via-teal-600 to-cyan-600 text-white px-4 pt-8 pb-12 rounded-b-[2rem] shadow-lg">
        <div className="max-w-lg mx-auto space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Seu negócio</p>
          <h1 className="text-2xl font-bold">Categorias e serviços</h1>
          <p className="text-sm text-white/85">
            Mostre onde você atua e o que oferece. Plano atual:{' '}
            <span className="font-bold text-white">{nomePlano(plano)}</span> — até {limites.maxCategorias}{' '}
            categorias e {limites.maxServicos} serviços.
          </p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 -mt-6 space-y-4 relative z-10">
        <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-md border border-gray-100 dark:border-slate-800 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Áreas de atuação</h2>
              <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
                Selecionadas {categoriasSelecionadas.length}/{limites.maxCategorias} — clientes filtram por estas áreas.
              </p>
            </div>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 text-sm">🔎</span>
            <input
              value={buscaCat}
              onChange={(e) => setBuscaCat(e.target.value)}
              placeholder="Filtrar categorias..."
              className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
            />
          </div>
          <div className="max-h-56 overflow-y-auto pr-1 flex flex-wrap gap-2">
            {categoriasVisiveis.map((cat) => {
              const ativo = categoriasSelecionadas.includes(cat.id)
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => alternarCategoria(cat.id)}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-all ${
                    ativo
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 border-transparent text-white shadow-md'
                      : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:border-emerald-300'
                  }`}
                >
                  <span>{iconeCategoria(cat.nome)}</span>
                  {cat.nome}
                </button>
              )
            })}
          </div>
          {categoriasVisiveis.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-slate-400">Nenhuma categoria encontrada. Ajuste a busca ou rode a migração 010 no Supabase.</p>
          )}
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-md border border-gray-100 dark:border-slate-800 space-y-4">
          <h2 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Novo serviço</h2>
          <div className="flex flex-wrap gap-2">
            {DICAS_SERVICO.map((dica) => (
              <button
                key={dica}
                type="button"
                onClick={() => setDescricao(dica)}
                className="text-[10px] font-medium px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-800 border border-transparent hover:border-emerald-200 transition-colors"
              >
                + {dica}
              </button>
            ))}
          </div>
          <form onSubmit={criarServico} className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600 dark:text-slate-400">Categoria do serviço</span>
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : '')}
                className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
              >
                <option value="">Escolha entre suas áreas selecionadas</option>
                {categoriasSelecionadas.map((id) => (
                  <option key={id} value={id}>
                    {nomeCategoria(id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600 dark:text-slate-400">Descrição do que você faz</span>
              <input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: Instalação de chuveiros elétricos e troca de resistência"
                className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600 dark:text-slate-400">Valor por hora (opcional)</span>
              <input
                value={valorHora}
                onChange={(e) => setValorHora(e.target.value)}
                placeholder="Ex.: 85 ou 120,50"
                className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={salvando || carregando}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold py-3 rounded-xl text-sm shadow-md disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Cadastrar serviço'}
            </button>
          </form>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-md border border-gray-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Seu catálogo</h2>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
              {servicos.length}/{limites.maxServicos}
            </span>
          </div>
          {servicos.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed">
              Nenhum serviço ainda. Escolha categorias acima e cadastre pelo menos um serviço por área em que quer aparecer nas buscas.
            </p>
          )}
          <ul className="space-y-3">
            {servicos.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-gray-100 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-800 p-4 flex gap-3"
              >
                <span className="text-2xl shrink-0">{iconeCategoria(nomeCategoria(item.categoria_id))}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">{nomeCategoria(item.categoria_id)}</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-0.5">{item.descricao}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {item.valor_hora != null ? (
                        <span className="font-semibold text-gray-800 dark:text-slate-200">R$ {Number(item.valor_hora).toFixed(2)}/h</span>
                      ) : (
                        'Valor a combinar'
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => removerServico(item.id)}
                      className="text-xs font-semibold text-red-600 hover:text-red-800 shrink-0"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {aviso && <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 font-medium">{aviso}</p>}
      </div>
    </main>
  )
}
