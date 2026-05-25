'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { adminActions, type UsuarioAdmin } from '@/lib/supabase/admin-actions'
import { formatarDataPt } from '@/lib/formatar-data'
import CabecalhoAdmin from '@/components/admin/CabecalhoAdmin'

type Usuario = UsuarioAdmin

type FiltroTipo = 'todos' | 'cliente' | 'profissional' | 'administrador'

export default function AdminUsuariosScreen() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos')
  const [acao, setAcao] = useState<{ id: string; tipo: string } | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [modalSuspensao, setModalSuspensao] = useState<Usuario | null>(null)
  const [motivoSuspensao, setMotivoSuspensao] = useState('')
  const [modalNotificar, setModalNotificar] = useState<Usuario | null>(null)
  const [notifTitulo, setNotifTitulo] = useState('')
  const [notifCorpo, setNotifCorpo] = useState('')

  async function carregar() {
    setCarregando(true)
    const r = await adminActions.listarUsuarios()
    if (!r.ok) {
      setAviso({ tipo: 'erro', texto: r.erro || 'Falha ao listar usuários.' })
    } else {
      setUsuarios(r.usuarios || [])
    }
    setCarregando(false)
  }

  useEffect(() => { void carregar() }, [])

  const listaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return usuarios.filter((u) => {
      if (filtroTipo !== 'todos' && u.tipo !== filtroTipo) return false
      if (q) {
        const blob = `${u.nome} ${u.email} ${u.cidade}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [usuarios, busca, filtroTipo])

  async function executar(id: string, tipoAcao: string, fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setAcao({ id, tipo: tipoAcao })
    setAviso(null)
    const r = await fn()
    setAcao(null)
    if (!r.ok) {
      setAviso({ tipo: 'erro', texto: r.erro || 'Falha' })
      return
    }
    setAviso({ tipo: 'ok', texto: 'Ação aplicada.' })
    void carregar()
  }

  async function confirmarSuspensao() {
    if (!modalSuspensao || !motivoSuspensao.trim()) return
    const userId = modalSuspensao.id
    setModalSuspensao(null)
    setMotivoSuspensao('')
    await executar(userId, 'suspender', () => adminActions.suspenderUsuario(userId, motivoSuspensao.trim()))
  }

  async function confirmarNotificacao() {
    if (!modalNotificar || !notifTitulo.trim()) return
    const userId = modalNotificar.id
    const titulo = notifTitulo.trim()
    const corpo = notifCorpo.trim()
    setModalNotificar(null)
    setNotifTitulo('')
    setNotifCorpo('')
    await executar(userId, 'notificar', () => adminActions.notificarUsuario(userId, titulo, corpo))
  }

  function abrirNotificarValidacao(u: Usuario) {
    setNotifTitulo('Envie seus documentos para validação')
    setNotifCorpo(
      'Olá! Para começar a atender clientes na MaoCerta você precisa enviar e ter pelo menos um documento aprovado. ' +
      'Acesse Ajustes → Validação e envie um CPF, CNPJ ou documento com foto. Avisaremos quando estiver tudo certo.',
    )
    setModalNotificar(u)
  }

  function abrirNotificarLivre(u: Usuario) {
    setNotifTitulo('')
    setNotifCorpo('')
    setModalNotificar(u)
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50/40 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 pb-10">
      <CabecalhoAdmin titulo="Usuários" subtitulo="Gerenciar contas — RF56, RF61" />

      <div className="max-w-6xl mx-auto px-4 -mt-8 space-y-3 relative z-10">
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-3 space-y-3">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, email ou cidade..."
            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
          />
          <div className="flex gap-2 flex-wrap">
            {(['todos', 'cliente', 'profissional', 'administrador'] as FiltroTipo[]).map((f) => (
              <button
                key={f}
                onClick={() => setFiltroTipo(f)}
                className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border ${
                  filtroTipo === f
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700'
                }`}
              >
                {f}
              </button>
            ))}
            <span className="text-[11px] text-gray-500 dark:text-slate-400 ml-auto self-center">
              {listaFiltrada.length} resultado(s)
            </span>
          </div>
        </section>

        {aviso && (
          <p className={`text-xs rounded-xl p-3 font-medium ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900/40'
              : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-900/40'
          }`}>
            {aviso.texto}
          </p>
        )}

        {carregando && <p className="text-center text-sm text-gray-500 dark:text-slate-400 py-8">Carregando...</p>}

        {!carregando && listaFiltrada.map((u) => {
          const acaoEmCurso = acao?.id === u.id
          return (
            <article key={u.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/admin/usuarios/${u.id}`} className="font-bold text-gray-900 dark:text-slate-100 truncate hover:text-amber-700 dark:hover:text-amber-300">
                      {u.nome || '—'}
                    </Link>
                    <BadgeTipo tipo={u.tipo} />
                    {u.validado && <BadgePill cor="emerald">✓ Validado</BadgePill>}
                    {u.suspenso && <BadgePill cor="red">🚫 Suspenso</BadgePill>}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{u.email}</p>
                  <p className="text-[11px] text-gray-400 dark:text-slate-500">
                    {[u.cidade, u.estado].filter(Boolean).join(' - ') || 'sem local'} · cadastrado {formatarDataPt(u.created_at)}
                  </p>
                  {u.suspenso && u.motivo_suspensao && (
                    <p className="text-[11px] text-red-700 dark:text-red-300 mt-1 italic">
                      Motivo da suspensão: {u.motivo_suspensao}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                {u.tipo === 'profissional' && !u.validado && (
                  <>
                    <BotaoAcao
                      onClick={() => executar(u.id, 'validar', () => adminActions.marcarValidado(u.id, true))}
                      disabled={acaoEmCurso}
                      cor="emerald"
                    >
                      {acao?.id === u.id && acao.tipo === 'validar' ? 'Validando...' : 'Marcar validado'}
                    </BotaoAcao>
                    <BotaoAcao
                      onClick={() => abrirNotificarValidacao(u)}
                      disabled={acaoEmCurso}
                      cor="amber"
                    >
                      📨 Notificar a enviar docs
                    </BotaoAcao>
                  </>
                )}
                {u.tipo === 'profissional' && u.validado && (
                  <BotaoAcao
                    onClick={() => executar(u.id, 'invalidar', () => adminActions.marcarValidado(u.id, false))}
                    disabled={acaoEmCurso}
                    cor="amber"
                  >
                    Remover validação
                  </BotaoAcao>
                )}

                {!u.suspenso ? (
                  <BotaoAcao
                    onClick={() => setModalSuspensao(u)}
                    disabled={acaoEmCurso}
                    cor="red"
                  >
                    Suspender
                  </BotaoAcao>
                ) : (
                  <BotaoAcao
                    onClick={() => executar(u.id, 'reativar', () => adminActions.reativarUsuario(u.id))}
                    disabled={acaoEmCurso}
                    cor="emerald"
                  >
                    {acao?.id === u.id && acao.tipo === 'reativar' ? 'Reativando...' : 'Reativar'}
                  </BotaoAcao>
                )}

                {u.tipo !== 'administrador' && (
                  <BotaoAcao
                    onClick={() => {
                      if (confirm(`Promover ${u.nome} a administrador?`)) {
                        void executar(u.id, 'promover', () => adminActions.promoverAdministrador(u.id))
                      }
                    }}
                    disabled={acaoEmCurso}
                    cor="purple"
                  >
                    Promover a admin
                  </BotaoAcao>
                )}

                <BotaoAcao
                  onClick={() => abrirNotificarLivre(u)}
                  disabled={acaoEmCurso}
                  cor="blue"
                >
                  📨 Notificar
                </BotaoAcao>
              </div>
            </article>
          )
        })}
      </div>

      {/* Modal notificacao */}
      {modalNotificar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setModalNotificar(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">Notificar {modalNotificar.nome}</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              A mensagem aparecerá no sino de alertas dessa conta.
            </p>
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Título</span>
              <input
                value={notifTitulo}
                onChange={(e) => setNotifTitulo(e.target.value)}
                placeholder="Ex.: Envie seus documentos"
                className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Mensagem</span>
              <textarea
                value={notifCorpo}
                onChange={(e) => setNotifCorpo(e.target.value)}
                rows={4}
                className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm resize-none"
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => { setModalNotificar(null); setNotifTitulo(''); setNotifCorpo('') }}
                className="flex-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 font-semibold py-2.5 rounded-xl text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarNotificacao}
                disabled={!notifTitulo.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm"
              >
                Enviar notificação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal suspensao */}
      {modalSuspensao && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setModalSuspensao(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">Suspender {modalSuspensao.nome}</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              O usuário será marcado como suspenso e o motivo ficará registrado. Pode ser revertido depois.
            </p>
            <textarea
              value={motivoSuspensao}
              onChange={(e) => setMotivoSuspensao(e.target.value)}
              rows={3}
              placeholder="Motivo da suspensão (obrigatório)..."
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setModalSuspensao(null); setMotivoSuspensao('') }}
                className="flex-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 font-semibold py-2.5 rounded-xl text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarSuspensao}
                disabled={!motivoSuspensao.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm"
              >
                Suspender
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function BadgeTipo({ tipo }: { tipo: string }) {
  const cores: Record<string, string> = {
    cliente: 'bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-900/40',
    profissional: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900/40',
    administrador: 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900/40',
  }
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cores[tipo] || 'bg-gray-100 text-gray-700'}`}>
      {tipo}
    </span>
  )
}

function BadgePill({ cor, children }: { cor: 'emerald' | 'red' | 'amber'; children: React.ReactNode }) {
  const cls = {
    emerald: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200',
    red: 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-200',
    amber: 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200',
  }[cor]
  return <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cls}`}>{children}</span>
}

function BotaoAcao({
  onClick, disabled, cor, children,
}: {
  onClick: () => void; disabled?: boolean; cor: 'emerald' | 'red' | 'amber' | 'purple' | 'blue'; children: React.ReactNode
}) {
  const cls = {
    emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    red: 'bg-red-600 hover:bg-red-700 text-white',
    amber: 'bg-amber-600 hover:bg-amber-700 text-white',
    purple: 'bg-purple-600 hover:bg-purple-700 text-white',
    blue: 'bg-blue-600 hover:bg-blue-700 text-white',
  }[cor]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  )
}
