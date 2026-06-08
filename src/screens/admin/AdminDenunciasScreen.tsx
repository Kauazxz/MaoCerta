'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatarDataPt, formatarRelativoPt } from '@/lib/formatar-data'
import CabecalhoAdmin from '@/components/admin/CabecalhoAdmin'
import { useDenunciasAdmin } from '@/lib/realtime/hooks'

type PerfilResumo = { id: string; nome: string; tipo: string } | null

type Denuncia = {
  id: string
  motivo: string
  descricao: string | null
  status: string
  created_at: string
  analisado_em: string | null
  denunciante_id: string
  denunciado_id: string
  denunciante: PerfilResumo
  denunciado: PerfilResumo
}

type FiltroStatus = 'abertas' | 'em_analise' | 'resolvidas' | 'arquivadas' | 'todos'

const MOTIVOS: Record<string, string> = {
  comportamento_inadequado: 'Comportamento inadequado',
  servico_nao_cumprido: 'Serviço não cumprido',
  cobranca_indevida: 'Cobrança indevida',
  perfil_falso: 'Perfil falso',
  outro: 'Outro',
}

const card =
  'bg-white dark:bg-slate-900/80 rounded-2xl border border-gray-100 dark:border-slate-800/50 shadow-sm dark:shadow-none'

export default function AdminDenunciasScreen() {
  const [lista, setLista] = useState<Denuncia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [filtro, setFiltro] = useState<FiltroStatus>('abertas')
  const [acaoId, setAcaoId] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const sb = createClient()
    const { data, error } = await sb
      .from('denuncias')
      .select(`
        id, motivo, descricao, status, created_at, analisado_em,
        denunciante_id, denunciado_id,
        denunciante:denunciante_id ( id, nome, tipo ),
        denunciado:denunciado_id ( id, nome, tipo )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setAviso({ tipo: 'erro', texto: `Erro ao carregar denúncias: ${error.message}` })
      setLista([])
    } else {
      setLista((data as unknown as Denuncia[]) || [])
    }
    setCarregando(false)
  }, [])

  useEffect(() => { void carregar() }, [carregar])
  useDenunciasAdmin(() => void carregar())

  const contadores = useMemo(() => ({
    abertas: lista.filter((d) => d.status === 'aberta').length,
    emAnalise: lista.filter((d) => d.status === 'em_analise').length,
    resolvidas: lista.filter((d) => d.status === 'resolvida').length,
    arquivadas: lista.filter((d) => d.status === 'arquivada').length,
    total: lista.length,
  }), [lista])

  const filtradas = lista.filter((d) => {
    if (filtro === 'abertas') return d.status === 'aberta'
    if (filtro === 'em_analise') return d.status === 'em_analise'
    if (filtro === 'resolvidas') return d.status === 'resolvida'
    if (filtro === 'arquivadas') return d.status === 'arquivada'
    return true
  })

  async function atualizarStatus(id: string, status: Denuncia['status']) {
    setAcaoId(id)
    setAviso(null)
    const sb = createClient()
    const { error } = await sb
      .from('denuncias')
      .update({
        status,
        analisado_em: new Date().toISOString(),
      })
      .eq('id', id)

    setAcaoId(null)
    if (error) {
      setAviso({ tipo: 'erro', texto: error.message })
      return
    }
    setAviso({ tipo: 'ok', texto: 'Status atualizado.' })
    void carregar()
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50/40 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 pb-10">
      <CabecalhoAdmin
        titulo="Denúncias"
        subtitulo="Relatos de usuários sobre comportamento, cobranças e perfis suspeitos"
      />

      <div className="max-w-6xl mx-auto px-4 -mt-8 space-y-3 relative z-10">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ResumoCard titulo="Abertas" valor={contadores.abertas} destaque={contadores.abertas > 0} />
          <ResumoCard titulo="Em análise" valor={contadores.emAnalise} />
          <ResumoCard titulo="Resolvidas" valor={contadores.resolvidas} />
          <ResumoCard titulo="Total" valor={contadores.total} />
        </section>

        <section className={`${card} p-3 flex gap-2 flex-wrap`}>
          {(['abertas', 'em_analise', 'resolvidas', 'arquivadas', 'todos'] as FiltroStatus[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-colors ${
                filtro === f
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700'
              }`}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
          <span className="text-[11px] text-gray-500 dark:text-slate-400 ml-auto self-center">
            {filtradas.length} denúncia(s)
          </span>
        </section>

        {aviso && (
          <p className={`text-xs rounded-xl p-3 font-medium ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900/40'
              : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-900/40'
          }`}>{aviso.texto}</p>
        )}

        {carregando && (
          <p className="text-center text-sm text-gray-500 dark:text-slate-400 py-8">Carregando...</p>
        )}

        {!carregando && filtradas.length === 0 && (
          <div className={`${card} p-8 text-center space-y-2`}>
            <p className="text-3xl">🚩</p>
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Nenhuma denúncia neste filtro</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">Tudo em ordem por aqui.</p>
          </div>
        )}

        {!carregando && filtradas.map((d) => {
          const badge = badgeStatus(d.status)
          return (
            <article key={d.id} className={`${card} p-4 space-y-3`}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900 dark:text-slate-100">
                      {MOTIVOS[d.motivo] || d.motivo}
                    </p>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge.cls}`}>
                      {badge.txt}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-slate-500">
                    Registrada {formatarRelativoPt(d.created_at)} · {formatarDataPt(d.created_at)}
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-2 text-xs">
                <PerfilLinha
                  rotulo="Denunciante"
                  perfil={d.denunciante}
                  fallbackId={d.denunciante_id}
                />
                <PerfilLinha
                  rotulo="Denunciado"
                  perfil={d.denunciado}
                  fallbackId={d.denunciado_id}
                  destaque
                />
              </div>

              {d.descricao && (
                <div className="rounded-xl bg-gray-50 dark:bg-slate-950/50 border border-gray-100 dark:border-slate-800/40 px-3 py-2">
                  <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase">Descrição</p>
                  <p className="text-sm text-gray-800 dark:text-slate-200 mt-0.5 whitespace-pre-wrap">{d.descricao}</p>
                </div>
              )}

              {d.analisado_em && d.status !== 'aberta' && (
                <p className="text-[10px] text-gray-400 dark:text-slate-500">
                  Atualizada em {formatarDataPt(d.analisado_em)}
                </p>
              )}

              <div className="flex gap-2 flex-wrap">
                {d.status === 'aberta' && (
                  <button
                    type="button"
                    onClick={() => atualizarStatus(d.id, 'em_analise')}
                    disabled={acaoId === d.id}
                    className="text-xs font-semibold px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                  >
                    Iniciar análise
                  </button>
                )}
                {(d.status === 'aberta' || d.status === 'em_analise') && (
                  <>
                    <button
                      type="button"
                      onClick={() => atualizarStatus(d.id, 'resolvida')}
                      disabled={acaoId === d.id}
                      className="text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                    >
                      Resolver
                    </button>
                    <button
                      type="button"
                      onClick={() => atualizarStatus(d.id, 'arquivada')}
                      disabled={acaoId === d.id}
                      className="text-xs font-semibold px-3 py-2 rounded-xl bg-gray-600 hover:bg-gray-700 text-white disabled:opacity-50"
                    >
                      Arquivar
                    </button>
                  </>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </main>
  )
}

function ResumoCard({ titulo, valor, destaque = false }: { titulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className={`${destaque ? 'border-red-300 dark:border-red-800/60' : ''} ${card} px-4 py-3`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">{titulo}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${destaque ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-slate-100'}`}>
        {valor}
      </p>
    </div>
  )
}

function PerfilLinha({
  rotulo,
  perfil,
  fallbackId,
  destaque = false,
}: {
  rotulo: string
  perfil: PerfilResumo
  fallbackId: string
  destaque?: boolean
}) {
  const id = perfil?.id || fallbackId
  return (
    <div className={`rounded-xl px-3 py-2 border ${destaque ? 'border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20' : 'border-gray-100 dark:border-slate-800/40 bg-gray-50/50 dark:bg-slate-950/30'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">{rotulo}</p>
      <p className="font-semibold text-gray-900 dark:text-slate-100 truncate">{perfil?.nome || '—'}</p>
      <p className="text-[10px] text-gray-400 dark:text-slate-500 capitalize">{perfil?.tipo || 'usuário'}</p>
      <Link href={`/admin/usuarios/${id}`} className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:underline">
        Ver perfil →
      </Link>
    </div>
  )
}

function badgeStatus(status: string) {
  const s = (status || '').toLowerCase()
  if (s === 'resolvida') return { txt: 'Resolvida', cls: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900/40' }
  if (s === 'arquivada') return { txt: 'Arquivada', cls: 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700' }
  if (s === 'em_analise') return { txt: 'Em análise', cls: 'bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-900/40' }
  return { txt: 'Aberta', cls: 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-900/40' }
}
