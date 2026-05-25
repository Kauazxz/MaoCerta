'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { adminActions } from '@/lib/supabase/admin-actions'
import { formatarDataPt, formatarRelativoPt } from '@/lib/formatar-data'
import CabecalhoAdmin from '@/components/admin/CabecalhoAdmin'

type Documento = {
  id: string
  tipo_documento: string
  arquivo_url: string
  status: string
  motivo_rejeicao: string | null
  criado_em: string
  analisado_em: string | null
  profissional_id: string
  profissional: { nome: string; cidade: string | null; estado: string | null } | null
}

type FiltroStatus = 'pendentes' | 'todos' | 'aprovados' | 'rejeitados'

export default function AdminValidacoesScreen() {
  const [docs, setDocs] = useState<Documento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [filtro, setFiltro] = useState<FiltroStatus>('pendentes')
  const [acao, setAcao] = useState<string | null>(null)
  const [modalRejeicao, setModalRejeicao] = useState<Documento | null>(null)
  const [motivo, setMotivo] = useState('')

  async function carregar() {
    setCarregando(true)
    const sb = createClient()
    const { data, error } = await sb
      .from('documentos_validacao')
      .select(`
        id, tipo_documento, arquivo_url, status, motivo_rejeicao, criado_em, analisado_em, profissional_id,
        profissional:profissional_id ( nome, cidade, estado )
      `)
      .order('criado_em', { ascending: false })
    console.log('[admin/validacoes] retorno bruto:', { data, error, count: data?.length })
    if (error) {
      setAviso({ tipo: 'erro', texto: `Erro ao consultar banco: ${error.message}` })
    }
    setDocs(((data as unknown as Documento[]) || []))
    setCarregando(false)
  }

  useEffect(() => { void carregar() }, [])

  const filtrados = docs.filter((d) => {
    const s = (d.status || '').toLowerCase().trim()
    if (filtro === 'pendentes') return s === 'pendente' || s === 'em_analise' || s === 'enviado'
    if (filtro === 'aprovados') return s === 'aprovado'
    if (filtro === 'rejeitados') return s === 'rejeitado'
    return true
  })

  async function aprovar(docId: string) {
    setAcao(docId)
    setAviso(null)
    const r = await adminActions.aprovarDocumento(docId)
    setAcao(null)
    if (!r.ok) {
      setAviso({ tipo: 'erro', texto: r.erro || 'Falha' })
      return
    }
    setAviso({ tipo: 'ok', texto: 'Documento aprovado. Prestador marcado como validado.' })
    void carregar()
  }

  async function confirmarRejeicao() {
    if (!modalRejeicao || !motivo.trim()) return
    const id = modalRejeicao.id
    setModalRejeicao(null)
    setMotivo('')
    setAcao(id)
    const r = await adminActions.rejeitarDocumento(id, motivo.trim())
    setAcao(null)
    if (!r.ok) {
      setAviso({ tipo: 'erro', texto: r.erro || 'Falha' })
      return
    }
    setAviso({ tipo: 'ok', texto: 'Documento rejeitado.' })
    void carregar()
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50/40 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 pb-10">
      <CabecalhoAdmin titulo="Validação de documentos" subtitulo="RF57 · RN30 · RN31" />

      <div className="max-w-6xl mx-auto px-4 -mt-8 space-y-3 relative z-10">
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-3 flex gap-2 flex-wrap">
          {(['pendentes', 'aprovados', 'rejeitados', 'todos'] as FiltroStatus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border ${
                filtro === f
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700'
              }`}
            >
              {f}
            </button>
          ))}
          <span className="text-[11px] text-gray-500 dark:text-slate-400 ml-auto self-center">
            {filtrados.length} doc(s)
          </span>
        </section>

        {aviso && (
          <p className={`text-xs rounded-xl p-3 font-medium ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900/40'
              : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-900/40'
          }`}>{aviso.texto}</p>
        )}

        {carregando && <p className="text-center text-sm text-gray-500 dark:text-slate-400 py-8">Carregando...</p>}
        {!carregando && filtrados.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center text-sm text-gray-500 dark:text-slate-400">
            Nenhum documento neste filtro.
          </div>
        )}

        {!carregando && filtrados.map((d) => {
          const badge = badgeStatus(d.status)
          return (
            <article key={d.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900 dark:text-slate-100">{d.profissional?.nome || '—'}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge.cls}`}>
                      {badge.txt}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-slate-500">
                    {[d.profissional?.cidade, d.profissional?.estado].filter(Boolean).join(' - ') || 'sem local'}
                  </p>
                  <a
                    href={`/admin/usuarios/${d.profissional_id}`}
                    className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:underline"
                  >
                    Ver perfil completo →
                  </a>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-slate-400">{d.tipo_documento}</p>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500">enviado {formatarRelativoPt(d.criado_em)}</p>
                </div>
              </div>

              {d.motivo_rejeicao && (
                <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 px-3 py-2">
                  <p className="text-[10px] font-bold text-red-700 dark:text-red-300 uppercase">Motivo de rejeição</p>
                  <p className="text-xs text-red-900 dark:text-red-200 mt-0.5">{d.motivo_rejeicao}</p>
                  {d.analisado_em && (
                    <p className="text-[10px] text-red-700 dark:text-red-300 mt-1">em {formatarDataPt(d.analisado_em)}</p>
                  )}
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <a
                  href={d.arquivo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold px-3 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-700"
                >
                  📎 Ver arquivo
                </a>
                {(d.status === 'pendente' || d.status === 'em_analise') && (
                  <>
                    <button
                      onClick={() => aprovar(d.id)}
                      disabled={acao === d.id}
                      className="text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                    >
                      ✓ Aprovar
                    </button>
                    <button
                      onClick={() => { setModalRejeicao(d); setMotivo('') }}
                      disabled={acao === d.id}
                      className="text-xs font-semibold px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                    >
                      ✕ Rejeitar
                    </button>
                  </>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {modalRejeicao && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setModalRejeicao(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">Rejeitar documento</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              O motivo será mostrado ao prestador na tela de validação. Seja específico para que ele possa corrigir e reenviar.
            </p>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              placeholder="Ex.: A foto está borrada, não dá pra ler o número do documento. Reenvie em boa qualidade."
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setModalRejeicao(null); setMotivo('') }}
                className="flex-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 font-semibold py-2.5 rounded-xl text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarRejeicao}
                disabled={!motivo.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm"
              >
                Rejeitar com este motivo
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function badgeStatus(status: string) {
  const s = (status || '').toLowerCase()
  if (s === 'aprovado')   return { txt: 'Aprovado',  cls: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900/40' }
  if (s === 'rejeitado')  return { txt: 'Rejeitado', cls: 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-900/40' }
  if (s === 'em_analise') return { txt: 'Em análise', cls: 'bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-900/40' }
  return                     { txt: 'Pendente',  cls: 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900/40' }
}
