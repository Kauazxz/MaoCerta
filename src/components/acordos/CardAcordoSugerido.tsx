'use client'

import { useState } from 'react'
import { acordosService } from '@/lib/supabase/acordos'
import type { AcordoComConfirmacoes, TipoAcordo } from '@/types/acordos'

type Props = {
  acordo: AcordoComConfirmacoes
  meuId: string
  meuPapel: 'cliente' | 'profissional'
  onAlterado: () => void
}

const LABELS: Record<TipoAcordo, { titulo: string; cor: string; icone: string }> = {
  vistoria:     { titulo: 'Vistoria',     cor: 'border-amber-300 dark:border-amber-700',   icone: '🔍' },
  consulta:     { titulo: 'Consulta',     cor: 'border-amber-300 dark:border-amber-700',   icone: '🩺' },
  orcamento:    { titulo: 'Orçamento',    cor: 'border-purple-300 dark:border-purple-700', icone: '💰' },
  agendamento:  { titulo: 'Agendamento',  cor: 'border-blue-300 dark:border-blue-700',     icone: '📅' },
  execucao:     { titulo: 'Execução',     cor: 'border-emerald-300 dark:border-emerald-700', icone: '🛠️' },
  conclusao:    { titulo: 'Conclusão',    cor: 'border-emerald-300 dark:border-emerald-700', icone: '✅' },
  cancelamento: { titulo: 'Cancelamento', cor: 'border-red-300 dark:border-red-700',       icone: '❌' },
}

function formatarValor(v: number | null) {
  if (v == null) return null
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarDataHora(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function CardAcordoSugerido({ acordo, meuId, meuPapel, onAlterado }: Props) {
  const [acao, setAcao] = useState<null | 'aceitar' | 'recusar' | 'editar'>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [eResumo, setEResumo] = useState(acordo.resumo)
  const [eValor, setEValor] = useState(acordo.valor != null ? acordo.valor.toString().replace('.', ',') : '')
  const [eDataHora, setEDataHora] = useState(acordo.data_hora ? acordo.data_hora.slice(0, 16) : '')
  const [eObs, setEObs] = useState(acordo.observacoes || '')

  const label = LABELS[acordo.tipo]
  const valorFmt = formatarValor(acordo.valor)
  const dataHoraFmt = formatarDataHora(acordo.data_hora)

  const aceiteSeu = meuPapel === 'cliente' ? acordo.aceitouCliente : acordo.aceitouPrestador
  const aceiteOutro = meuPapel === 'cliente' ? acordo.aceitouPrestador : acordo.aceitouCliente
  const podeAgir =
    acordo.status === 'aguardando' || acordo.status === 'aceito' || acordo.status === 'editado'

  async function aceitar() {
    setAcao('aceitar')
    setErro(null)
    const r = await acordosService.aceitar(acordo.id, meuId)
    setAcao(null)
    if (!r.ok) {
      setErro(r.erro || 'Falha ao aceitar.')
      return
    }
    onAlterado()
  }

  async function recusar() {
    setAcao('recusar')
    setErro(null)
    const r = await acordosService.recusar(acordo.id, meuId)
    setAcao(null)
    if (!r.ok) {
      setErro(r.erro || 'Falha ao recusar.')
      return
    }
    onAlterado()
  }

  async function salvarEdicao() {
    setAcao('editar')
    setErro(null)
    const valorNum = eValor.trim() ? Number(eValor.replace(/\./g, '').replace(',', '.')) : null
    const dataHoraIso = eDataHora ? new Date(eDataHora).toISOString() : null
    const r = await acordosService.editar(acordo.id, meuId, {
      resumo: eResumo.trim(),
      valor: valorNum && !Number.isNaN(valorNum) ? valorNum : null,
      data_hora: dataHoraIso,
      observacoes: eObs.trim() || null,
    })
    setAcao(null)
    if (!r.ok) {
      setErro(r.erro || 'Falha ao salvar edição.')
      return
    }
    setEditando(false)
    onAlterado()
  }

  return (
    <article className={`bg-white dark:bg-slate-900 rounded-2xl border-2 ${label.cor} shadow-sm overflow-hidden`}>
      <div className="px-4 py-3 flex items-center justify-between gap-2 bg-gray-50 dark:bg-slate-800/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg" aria-hidden>{label.icone}</span>
          <p className="text-xs font-bold text-gray-700 dark:text-slate-200 uppercase tracking-wider truncate">
            {label.titulo} sugerido
          </p>
        </div>
        <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 shrink-0">
          {acordo.confianca}% confiança
        </span>
      </div>

      <div className="p-4 space-y-3">
        {!editando ? (
          <>
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{acordo.resumo}</p>
            {(valorFmt || dataHoraFmt) && (
              <div className="grid grid-cols-2 gap-2">
                {valorFmt && (
                  <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40 rounded-xl px-3 py-2">
                    <p className="text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">Valor</p>
                    <p className="text-sm font-bold text-purple-900 dark:text-purple-100">{valorFmt}</p>
                  </div>
                )}
                {dataHoraFmt && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 rounded-xl px-3 py-2">
                    <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Data/Hora</p>
                    <p className="text-sm font-bold text-blue-900 dark:text-blue-100">{dataHoraFmt}</p>
                  </div>
                )}
              </div>
            )}
            {acordo.observacoes && (
              <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed bg-gray-50 dark:bg-slate-800 rounded-xl p-2 italic">
                &quot;{acordo.observacoes}&quot;
              </p>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Resumo</span>
              <input
                value={eResumo}
                onChange={(e) => setEResumo(e.target.value)}
                className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Valor (R$)</span>
                <input
                  inputMode="decimal"
                  value={eValor}
                  onChange={(e) => setEValor(e.target.value)}
                  placeholder="opcional"
                  className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Data/Hora</span>
                <input
                  type="datetime-local"
                  value={eDataHora}
                  onChange={(e) => setEDataHora(e.target.value)}
                  className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Observações</span>
              <textarea
                rows={2}
                value={eObs}
                onChange={(e) => setEObs(e.target.value)}
                className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-slate-100 resize-none"
              />
            </label>
          </div>
        )}

        <div className="flex items-center justify-between pt-1 text-[11px]">
          <span className={aceiteSeu ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-gray-500 dark:text-slate-400'}>
            Você: {aceiteSeu ? '✓ aceitou' : '— pendente'}
          </span>
          <span className={aceiteOutro ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-gray-500 dark:text-slate-400'}>
            {meuPapel === 'cliente' ? 'Prestador' : 'Cliente'}: {aceiteOutro ? '✓ aceitou' : '— pendente'}
          </span>
        </div>

        {erro && <p className="text-xs text-red-600 dark:text-red-400 font-medium">{erro}</p>}

        {podeAgir && !aceiteSeu && !editando && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={aceitar}
              disabled={acao !== null}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-50"
            >
              {acao === 'aceitar' ? 'Aceitando...' : 'Aceitar'}
            </button>
            <button
              type="button"
              onClick={() => setEditando(true)}
              disabled={acao !== null}
              className="px-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 text-sm font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={recusar}
              disabled={acao !== null}
              className="px-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-sm font-semibold rounded-xl hover:bg-red-100 dark:hover:bg-red-950/60"
            >
              {acao === 'recusar' ? '...' : 'Recusar'}
            </button>
          </div>
        )}

        {editando && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={salvarEdicao}
              disabled={acao !== null}
              className="flex-1 bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-50"
            >
              {acao === 'editar' ? 'Salvando...' : 'Salvar e reenviar'}
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              disabled={acao !== null}
              className="px-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 text-sm font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Cancelar
            </button>
          </div>
        )}

        {aceiteSeu && !aceiteOutro && (
          <p className="text-[11px] text-gray-500 dark:text-slate-400 italic">
            Você já aceitou. Aguardando o {meuPapel === 'cliente' ? 'prestador' : 'cliente'}.
          </p>
        )}
      </div>
    </article>
  )
}
