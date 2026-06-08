'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import NotaAvaliacaoBadge from '@/components/reputacao/NotaAvaliacaoBadge'
import { useNotaReputacao } from '@/hooks/useNotaReputacao'

type Profile = {
  nome: string
  email: string
  tipo: string
  plano: string
  avatarUrl: string | null
}

const NOME_PLANO: Record<string, string> = {
  free: 'Free',
  basico: 'Básico',
  premium: 'Premium Plus',
}

const itens = [
  {
    href: '/cliente/configuracoes/conta',
    icone: '👤',
    titulo: 'Conta',
    descricao: 'Editar perfil e dados pessoais',
  },
  {
    href: '/cliente/configuracoes/plano',
    icone: '💳',
    titulo: 'Plano',
    descricao: 'Gerenciar assinatura e benefícios',
  },
  {
    href: '/cliente/configuracoes/reputacao',
    icone: '⭐',
    titulo: 'Reputação',
    descricao: 'Avaliações dos prestadores',
  },
  {
    href: '/cliente/financeiro',
    icone: '💰',
    titulo: 'Financeiro',
    descricao: 'Extrato: pagamento, contrato, etapa e serviço',
  },
  {
    href: '/cliente/configuracoes/seguranca',
    icone: '🛡️',
    titulo: 'Privacidade e Segurança',
    descricao: '2FA, bloqueios e dados',
  },
  {
    href: '/cliente/configuracoes/denuncias',
    icone: '🚩',
    titulo: 'Minhas denúncias',
    descricao: 'Acompanhe relatos e fale com a equipe',
  },
  {
    href: '/cliente/configuracoes/suporte',
    icone: '❓',
    titulo: 'Suporte',
    descricao: 'Central de ajuda e contato',
  },
]

function pegarIniciais(nome: string) {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join('')
}

export default function ClienteConfiguracoesScreen() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const { notaMedia, totalAvaliacoes, carregando: carregandoNota } = useNotaReputacao(userId)

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setUserId(null)
        setProfile({
          nome: 'Visitante Demo',
          email: 'demo@maocerta.com',
          tipo: 'cliente',
          plano: 'free',
          avatarUrl: null,
        })
        return
      }

      setUserId(user.id)

      const { data } = await supabase
        .from('profiles')
        .select('nome, tipo, plano, avatar_url')
        .eq('id', user.id)
        .single()

      setProfile({
        nome: data?.nome || user.email?.split('@')[0] || 'Usuário',
        email: user.email || '',
        tipo: data?.tipo || 'cliente',
        plano: data?.plano || 'free',
        avatarUrl: data?.avatar_url || null,
      })
    }
    carregar()
  }, [])

  async function sair() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <main className="min-h-screen pb-10">
      <header className="min-h-[200px] flex items-end bg-gradient-to-br from-purple-700 via-indigo-600 to-blue-600 text-white px-4 pt-8 pb-12 rounded-b-[2rem] shadow-lg">
        <div className="max-w-lg mx-auto w-full space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Sua conta</p>
          <h1 className="text-2xl font-bold">Ajustes</h1>
          <p className="text-sm text-white/85 leading-relaxed">
            Edite perfil, plano, segurança e preferências da sua conta.
          </p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 -mt-6 space-y-4 relative z-10">
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-md p-5 space-y-3">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-200 to-indigo-200 rounded-full flex items-center justify-center text-lg font-bold text-purple-900 overflow-hidden">
              {profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
              ) : (
                <span>{profile ? pegarIniciais(profile.nome) : '...'}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base text-gray-900 dark:text-slate-100 truncate">{profile?.nome || 'Carregando...'}</p>
              <p className="text-gray-500 dark:text-slate-400 text-xs truncate">{profile?.email || ''}</p>
            </div>
          </div>
          <div className="border-t border-gray-100 dark:border-slate-800 pt-3 flex items-center justify-between">
            <div>
              <p className="text-gray-400 dark:text-slate-500 text-[10px] font-medium uppercase tracking-wider">Plano atual</p>
              <p className="font-bold text-purple-700">{NOME_PLANO[profile?.plano || 'free'] || 'Free'}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 dark:text-slate-500 text-[10px] font-medium uppercase tracking-wider">Avaliação</p>
              <NotaAvaliacaoBadge
                notaMedia={notaMedia}
                totalAvaliacoes={totalAvaliacoes}
                carregando={carregandoNota}
                compacto
              />
            </div>
          </div>
        </section>

        {/* Lista de seções */}
        <div className="space-y-2">
          {itens.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 bg-white dark:bg-slate-900 rounded-2xl p-4 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors shadow-sm border border-gray-100 dark:border-slate-800"
            >
              <div className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-lg shrink-0">
                {item.icone}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-gray-900 dark:text-slate-100">{item.titulo}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">{item.descricao}</p>
              </div>
              <span className="text-gray-300 text-lg">›</span>
            </Link>
          ))}
        </div>

        {/* Sair */}
        <button
          onClick={sair}
          className="w-full bg-red-50 text-red-600 font-semibold py-3 rounded-2xl text-sm hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
        >
          <span>↪</span> Sair da conta
        </button>
      </div>
    </main>
  )
}
