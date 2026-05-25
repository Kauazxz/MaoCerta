'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { adminActions, type UsuarioAdmin } from '@/lib/supabase/admin-actions'
import { formatarDataPt, formatarRelativoPt, formatarValorBrl } from '@/lib/formatar-data'
import CabecalhoAdmin from '@/components/admin/CabecalhoAdmin'

type Documento = {
  id: string
  tipo_documento: string
  status: string
  motivo_rejeicao: string | null
  criado_em: string
  arquivo_url: string
}

type Stats = {
  atendimentosAtivos: number
  atendimentosConcluidos: number
  atendimentosCancelados: number
  demandasPublicadas: number
  propostasEnviadas: number
  avaliacoesRecebidas: number
  notaMedia: number | null
  denunciasContra: number
  denunciasEnviadas: number
  totalPago: number
  totalRecebidoCarteira: number
  saldoCarteira: number
  totalSaqueado: number
}

const STATS_ZERO: Stats = {
  atendimentosAtivos: 0, atendimentosConcluidos: 0, atendimentosCancelados: 0,
  demandasPublicadas: 0, propostasEnviadas: 0, avaliacoesRecebidas: 0, notaMedia: null,
  denunciasContra: 0, denunciasEnviadas: 0, totalPago: 0, totalRecebidoCarteira: 0,
  saldoCarteira: 0, totalSaqueado: 0,
}

export default function AdminUsuarioDetalheScreen({ id }: { id: string }) {
  const [usuario, setUsuario] = useState<UsuarioAdmin | null>(null)
  const [stats, setStats] = useState<Stats>(STATS_ZERO)
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [modalNotif, setModalNotif] = useState(false)
  const [notifTitulo, setNotifTitulo] = useState('')
  const [notifCorpo, setNotifCorpo] = useState('')

  async function carregar() {
    setCarregando(true)
    const sb = createClient()

    const rUsuarios = await adminActions.listarUsuarios()
    const u = rUsuarios.usuarios?.find((x) => x.id === id) || null
    setUsuario(u)

    const [atendCli, atendPrest, demandas, propostas, aval, denContra, denEnviou, pagCli, walletTx, wallet, saques, docs] = await Promise.all([
      sb.from('solicitacoes').select('status', { count: 'exact', head: false }).eq('cliente_id', id),
      sb.from('solicitacoes').select('status').eq('profissional_id', id),
      sb.from('demandas').select('id', { count: 'exact', head: true }).eq('cliente_id', id),
      sb.from('propostas').select('id', { count: 'exact', head: true }).eq('profissional_id', id),
      sb.from('avaliacoes').select('nota').eq('avaliado_id', id),
      sb.from('denuncias').select('id', { count: 'exact', head: true }).eq('denunciado_id', id),
      sb.from('denuncias').select('id', { count: 'exact', head: true }).eq('denunciante_id', id),
      sb.from('pagamentos').select('valor_bruto, status').eq('cliente_id', id),
      sb.from('wallet_transactions').select('valor, tipo').eq('user_id', id),
      sb.from('wallets').select('saldo, saldo_bloqueado').eq('user_id', id).maybeSingle(),
      sb.from('saques').select('valor, status').eq('user_id', id),
      sb.from('documentos_validacao').select('id, tipo_documento, status, motivo_rejeicao, criado_em, arquivo_url').eq('profissional_id', id).order('criado_em', { ascending: false }),
    ])

    const atendCliRows = (atendCli.data as { status: string }[] | null) || []
    const atendPrestRows = (atendPrest.data as { status: string }[] | null) || []
    const todasAtend = [...atendCliRows, ...atendPrestRows]

    const notas = ((aval.data as { nota: number }[] | null) || []).map((a) => Number(a.nota))
    const notaMedia = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null

    const totalPago = ((pagCli.data as { valor_bruto: number; status: string }[] | null) || [])
      .filter((p) => ['em_escrow', 'liberado', 'pago', 'contestado'].includes(p.status))
      .reduce((a, p) => a + Number(p.valor_bruto || 0), 0)

    const totalRec = ((walletTx.data as { valor: number; tipo: string }[] | null) || [])
      .filter((t) => t.tipo === 'liberacao_escrow' || t.tipo === 'recebimento_etapa')
      .reduce((a, t) => a + Number(t.valor || 0), 0)

    const totalSaqueado = ((saques.data as { valor: number; status: string }[] | null) || [])
      .filter((s) => s.status === 'processado')
      .reduce((a, s) => a + Number(s.valor || 0), 0)

    setStats({
      atendimentosAtivos: todasAtend.filter((s) => s.status === 'aceita' || s.status === 'em_andamento').length,
      atendimentosConcluidos: todasAtend.filter((s) => s.status === 'concluida').length,
      atendimentosCancelados: todasAtend.filter((s) => s.status === 'cancelada').length,
      demandasPublicadas: demandas.count ?? 0,
      propostasEnviadas: propostas.count ?? 0,
      avaliacoesRecebidas: notas.length,
      notaMedia,
      denunciasContra: denContra.count ?? 0,
      denunciasEnviadas: denEnviou.count ?? 0,
      totalPago,
      totalRecebidoCarteira: totalRec,
      saldoCarteira: Number(wallet.data?.saldo || 0),
      totalSaqueado,
    })

    setDocumentos((docs.data as Documento[]) || [])
    setCarregando(false)
  }

  useEffect(() => { void carregar() }, [id])

  async function executar(fn: () => Promise<{ ok: boolean; erro?: string }>, sucesso: string) {
    setAviso(null)
    const r = await fn()
    if (!r.ok) {
      setAviso({ tipo: 'erro', texto: r.erro || 'Falha' })
      return
    }
    setAviso({ tipo: 'ok', texto: sucesso })
    void carregar()
  }

  async function enviarNotificacao() {
    if (!notifTitulo.trim()) return
    const t = notifTitulo.trim()
    const c = notifCorpo.trim()
    setModalNotif(false)
    setNotifTitulo('')
    setNotifCorpo('')
    await executar(() => adminActions.notificarUsuario(id, t, c), 'Notificação enviada.')
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-slate-950">
        <CabecalhoAdmin titulo="Usuário" voltarHref="/admin/usuarios" voltarLabel="‹ Usuários" />
        <p className="text-center py-10 text-sm text-gray-500 dark:text-slate-400">Carregando...</p>
      </main>
    )
  }

  if (!usuario) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-slate-950">
        <CabecalhoAdmin titulo="Usuário não encontrado" voltarHref="/admin/usuarios" voltarLabel="‹ Usuários" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50/40 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 pb-10">
      <CabecalhoAdmin
        titulo={usuario.nome || '—'}
        subtitulo={`${usuario.tipo} · ${usuario.email || 'sem email'}`}
        voltarHref="/admin/usuarios"
        voltarLabel="‹ Usuários"
      />

      <div className="max-w-6xl mx-auto px-4 -mt-8 relative z-10 space-y-4">
        {aviso && (
          <p className={`text-xs rounded-xl p-3 font-medium ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900/40'
              : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-900/40'
          }`}>{aviso.texto}</p>
        )}

        {/* Cartao de identificacao + status */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">{usuario.nome}</h2>
                <Badge cor="amber">{usuario.tipo}</Badge>
                {usuario.plano && <Badge cor="purple">Plano {usuario.plano}</Badge>}
                {usuario.validado && <Badge cor="emerald">✓ Validado</Badge>}
                {usuario.suspenso && <Badge cor="red">🚫 Suspenso</Badge>}
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">{usuario.email || '—'}</p>
              <p className="text-[11px] text-gray-400 dark:text-slate-500">
                {[usuario.cidade, usuario.estado].filter(Boolean).join(' - ') || 'sem localização'} · cadastrado em {formatarDataPt(usuario.created_at)}
              </p>
              {usuario.suspenso && usuario.motivo_suspensao && (
                <p className="text-[11px] text-red-700 dark:text-red-300 mt-1 italic">Motivo da suspensão: {usuario.motivo_suspensao}</p>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {usuario.tipo === 'profissional' && !usuario.validado && (
                <Btn cor="emerald" onClick={() => executar(() => adminActions.marcarValidado(id, true), 'Validado.')}>Marcar validado</Btn>
              )}
              {usuario.tipo === 'profissional' && usuario.validado && (
                <Btn cor="amber" onClick={() => executar(() => adminActions.marcarValidado(id, false), 'Validação removida.')}>Remover validação</Btn>
              )}
              {!usuario.suspenso ? (
                <Btn cor="red" onClick={() => {
                  const m = prompt('Motivo da suspensão:')
                  if (m && m.trim()) void executar(() => adminActions.suspenderUsuario(id, m.trim()), 'Usuário suspenso.')
                }}>Suspender</Btn>
              ) : (
                <Btn cor="emerald" onClick={() => executar(() => adminActions.reativarUsuario(id), 'Usuário reativado.')}>Reativar</Btn>
              )}
              <Btn cor="blue" onClick={() => setModalNotif(true)}>📨 Notificar</Btn>
            </div>
          </div>
        </section>

        {/* Stats grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <CardStat titulo="Atendimentos ativos" valor={stats.atendimentosAtivos} />
          <CardStat titulo="Atendimentos concluídos" valor={stats.atendimentosConcluidos} />
          <CardStat titulo="Atendimentos cancelados" valor={stats.atendimentosCancelados} />
          <CardStat titulo="Nota média" valor={stats.notaMedia != null ? `${stats.notaMedia.toFixed(1)} ★` : '—'} sub={`${stats.avaliacoesRecebidas} avaliação(ões)`} />
          {usuario.tipo === 'cliente' && (
            <>
              <CardStat titulo="Demandas publicadas" valor={stats.demandasPublicadas} />
              <CardStat titulo="Total pago" valor={formatarValorBrl(stats.totalPago)} />
            </>
          )}
          {usuario.tipo === 'profissional' && (
            <>
              <CardStat titulo="Propostas enviadas" valor={stats.propostasEnviadas} />
              <CardStat titulo="Saldo na carteira" valor={formatarValorBrl(stats.saldoCarteira)} />
              <CardStat titulo="Total recebido" valor={formatarValorBrl(stats.totalRecebidoCarteira)} />
              <CardStat titulo="Total sacado" valor={formatarValorBrl(stats.totalSaqueado)} />
            </>
          )}
          <CardStat titulo="Denúncias contra" valor={stats.denunciasContra} destaque={stats.denunciasContra > 0} />
          <CardStat titulo="Denúncias enviadas" valor={stats.denunciasEnviadas} />
        </section>

        {/* Documentos */}
        {usuario.tipo === 'profissional' && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">Documentos enviados</p>
              <Link href="/admin/validacoes" className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:underline">Ver na fila →</Link>
            </div>
            {documentos.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 dark:text-slate-400">Este prestador ainda não enviou nenhum documento.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-slate-800">
                {documentos.map((d) => {
                  const cor = d.status === 'aprovado' ? 'emerald' : d.status === 'rejeitado' ? 'red' : 'amber'
                  return (
                    <li key={d.id} className="p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{d.tipo_documento}</p>
                        <Badge cor={cor}>{d.status}</Badge>
                      </div>
                      {d.motivo_rejeicao && (
                        <p className="text-[11px] text-red-700 dark:text-red-300 italic">Motivo: {d.motivo_rejeicao}</p>
                      )}
                      <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-slate-500">
                        <span>{formatarRelativoPt(d.criado_em)}</span>
                        <a href={d.arquivo_url} target="_blank" rel="noopener noreferrer" className="text-amber-700 dark:text-amber-300 font-semibold">Ver arquivo ↗</a>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}
      </div>

      {modalNotif && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setModalNotif(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">Notificar {usuario.nome}</h3>
            <input value={notifTitulo} onChange={(e) => setNotifTitulo(e.target.value)} placeholder="Título"
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm" />
            <textarea value={notifCorpo} onChange={(e) => setNotifCorpo(e.target.value)} rows={4} placeholder="Mensagem"
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm resize-none" />
            <div className="flex gap-2">
              <button onClick={() => { setModalNotif(false); setNotifTitulo(''); setNotifCorpo('') }}
                className="flex-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 font-semibold py-2.5 rounded-xl text-sm">Cancelar</button>
              <button onClick={enviarNotificacao} disabled={!notifTitulo.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm">Enviar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function Badge({ cor, children }: { cor: 'amber' | 'purple' | 'emerald' | 'red'; children: React.ReactNode }) {
  const cls = {
    amber: 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200',
    purple: 'bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-200',
    emerald: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200',
    red: 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-200',
  }[cor]
  return <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cls}`}>{children}</span>
}

function Btn({ cor, onClick, children }: { cor: 'amber' | 'emerald' | 'red' | 'blue' | 'purple'; onClick: () => void; children: React.ReactNode }) {
  const cls = {
    amber: 'bg-amber-600 hover:bg-amber-700',
    emerald: 'bg-emerald-600 hover:bg-emerald-700',
    red: 'bg-red-600 hover:bg-red-700',
    blue: 'bg-blue-600 hover:bg-blue-700',
    purple: 'bg-purple-600 hover:bg-purple-700',
  }[cor]
  return <button onClick={onClick} className={`text-xs font-semibold px-3 py-2 rounded-xl text-white ${cls}`}>{children}</button>
}

function CardStat({ titulo, valor, sub, destaque = false }: { titulo: string; valor: string | number; sub?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${
      destaque
        ? 'border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30'
        : 'border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900'
    }`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">{titulo}</p>
      <p className={`text-xl font-bold mt-1 ${destaque ? 'text-red-900 dark:text-red-100' : 'text-gray-900 dark:text-slate-100'}`}>{valor}</p>
      {sub && <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
