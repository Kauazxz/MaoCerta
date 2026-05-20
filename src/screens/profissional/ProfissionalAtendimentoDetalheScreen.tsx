'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { prestadorService } from '@/lib/supabase/prestador'
import { formatarDataPt } from '@/lib/formatar-data'
import ChatAtendimento from '@/screens/atendimento/ChatAtendimento'
import AbasAtendimento from '@/components/acordos/AbasAtendimento'
import PerfilModal from '@/screens/perfil/PerfilModal'
import EtapaAtualCard from '@/components/atendimento/EtapaAtualCard'
import TimelineEtapas from '@/components/atendimento/TimelineEtapas'
import type { Etapa } from '@/types'
import ValorServicoCard from '@/components/financeiro/ValorServicoCard'
import AvaliarClienteCard from '@/components/financeiro/AvaliarClienteCard'
import AtendimentoContextoSidebar from '@/components/atendimento/AtendimentoContextoSidebar'

type Atendimento = {
  id: string
  titulo: string
  descricao: string
  status: string
  created_at: string
  updated_at: string
  cliente_id: string
  profissional_id: string
  demanda_origem_id: string | null
  valor_total_servico?: number | null
  cliente: { id: string; nome: string; telefone: string | null; avatar_url: string | null } | null
}

export default function ProfissionalAtendimentoDetalheScreen({ id }: { id: string }) {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [atendimento, setAtendimento] = useState<Atendimento | null>(null)
  const [meuId, setMeuId] = useState<string | null>(null)
  const [acaoEmCurso, setAcaoEmCurso] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false)
  const [verPerfilCliente, setVerPerfilCliente] = useState(false)
  const [financeSignal, setFinanceSignal] = useState(0)
  const [etapas, setEtapas] = useState<Etapa[]>([])

  useEffect(() => {
    carregar()
  }, [id])

  async function carregar() {
    setCarregando(true)
    setErro(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setErro('Faça login para ver este atendimento.')
      setCarregando(false)
      return
    }
    setMeuId(user.id)

    const { data, error } = await supabase
      .from('solicitacoes')
      .select(`
        id, titulo, descricao, status, created_at, updated_at,
        cliente_id, profissional_id, demanda_origem_id, valor_total_servico,
        cliente:cliente_id ( id, nome, telefone, avatar_url )
      `)
      .eq('id', id)
      .eq('profissional_id', user.id)
      .maybeSingle()

    if (error) {
      setErro(`Erro ao carregar: ${error.message}`)
    } else if (!data) {
      setErro('Atendimento não encontrado.')
    } else {
      setAtendimento(data as unknown as Atendimento)
      try {
        const es = await prestadorService.getEtapasAtendimento(id)
        setEtapas(es)
      } catch (e) {
        console.error('[atendimento] etapas fetch', e)
      }
    }
    setCarregando(false)
  }

  async function iniciar() {
    if (!atendimento) return
    setAcaoEmCurso(true)
    try {
      await prestadorService.iniciarAtendimento(atendimento.id)
      await carregar()
    } catch (e) {
      console.error(e)
      setErro('Falha ao iniciar.')
    } finally {
      setAcaoEmCurso(false)
    }
  }

  async function concluir() {
    if (!atendimento) return
    setAcaoEmCurso(true)
    try {
      await prestadorService.concluirAtendimento(atendimento.id)
      await carregar()
    } catch (e) {
      console.error(e)
      setErro('Falha ao concluir.')
    } finally {
      setAcaoEmCurso(false)
    }
  }

  async function cancelar() {
    if (!atendimento) return
    setAcaoEmCurso(true)
    setErro(null)
    const supabase = createClient()
    const { error } = await supabase
      .from('solicitacoes')
      .update({ status: 'cancelada', updated_at: new Date().toISOString() })
      .eq('id', atendimento.id)
    setAcaoEmCurso(false)
    if (error) {
      setErro(`Falha ao cancelar: ${error.message}`)
      return
    }
    router.push('/profissional/atendimentos')
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-slate-800 p-6">
        <div className="max-w-lg mx-auto bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-md flex items-center gap-3">
          <span className="inline-block w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-600 dark:text-slate-400">Carregando atendimento...</p>
        </div>
      </main>
    )
  }

  if (!atendimento || !meuId) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-slate-800 p-6">
        <div className="max-w-lg mx-auto bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-md space-y-3">
          <p className="text-sm text-red-700">{erro || 'Atendimento não encontrado.'}</p>
          <Link href="/profissional/atendimentos" className="text-sm font-semibold text-emerald-700">
            ‹ Voltar para Atendimentos
          </Link>
        </div>
      </main>
    )
  }

  const cliente = atendimento.cliente
  const ativo = atendimento.status === 'aceita' || atendimento.status === 'em_andamento'
  const statusLabel =
    atendimento.status === 'aceita'
      ? 'Aceito (aguardando início)'
      : atendimento.status === 'em_andamento'
        ? 'Em andamento'
        : atendimento.status === 'concluida'
          ? 'Concluído'
          : 'Cancelado'

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col">
      <header className="bg-gradient-to-r from-emerald-700 via-teal-600 to-cyan-700 text-white px-4 pt-6 pb-5 shadow-lg">
        <div className="max-w-lg mx-auto space-y-3">
          <Link
            href="/profissional/atendimentos"
            className="inline-flex items-center gap-1 text-white/80 text-xs font-medium hover:text-white"
          >
            ‹ Atendimentos
          </Link>
          <button
            type="button"
            onClick={() => setVerPerfilCliente(true)}
            className="flex items-center gap-3 w-full text-left bg-white/10 hover:bg-white/15 rounded-xl p-2 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-white/20 overflow-hidden flex items-center justify-center text-base font-bold">
              {cliente?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cliente.avatar_url} alt={cliente.nome} className="w-full h-full object-cover" />
              ) : (
                <span>{(cliente?.nome || '?').slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-white/65">Cliente · toque para ver perfil</p>
              <h1 className="text-lg font-bold truncate">{cliente?.nome || 'Sem nome'}</h1>
              {cliente?.telefone && (
                <span className="text-[11px] text-white/80">{cliente.telefone}</span>
              )}
            </div>
            <span className="text-white/70 text-lg">›</span>
          </button>
          <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2.5 py-1 rounded-full">
            {statusLabel}
          </span>
        </div>
      </header>

      <div className="flex-1 w-full max-w-7xl mx-auto px-4 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 pb-8 items-start">
        <div className="w-full min-w-0">
      <section className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 px-4 py-4">
        <div className="w-full space-y-2">
          <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Detalhes</p>
          <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">{atendimento.titulo}</h2>
          <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">{atendimento.descricao}</p>
          <p className="text-[11px] text-gray-400 dark:text-slate-500">Aberto em {formatarDataPt(atendimento.created_at)}</p>

          {ativo && (
            <div className="flex flex-wrap gap-2 pt-2">
              {atendimento.status === 'aceita' && (
                <button
                  type="button"
                  onClick={iniciar}
                  disabled={acaoEmCurso}
                  className="text-xs font-semibold bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Iniciar atendimento
                </button>
              )}
              {atendimento.status === 'em_andamento' && (
                <button
                  type="button"
                  onClick={concluir}
                  disabled={acaoEmCurso}
                  className="text-xs font-semibold bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  Marcar como concluído
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmandoCancelamento(true)}
                disabled={acaoEmCurso}
                className="text-xs font-semibold bg-white dark:bg-slate-900 border border-red-200 text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                Cancelar atendimento
              </button>
            </div>
          )}
        </div>
      </section>

      {confirmandoCancelamento && (
        <section className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900 px-4 py-4">
          <div className="w-full space-y-3">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              Tem certeza? {atendimento.demanda_origem_id ? 'A demanda volta a aparecer pra outros prestadores.' : ''}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelar}
                disabled={acaoEmCurso}
                className="text-xs font-bold bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Sim, cancelar
              </button>
              <button
                type="button"
                onClick={() => setConfirmandoCancelamento(false)}
                disabled={acaoEmCurso}
                className="text-xs font-semibold bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Voltar
              </button>
            </div>
          </div>
        </section>
      )}

      {erro && (
        <p className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900/40 px-4 py-2 text-center">{erro}</p>
      )}

      <section className="bg-emerald-50/40 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900 px-4 py-4">
        <div className="w-full space-y-3">
          <p className="text-[11px] text-emerald-950/90 leading-relaxed rounded-xl border border-emerald-200 bg-white/90 px-3 py-2.5">
            <strong>Repasse seguro:</strong> o cliente paga por Pix na plataforma; o valor só entra na sua carteira após
            as confirmações da etapa. Não peça Pix fora da MaoCerta (RN18).
          </p>
          <ValorServicoCard
            solicitacaoId={atendimento.id}
            valorAtual={atendimento.valor_total_servico}
            status={atendimento.status}
            podeEditar={ativo}
            tema="profissional"
            onSalvo={() => {
              void carregar()
              setFinanceSignal(n => n + 1)
            }}
          />
        </div>
      </section>

      <section className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
        <EtapaAtualCard
          etapa={etapas.find(e => e.status !== 'concluida' && e.status !== 'cancelada') ?? etapas[etapas.length - 1] ?? null}
          meuPapel="profissional"
          onAlterado={() => void carregar()}
        />
      </section>

      {atendimento.status === 'concluida' && cliente && (
        <section className="px-4 py-4 border-b border-gray-100 dark:border-slate-800">
          <AvaliarClienteCard
            atendimentoId={atendimento.id}
            clienteId={atendimento.cliente_id}
            nomeCliente={cliente.nome || 'Cliente'}
            statusAtendimento={atendimento.status}
          />
        </section>
      )}

      <AbasAtendimento
        solicitacaoId={atendimento.id}
        meuId={meuId}
        meuPapel="profissional"
        conversa={<ChatAtendimento solicitacaoId={atendimento.id} meuId={meuId} podeEnviar={ativo} />}
        fluxo={
          <TimelineEtapas
            solicitacaoId={atendimento.id}
            meuId={meuId}
            meuTipo="profissional"
            solicitacaoStatus={atendimento.status}
            financeSignal={financeSignal}
          />
        }
      />
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-14 self-start pt-4">
          <AtendimentoContextoSidebar
            titulo={atendimento.titulo}
            descricao={atendimento.descricao}
            statusLabel={statusLabel}
            criadoEm={atendimento.created_at}
            valorTotal={atendimento.valor_total_servico ?? null}
            outroPapel="cliente"
            outroNome={cliente?.nome || '—'}
          />
        </aside>
      </div>

      <PerfilModal
        perfilId={atendimento.cliente_id}
        aberto={verPerfilCliente}
        onFechar={() => setVerPerfilCliente(false)}
        rotulo="Cliente"
      />
    </main>
  )
}
