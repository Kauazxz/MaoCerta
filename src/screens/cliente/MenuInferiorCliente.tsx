'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const abas = [
  { href: '/cliente/inicio', icone: '🏠', label: 'Início' },
  { href: '/cliente/buscar', icone: '🔍', label: 'Buscar' },
  { href: '/cliente/demandas', icone: '📋', label: 'Demandas' },
  { href: '/cliente/atendimentos', icone: '🤝', label: 'Atendimentos' },
  { href: '/cliente/configuracoes', icone: '⚙️', label: 'Ajustes' },
]

export default function MenuInferiorCliente() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 z-40">
      <div className="max-w-md mx-auto flex items-center justify-around px-2 py-2">
        {abas.map((aba) => {
          const ativo = pathname === aba.href
          return (
            <Link
              key={aba.href}
              href={aba.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors ${
                ativo ? 'text-purple-700 dark:text-violet-400' : 'text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300'
              }`}
            >
              <span className="text-xl">{aba.icone}</span>
              <span className={`text-[10px] ${ativo ? 'font-semibold' : 'font-medium'}`}>
                {aba.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}