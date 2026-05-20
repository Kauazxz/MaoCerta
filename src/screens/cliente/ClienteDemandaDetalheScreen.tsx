'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { iconeCategoria } from '@/lib/categorias-ui'
import { formatarDataPt, formatarRelativoPt } from '@/lib/formatar-data'
import { obterLimitesPlano, nomePlano } from '@/lib/plano-limites'
import PerfilModal from '@/screens/perfil/PerfilModal'

type Demanda = {
  id: string
  titulo: string
  descricao: string
  status: string
  created_at: string
  cliente_id: string
  categorias: { nome: string } | null
}

type Proposta = {
  id: string
  profissional_id: string
  mensagem: string
  valor_proposto: number
  prazo: string
  status: string
  created_at: string
  profissional: {
    id: string
    nome: string
    avatar_url: string | null
    cidade: string | null
    estado: string | null
    experiencia_anos: number | null
  } | null
}

function formatarValor(v: number) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function badgeStatusProposta(status: string) {
  switch (status) {
    case 'aceita':
      return { label: '✓ Escolhido', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
    case 'suplente':
      return { label: 'Suplente', className: 'bg-blue-50 text-blue-700 border-blue-200' }
    case 'recusada':
      return { label: 'Recusada', className: 'bg-red-50 text-red-700 border-red-200' }
    default:
      return { label: 'Aguardando escolha', className: 'bg-amber-50 text-amber-900 border-amber-200' }
  }
}

export default function ClienteDemandaDetalheScreen({ id }: { id: string }) {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [demanda, setDemanda] = useState<Demanda | null>(null)
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [plano, setPlano] = useState<string>('free')
  const [acaoEmCurso, setAcaoEmCurso] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [perfilAberto, setPerfilAberto] = useState<string | null>(null)
  const [propostaParaEscolher, setPropostaParaEscolher] = useState<Proposta | null>(null)
  const [editando, setEditando] = useState(false)
  const [tituloEdit, setTituloEdit] = useState('')
  const [descricaoEdit, setDescricaoEdit] = useState('')
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  const limites = useMemo(() => obterLimitesPlano(plano), [plano])
  const propostasVisiveis = useMemo(
    () => propostas.slice(0, limites.maxPropostasPorDemanda),
    [propostas, limites.maxPropostasPorDemanda],
  )
  const escondidasPorPlano = propostas.length - propostasVisiveis.length
  const propostaAceita = useMemo(() => propostas.find((p) => p.status === 'aceita'), [propostas])

  useEffect(() => {
    carregar()
  }, [id])

  async function carregar() {
    setCarregando(true)
    setAviso(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setAviso({ tipo: 'erro', texto: 'Faça login para ver esta demanda.' })
      setCarregando(false)
      return
    }

    const [demRes, propRes, perfilRes] = await Promise.all([
      supabase
        .from('demandas')
        .select(`id, titulo, descricao, status, created_at, cliente_id, categorias ( nome )`)
        .eq('id', id)
        .eq('cliente_id', user.id)
        .maybeSingle(),
      supabase
        .from('propostas')
        .select(`
          id, profissional_id, mensagem, valor_proposto, prazo, status, created_at,
          profissional:profissional_id ( id, nome, avatar_url, cidade, estado, experiencia_anos )
        `)
        .eq('demanda_id', id)
        .order('created_at', { ascending: true }),
      supabase.from('profiles').select('plano').eq('id', user.id).maybeSingle(),
    ])

    if (demRes.error || !demRes.data) {
      setAviso({ tipo: 'erro', texto: demRes.error?.message || 'Demanda não encontrada.' })
    } else {
      setDemanda(demRes.data as unknown as Demanda)
    }

    setPropostas((propRes.data as unknown as Proposta[]) || [])
    setPlano((perfilRes.data?.plano as string) || 'free')
    setCarregando(false)
  }

  function abrirConfirmacaoEscolha(proposta: Proposta) {
    setPropostaParaEscolher(proposta)
  }

  async function confirmarEscolhaProposta() {
    const proposta = propostaParaEscolher
    if (!proposta || !demanda) return

    setAcaoEmCurso(proposta.id)
    setAviso(null)
    const supabase = createClient()

    // RF28 — limite de serviços simultâneos aceitos pelo cliente
    const { count } = await supabase
      .from('solicitacoes')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', demanda.cliente_id)
      .in('status', ['aceita', 'em_andamento'])
    if ((count ?? 0) >= limites.maxServicosSimultaneosCliente) {
      setAcaoEmCurso(null)
      setPropostaParaEscolher(null)
      setAviso({
        tipo: 'erro',
        texto: `Você já tem ${count} serviço(s) ativo(s). Limite do plano ${nomePlano(plano)}: ${limites.maxServicosSimultaneosCliente}. Conclua algum ou faça upgrade.`,
      })
      return
    }

    // 1) Cria solicitação aceita ligada à demanda + proposta.
    // Idempotente: se ja' existe solicitacao para essa demanda (tentativa
    // anterior que falhou no UPDATE da proposta, por exemplo), reaproveita.
    const { data: existente } = await supabase
      .from('solicitacoes')
      .select('id, status')
      .eq('demanda_origem_id', demanda.id)
      .maybeSingle()

    let solId: string
    if (existente?.id) {
      solId = existente.id as string
      // Se estiver cancelada/recusada, reativa com a proposta atual
      const statusAtual = (existente.status as string | undefined) || ''
      if (statusAtual === 'cancelada' || statusAtual === 'recusada') {
        await supabase
          .from('solicitacoes')
          .update({
            status: 'aceita',
            profissional_id: proposta.profissional_id,
            proposta_origem_id: proposta.id,
          })
          .eq('id', solId)
      }
    } else {
      const { data: solCriada, error: erroSol } = await supabase
        .from('solicitacoes')
        .insert({
          cliente_id: demanda.cliente_id,
          profissional_id: proposta.profissional_id,
          titulo: demanda.titulo,
          descricao: demanda.descricao,
          status: 'aceita',
          demanda_origem_id: demanda.id,
          proposta_origem_id: proposta.id,
        })
        .select('id')
        .single()
      if (erroSol || !solCriada) {
        setAcaoEmCurso(null)
        setPropostaParaEscolher(null)
        setAviso({ tipo: 'erro', texto: `Falha ao abrir atendimento: ${erroSol?.message || 'sem id'}` })
        return
      }
      solId = solCriada.id as string
    }

    // 1b) Copia o valor da proposta pro atendimento — dispara a divisão entre etapas.
    // O prestador foi quem definiu o valor na proposta; o cliente apenas concordou ao escolher.
    await supabase
      .from('solicitacoes')
      .update({ valor_total_servico: Number(proposta.valor_proposto) })
      .eq('id', solId)

    // 2) Marca proposta como aceita (trigger faz as outras virarem suplente)
    const { error: erroProp } = await supabase
      .from('propostas')
      .update({ status: 'aceita' })
      .eq('id', proposta.id)

    setAcaoEmCurso(null)
    setPropostaParaEscolher(null)

    if (erroProp) {
      setAviso({ tipo: 'erro', texto: `Atendimento criado, mas falhou ao marcar proposta: ${erroProp.message}` })
      return
    }

    setAviso({ tipo: 'ok', texto: 'Prestador escolhido. Indo para o chat...' })
    setTimeout(() => router.push('/cliente/atendimentos'), 1000)
  }

  function abrirEdicao() {
    if (!demanda) return
    setTituloEdit(demanda.titulo)
    setDescricaoEdit(demanda.descricao)
    setEditando(true)
  }

  async function salvarEdicao() {
    if (!demanda) return
    const titulo = tituloEdit.trim()
    const descricao = descricaoEdit.trim()
    if (!titulo || !descricao) {
      setAviso({ tipo: 'erro', texto: 'Título e descrição não podem ficar vazios.' })
      return
    }
    setSalvandoEdicao(true)
    setAviso(null)
    const supabase = createClient()
    const { error } = await supabase
      .from('demandas')
      .update({ titulo, descricao })
      .eq('id', demanda.id)
    setSalvandoEdicao(false)
    if (error) {
      setAviso({ tipo: 'erro', texto: `Não foi possível salvar: ${error.message}` })
      return
    }
    setDemanda({ ...demanda, titulo, descricao })
    setEditando(false)
    setAviso({ tipo: 'ok', texto: 'Demanda atualizada.' })
  }

  async function excluirDemanda() {
    if (!demanda) return
    setExcluindo(true)
    setAviso(null)
    const supabase = createClient()
    // .select() faz o Supabase retornar as linhas afetadas — se a RLS
    // bloqueia silenciosamente, data vira [] e o usuario recebe aviso real.
    const { data, error } = await supabase
      .from('demandas')
      .delete()
      .eq('id', demanda.id)
      .select('id')
    setExcluindo(false)
    if (error) {
      setConfirmandoExclusao(false)
      setAviso({ tipo: 'erro', texto: `Não foi possível excluir: ${error.message}` })
      return
    }
    if (!data || data.length === 0) {
      setConfirmandoExclusao(false)
      setAviso({
        tipo: 'erro',
        texto:
          'Exclusão bloqueada. Verifique se a demanda ainda tem proposta marcada como aceita — se o atendimento foi cancelado, é preciso aplicar a migration 034 para destravá-la.',
      })
      return
    }
    router.push('/cliente/demandas')
  }

  const cat = demanda?.categorias?.nome || 'Categoria'

  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-50/40 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 pb-10">
      <header className="min-h-[200px] flex items-end bg-gradient-to-br from-purple-700 via-indigo-600 to-blue-600 text-white px-4 pt-8 pb-12 rounded-b-[2rem] shadow-lg">
        <div className="max-w-lg mx-auto w-full space-y-3">
          <Link
            href="/cliente/demandas"
            className="inline-flex items-center gap-1 text-white/85 text-sm font-medium hover:text-white"
          >
            <span className="text-base">‹</span> Voltar para minhas demandas
          </Link>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Sua demanda</p>
          <h1 className="text-2xl font-bold">{demanda?.titulo || (carregando ? 'Carregando...' : 'Demanda')}</h1>
          {demanda && (
            <p className="text-sm text-white/85 leading-relaxed">
              {iconeCategoria(cat)} {cat} · publicada {formatarRelativoPt(demanda.created_at)}
            </p>
          )}
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 -mt-6 space-y-4 relative z-10">
        {aviso && (
          <p
            className={`text-xs rounded-2xl p-3 font-medium ${
              aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {aviso.texto}
          </p>
        )}

        {carregando && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow border border-gray-100 dark:border-slate-800 flex items-center gap-3">
            <span className="inline-block w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600 dark:text-slate-400">Carregando...</p>
          </div>
        )}

        {!carregando && demanda && (
          <>
            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-md p-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Descrição</p>
                {!propostaAceita && demanda.status === 'aberta' && !editando && (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={abrirEdicao}
                      className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-200"
                    >
                      Editar
                    </button>
                    <span className="text-gray-300 dark:text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => setConfirmandoExclusao(true)}
                      className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </div>

              {!editando && (
                <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{demanda.descricao}</p>
              )}

              {editando && (
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Título</span>
                    <input
                      value={tituloEdit}
                      onChange={(e) => setTituloEdit(e.target.value)}
                      className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Descrição</span>
                    <textarea
                      rows={4}
                      value={descricaoEdit}
                      onChange={(e) => setDescricaoEdit(e.target.value)}
                      className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500/30 resize-none"
                    />
                  </label>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={salvarEdicao}
                      disabled={salvandoEdicao}
                      className="flex-1 bg-purple-700 hover:bg-purple-800 text-white font-semibold py-2 rounded-xl text-sm disabled:opacity-50"
                    >
                      {salvandoEdicao ? 'Salvando...' : 'Salvar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditando(false)}
                      disabled={salvandoEdicao}
                      className="px-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-slate-700"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-gray-400 dark:text-slate-500 pt-2 border-t border-gray-100 dark:border-slate-800">
                Aberta em {formatarDataPt(demanda.created_at)} · status:{' '}
                <span className="font-semibold text-gray-600 dark:text-slate-400">{demanda.status.replace(/_/g, ' ')}</span>
              </p>
            </section>

            {propostaAceita && (
              <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-1">
                <p className="text-xs font-bold text-emerald-900 uppercase tracking-wide">Prestador escolhido</p>
                <p className="text-sm text-emerald-900">
                  {propostaAceita.profissional?.nome || '—'} ·{' '}
                  {formatarValor(Number(propostaAceita.valor_proposto))} · {propostaAceita.prazo}
                </p>
                <Link
                  href="/cliente/atendimentos"
                  className="inline-block text-xs font-bold text-emerald-700 hover:text-emerald-900 mt-1"
                >
                  Abrir conversa ›
                </Link>
              </section>
            )}

            <section className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest">
                  Propostas recebidas ({propostas.length})
                </h2>
                <span className="text-[11px] text-gray-400 dark:text-slate-500">
                  Plano {nomePlano(plano)}: até {limites.maxPropostasPorDemanda}/demanda
                </span>
              </div>

              {propostas.length === 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm text-center space-y-1">
                  <p className="text-3xl">⏳</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">Nenhuma proposta ainda</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
                    Aguarde — prestadores compatíveis com sua categoria vão enviar propostas com valor e prazo.
                  </p>
                </div>
              )}

              {propostasVisiveis.map((p) => {
                const badge = badgeStatusProposta(p.status)
                const prest = p.profissional
                const local = [prest?.cidade, prest?.estado].filter(Boolean).join(' - ')
                const podeEscolher = !propostaAceita && p.status === 'pendente'
                const acao = acaoEmCurso === p.id

                return (
                  <article
                    key={p.id}
                    className={`bg-white dark:bg-slate-900 rounded-2xl border-2 p-4 space-y-3 ${
                      p.status === 'aceita' ? 'border-emerald-300' : 'border-gray-100 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => prest && setPerfilAberto(prest.id)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-gray-50 dark:hover:bg-slate-800 rounded-xl p-1 -m-1"
                      >
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-200 to-indigo-200 flex items-center justify-center text-base font-bold text-purple-900 overflow-hidden shrink-0">
                          {prest?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={prest.avatar_url} alt={prest.nome} className="w-full h-full object-cover" />
                          ) : (
                            (prest?.nome || '?').slice(0, 1).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{prest?.nome || 'Prestador'}</p>
                          {(local || prest?.experiencia_anos) && (
                            <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                              {local && <>📍 {local}</>}
                              {prest?.experiencia_anos != null && <> · {prest.experiencia_anos}a exp.</>}
                            </p>
                          )}
                        </div>
                      </button>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border whitespace-nowrap ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/40 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">Valor</p>
                        <p className="text-base font-bold text-purple-900 dark:text-purple-100 mt-0.5">
                          {formatarValor(Number(p.valor_proposto))}
                        </p>
                      </div>
                      <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">Prazo</p>
                        <p className="text-base font-bold text-indigo-900 dark:text-indigo-100 mt-0.5 truncate">{p.prazo}</p>
                      </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">Mensagem</p>
                      <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{p.mensagem}</p>
                    </div>

                    <p className="text-[10px] text-gray-400 dark:text-slate-500">{formatarRelativoPt(p.created_at)}</p>

                    {podeEscolher && (
                      <button
                        type="button"
                        onClick={() => abrirConfirmacaoEscolha(p)}
                        disabled={acao}
                        className="w-full bg-purple-700 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-purple-800 disabled:opacity-50"
                      >
                        {acao ? 'Escolhendo...' : 'Escolher este prestador'}
                      </button>
                    )}
                  </article>
                )
              })}

              {escondidasPorPlano > 0 && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  +{escondidasPorPlano} proposta(s) ocultas pelo plano {nomePlano(plano)}.{' '}
                  <Link href="/cliente/configuracoes/plano" className="font-bold hover:underline">
                    Faça upgrade
                  </Link>{' '}
                  para ver todas.
                </p>
              )}
            </section>
          </>
        )}
      </div>

      <PerfilModal
        perfilId={perfilAberto || ''}
        aberto={!!perfilAberto}
        onFechar={() => setPerfilAberto(null)}
        rotulo="Prestador"
      />

      {propostaParaEscolher && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => acaoEmCurso || setPropostaParaEscolher(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3">
              <p className="text-[11px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-widest">Confirmar escolha</p>
              <h3 className="text-base font-bold text-gray-900 dark:text-slate-100 mt-1">
                Escolher {propostaParaEscolher.profissional?.nome || 'este prestador'}?
              </h3>
            </div>
            <div className="px-5 pb-4 space-y-2">
              <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/40 rounded-xl px-3 py-2">
                <p className="text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">Valor combinado</p>
                <p className="text-lg font-bold text-purple-900 dark:text-purple-100">
                  {formatarValor(Number(propostaParaEscolher.valor_proposto))}
                </p>
                <p className="text-[11px] text-purple-800 dark:text-purple-300 mt-0.5">Prazo: {propostaParaEscolher.prazo}</p>
              </div>
              <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">
                Isso abre um atendimento agora e marca as demais propostas como suplentes. Os outros prestadores não conseguem mais ser escolhidos nessa demanda.
              </p>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                type="button"
                onClick={() => setPropostaParaEscolher(null)}
                disabled={!!acaoEmCurso}
                className="flex-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarEscolhaProposta}
                disabled={!!acaoEmCurso}
                className="flex-1 bg-purple-700 hover:bg-purple-800 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                {acaoEmCurso ? 'Confirmando...' : 'Sim, escolher'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmandoExclusao && demanda && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => excluindo || setConfirmandoExclusao(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3">
              <p className="text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">Excluir demanda</p>
              <h3 className="text-base font-bold text-gray-900 dark:text-slate-100 mt-1">
                Tem certeza?
              </h3>
              <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed mt-2">
                Esta ação não pode ser desfeita. A demanda <strong>{demanda.titulo}</strong> e qualquer proposta recebida serão removidas.
              </p>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                type="button"
                onClick={() => setConfirmandoExclusao(false)}
                disabled={excluindo}
                className="flex-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={excluirDemanda}
                disabled={excluindo}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                {excluindo ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
