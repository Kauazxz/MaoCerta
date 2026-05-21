'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Aba = { href: string; icone: string; label: string }

type Props = {
  papel: 'cliente' | 'profissional' | 'admin'
}

const ABAS: Record<Props['papel'], Aba[]> = {
  cliente: [
    { href: '/cliente/inicio', icone: '🏠', label: 'Início' },
    { href: '/cliente/buscar', icone: '🔍', label: 'Buscar' },
    { href: '/cliente/demandas', icone: '📋', label: 'Demandas' },
    { href: '/cliente/atendimentos', icone: '🤝', label: 'Atendimentos' },
    { href: '/cliente/configuracoes', icone: '⚙️', label: 'Ajustes' },
  ],
  profissional: [
    { href: '/profissional/inicio', icone: '🏠', label: 'Início' },
    { href: '/profissional/atendimentos', icone: '🤝', label: 'Atendimentos' },
    { href: '/profissional/solicitacoes', icone: '📨', label: 'Pedidos' },
    { href: '/profissional/demandas', icone: '📋', label: 'Demandas' },
    { href: '/profissional/servicos', icone: '🧰', label: 'Serviços' },
    { href: '/profissional/carteira', icone: '💰', label: 'Carteira' },
    { href: '/profissional/configuracoes', icone: '⚙️', label: 'Ajustes' },
  ],
  admin: [
    { href: '/admin/inicio', icone: '🏠', label: 'Início' },
    { href: '/admin/usuarios', icone: '👥', label: 'Usuários' },
    { href: '/admin/financeiro', icone: '💰', label: 'Financeiro' },
    { href: '/admin/configuracoes', icone: '⚙️', label: 'Ajustes' },
  ],
}

const TITULO: Record<Props['papel'], string> = {
  cliente: 'MaoCerta',
  profissional: 'MaoCerta · Pro',
  admin: 'MaoCerta · Admin',
}

const COR_ATIVO: Record<Props['papel'], string> = {
  cliente: 'text-purple-700 dark:text-violet-300 border-purple-600 dark:border-violet-400',
  profissional: 'text-emerald-700 dark:text-emerald-300 border-emerald-600 dark:border-emerald-400',
  admin: 'text-amber-700 dark:text-amber-300 border-amber-600 dark:border-amber-400',
}

export default function MenuSuperior({ papel }: Props) {
  const pathname = usePathname()
  const abas = ABAS[papel]

  return (
    <header className="hidden lg:block sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-gray-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-6 flex items-center gap-8">
        <Link href={abas[0].href} className="text-sm font-bold text-gray-900 dark:text-slate-100 shrink-0 py-3">
          {TITULO[papel]}
        </Link>
        <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
          {abas.map((aba) => {
            const ativo = pathname === aba.href || pathname?.startsWith(aba.href + '/')
            return (
              <Link
                key={aba.href}
                href={aba.href}
                className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  ativo
                    ? COR_ATIVO[papel]
                    : 'text-gray-500 dark:text-slate-400 border-transparent hover:text-gray-800 dark:hover:text-slate-200'
                }`}
              >
                <span aria-hidden>{aba.icone}</span>
                {aba.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
