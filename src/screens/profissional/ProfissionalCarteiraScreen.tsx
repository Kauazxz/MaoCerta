'use client'

import { useEffect, useMemo, useState, FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { prestadorService, type WalletTransaction, type Saque } from '@/lib/supabase/prestador'
import { formatarDataPt } from '@/lib/formatar-data'

type Aba = 'movimentacoes' | 'saques'

function formatarValor(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function badgeSaque(status: string) {
  switch (status) {
    case 'processado':
      return { label: 'Processado', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'cancelado':
      return { label: 'Cancelado', className: 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700' }
    default:
      return { label: 'Pendente', className: 'bg-amber-50 text-amber-900 border-amber-200' }
  }
}

export default function ProfissionalCarteiraScreen() {
  const [aba, setAba] = useState<Aba>('movimentacoes')
  const [userId, setUserId] = useState<string | null>(null)
  const [saldo, setSaldo] = useState(0)
  const [saldoBloqueado, setSaldoBloqueado] = useState(0)
  const [movimentacoes, setMovimentacoes] = useState<WalletTransaction[]>([])
  const [saques, setSaques] = useState<Saque[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const [mostrarSaque, setMostrarSaque] = useState(false)
  const [valorSaque, setValorSaque] = useState('')
  const [observacao, setObservacao] = useState('')
  const [enviandoSaque, setEnviandoSaque] = useState(false)

  const [chavePix, setChavePix] = useState<string | null>(null)
  const [tipoChavePix, setTipoChavePix] = useState<string | null>(null)
  const [editChavePix, setEditChavePix] = useState(false)
  const [novaChave, setNovaChave] = useState('')
  const [novaChaveTipo, setNovaChaveTipo] = useState<'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'>('cpf')
  const [salvandoChave, setSalvandoChave] = useState(false)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    setAviso(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setAviso({ tipo: 'erro', texto: 'Faça login como prestador para acessar a carteira.' })
        return
      }
      setUserId(user.id)
      const [wallet, movs, sqs, pix] = await Promise.all([
        prestadorService.getWallet(user.id),
        prestadorService.getWalletTransactions(user.id),
        prestadorService.getSaques(user.id),
        prestadorService.getChavePix(user.id),
      ])
      setSaldo(Number(wallet?.saldo ?? 0))
      setSaldoBloqueado(Number(wallet?.saldo_bloqueado ?? 0))
      setMovimentacoes(movs)
      setSaques(sqs)
      setChavePix(pix.chave)
      setTipoChavePix(pix.tipo)
      if (!pix.chave) setEditChavePix(true)
    } catch (e) {
      console.error(e)
      setAviso({ tipo: 'erro', texto: 'Não foi possível carregar a carteira.' })
    } finally {
      setCarregando(false)
    }
  }

  const totalPendente = useMemo(
    () => saques.filter(s => s.status === 'pendente').reduce((acc, s) => acc + Number(s.valor), 0),
    [saques],
  )

  const saldoDisponivel = Math.max(0, saldo - totalPendente)

  async function enviarSaque(e: FormEvent) {
    e.preventDefault()
    if (!userId) return
    if (!chavePix) {
      setAviso({ tipo: 'erro', texto: 'Cadastre sua chave Pix antes de solicitar saque.' })
      setEditChavePix(true)
      return
    }
    const valor = Number(valorSaque.replace(',', '.'))
    if (!valor || valor <= 0) {
      setAviso({ tipo: 'erro', texto: 'Informe um valor válido.' })
      return
    }
    if (valor > saldoDisponivel) {
      setAviso({ tipo: 'erro', texto: `Você só tem ${formatarValor(saldoDisponivel)} disponível para saque.` })
      return
    }
    setEnviandoSaque(true)
    try {
      await prestadorService.solicitarSaque(userId, valor, observacao || undefined)
      setAviso({ tipo: 'ok', texto: `Solicitação de ${formatarValor(valor)} enviada. Você acompanha o status abaixo.` })
      setValorSaque('')
      setObservacao('')
      setMostrarSaque(false)
      setAba('saques')
      await carregar()
    } catch (err: unknown) {
      console.error(err)
      const cod = (err as Error & { codigo?: string }).codigo || (err as Error).message
      if (cod === 'abaixo_minimo') {
        setAviso({ tipo: 'erro', texto: 'Valor abaixo do mínimo permitido para saque.' })
      } else {
        setAviso({ tipo: 'erro', texto: 'Não foi possível registrar o saque. Tente novamente.' })
      }
    } finally {
      setEnviandoSaque(false)
    }
  }

  async function salvarChavePix(e: FormEvent) {
    e.preventDefault()
    if (!userId) return
    const valor = novaChave.trim()
    if (!valor) {
      setAviso({ tipo: 'erro', texto: 'Informe a chave Pix.' })
      return
    }
    setSalvandoChave(true)
    try {
      await prestadorService.salvarChavePix(userId, valor, novaChaveTipo)
      setChavePix(valor)
      setTipoChavePix(novaChaveTipo)
      setEditChavePix(false)
      setNovaChave('')
      setAviso({ tipo: 'ok', texto: 'Chave Pix salva.' })
    } catch (err) {
      console.error(err)
      setAviso({ tipo: 'erro', texto: 'Não foi possível salvar a chave Pix.' })
    } finally {
      setSalvandoChave(false)
    }
  }

  async function cancelarSaque(id: string) {
    try {
      await prestadorService.cancelarSaque(id)
      await carregar()
    } catch (err) {
      console.error(err)
      setAviso({ tipo: 'erro', texto: 'Não foi possível cancelar o saque.' })
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50/40 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 pb-10">
      <header className="min-h-[200px] flex items-end bg-gradient-to-br from-emerald-700 via-teal-600 to-cyan-600 text-white px-4 pt-8 pb-12 rounded-b-[2rem] shadow-lg">
        <div className="max-w-lg mx-auto w-full space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Carteira interna</p>
          <h1 className="text-2xl font-bold">Seu saldo</h1>
          <p className="text-sm text-white/85 leading-relaxed">
            Acompanhe créditos, débitos e solicite saque dos valores recebidos.
          </p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 -mt-6 space-y-4 relative z-10">
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-md p-5 space-y-3">
          <div>
            <p className="text-[11px] text-gray-500 dark:text-slate-400 uppercase tracking-wider">Disponível para saque</p>
            <p className="text-3xl font-extrabold text-emerald-700 mt-1">{formatarValor(saldoDisponivel)}</p>
            {saldoBloqueado > 0 && (
              <p className="text-sm font-semibold text-amber-800 mt-2">
                Em escrow / bloqueado: {formatarValor(saldoBloqueado)}
              </p>
            )}
            <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-2 leading-relaxed">
              Créditos disponíveis após liberação das etapas. Sem recarga manual (RN24). Saques via fluxo anti-fraude
              (S1).
            </p>
            {totalPendente > 0 && (
              <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
                {formatarValor(totalPendente)} em saques pendentes
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMostrarSaque(v => !v)}
            disabled={saldoDisponivel <= 0 || !chavePix}
            className="w-full bg-emerald-700 text-white font-bold py-3 rounded-2xl text-sm hover:bg-emerald-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mostrarSaque ? 'Cancelar' : 'Solicitar saque'}
          </button>
          {!chavePix && (
            <p className="text-[11px] text-amber-800 font-semibold">
              Cadastre sua chave Pix abaixo para liberar o botão de saque.
            </p>
          )}
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-md p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Chave Pix para receber
              </p>
              {chavePix ? (
                <>
                  <p className="text-sm font-bold text-gray-900 dark:text-slate-100 mt-1 break-all">{chavePix}</p>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                    Tipo: <strong className="uppercase">{tipoChavePix || '—'}</strong>
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-700 dark:text-slate-300 mt-1">Ainda nao cadastrada.</p>
              )}
            </div>
            {!editChavePix && (
              <button
                type="button"
                onClick={() => {
                  setEditChavePix(true)
                  setNovaChave(chavePix ?? '')
                  setNovaChaveTipo(
                    (['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'].includes((tipoChavePix ?? '') as string)
                      ? (tipoChavePix as 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria')
                      : 'cpf'),
                  )
                }}
                className="text-[11px] font-semibold text-emerald-700 hover:underline"
              >
                {chavePix ? 'Alterar' : 'Cadastrar'}
              </button>
            )}
          </div>

          {editChavePix && (
            <form onSubmit={salvarChavePix} className="space-y-2 border-t border-gray-100 dark:border-slate-800 pt-3">
              <label className="block">
                <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide">
                  Tipo da chave
                </span>
                <select
                  value={novaChaveTipo}
                  onChange={e => setNovaChaveTipo(e.target.value as typeof novaChaveTipo)}
                  className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-600"
                >
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                  <option value="email">E-mail</option>
                  <option value="telefone">Telefone</option>
                  <option value="aleatoria">Aleatoria</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide">
                  Chave
                </span>
                <input
                  type="text"
                  value={novaChave}
                  onChange={e => setNovaChave(e.target.value)}
                  placeholder="Ex.: 123.456.789-00, seu@email.com..."
                  required
                  className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-600 focus:bg-white"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={salvandoChave}
                  className="flex-1 bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-emerald-800 disabled:opacity-50"
                >
                  {salvandoChave ? 'Salvando...' : 'Salvar chave Pix'}
                </button>
                {chavePix && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditChavePix(false)
                      setNovaChave('')
                    }}
                    className="text-xs font-semibold text-gray-600 dark:text-slate-400 px-3"
                  >
                    Voltar
                  </button>
                )}
              </div>
              <p className="text-[10px] text-gray-500 dark:text-slate-500 leading-relaxed">
                A chave fica salva no seu perfil e é copiada para cada solicitação de saque (snapshot).
              </p>
            </form>
          )}
        </section>

        {mostrarSaque && (
          <form onSubmit={enviarSaque} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-md p-5 space-y-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100">Nova solicitação de saque</h2>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                Saldo disponível: <strong>{formatarValor(saldoDisponivel)}</strong>
              </p>
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide">Valor (R$)</span>
              <input
                type="text"
                inputMode="decimal"
                value={valorSaque}
                onChange={e => setValorSaque(e.target.value)}
                placeholder="0,00"
                required
                className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-600 focus:bg-white dark:bg-slate-900"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide">Observação (opcional)</span>
              <textarea
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
                rows={2}
                placeholder="Ex.: chave Pix, banco preferido..."
                className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-600 focus:bg-white resize-none"
              />
            </label>

            <button
              type="submit"
              disabled={enviandoSaque}
              className="w-full bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-emerald-800 disabled:opacity-50"
            >
              {enviandoSaque ? 'Enviando...' : 'Confirmar saque'}
            </button>
          </form>
        )}

        {aviso && (
          <div
            className={`rounded-2xl p-3 text-sm font-medium ${
              aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {aviso.texto}
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-1 grid grid-cols-2 gap-1 shadow border border-gray-100 dark:border-slate-800">
          <BotaoAba ativo={aba === 'movimentacoes'} onClick={() => setAba('movimentacoes')} contador={movimentacoes.length}>
            Movimentações
          </BotaoAba>
          <BotaoAba ativo={aba === 'saques'} onClick={() => setAba('saques')} contador={saques.length}>
            Saques
          </BotaoAba>
        </div>

        {carregando && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow border border-gray-100 dark:border-slate-800 flex items-center gap-3">
            <span className="inline-block w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600 dark:text-slate-400">Carregando...</p>
          </div>
        )}

        {!carregando && aba === 'movimentacoes' && movimentacoes.length > 0 && (
          <ul className="space-y-2">
            {movimentacoes.map(m => (
              <li key={m.id} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 p-4 flex items-center gap-3">
                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-base font-bold ${
                    m.tipo === 'debito' || m.tipo === 'estorno_disputa' || m.tipo === 'saque'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {m.tipo === 'debito' || m.tipo === 'estorno_disputa' || m.tipo === 'saque' ? '↓' : '↑'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{m.descricao}</p>
                  <p className="text-[11px] text-gray-400 dark:text-slate-500">{formatarDataPt(m.created_at)}</p>
                </div>
                <span
                  className={`text-sm font-bold whitespace-nowrap ${
                    m.tipo === 'debito' || m.tipo === 'estorno_disputa' || m.tipo === 'saque'
                      ? 'text-red-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {m.tipo === 'debito' || m.tipo === 'estorno_disputa' || m.tipo === 'saque' ? '−' : '+'}
                  {formatarValor(Number(m.valor))}
                </span>
              </li>
            ))}
          </ul>
        )}

        {!carregando && aba === 'movimentacoes' && movimentacoes.length === 0 && (
          <Vazio
            emoji="💸"
            titulo="Nenhuma movimentação ainda"
            texto="Créditos e débitos da sua carteira aparecem aqui assim que houver atendimento finalizado."
          />
        )}

        {!carregando && aba === 'saques' && saques.length > 0 && (
          <ul className="space-y-2">
            {saques.map(s => {
              const badge = badgeSaque(s.status)
              return (
                <li key={s.id} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <time className="text-[11px] text-gray-400 dark:text-slate-500">{formatarDataPt(s.created_at)}</time>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-base font-bold text-gray-900 dark:text-slate-100">{formatarValor(Number(s.valor))}</p>
                    {s.status === 'pendente' && (
                      <button
                        type="button"
                        onClick={() => cancelarSaque(s.id)}
                        className="text-[11px] text-red-600 font-semibold hover:text-red-800"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                  {s.observacao && <p className="text-xs text-gray-500 dark:text-slate-400">{s.observacao}</p>}
                </li>
              )
            })}
          </ul>
        )}

        {!carregando && aba === 'saques' && saques.length === 0 && (
          <Vazio
            emoji="🏦"
            titulo="Nenhum saque solicitado"
            texto="Quando você solicitar um saque, ele aparece aqui com o status (pendente, processado ou cancelado)."
          />
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
        ativo ? 'bg-emerald-700 text-white' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:bg-slate-800 dark:hover:bg-slate-800'
      }`}
    >
      {children}
      <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${ativo ? 'bg-white/25' : 'bg-gray-100 dark:bg-slate-800'}`}>
        {contador}
      </span>
    </button>
  )
}

function Vazio({ emoji, titulo, texto }: { emoji: string; titulo: string; texto: string }) {
  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm text-center space-y-2">
      <p className="text-4xl">{emoji}</p>
      <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">{titulo}</p>
      <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">{texto}</p>
    </section>
  )
}
