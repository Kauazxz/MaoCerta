'use client'

import { useState } from 'react'
import ModalBase from './ModalBase'
import { criarPlanoAtendimento } from '@/lib/supabase/atendimento-plano'
import type { ModeloPlano } from '@/types/atendimento'

const MODELOS: { value: ModeloPlano; label: string; descricao: string }[] = [
  { value: 'servico_simples', label: 'Servico simples', descricao: 'Um item, um pagamento.' },
  { value: 'pagamento_antes', label: 'Pagamento antes', descricao: 'Cliente paga antes da execucao.' },
  { value: 'pagamento_depois', label: 'Pagamento depois', descricao: 'Cliente paga apos execucao + confirmacao.' },
  { value: 'por_hora', label: 'Por hora', descricao: 'Valor base + horas extras.' },
  { value: 'por_diaria', label: 'Por diaria', descricao: 'Valor por dia trabalhado.' },
  { value: 'por_etapa', label: 'Por etapa', descricao: 'Etapas sequenciais (ex.: vistoria + execucao).' },
  { value: 'personalizado', label: 'Personalizado', descricao: 'Voce decide combinar como quiser.' },
]

type Props = {
  aberto: boolean
  solicitacaoId: string
  onFechar: () => void
  onCriado: (planoId: string) => void
}

export default function CriarPlanoModal({ aberto, solicitacaoId, onFechar, onCriado }: Props) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [modelo, setModelo] = useState<ModeloPlano>('servico_simples')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) {
      setErro('Informe um titulo para o plano.')
      return
    }
    setEnviando(true)
    setErro(null)
    try {
      const id = await criarPlanoAtendimento({
        solicitacao_id: solicitacaoId,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        modelo,
      })
      onCriado(id)
      setTitulo('')
      setDescricao('')
      setModelo('servico_simples')
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <ModalBase aberto={aberto} titulo="Criar plano de atendimento" onFechar={onFechar}>
      <form onSubmit={submeter} className="space-y-3">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Titulo
          </span>
          <input
            type="text"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            placeholder='Ex.: "Servico de pintura - sala"'
            required
            className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-600"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Descricao (opcional)
          </span>
          <textarea
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            rows={2}
            placeholder="Resumo do servico"
            className="mt-1 w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-600 resize-none"
          />
        </label>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Modelo
          </span>
          <div className="mt-1 grid grid-cols-1 gap-1.5">
            {MODELOS.map(m => (
              <label
                key={m.value}
                className={`flex items-start gap-2 rounded-xl border p-2.5 cursor-pointer text-xs ${
                  modelo === m.value
                    ? 'border-violet-300 bg-violet-50 dark:bg-violet-950/30'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <input
                  type="radio"
                  name="modelo"
                  value={m.value}
                  checked={modelo === m.value}
                  onChange={() => setModelo(m.value)}
                  className="mt-0.5"
                />
                <span>
                  <strong className="text-slate-900 dark:text-slate-100">{m.label}</strong>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">{m.descricao}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        {erro && <p className="text-xs text-red-600 font-medium">{erro}</p>}
        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-xl bg-violet-700 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {enviando ? 'Criando...' : 'Criar plano'}
        </button>
      </form>
    </ModalBase>
  )
}
