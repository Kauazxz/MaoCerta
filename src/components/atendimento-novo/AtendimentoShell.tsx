'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import AtendimentoStatusCard from './AtendimentoStatusCard'
import ProximaAcaoAtendimento from './ProximaAcaoAtendimento'
import PlanoAtendimentoPanel from './PlanoAtendimentoPanel'
import PagamentosAtendimentoPanel from './PagamentosAtendimentoPanel'
import HistoricoAtendimentoPanel from './HistoricoAtendimentoPanel'
import ChatAtendimentoNovo from './ChatAtendimentoNovo'
import CriarPlanoModal from './CriarPlanoModal'
import CriarItemModal from './CriarItemModal'
import CobrancaExtraModal from './CobrancaExtraModal'
import FechamentoHorasModal from './FechamentoHorasModal'
import TermoFinalPanel from './TermoFinalPanel'
import type { AtendimentoCompleto, ItemPlano } from '@/types/atendimento'

type Aba = 'conversa' | 'plano' | 'pagamentos' | 'historico' | 'termo'

type Props = {
  atendimento: AtendimentoCompleto
  perfil: 'cliente' | 'profissional'
  meuId: string
  solicitacaoId: string
  conexao: 'desconectado' | 'conectando' | 'conectado'
  onRefresh: () => void
}

export default function AtendimentoShell({
  atendimento,
  perfil,
  meuId,
  solicitacaoId,
  conexao,
  onRefresh,
}: Props) {
  const [aba, setAba] = useState<Aba>('conversa')
  const [modalPlano, setModalPlano] = useState(false)
  const [modalItem, setModalItem] = useState(false)
  const [modalExtra, setModalExtra] = useState(false)
  const [modalHoras, setModalHoras] = useState(false)

  const itemHora: ItemPlano | null = useMemo(
    () => atendimento.itens.find(i => i.tipo === 'hora' || i.unidade === 'hora') || null,
    [atendimento.itens],
  )

  const concluido = atendimento.plano?.status === 'concluido'
  const linkSaida =
    perfil === 'cliente' ? '/cliente/atendimentos' : '/profissional/atendimentos'

  function aplicarDeeplink(link: Record<string, unknown>) {
    if (link.cobranca_id) setAba('pagamentos')
    else if (link.item_id || link.plano_id) setAba('plano')
    else setAba('historico')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-24 space-y-4">
      {concluido && (
        <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-slate-900 p-4 shadow-sm space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            Atendimento concluido
          </p>
          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
            Tudo certo por aqui ✓
          </p>
          <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
            {perfil === 'cliente'
              ? 'Termo assinado e avaliacao registrada. Voce ja pode voltar para a lista de atendimentos.'
              : 'O cliente concluiu o atendimento. Voce ja pode voltar para a lista.'}
          </p>
          <Link
            href={linkSaida}
            className="block w-full text-center rounded-xl bg-emerald-700 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"
          >
            Voltar para meus atendimentos
          </Link>
        </section>
      )}

      <AtendimentoStatusCard atendimento={atendimento} />
      <ProximaAcaoAtendimento
        atendimento={atendimento}
        perfil={perfil}
        onAcao={destino => {
          if (destino === 'pagamentos') setAba('pagamentos')
          else if (destino === 'historico') setAba('historico')
          else if (destino === 'plano') setAba('plano')
          if (!atendimento.plano && perfil === 'profissional') setModalPlano(true)
        }}
      />

      {/* Atalhos contextuais do profissional */}
      {perfil === 'profissional' && (
        <section className="grid grid-cols-2 gap-2">
          {!atendimento.plano && (
            <button
              type="button"
              onClick={() => setModalPlano(true)}
              className="col-span-2 rounded-xl bg-emerald-700 py-2.5 text-xs font-bold text-white"
            >
              + Criar plano
            </button>
          )}
          {atendimento.plano && (
            <>
              <button
                type="button"
                onClick={() => setModalItem(true)}
                className="rounded-xl border border-violet-300 bg-white dark:bg-slate-900 py-2 text-[11px] font-bold text-violet-800"
              >
                + Item / proposta
              </button>
              <button
                type="button"
                onClick={() => setModalExtra(true)}
                className="rounded-xl border border-amber-300 bg-white dark:bg-slate-900 py-2 text-[11px] font-bold text-amber-800"
              >
                + Cobranca extra
              </button>
              {itemHora && (
                <button
                  type="button"
                  onClick={() => setModalHoras(true)}
                  className="col-span-2 rounded-xl border border-slate-200 bg-white dark:bg-slate-900 py-2 text-[11px] font-bold text-slate-700"
                >
                  Fechamento por hora
                </button>
              )}
            </>
          )}
        </section>
      )}

      {/* Conexao realtime - indicador discreto */}
      <p className="text-[10px] text-slate-400 text-right">
        {conexao === 'conectado'
          ? '● realtime ativo'
          : conexao === 'conectando'
            ? '○ conectando...'
            : '○ desconectado'}
      </p>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-1 grid grid-cols-5 gap-1 shadow border border-slate-200 dark:border-slate-800">
        <BotaoAba ativo={aba === 'conversa'} onClick={() => setAba('conversa')}>
          Conversa
        </BotaoAba>
        <BotaoAba
          ativo={aba === 'plano'}
          onClick={() => setAba('plano')}
          contador={atendimento.itens.length}
        >
          Plano
        </BotaoAba>
        <BotaoAba
          ativo={aba === 'pagamentos'}
          onClick={() => setAba('pagamentos')}
          contador={atendimento.cobrancas.length}
        >
          Pagam.
        </BotaoAba>
        <BotaoAba
          ativo={aba === 'historico'}
          onClick={() => setAba('historico')}
          contador={atendimento.eventos.length}
        >
          Hist.
        </BotaoAba>
        <BotaoAba ativo={aba === 'termo'} onClick={() => setAba('termo')}>
          Termo
        </BotaoAba>
      </div>

      {aba === 'conversa' && (
        <ChatAtendimentoNovo
          solicitacaoId={solicitacaoId}
          meuId={meuId}
          onDeeplink={aplicarDeeplink}
        />
      )}
      {aba === 'plano' && (
        <PlanoAtendimentoPanel
          atendimento={atendimento}
          perfil={perfil}
          meuId={meuId}
          onAlterado={onRefresh}
        />
      )}
      {aba === 'pagamentos' && (
        <PagamentosAtendimentoPanel atendimento={atendimento} perfil={perfil} onAlterado={onRefresh} />
      )}
      {aba === 'historico' && <HistoricoAtendimentoPanel eventos={atendimento.eventos} />}
      {aba === 'termo' && (
        <TermoFinalPanel
          atendimento={atendimento}
          perfil={perfil}
          solicitacaoId={solicitacaoId}
          onAlterado={onRefresh}
        />
      )}

      {/* Modais profissional */}
      <CriarPlanoModal
        aberto={modalPlano}
        solicitacaoId={solicitacaoId}
        onFechar={() => setModalPlano(false)}
        onCriado={() => {
          setModalPlano(false)
          setAba('plano')
          onRefresh()
        }}
      />
      {atendimento.plano && (
        <CriarItemModal
          aberto={modalItem}
          planoId={atendimento.plano.id}
          onFechar={() => setModalItem(false)}
          onCriado={() => {
            setModalItem(false)
            setAba('plano')
            onRefresh()
          }}
        />
      )}
      <CobrancaExtraModal
        aberto={modalExtra}
        solicitacaoId={solicitacaoId}
        itens={atendimento.itens}
        onFechar={() => setModalExtra(false)}
        onCriado={() => {
          setModalExtra(false)
          setAba('pagamentos')
          onRefresh()
        }}
      />
      <FechamentoHorasModal
        aberto={modalHoras}
        solicitacaoId={solicitacaoId}
        itemBase={itemHora}
        onFechar={() => setModalHoras(false)}
        onCriado={() => {
          setModalHoras(false)
          setAba('pagamentos')
          onRefresh()
        }}
      />
    </div>
  )
}

function BotaoAba({
  ativo,
  onClick,
  contador,
  children,
}: {
  ativo: boolean
  onClick: () => void
  contador?: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-semibold py-2.5 rounded-xl transition-colors ${
        ativo ? 'bg-violet-700 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
    >
      {children}
      {typeof contador === 'number' && (
        <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${ativo ? 'bg-white/25' : 'bg-slate-100 dark:bg-slate-800'}`}>
          {contador}
        </span>
      )}
    </button>
  )
}
