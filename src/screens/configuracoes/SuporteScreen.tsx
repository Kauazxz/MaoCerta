'use client'

import { useState, FormEvent } from 'react'
import CabecalhoAjuste from './CabecalhoAjuste'

export type Pergunta = {
  pergunta: string
  resposta: string
}

export type Canal = {
  icone: string
  titulo: string
  descricao: string
  acao: string
}

type Props = {
  voltarHref: string
  faq: Pergunta[]
  canais: Canal[]
  destaque?: {
    titulo: string
    descricao: string
  }
  tema?: 'cliente' | 'prestador' | 'admin'
}

const DESTAQUE_PADRAO = {
  titulo: 'Estamos aqui para resolver',
  descricao: 'Antes de abrir um chamado, dê uma olhada nas dúvidas mais comuns abaixo.',
}

export default function SuporteScreen({ voltarHref, faq, canais, destaque = DESTAQUE_PADRAO, tema = 'cliente' }: Props) {
  const [aberta, setAberta] = useState<number | null>(0)

  return (
    <main className="min-h-screen pb-10">
      <CabecalhoAjuste titulo="Suporte" subtitulo="Central de ajuda e contato" voltarHref={voltarHref} tema={tema} />
      <div className="max-w-lg mx-auto px-4 -mt-6 space-y-4 relative z-10">

      <section className="bg-gradient-to-br from-emerald-600 to-teal-500 rounded-3xl p-5 text-white space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Precisa de ajuda?</p>
        <p className="text-lg font-bold">{destaque.titulo}</p>
        <p className="text-sm text-white/80">{destaque.descricao}</p>
      </section>

      <section className="bg-white dark:bg-slate-900/80 rounded-2xl border border-gray-100 dark:border-slate-800/50 divide-y divide-gray-100 dark:divide-slate-800/80 shadow-sm dark:shadow-none overflow-hidden">
        {faq.map((item, i) => {
          const ativo = aberta === i
          return (
            <div key={item.pergunta}>
              <button
                type="button"
                onClick={() => setAberta(ativo ? null : i)}
                className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <span className="flex-1 font-semibold text-sm text-gray-900 dark:text-slate-100">{item.pergunta}</span>
                <span className={`text-gray-400 dark:text-slate-500 text-lg shrink-0 transition-transform ${ativo ? 'rotate-90' : ''}`}>
                  ›
                </span>
              </button>
              {ativo && <p className="px-4 pb-4 text-sm text-gray-600 dark:text-slate-400 leading-relaxed">{item.resposta}</p>}
            </div>
          )
        })}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100 uppercase tracking-wide px-2">Fale com a gente</h2>
        {canais.map(canal => (
          <button
            key={canal.titulo}
            className="w-full flex items-center gap-4 bg-white dark:bg-slate-900/80 rounded-2xl border border-gray-100 dark:border-slate-800/50 p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors shadow-sm dark:shadow-none"
          >
            <span className="text-xl shrink-0">{canal.icone}</span>
            <div className="flex-1 text-left">
              <p className="font-semibold text-sm text-gray-900 dark:text-slate-100">{canal.titulo}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">{canal.descricao}</p>
            </div>
            <span className="text-purple-700 text-xs font-semibold">{canal.acao} ›</span>
          </button>
        ))}
      </section>

      <FormularioMensagem />

      <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center px-6 pb-2">
        Versão 0.1 · MãoCerta © 2026
      </p>
      </div>
    </main>
  )
}

function FormularioMensagem() {
  const [assunto, setAssunto] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setTimeout(() => {
      setEnviando(false)
      setEnviado(true)
      setAssunto('')
      setMensagem('')
    }, 600)
  }

  return (
    <form onSubmit={enviar} className="bg-white dark:bg-slate-900 rounded-2xl p-5 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100 uppercase tracking-wide">Enviar mensagem</h2>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Conte o que está acontecendo e respondemos por e-mail.</p>
      </div>

      <label className="block">
        <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide">Assunto</span>
        <input
          type="text"
          value={assunto}
          onChange={e => setAssunto(e.target.value)}
          required
          className="mt-1 w-full bg-gray-50 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:border-purple-600 focus:bg-white dark:bg-slate-900"
        />
      </label>

      <label className="block">
        <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide">Mensagem</span>
        <textarea
          value={mensagem}
          onChange={e => setMensagem(e.target.value)}
          required
          rows={4}
          className="mt-1 w-full bg-gray-50 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:border-purple-600 focus:bg-white dark:bg-slate-900 resize-none"
        />
      </label>

      {enviado && (
        <div className="rounded-xl p-2.5 text-xs font-medium bg-emerald-50 text-emerald-700">
          Recebemos sua mensagem. Em breve entraremos em contato pelo seu e-mail.
        </div>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="w-full bg-purple-700 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-purple-800 disabled:opacity-50"
      >
        {enviando ? 'Enviando...' : 'Enviar para o suporte'}
      </button>
    </form>
  )
}
