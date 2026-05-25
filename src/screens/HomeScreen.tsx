'use client'

import { useState } from 'react'
import Link from 'next/link'

const passos = {
  cliente: [
    { icone: '📝', titulo: 'Crie sua conta', descricao: 'Cadastro rápido, só o básico' },
    { icone: '🔍', titulo: 'Busque ou publique', descricao: 'Encontre um profissional ou poste uma demanda' },
    { icone: '💬', titulo: 'Negocie', descricao: 'Combine prazo e valor pelo chat da plataforma' },
    { icone: '✅', titulo: 'Serviço concluído', descricao: 'Pague e avalie pelo app' },
  ],
  profissional: [
    { icone: '📝', titulo: 'Crie sua conta', descricao: 'Complete seu perfil para aparecer nas buscas' },
    { icone: '📥', titulo: 'Receba ou proponha', descricao: 'Atenda solicitações ou envie propostas em demandas' },
    { icone: '💬', titulo: 'Negocie', descricao: 'Combine prazo e valor pelo chat da plataforma' },
    { icone: '💰', titulo: 'Execute e receba', descricao: 'O pagamento cai direto na sua carteira' },
  ],
}

function ModalComoFunciona({ onFechar }: { onFechar: () => void }) {
  const [aba, setAba] = useState<'cliente' | 'profissional'>('cliente')

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center z-50 p-4"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-xs bg-white dark:bg-slate-900 rounded-3xl p-6 space-y-5 mb-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Como funciona?</h2>
          <button
            onClick={onFechar}
            className="w-8 h-8 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-500 dark:text-slate-400 text-sm font-bold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Abas */}
        <div className="flex bg-gray-100 dark:bg-slate-800 rounded-xl p-1 gap-1">
          <button
            onClick={() => setAba('cliente')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              aba === 'cliente' ? 'bg-white dark:bg-slate-900 text-purple-700 shadow-sm' : 'text-gray-500 dark:text-slate-400'
            }`}
          >
            👤 Cliente
          </button>
          <button
            onClick={() => setAba('profissional')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              aba === 'profissional' ? 'bg-white dark:bg-slate-900 text-purple-700 shadow-sm' : 'text-gray-500 dark:text-slate-400'
            }`}
          >
            💼 Profissional
          </button>
        </div>

        {/* Passos */}
        <div className="space-y-3">
          {passos[aba].map((passo, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center text-lg shrink-0">
                {passo.icone}
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-slate-100">{passo.titulo}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">{passo.descricao}</p>
              </div>
            </div>
          ))}
        </div>

        <Link
          href="/cadastro"
          onClick={onFechar}
          className="block w-full bg-purple-600 text-white font-semibold py-3 rounded-2xl text-center text-sm hover:bg-purple-700 transition-colors"
        >
          Criar minha conta
        </Link>
      </div>
    </div>
  )
}

export default function Home() {
  const [tipo, setTipo] = useState<'cliente' | 'profissional'>('cliente')
  const [modalAberto, setModalAberto] = useState(false)

  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-700 via-indigo-600 to-blue-400 flex flex-col items-center justify-center p-6 relative">

      {modalAberto && <ModalComoFunciona onFechar={() => setModalAberto(false)} />}

      <button
        onClick={() => setModalAberto(true)}
        className="absolute top-6 right-6 w-9 h-9 bg-white/20 hover:bg-white/30 rounded-full text-white font-bold text-sm transition-colors"
      >
        ?
      </button>

      <div className="w-full max-w-xs space-y-5">

        {/* Logo e título */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 mx-auto">
            <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M40 4L72 22V58L40 76L8 58V22L40 4Z"
                fill="white"
                fillOpacity="0.2"
                stroke="white"
                strokeOpacity="0.4"
                strokeWidth="1.5"
              />
              <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fontSize="28" fill="white">
                🤝
              </text>
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">MãoCerta</h1>
            <p className="text-white/80 text-sm mt-2 leading-relaxed">
              O app que conecta você aos{' '}
              <strong className="text-white font-semibold">profissionais</strong> certos,{' '}
              <strong className="text-white font-semibold">perto</strong> de você.
            </p>
          </div>
        </div>

        {/* Entrar / Criar conta */}
        <div className="flex gap-3">
          <Link
            href="/entrar"
            className="flex-1 bg-white dark:bg-slate-900 text-purple-700 font-semibold py-3 rounded-2xl text-center text-sm hover:bg-white/90 transition-colors"
          >
            Entrar
          </Link>
          <Link
            href={`/cadastro?tipo=${tipo}`}
            className="flex-1 border-2 border-white text-white font-semibold py-3 rounded-2xl text-center text-sm hover:bg-white/10 transition-colors"
          >
            Criar conta
          </Link>
        </div>

        {/* Divisor */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/30" />
          <span className="text-white/60 text-xs">ou</span>
          <div className="flex-1 h-px bg-white/30" />
        </div>

        {/* Seleção de tipo */}
        <div className="space-y-3">
          <p className="text-white font-semibold text-center text-sm">Como você quer usar?</p>

          <button
            onClick={() => setTipo('cliente')}
            className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${
              tipo === 'cliente' ? 'bg-white dark:bg-slate-900 shadow-lg' : 'bg-white/15 hover:bg-white/25'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
              tipo === 'cliente' ? 'bg-purple-100' : 'bg-white/20'
            }`}>
              👤
            </div>
            <div className="flex-1 text-left">
              <p className={`font-semibold text-sm ${tipo === 'cliente' ? 'text-gray-900 dark:text-slate-100' : 'text-white'}`}>
                Cliente
              </p>
              <p className={`text-xs ${tipo === 'cliente' ? 'text-gray-500 dark:text-slate-400' : 'text-white/70'}`}>
                Buscar e contratar um serviço
              </p>
            </div>
            {tipo === 'cliente' ? (
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">✓</span>
              </div>
            ) : (
              <span className="text-white/50 text-lg">›</span>
            )}
          </button>

          <button
            onClick={() => setTipo('profissional')}
            className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${
              tipo === 'profissional' ? 'bg-white dark:bg-slate-900 shadow-lg' : 'bg-white/15 hover:bg-white/25'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
              tipo === 'profissional' ? 'bg-purple-100' : 'bg-white/20'
            }`}>
              💼
            </div>
            <div className="flex-1 text-left">
              <p className={`font-semibold text-sm ${tipo === 'profissional' ? 'text-gray-900 dark:text-slate-100' : 'text-white'}`}>
                Profissional
              </p>
              <p className={`text-xs ${tipo === 'profissional' ? 'text-gray-500 dark:text-slate-400' : 'text-white/70'}`}>
                Quero oferecer meus serviços
              </p>
            </div>
            {tipo === 'profissional' ? (
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">✓</span>
              </div>
            ) : (
              <span className="text-white/50 text-lg">›</span>
            )}
          </button>
        </div>

        {/* Rodapé */}
        <p className="text-white/40 text-xs text-center">🔒 Seus dados estão protegidos</p>
        <div className="text-center pt-1">
          <Link
            href="/entrar"
            className="inline-flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition-colors"
          >
            🛡️ Acesso administrativo
          </Link>
        </div>
      </div>
    </main>
  )
}
