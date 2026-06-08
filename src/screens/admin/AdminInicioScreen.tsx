'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useDashboardAdminRefresh } from '@/lib/realtime/hooks'

type Contadores = {
  usuarios: number
  prestadores: number
  clientes: number
  validacoesPendentes: number
  denunciasAbertas: number
  disputasAbertas: number
  atendimentosAtivos: number
  totalAtendimentos: number
}

const ZERO: Contadores = {
  usuarios: 0, prestadores: 0, clientes: 0, validacoesPendentes: 0,
  denunciasAbertas: 0, disputasAbertas: 0, atendimentosAtivos: 0, totalAtendimentos: 0,
}

const card =
  'bg-white dark:bg-slate-900/80 rounded-2xl border border-gray-100 dark:border-slate-800/50 shadow-sm dark:shadow-none'

export default function AdminInicioScreen() {
  const [c, setC] = useState<Contadores>(ZERO)
  const [carregando, setCarregando] = useState(true)

  const load = useCallback(async () => {
    const sb = createClient()
    const [usu, prest, cli, validPend, denAbertas, dispAbertas, atendAtivos, totalAtend] = await Promise.all([
      sb.from('profiles').select('id', { count: 'exact', head: true }),
      sb.from('profiles').select('id', { count: 'exact', head: true }).eq('tipo', 'profissional'),
      sb.from('profiles').select('id', { count: 'exact', head: true }).eq('tipo', 'cliente'),
      sb.from('documentos_validacao').select('id', { count: 'exact', head: true }).in('status', ['pendente', 'em_analise']),
      sb.from('denuncias').select('id', { count: 'exact', head: true }).in('status', ['aberta', 'em_analise']),
      sb.from('disputas').select('id', { count: 'exact', head: true }).in('status', ['aberta', 'em_analise']),
      sb.from('solicitacoes').select('id', { count: 'exact', head: true }).in('status', ['aceita', 'em_andamento']),
      sb.from('solicitacoes').select('id', { count: 'exact', head: true }),
    ])
    setC({
      usuarios: usu.count ?? 0,
      prestadores: prest.count ?? 0,
      clientes: cli.count ?? 0,
      validacoesPendentes: validPend.count ?? 0,
      denunciasAbertas: denAbertas.count ?? 0,
      disputasAbertas: dispAbertas.count ?? 0,
      atendimentosAtivos: atendAtivos.count ?? 0,
      totalAtendimentos: totalAtend.count ?? 0,
    })
    setCarregando(false)
  }, [])

  useEffect(() => { void load() }, [load])

  useDashboardAdminRefresh(() => void load())

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50/40 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 pb-10">
      <header className="min-h-[200px] flex items-end bg-gradient-to-br from-amber-700 via-orange-600 to-red-600 text-white px-4 pt-8 pb-12 rounded-b-[2rem] shadow-lg">
        <div className="max-w-6xl mx-auto w-full space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">Painel administrativo</p>
          <h1 className="text-2xl font-bold">MaoCerta · Admin</h1>
          <p className="text-sm text-white/85 leading-relaxed max-w-lg">
            Controle de usuários, validações, denúncias, disputas e configuração da plataforma.
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 -mt-6 space-y-4 relative z-10">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Atalho
            href="/admin/usuarios"
            icone="👥"
            titulo="Usuários"
            contador={c.usuarios}
            descricao={`${c.clientes} cliente(s), ${c.prestadores} prestador(es)`}
            cor="from-purple-600 to-indigo-600"
            carregando={carregando}
          />
          <Atalho
            href="/admin/validacoes"
            icone="🛡️"
            titulo="Validações"
            contador={c.validacoesPendentes}
            descricao={c.validacoesPendentes === 0 ? 'Nada pendente' : 'Documento(s) aguardando análise'}
            cor="from-blue-600 to-cyan-600"
            destaque={c.validacoesPendentes > 0}
            carregando={carregando}
          />
          <Atalho
            href="/admin/denuncias"
            icone="🚩"
            titulo="Denúncias"
            contador={c.denunciasAbertas}
            descricao={c.denunciasAbertas === 0 ? 'Tudo em ordem' : 'Aberta(s) ou em análise'}
            cor="from-red-600 to-pink-600"
            destaque={c.denunciasAbertas > 0}
            carregando={carregando}
          />
          <Atalho
            href="/admin/disputas"
            icone="⚖️"
            titulo="Disputas"
            contador={c.disputasAbertas}
            descricao={c.disputasAbertas === 0 ? 'Sem disputas ativas' : 'Disputa(s) financeira(s)'}
            cor="from-amber-600 to-orange-600"
            destaque={c.disputasAbertas > 0}
            carregando={carregando}
          />
        </section>

        <section className={`${card} p-4`}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-3">
            Resumo operacional
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <CardStat titulo="Atendimentos ativos" valor={c.atendimentosAtivos} carregando={carregando} />
            <CardStat titulo="Total de atendimentos" valor={c.totalAtendimentos} carregando={carregando} />
            <CardStat titulo="Clientes na plataforma" valor={c.clientes} carregando={carregando} />
            <CardStat titulo="Prestadores na plataforma" valor={c.prestadores} carregando={carregando} />
          </div>
        </section>

        <section>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 px-1 mb-2">
            Ferramentas
          </p>
          <div className={`${card} divide-y divide-gray-100 dark:divide-slate-800/80`}>
            <ItemMenu href="/admin/financeiro" icone="💰" titulo="Financeiro" descricao="Comissões, escrow e repasses" />
            <ItemMenu href="/admin/saques" icone="🏦" titulo="Saques de prestadores" descricao="Pagar Pix e debitar saldo" />
            <ItemMenu href="/admin/diagnostico-pix" icone="🔍" titulo="Diagnóstico Pix" descricao="Rastrear pagamentos e webhooks" />
            <ItemMenu href="/admin/atendimentos/risco" icone="⚠️" titulo="Riscos no chat" descricao="Mensagens suspeitas (pix por fora, etc.)" />
            <ItemMenu href="/admin/configuracoes" icone="⚙️" titulo="Configurações" descricao="Conta admin e suporte" />
          </div>
        </section>
      </div>
    </main>
  )
}

function Atalho({
  href, icone, titulo, contador, descricao, cor, destaque = false, carregando,
}: {
  href: string; icone: string; titulo: string; contador: number; descricao: string
  cor: string; destaque?: boolean; carregando: boolean
}) {
  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-2xl border ${
        destaque ? 'border-amber-400 dark:border-amber-600' : 'border-gray-100 dark:border-slate-800/50'
      } bg-white dark:bg-slate-900/80 p-4 shadow-sm dark:shadow-none hover:shadow-md dark:hover:shadow-none hover:border-gray-200 dark:hover:border-slate-700 transition-all`}
    >
      <div className={`absolute inset-0 opacity-[0.07] dark:opacity-[0.12] bg-gradient-to-br ${cor}`} />
      <div className="relative space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cor} flex items-center justify-center text-lg shadow-sm`}>
            {icone}
          </div>
          {destaque && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-full shrink-0">
              Pendente
            </span>
          )}
        </div>
        <p className="text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{titulo}</p>
        <p className="text-3xl font-extrabold text-gray-900 dark:text-slate-100 tabular-nums">
          {carregando ? '—' : contador}
        </p>
        <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-relaxed">{descricao}</p>
      </div>
    </Link>
  )
}

function CardStat({ titulo, valor, carregando }: { titulo: string; valor: number; carregando?: boolean }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-slate-950/50 border border-gray-100 dark:border-slate-800/40 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 leading-tight">{titulo}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-slate-100 mt-1 tabular-nums">
        {carregando ? '—' : valor}
      </p>
    </div>
  )
}

function ItemMenu({ href, icone, titulo, descricao }: {
  href: string; icone: string; titulo: string; descricao: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
    >
      <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-lg shrink-0">
        {icone}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-900 dark:text-slate-100">{titulo}</p>
        <p className="text-xs text-gray-500 dark:text-slate-400">{descricao}</p>
      </div>
      <span className="text-gray-300 dark:text-slate-600 text-lg shrink-0">›</span>
    </Link>
  )
}
