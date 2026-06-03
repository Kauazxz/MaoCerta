'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatarDataPt } from '@/lib/formatar-data'

type SaqueRow = {
  id: string
  user_id: string
  valor: number
  status: 'pendente' | 'processado' | 'cancelado'
  observacao: string | null
  chave_pix_destino: string | null
  tipo_chave_destino: string | null
  processado_em: string | null
  created_at: string
  comprovante_obs: string | null
  profiles?: { nome: string | null; email: string | null } | null
}

type Aba = 'pendentes' | 'historico'

function formatarValor(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function badge(status: SaqueRow['status']) {
  switch (status) {
    case 'processado':
      return { label: 'Processado', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
    case 'cancelado':
      return { label: 'Cancelado', cls: 'bg-slate-100 text-slate-700 border-slate-200' }
    default:
      return { label: 'Pendente', cls: 'bg-amber-50 text-amber-900 border-amber-200' }
  }
}

export default function AdminSaquesScreen() {
  const [aba, setAba] = useState<Aba>('pendentes')
  const [pendentes, setPendentes] = useState<SaqueRow[]>([])
  const [historico, setHistorico] = useState<SaqueRow[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [processandoId, setProcessandoId] = useState<string | null>(null)
  const [obsPorSaque, setObsPorSaque] = useState<Record<string, string>>({})
  const [copiouId, setCopiouId] = useState<string | null>(null)

  useEffect(() => {
    void carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    setAviso(null)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('saques')
        .select(
          'id, user_id, valor, status, observacao, chave_pix_destino, tipo_chave_destino, processado_em, created_at, comprovante_obs, profiles:user_id (nome, email)',
        )
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      const rows = (data as unknown as SaqueRow[]) || []
      setPendentes(rows.filter(s => s.status === 'pendente'))
      setHistorico(rows.filter(s => s.status !== 'pendente'))
    } catch (e) {
      console.error(e)
      setAviso({ tipo: 'erro', texto: 'Sem permissao ou erro ao carregar saques.' })
    } finally {
      setCarregando(false)
    }
  }

  async function marcarComoPago(id: string) {
    setProcessandoId(id)
    setAviso(null)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('fn_admin_processar_saque', {
        p_saque_id: id,
        p_observacao: obsPorSaque[id] || null,
      })
      if (error) throw error
      const row = data as { ok?: boolean; erro?: string }
      if (row && row.ok === false) {
        setAviso({ tipo: 'erro', texto: mapErro(row.erro) })
        return
      }
      setAviso({ tipo: 'ok', texto: 'Saque marcado como processado. Saldo debitado e prestador notificado.' })
      setObsPorSaque(prev => {
        const cp = { ...prev }
        delete cp[id]
        return cp
      })
      await carregar()
    } catch (e) {
      console.error(e)
      setAviso({ tipo: 'erro', texto: 'Falha ao marcar como pago.' })
    } finally {
      setProcessandoId(null)
    }
  }

  async function copiarChave(id: string, chave: string | null) {
    if (!chave) return
    try {
      await navigator.clipboard.writeText(chave)
      setCopiouId(id)
      setTimeout(() => setCopiouId(prev => (prev === id ? null : prev)), 2000)
    } catch {
      setAviso({ tipo: 'erro', texto: 'Nao foi possivel copiar a chave.' })
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 px-4 pt-8">
      <div className="max-w-lg mx-auto space-y-4">
        <header>
          <Link href="/admin/inicio" className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100">
            ← Inicio
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">Saques de prestadores</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Pendentes precisam ser pagos no app do banco e marcados como pagos aqui para debitar o saldo.
          </p>
        </header>

        {aviso && (
          <div
            className={`rounded-xl px-3 py-2.5 text-xs font-medium border ${
              aviso.tipo === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {aviso.texto}
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-1 grid grid-cols-2 gap-1 shadow border border-slate-200 dark:border-slate-800">
          <BotaoAba ativo={aba === 'pendentes'} onClick={() => setAba('pendentes')} contador={pendentes.length}>
            Pendentes
          </BotaoAba>
          <BotaoAba ativo={aba === 'historico'} onClick={() => setAba('historico')} contador={historico.length}>
            Historico
          </BotaoAba>
        </div>

        {carregando && <p className="text-sm text-slate-500">Carregando...</p>}

        {!carregando && aba === 'pendentes' && pendentes.length === 0 && (
          <Vazio
            emoji="✅"
            titulo="Sem saques pendentes"
            texto="Quando um prestador solicitar saque, ele aparece aqui com a chave Pix e o valor."
          />
        )}

        {!carregando && aba === 'pendentes' && (
          <ul className="space-y-3">
            {pendentes.map(s => {
              const proc = processandoId === s.id
              return (
                <li
                  key={s.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {s.profiles?.nome || 'Prestador'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{s.profiles?.email}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                        Solicitado em {formatarDataPt(s.created_at)}
                      </p>
                    </div>
                    <span className="text-base font-extrabold text-emerald-700 whitespace-nowrap">
                      {formatarValor(Number(s.valor))}
                    </span>
                  </div>

                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Chave Pix de destino
                    </p>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-mono text-slate-900 dark:text-slate-100 break-all">
                        {s.chave_pix_destino || '— sem chave salva —'}
                      </p>
                      {s.chave_pix_destino && (
                        <button
                          type="button"
                          onClick={() => copiarChave(s.id, s.chave_pix_destino)}
                          className="text-[11px] font-semibold text-emerald-700 hover:underline whitespace-nowrap"
                        >
                          {copiouId === s.id ? 'Copiado!' : 'Copiar'}
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Tipo: <strong className="uppercase">{s.tipo_chave_destino || '—'}</strong>
                    </p>
                  </div>

                  {s.observacao && (
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Observacao do prestador: <em>{s.observacao}</em>
                    </p>
                  )}

                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Comprovante / observacao (opcional)
                    </span>
                    <textarea
                      value={obsPorSaque[s.id] || ''}
                      onChange={e => setObsPorSaque(prev => ({ ...prev, [s.id]: e.target.value }))}
                      rows={2}
                      placeholder="Ex.: pago via banco X, transacao 123456..."
                      className="mt-1 w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 focus:outline-none focus:border-emerald-600"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={proc}
                    onClick={() => marcarComoPago(s.id)}
                    className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {proc ? 'Marcando...' : 'Confirmar Pix pago — debitar saldo'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {!carregando && aba === 'historico' && historico.length === 0 && (
          <Vazio
            emoji="🗂"
            titulo="Sem historico"
            texto="Saques processados ou cancelados aparecem aqui."
          />
        )}

        {!carregando && aba === 'historico' && historico.length > 0 && (
          <ul className="space-y-2">
            {historico.map(s => {
              const b = badge(s.status)
              return (
                <li
                  key={s.id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${b.cls}`}>
                      {b.label}
                    </span>
                    <time className="text-[10px] text-slate-400 dark:text-slate-500">
                      {s.processado_em ? formatarDataPt(s.processado_em) : formatarDataPt(s.created_at)}
                    </time>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {s.profiles?.nome || 'Prestador'}
                    </p>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {formatarValor(Number(s.valor))}
                    </p>
                  </div>
                  {s.chave_pix_destino && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono break-all">
                      Pix: {s.chave_pix_destino}
                    </p>
                  )}
                  {s.comprovante_obs && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{s.comprovante_obs}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
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
  contador: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-semibold py-2.5 rounded-xl transition-colors ${
        ativo ? 'bg-emerald-700 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
    >
      {children}
      <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${ativo ? 'bg-white/25' : 'bg-slate-100 dark:bg-slate-800'}`}>
        {contador}
      </span>
    </button>
  )
}

function Vazio({ emoji, titulo, texto }: { emoji: string; titulo: string; texto: string }) {
  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm text-center space-y-2">
      <p className="text-4xl">{emoji}</p>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{titulo}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">{texto}</p>
    </section>
  )
}

function mapErro(c?: string) {
  switch (c) {
    case 'apenas_admin':
      return 'Voce nao tem permissao de administrador.'
    case 'saque_invalido':
      return 'Saque nao encontrado.'
    case 'status_invalido':
      return 'Este saque ja foi processado ou cancelado.'
    case 'saldo_insuficiente':
      return 'O saldo do prestador esta abaixo do valor do saque.'
    default:
      return c ? `Erro: ${c}` : 'Operacao nao permitida.'
  }
}
