'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { iconeCategoria } from '@/lib/categorias-ui'
import { formatarRelativoPt } from '@/lib/formatar-data'
import { obterLimitesPlano, nomePlano } from '@/lib/plano-limites'
import { useRealtimeRefresh } from '@/lib/realtime'
import PerfilModal from '@/screens/perfil/PerfilModal'

type Demanda = {
  id: string
  titulo: string
  descricao: string
  categoria_id: number
  status: string
  created_at: string
  cliente_id: string
  categorias: { nome: string } | null
  cliente: { nome: string; cidade: string | null } | null
}

export default function ProfissionalDemandasScreen() {
  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [carregando, setCarregando] = useState(true)
  const [acaoEmCurso, setAcaoEmCurso] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [perfilAberto, setPerfilAberto] = useState<string | null>(null)
  const [plano, setPlano] = useState<string>('free')
  const [propostasAtivas, setPropostasAtivas] = useState(0)
  const [demandaForm, setDemandaForm] = useState<string | null>(null)
  const [formMensagem, setFormMensagem] = useState('')
  const [formValor, setFormValor] = useState('')
  const [formPrazo, setFormPrazo] = useState('')

  const limites = useMemo(() => obterLimitesPlano(plano), [plano])
  const podeEnviar = limites.podeEnviarPropostas
  const limitePropostasAtingido = propostasAtivas >= limites.maxPropostasSimultaneasPrestador

  const demandasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return demandas
    return demandas.filter((d) => {
      const cat = d.categorias?.nome?.toLowerCase() || ''
      return (
        d.titulo.toLowerCase().includes(q) ||
        d.descricao.toLowerCase().includes(q) ||
        cat.includes(q)
      )
    })
  }, [demandas, busca])

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Realtime: novas demandas / propostas alteram a lista visivel
  useRealtimeRefresh('demandas', () => carregar(), { key: 'prest-demandas' })
  useRealtimeRefresh('propostas', () => carregar(), { key: 'prest-demandas-prop' })

  async function carregar() {
    setCarregando(true)
    setAviso(null)
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user

    if (!user) {
      setAviso({ tipo: 'erro', texto: 'Faça login como prestador para ver as demandas.' })
      setCarregando(false)
      return
    }
    setUserId(user.id)

    const [recusasRes, aceitasRes, propostasRes, perfilRes] = await Promise.all([
      supabase.from('demanda_recusas').select('demanda_id').eq('profissional_id', user.id),
      supabase
        .from('solicitacoes')
        .select('demanda_origem_id, proposta_origem_id, status')
        .eq('profissional_id', user.id)
        .not('demanda_origem_id', 'is', null),
      supabase
        .from('propostas')
        .select('id, demanda_id, status')
        .eq('profissional_id', user.id),
      supabase.from('profiles').select('plano').eq('id', user.id).maybeSingle(),
    ])

    setPlano((perfilRes.data?.plano as string) || 'free')

    type AceitaRow = { demanda_origem_id: string; proposta_origem_id: string | null; status: string }
    const aceitasMinhas = (aceitasRes.data as AceitaRow[] | null) || []
    const propostasComAtendimentoAtivo = new Set(
      aceitasMinhas
        .filter((a) => a.status === 'aceita' || a.status === 'em_andamento')
        .map((a) => a.proposta_origem_id)
        .filter((id): id is string => !!id),
    )

    const propostasMinhas =
      (propostasRes.data as { id: string; demanda_id: string; status: string }[] | null) || []
    const propostasIds = new Set(propostasMinhas.map((p) => p.demanda_id))
    // Ativa = aguardando resposta do cliente OU aceita com atendimento ainda em curso.
    // Propostas aceitas cujo atendimento foi cancelado/concluido nao contam mais.
    const ativas = propostasMinhas.filter((p) => {
      if (p.status === 'pendente') return true
      if (p.status === 'aceita') return propostasComAtendimentoAtivo.has(p.id)
      return false
    }).length
    setPropostasAtivas(ativas)

    const idsExcluidos = new Set<string>([
      ...(recusasRes.data?.map((r: { demanda_id: string }) => r.demanda_id) || []),
      ...aceitasMinhas.map((a) => a.demanda_origem_id),
      ...propostasIds,
    ])

    const { data, error } = await supabase
      .from('demandas')
      .select(`
        id, titulo, descricao, categoria_id, status, created_at, cliente_id,
        categorias ( nome ),
        cliente:cliente_id ( nome, cidade )
      `)
      .eq('status', 'aberta')
      .neq('cliente_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[demandas] select', error)
      setAviso({ tipo: 'erro', texto: `Erro ao carregar: ${error.message}` })
    } else {
      const lista = ((data as unknown as Demanda[] | null) || []).filter((d) => !idsExcluidos.has(d.id))
      setDemandas(lista)
    }
    setCarregando(false)
  }

  function abrirFormulario(demanda: Demanda) {
    setDemandaForm(demanda.id)
    setFormMensagem('')
    setFormValor('')
    setFormPrazo('')
    setAviso(null)
  }

  function fecharFormulario() {
    setDemandaForm(null)
    setFormMensagem('')
    setFormValor('')
    setFormPrazo('')
  }

  async function enviarProposta(e: FormEvent, demanda: Demanda) {
    e.preventDefault()
    if (!userId) return
    if (!podeEnviar) {
      setAviso({ tipo: 'erro', texto: `O plano ${nomePlano(plano)} não permite enviar propostas.` })
      return
    }
    if (limitePropostasAtingido) {
      setAviso({
        tipo: 'erro',
        texto: `Você já tem ${propostasAtivas} proposta(s) ativa(s). Limite do plano ${nomePlano(plano)}: ${limites.maxPropostasSimultaneasPrestador}.`,
      })
      return
    }
    const valor = Number(formValor.replace(',', '.'))
    if (!formMensagem.trim() || !valor || valor <= 0 || !formPrazo.trim()) {
      setAviso({ tipo: 'erro', texto: 'Preencha mensagem, valor (>0) e prazo.' })
      return
    }

    setAcaoEmCurso(demanda.id)
    const supabase = createClient()
    const { error } = await supabase.from('propostas').insert({
      demanda_id: demanda.id,
      profissional_id: userId,
      mensagem: formMensagem.trim(),
      valor_proposto: valor,
      prazo: formPrazo.trim(),
    })

    setAcaoEmCurso(null)

    if (error) {
      console.error('[enviarProposta] insert', error)
      setAviso({ tipo: 'erro', texto: `Não foi possível enviar: ${error.message}` })
      return
    }

    setDemandas((atual) => atual.filter((d) => d.id !== demanda.id))
    setPropostasAtivas((n) => n + 1)
    fecharFormulario()
    setAviso({ tipo: 'ok', texto: 'Proposta enviada. O cliente será notificado.' })
  }

  async function recusar(demanda: Demanda) {
    if (!userId) return
    setAcaoEmCurso(demanda.id)
    setAviso(null)
    const supabase = createClient()

    const { error } = await supabase.from('demanda_recusas').insert({
      demanda_id: demanda.id,
      profissional_id: userId,
    })

    setAcaoEmCurso(null)

    if (error) {
      console.error('[recusar] insert demanda_recusas', error)
      setAviso({ tipo: 'erro', texto: `Não foi possível recusar: ${error.message}` })
      return
    }

    setDemandas((atual) => atual.filter((d) => d.id !== demanda.id))
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 pb-10">
      <div className="min-h-[200px] flex items-end bg-gradient-to-br from-emerald-700 via-teal-600 to-cyan-600 text-white px-4 pt-8 pb-12 rounded-b-[2rem] shadow-lg">
        <div className="max-w-lg mx-auto space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">Marketplace</p>
          <h1 className="text-2xl font-bold leading-tight">Demandas públicas</h1>
          <p className="text-sm text-white/85 leading-relaxed">
            Pedidos abertos por clientes. Envie sua proposta com valor e prazo — o cliente compara e escolhe um prestador.
          </p>
          <div className="bg-white/15 rounded-2xl px-3 py-2 text-xs">
            <span className="font-semibold">Plano {nomePlano(plano)}:</span>{' '}
            {podeEnviar
              ? `${propostasAtivas} de ${limites.maxPropostasSimultaneasPrestador} proposta(s) ativa(s)`
              : 'não envia propostas'}
          </div>
          <div className="relative pt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 text-sm">🔎</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por título, descrição ou categoria..."
              className="w-full rounded-xl bg-white/15 border border-white/25 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
            />
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-4 space-y-4 relative z-10">
        {aviso && (
          <p
            className={`text-xs rounded-xl p-3 font-medium border ${
              aviso.tipo === 'ok'
                ? 'text-emerald-900 bg-emerald-50 border-emerald-200'
                : 'text-red-900 bg-red-50 border-red-200'
            }`}
          >
            {aviso.texto}
          </p>
        )}

        {carregando && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-md border border-gray-100 dark:border-slate-800 flex items-center gap-3">
            <span className="inline-block w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600 dark:text-slate-400">Carregando demandas...</p>
          </div>
        )}

        {!carregando && demandasFiltradas.length === 0 && demandas.length > 0 && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            Nenhuma demanda combina com a busca. Limpe o filtro para ver todas.
          </p>
        )}

        {!carregando &&
          demandasFiltradas.map((d) => {
            const catNome = d.categorias?.nome || 'Categoria'
            const cliente = d.cliente
            const acaoCarregando = acaoEmCurso === d.id
            return (
              <article
                key={d.id}
                className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
              >
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg" aria-hidden>
                      {iconeCategoria(catNome)}
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full">
                      {catNome}
                    </span>
                    <span className="text-[11px] text-gray-400 dark:text-slate-500 ml-auto">{formatarRelativoPt(d.created_at)}</span>
                  </div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-slate-100 leading-snug">{d.titulo}</h2>
                  <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">{d.descricao}</p>

                  {cliente && (
                    <button
                      type="button"
                      onClick={() => setPerfilAberto(d.cliente_id)}
                      className="text-left w-full bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl px-3 py-2 transition-colors"
                    >
                      <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Cliente</p>
                      <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                        {cliente.nome}
                        {cliente.cidade && (
                          <span className="text-xs font-normal text-gray-500 dark:text-slate-400"> · {cliente.cidade}</span>
                        )}
                      </p>
                      <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">Ver perfil completo ›</p>
                    </button>
                  )}

                  {demandaForm !== d.id && (
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => abrirFormulario(d)}
                        disabled={acaoCarregando || !podeEnviar || limitePropostasAtingido}
                        className="flex-1 min-w-[120px] text-sm font-semibold bg-emerald-600 text-white py-2.5 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {!podeEnviar
                          ? 'Plano não envia propostas'
                          : limitePropostasAtingido
                            ? 'Limite de propostas atingido'
                            : 'Enviar proposta'}
                      </button>
                      <button
                        type="button"
                        onClick={() => recusar(d)}
                        disabled={acaoCarregando}
                        className="flex-1 min-w-[120px] text-sm font-semibold bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50"
                      >
                        Recusar
                      </button>
                    </div>
                  )}

                  {demandaForm === d.id && (
                    <form onSubmit={(e) => enviarProposta(e, d)} className="space-y-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Sua proposta</p>
                      <textarea
                        value={formMensagem}
                        onChange={(e) => setFormMensagem(e.target.value)}
                        placeholder="Como você executaria o serviço, materiais e disponibilidade"
                        rows={3}
                        required
                        className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={formValor}
                          onChange={(e) => setFormValor(e.target.value)}
                          placeholder="Valor (R$)"
                          required
                          className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm"
                        />
                        <input
                          type="text"
                          value={formPrazo}
                          onChange={(e) => setFormPrazo(e.target.value)}
                          placeholder="Prazo (ex.: 3 dias)"
                          required
                          className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={acaoCarregando}
                          className="flex-1 bg-emerald-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {acaoCarregando ? 'Enviando...' : 'Enviar proposta'}
                        </button>
                        <button
                          type="button"
                          onClick={fecharFormulario}
                          disabled={acaoCarregando}
                          className="px-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-slate-800"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </article>
            )
          })}

        {!carregando && demandas.length === 0 && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm text-center space-y-2">
            <p className="text-4xl">📭</p>
            <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">Nenhuma demanda no momento</p>
            <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
              Quando algum cliente publicar uma demanda compatível com sua atuação, ela aparece aqui.
              Demandas que você recusou ou aceitou não voltam a aparecer.
            </p>
          </section>
        )}
      </div>

      <PerfilModal
        perfilId={perfilAberto || ''}
        aberto={!!perfilAberto}
        onFechar={() => setPerfilAberto(null)}
        rotulo="Cliente"
      />
    </main>
  )
}
