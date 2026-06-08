'use client'

import { useCallback, useEffect, useMemo, useState, FormEvent } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { adminActions } from '@/lib/supabase/admin-actions'
import { formatarDataPt, formatarRelativoPt } from '@/lib/formatar-data'
import CabecalhoAdmin from '@/components/admin/CabecalhoAdmin'
import { useDenunciasAdmin } from '@/lib/realtime/hooks'
import { useAppRealtime } from '@/components/providers/AppRealtimeProvider'

type PerfilResumo = { id: string; nome: string; tipo: string } | null

type Denuncia = {
  id: string
  motivo: string
  descricao: string | null
  nota_admin: string | null
  status: string
  created_at: string
  analisado_em: string | null
  denunciante_id: string
  denunciado_id: string
  denunciante: PerfilResumo
  denunciado: PerfilResumo
}

type Mensagem = {
  id: string
  denuncia_id: string
  remetente_id: string
  conteudo: string
  created_at: string
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
  const { ticks } = useAppRealtime()
  const [lista, setLista] = useState<Denuncia[]>([])
  const [selecionada, setSelecionada] = useState<Denuncia | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [adminId, setAdminId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [filtro, setFiltro] = useState<FiltroStatus>('todos')
  const [acaoId, setAcaoId] = useState<string | null>(null)
  const [notaAdmin, setNotaAdmin] = useState('')
  const [salvandoNota, setSalvandoNota] = useState(false)
  const [novaMsg, setNovaMsg] = useState('')
  const [enviandoMsg, setEnviandoMsg] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (user) setAdminId(user.id)

    const { data, error } = await sb
      .from('denuncias')
      .select(`
        id, motivo, descricao, nota_admin, status, created_at, analisado_em,
        denunciante_id, denunciado_id,
        denunciante:denunciante_id ( id, nome, tipo ),
        denunciado:denunciado_id ( id, nome, tipo )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setAviso({ tipo: 'erro', texto: `Erro ao carregar denúncias: ${error.message}` })
      setLista([])
    } else {
      const rows = (data as unknown as Denuncia[]) || []
      setLista(rows)
      if (selecionada) {
        const atual = rows.find((d) => d.id === selecionada.id)
        if (atual) {
          setSelecionada(atual)
          setNotaAdmin(atual.nota_admin || '')
        }
      }
    }
    setCarregando(false)
  }, [selecionada])

  const carregarMensagens = useCallback(async (denunciaId: string) => {
    const sb = createClient()
    const { data, error } = await sb
      .from('denuncias_mensagens')
      .select('id, denuncia_id, remetente_id, conteudo, created_at')
      .eq('denuncia_id', denunciaId)
      .order('created_at', { ascending: true })
    if (!error) setMensagens((data as Mensagem[]) || [])
  }, [])

  useEffect(() => { void carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useDenunciasAdmin(() => void carregar())

  useEffect(() => {
    if (!selecionada) return
    void carregarMensagens(selecionada.id)
  }, [selecionada, ticks.denuncias, carregarMensagens])

  const contadores = useMemo(() => ({
    abertas: lista.filter((d) => d.status === 'aberta').length,
    emAnalise: lista.filter((d) => d.status === 'em_analise').length,
    resolvidas: lista.filter((d) => d.status === 'resolvida').length,
    total: lista.length,
  }), [lista])

  const filtradas = lista.filter((d) => {
    if (filtro === 'abertas') return d.status === 'aberta'
    if (filtro === 'em_analise') return d.status === 'em_analise'
    if (filtro === 'resolvidas') return d.status === 'resolvida'
    if (filtro === 'arquivadas') return d.status === 'arquivada'
    return true
  })

  function selecionar(d: Denuncia) {
    setSelecionada(d)
    setNotaAdmin(d.nota_admin || '')
    setNovaMsg('')
    setAviso(null)
  }

  async function atualizarStatus(id: string, status: Denuncia['status']) {
    setAcaoId(id)
    setAviso(null)
    const sb = createClient()
    const { error } = await sb
      .from('denuncias')
      .update({ status, analisado_em: new Date().toISOString() })
      .eq('id', id)
    setAcaoId(null)
    if (error) {
      setAviso({ tipo: 'erro', texto: error.message })
      return
    }
    setAviso({ tipo: 'ok', texto: 'Status atualizado.' })
    void carregar()
  }

  async function salvarNota() {
    if (!selecionada) return
    setSalvandoNota(true)
    setAviso(null)
    const sb = createClient()
    const { error } = await sb
      .from('denuncias')
      .update({ nota_admin: notaAdmin.trim() || null, analisado_em: new Date().toISOString() })
      .eq('id', selecionada.id)
    setSalvandoNota(false)
    if (error) {
      setAviso({ tipo: 'erro', texto: error.message })
      return
    }
    setAviso({ tipo: 'ok', texto: 'Nota interna salva.' })
    void carregar()
  }

  async function enviarMensagem(e: FormEvent) {
    e.preventDefault()
    if (!selecionada || !adminId || !novaMsg.trim()) return
    setEnviandoMsg(true)
    setAviso(null)
    const sb = createClient()
    const texto = novaMsg.trim()

    const { error } = await sb.from('denuncias_mensagens').insert({
      denuncia_id: selecionada.id,
      remetente_id: adminId,
      conteudo: texto,
    })

    if (error) {
      setEnviandoMsg(false)
      setAviso({ tipo: 'erro', texto: error.message })
      return
    }

    if (selecionada.status === 'aberta') {
      await sb.from('denuncias').update({
        status: 'em_analise',
        analisado_em: new Date().toISOString(),
      }).eq('id', selecionada.id)
    }

    await adminActions.notificarUsuario(
      selecionada.denunciante_id,
      'Atualização na sua denúncia',
      texto.length > 180 ? `${texto.slice(0, 177)}...` : texto,
    )

    setNovaMsg('')
    setEnviandoMsg(false)
    setAviso({ tipo: 'ok', texto: 'Mensagem enviada ao denunciante.' })
    void carregarMensagens(selecionada.id)
    void carregar()
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50/40 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 pb-10">
      <CabecalhoAdmin
        titulo="Denúncias"
        subtitulo="Analise relatos, registre contexto interno e converse com quem denunciou"
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

        <div className="grid lg:grid-cols-[300px_1fr] gap-3 items-start">
          <section className={`${card} overflow-hidden lg:max-h-[75vh] lg:overflow-y-auto`}>
            <div className="p-3 border-b border-gray-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900/80">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">Lista</p>
            </div>
            {carregando && <p className="p-4 text-sm text-gray-500 dark:text-slate-400">Carregando...</p>}
            {!carregando && filtradas.length === 0 && (
              <div className="p-6 text-center space-y-1">
                <p className="text-2xl">🚩</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">Nenhuma denúncia neste filtro.</p>
              </div>
            )}
            <ul className="divide-y divide-gray-100 dark:divide-slate-800">
              {filtradas.map((d) => {
                const badge = badgeStatus(d.status)
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => selecionar(d)}
                      className={`w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors ${
                        selecionada?.id === d.id ? 'bg-red-50 dark:bg-red-950/20 border-l-2 border-red-500' : ''
                      }`}
                    >
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">
                        {MOTIVOS[d.motivo] || d.motivo}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                        {d.denunciante?.nome || 'Denunciante'} → {d.denunciado?.nome || 'Denunciado'}
                      </p>
                      <div className="flex items-center justify-between mt-1 gap-1">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${badge.cls}`}>
                          {badge.txt}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-slate-500">{formatarRelativoPt(d.created_at)}</span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className={`${card} min-h-[480px] flex flex-col`}>
            {!selecionada && (
              <div className="p-8 text-center space-y-2 flex-1 flex flex-col items-center justify-center">
                <p className="text-4xl">🚩</p>
                <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Selecione uma denúncia</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 max-w-sm">
                  Veja detalhes, adicione contexto interno e converse com quem fez o relato.
                </p>
              </div>
            )}

            {selecionada && (
              <>
                <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 space-y-1">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">Denúncia</p>
                      <p className="font-bold text-gray-900 dark:text-slate-100">{MOTIVOS[selecionada.motivo] || selecionada.motivo}</p>
                      <p className="text-[11px] text-gray-400 dark:text-slate-500">
                        {formatarDataPt(selecionada.created_at)} · {badgeStatus(selecionada.status).txt}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeStatus(selecionada.status).cls}`}>
                      {badgeStatus(selecionada.status).txt}
                    </span>
                  </div>
                </div>

                <div className="p-4 space-y-4 flex-1 overflow-y-auto max-h-[65vh]">
                  <div className="grid sm:grid-cols-2 gap-2 text-xs">
                    <PerfilLinha rotulo="Denunciante" perfil={selecionada.denunciante} fallbackId={selecionada.denunciante_id} />
                    <PerfilLinha rotulo="Denunciado" perfil={selecionada.denunciado} fallbackId={selecionada.denunciado_id} destaque />
                  </div>

                  {selecionada.descricao && (
                    <div className="rounded-xl bg-gray-50 dark:bg-slate-950/50 border border-gray-100 dark:border-slate-800/40 px-3 py-2">
                      <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase">Relato do usuário</p>
                      <p className="text-sm text-gray-800 dark:text-slate-200 mt-0.5 whitespace-pre-wrap">{selecionada.descricao}</p>
                    </div>
                  )}

                  <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
                    <p className="text-[10px] font-bold text-amber-800 dark:text-amber-200 uppercase tracking-wider">
                      Nota interna (só admin)
                    </p>
                    <textarea
                      value={notaAdmin}
                      onChange={(e) => setNotaAdmin(e.target.value)}
                      rows={3}
                      placeholder="Contexto da análise, decisões, próximos passos..."
                      className="w-full text-sm rounded-xl border border-amber-200 dark:border-amber-900/40 bg-white dark:bg-slate-900 px-3 py-2 text-gray-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    />
                    <button
                      type="button"
                      onClick={() => void salvarNota()}
                      disabled={salvandoNota}
                      className="text-xs font-semibold px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                    >
                      {salvandoNota ? 'Salvando...' : 'Salvar nota'}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                      Conversa com o denunciante ({mensagens.length})
                    </p>
                    <div className="rounded-xl border border-gray-100 dark:border-slate-800/40 bg-gray-50/50 dark:bg-slate-950/30 p-3 max-h-48 overflow-y-auto space-y-2">
                      {mensagens.length === 0 && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 text-center py-4">
                          Nenhuma mensagem ainda. Inicie a conversa abaixo.
                        </p>
                      )}
                      {mensagens.map((m) => {
                        const ehAdmin = m.remetente_id === adminId
                        return (
                          <div key={m.id} className={`flex ${ehAdmin ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                              ehAdmin
                                ? 'bg-red-600 text-white'
                                : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 border border-gray-200 dark:border-slate-700'
                            }`}>
                              <p className="text-[9px] font-bold uppercase tracking-wider opacity-70 mb-0.5">
                                {ehAdmin ? 'Admin' : 'Denunciante'}
                              </p>
                              <p className="text-sm whitespace-pre-wrap break-words">{m.conteudo}</p>
                              <p className="text-[10px] opacity-60 mt-1">{formatarRelativoPt(m.created_at)}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <form onSubmit={(e) => void enviarMensagem(e)} className="flex gap-2">
                      <input
                        type="text"
                        value={novaMsg}
                        onChange={(e) => setNovaMsg(e.target.value)}
                        placeholder="Mensagem para o denunciante..."
                        className="flex-1 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                      />
                      <button
                        type="submit"
                        disabled={enviandoMsg || !novaMsg.trim()}
                        className="text-xs font-semibold px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 shrink-0"
                      >
                        Enviar
                      </button>
                    </form>
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-800 flex gap-2 flex-wrap">
                  {selecionada.status === 'aberta' && (
                    <button
                      type="button"
                      onClick={() => atualizarStatus(selecionada.id, 'em_analise')}
                      disabled={acaoId === selecionada.id}
                      className="text-xs font-semibold px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                    >
                      Iniciar análise
                    </button>
                  )}
                  {(selecionada.status === 'aberta' || selecionada.status === 'em_analise') && (
                    <>
                      <button
                        type="button"
                        onClick={() => atualizarStatus(selecionada.id, 'resolvida')}
                        disabled={acaoId === selecionada.id}
                        className="text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                      >
                        Resolver
                      </button>
                      <button
                        type="button"
                        onClick={() => atualizarStatus(selecionada.id, 'arquivada')}
                        disabled={acaoId === selecionada.id}
                        className="text-xs font-semibold px-3 py-2 rounded-xl bg-gray-600 hover:bg-gray-700 text-white disabled:opacity-50"
                      >
                        Arquivar
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
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
