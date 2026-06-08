'use client'

import { useState, FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import CabecalhoAjuste from './CabecalhoAjuste'

type Props = {
  voltarHref: string
  perfilToggleLabel?: string
  perfilToggleDescricao?: string
  mostrarPerfilPublico?: boolean
  tema?: 'cliente' | 'prestador' | 'admin'
}

const card =
  'bg-white dark:bg-slate-900/80 rounded-2xl border border-gray-100 dark:border-slate-800/50 shadow-sm dark:shadow-none overflow-hidden'

const row =
  'w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 text-left transition-colors'

export default function SegurancaScreen({
  voltarHref,
  perfilToggleLabel = 'Perfil público',
  perfilToggleDescricao = 'Permitir que outros usuários vejam seu nome e cidade',
  mostrarPerfilPublico = true,
  tema = 'cliente',
}: Props) {
  const [autenticacao2FA, setAutenticacao2FA] = useState(false)
  const [notificacoesLogin, setNotificacoesLogin] = useState(true)
  const [perfilPublico, setPerfilPublico] = useState(true)
  const [mostrarTrocaSenha, setMostrarTrocaSenha] = useState(false)

  return (
    <main className="min-h-screen pb-10">
      <CabecalhoAjuste titulo="Privacidade e Segurança" subtitulo="Proteja sua conta e seus dados" voltarHref={voltarHref} tema={tema} />
      <div className="max-w-lg mx-auto px-4 -mt-6 space-y-4 relative z-10">

      <section className={`${card} divide-y divide-gray-100 dark:divide-slate-800/80`}>
        <Toggle
          icone="🔐"
          titulo="Autenticação em 2 fatores"
          descricao="Receba um código por e-mail a cada novo login"
          ativo={autenticacao2FA}
          onChange={setAutenticacao2FA}
        />
        <Toggle
          icone="🔔"
          titulo="Notificar novos logins"
          descricao="Avisamos sempre que sua conta for acessada"
          ativo={notificacoesLogin}
          onChange={setNotificacoesLogin}
        />
        {mostrarPerfilPublico && (
          <Toggle
            icone="👁️"
            titulo={perfilToggleLabel}
            descricao={perfilToggleDescricao}
            ativo={perfilPublico}
            onChange={setPerfilPublico}
          />
        )}
        <button
          type="button"
          onClick={() => setMostrarTrocaSenha(v => !v)}
          className={row}
        >
          <span className="text-lg shrink-0">🔑</span>
          <div className="flex-1 min-w-0 text-left">
            <p className="font-semibold text-sm text-gray-900 dark:text-slate-100">Alterar senha</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">Use uma senha forte e única</p>
          </div>
          <span className={`text-gray-300 dark:text-slate-600 text-lg shrink-0 transition-transform ${mostrarTrocaSenha ? 'rotate-90' : ''}`}>›</span>
        </button>
        {mostrarTrocaSenha && (
          <div className="px-4 pb-4 bg-gray-50/50 dark:bg-slate-950/40">
            <FormularioSenha />
          </div>
        )}
        <ItemAcao
          icone="🚫"
          titulo="Usuários bloqueados"
          descricao="Veja quem você bloqueou na plataforma"
          contador={0}
        />
        <ItemAcao
          icone="🚩"
          titulo="Denúncias enviadas"
          descricao="Acompanhe denúncias que você fez"
          contador={0}
        />
        <ItemAcao
          icone="📥"
          titulo="Baixar meus dados"
          descricao="Exporte tudo que está vinculado à sua conta"
        />
      </section>

      <section className="rounded-2xl p-4 space-y-3 border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <span className="text-lg shrink-0">⚠️</span>
          <div>
            <p className="font-semibold text-sm text-red-900 dark:text-red-200">Excluir conta</p>
            <p className="text-xs text-red-700/80 dark:text-red-300/80 mt-1">
              Sua conta e seu histórico serão removidos. Atendimentos em andamento bloqueiam a exclusão.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="w-full bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 font-semibold py-2.5 rounded-xl text-sm border border-red-200 dark:border-red-800/60 hover:bg-red-100 dark:hover:bg-slate-700 transition-colors"
        >
          Solicitar exclusão
        </button>
      </section>
      </div>
    </main>
  )
}

function Toggle({
  icone,
  titulo,
  descricao,
  ativo,
  onChange,
}: {
  icone: string
  titulo: string
  descricao: string
  ativo: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!ativo)}
      className={row}
    >
      <span className="text-lg shrink-0">{icone}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-900 dark:text-slate-100">{titulo}</p>
        <p className="text-xs text-gray-500 dark:text-slate-400">{descricao}</p>
      </div>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          ativo ? 'bg-purple-700 dark:bg-purple-600' : 'bg-gray-300 dark:bg-slate-600'
        }`}
        aria-hidden
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
            ativo ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </span>
    </button>
  )
}

function ItemAcao({
  icone,
  titulo,
  descricao,
  contador,
}: {
  icone: string
  titulo: string
  descricao: string
  contador?: number
}) {
  return (
    <button type="button" className={row}>
      <span className="text-lg shrink-0">{icone}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-900 dark:text-slate-100">{titulo}</p>
        <p className="text-xs text-gray-500 dark:text-slate-400">{descricao}</p>
      </div>
      {contador !== undefined && (
        <span className="bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0">
          {contador}
        </span>
      )}
      <span className="text-gray-300 dark:text-slate-600 text-lg shrink-0">›</span>
    </button>
  )
}

function FormularioSenha() {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setAviso(null)

    if (nova.length < 8) {
      setAviso({ tipo: 'erro', texto: 'A nova senha precisa ter pelo menos 8 caracteres.' })
      return
    }
    if (nova !== confirmar) {
      setAviso({ tipo: 'erro', texto: 'A confirmação não bate com a nova senha.' })
      return
    }

    setSalvando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: nova })
    setSalvando(false)

    if (error) {
      setAviso({ tipo: 'erro', texto: 'Não foi possível atualizar. Faça login novamente e tente outra vez.' })
      return
    }

    setAviso({ tipo: 'ok', texto: 'Senha alterada com sucesso.' })
    setAtual('')
    setNova('')
    setConfirmar('')
  }

  return (
    <form onSubmit={enviar} className="space-y-3 pt-3 border-t border-gray-100 dark:border-slate-800">
      <CampoSenha label="Senha atual" valor={atual} onChange={setAtual} />
      <CampoSenha label="Nova senha" valor={nova} onChange={setNova} />
      <CampoSenha label="Confirmar nova senha" valor={confirmar} onChange={setConfirmar} />

      {aviso && (
        <div
          className={`rounded-xl p-2.5 text-xs font-medium ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
          }`}
        >
          {aviso.texto}
        </div>
      )}

      <button
        type="submit"
        disabled={salvando}
        className="w-full bg-purple-700 dark:bg-purple-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-purple-800 dark:hover:bg-purple-500 disabled:opacity-50 transition-colors"
      >
        {salvando ? 'Atualizando...' : 'Atualizar senha'}
      </button>
    </form>
  )
}

function CampoSenha({
  label,
  valor,
  onChange,
}: {
  label: string
  valor: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide">{label}</span>
      <input
        type="password"
        value={valor}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-purple-600 dark:focus:border-purple-500 focus:bg-white dark:focus:bg-slate-900 transition-colors"
      />
    </label>
  )
}
