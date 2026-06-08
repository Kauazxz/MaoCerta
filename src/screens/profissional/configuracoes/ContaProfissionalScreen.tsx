'use client'

import { useEffect, useRef, useState, ChangeEvent, FormEvent, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import CabecalhoAjuste from '@/screens/configuracoes/CabecalhoAjuste'
import CidadeEstadoSelect from '@/components/CidadeEstadoSelect'

type Form = {
  nome: string
  telefone: string
  estado: string
  cidade: string
  bio: string
  experienciaAnos: string
  historicoProfissional: string
}

const VAZIO: Form = { nome: '', telefone: '', estado: '', cidade: '', bio: '', experienciaAnos: '', historicoProfissional: '' }
const TAMANHO_MAX_MB = 2

function pegarIniciais(nome: string) {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join('')
}

export default function ContaProfissionalScreen() {
  const [form, setForm] = useState<Form>(VAZIO)
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const inputFotoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setEmail('demo@maocerta.com')
        setForm({ nome: 'Prestador Demo', telefone: '', estado: '', cidade: '', bio: '', experienciaAnos: '', historicoProfissional: '' })
        setCarregando(false)
        return
      }

      setEmail(user.email || '')

      const { data, error } = await supabase
        .from('profiles')
        .select('nome, telefone, cidade, estado, bio, avatar_url, experiencia_anos, historico_profissional')
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        console.error('[carregar] select profile', error)
        setAviso({ tipo: 'erro', texto: `Carregar: ${error.message}` })
      } else if (!data) {
        const meta = user.user_metadata as { nome?: string; telefone?: string }
        setForm({
          nome: meta?.nome || '',
          telefone: meta?.telefone || '',
          estado: '',
          cidade: '',
          bio: '',
          experienciaAnos: '',
          historicoProfissional: '',
        })
      } else {
        setForm({
          nome: data.nome || '',
          telefone: data.telefone || '',
          estado: data.estado || '',
          cidade: data.cidade || '',
          bio: data.bio || '',
          experienciaAnos: data.experiencia_anos ? String(data.experiencia_anos) : '',
          historicoProfissional: data.historico_profissional || '',
        })
        setAvatarUrl(data.avatar_url || null)
      }
      setCarregando(false)
    }
    carregar()
  }, [])

  async function trocarFoto(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return

    e.target.value = ''
    setAviso(null)

    if (!arquivo.type.startsWith('image/')) {
      setAviso({ tipo: 'erro', texto: 'Selecione um arquivo de imagem.' })
      return
    }

    if (arquivo.size > TAMANHO_MAX_MB * 1024 * 1024) {
      setAviso({ tipo: 'erro', texto: `A imagem precisa ter no máximo ${TAMANHO_MAX_MB} MB.` })
      return
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setAviso({ tipo: 'erro', texto: 'Faça login para alterar sua foto.' })
      return
    }

    setEnviandoFoto(true)
    const extensao = arquivo.name.split('.').pop() || 'jpg'
    const caminho = `${user.id}/avatar-${Date.now()}.${extensao}`

    const { error: erroUpload } = await supabase.storage
      .from('avatars')
      .upload(caminho, arquivo, { upsert: true, cacheControl: '3600', contentType: arquivo.type })

    if (erroUpload) {
      console.error('[avatar] upload', erroUpload)
      setAviso({ tipo: 'erro', texto: `Upload: ${erroUpload.message}` })
      setEnviandoFoto(false)
      return
    }

    const { data: publicUrl } = supabase.storage.from('avatars').getPublicUrl(caminho)
    const url = publicUrl.publicUrl

    const meta = user.user_metadata as { tipo?: 'cliente' | 'profissional' | 'administrador'; nome?: string; telefone?: string }
    const tipoUsuario = meta?.tipo || 'profissional'
    const nomeAtual = form.nome || meta?.nome || user.email?.split('@')[0] || 'Prestador'
    const telefoneAtual = form.telefone || meta?.telefone || ''

    const { error: erroBanco } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        nome: nomeAtual,
        tipo: tipoUsuario,
        telefone: telefoneAtual,
        avatar_url: url,
      })

    setEnviandoFoto(false)

    if (erroBanco) {
      console.error('[avatar] update profile', erroBanco)
      setAviso({ tipo: 'erro', texto: `Perfil: ${erroBanco.message}` })
      return
    }

    setAvatarUrl(url)
    setAviso({ tipo: 'ok', texto: 'Foto de perfil atualizada.' })
  }

  async function removerFoto() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setAviso({ tipo: 'erro', texto: 'Faça login para alterar sua foto.' })
      return
    }

    setEnviandoFoto(true)
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', user.id)
    setEnviandoFoto(false)

    if (error) {
      setAviso({ tipo: 'erro', texto: 'Não foi possível remover a foto.' })
      return
    }

    setAvatarUrl(null)
    setAviso({ tipo: 'ok', texto: 'Foto removida.' })
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setAviso(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setAviso({ tipo: 'erro', texto: 'Faça login para salvar suas alterações.' })
      setSalvando(false)
      return
    }

    const tipoUsuario = (user.user_metadata as { tipo?: 'cliente' | 'profissional' | 'administrador' })?.tipo || 'profissional'

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        nome: form.nome,
        telefone: form.telefone,
        estado: form.estado || null,
        cidade: form.cidade || null,
        bio: form.bio,
        experiencia_anos: form.experienciaAnos.trim() ? Number(form.experienciaAnos) : null,
        historico_profissional: form.historicoProfissional.trim() || null,
        tipo: tipoUsuario,
      })

    if (error) {
      console.error('[salvar] update profile', error)
      setAviso({ tipo: 'erro', texto: `Salvar: ${error.message}` })
    } else {
      setAviso({ tipo: 'ok', texto: 'Dados atualizados com sucesso.' })
    }
    setSalvando(false)
  }

  function alterar<K extends keyof Form>(campo: K, valor: Form[K]) {
    setForm(anterior => ({ ...anterior, [campo]: valor }))
  }

  const completudePerfil = useMemo(() => {
    const checks = [
      form.nome.trim().length >= 3,
      form.telefone.trim().length >= 8,
      form.cidade.trim().length >= 2,
      form.bio.trim().length >= 20,
      form.experienciaAnos.trim().length >= 1,
      form.historicoProfissional.trim().length >= 20,
      Boolean(avatarUrl),
    ]
    const ok = checks.filter(Boolean).length
    return Math.round((ok / checks.length) * 100)
  }, [form, avatarUrl])

  return (
    <main className="min-h-screen pb-10">
      <CabecalhoAjuste titulo="Conta" subtitulo="Edite seus dados pessoais e profissionais" voltarHref="/profissional/configuracoes" tema="prestador" />
      <div className="max-w-lg mx-auto px-4 -mt-6 space-y-4 relative z-10">
      <section className="rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-600 text-white p-4 shadow-lg border border-emerald-600/30">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70">Perfil</p>
            <p className="text-lg font-bold">Completude {completudePerfil}%</p>
            <p className="text-xs text-white/85 mt-1">Perfis completos recebem mais solicitações diretas.</p>
          </div>
          <div className="w-14 h-14 rounded-full border-4 border-white/30 flex items-center justify-center text-sm font-bold bg-white/10">
            {completudePerfil}%
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-black/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-white dark:bg-slate-900 transition-all duration-500"
            style={{ width: `${completudePerfil}%` }}
          />
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900/80 rounded-2xl p-5 flex flex-col items-center gap-3 shadow-sm dark:shadow-none border border-gray-100 dark:border-slate-800/50">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-white text-2xl font-bold flex items-center justify-center overflow-hidden">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
            ) : (
              <span>{pegarIniciais(form.nome) || '🛠️'}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => inputFotoRef.current?.click()}
            disabled={enviandoFoto}
            className="absolute -bottom-1 -right-1 w-9 h-9 bg-emerald-700 text-white rounded-full flex items-center justify-center text-sm shadow-md hover:bg-emerald-800 disabled:opacity-50"
            aria-label="Alterar foto de perfil"
          >
            {enviandoFoto ? '…' : '📷'}
          </button>
        </div>

        <input
          ref={inputFotoRef}
          type="file"
          accept="image/*"
          onChange={trocarFoto}
          className="hidden"
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputFotoRef.current?.click()}
            disabled={enviandoFoto}
            className="text-emerald-700 text-xs font-semibold hover:text-emerald-900 disabled:opacity-50"
          >
            {avatarUrl ? 'Trocar foto' : 'Adicionar foto'}
          </button>
          {avatarUrl && (
            <>
              <span className="text-gray-300 text-xs">·</span>
              <button
                type="button"
                onClick={removerFoto}
                disabled={enviandoFoto}
                className="text-red-600 text-xs font-semibold hover:text-red-800 disabled:opacity-50"
              >
                Remover
              </button>
            </>
          )}
        </div>
        <p className="text-[11px] text-gray-400 dark:text-slate-500">JPG ou PNG · até {TAMANHO_MAX_MB} MB · Foto profissional ajuda a fechar mais serviços</p>
      </section>

      <form onSubmit={salvar} className="space-y-4">
        <section className="bg-white dark:bg-slate-900/80 rounded-2xl p-5 space-y-4 shadow-sm dark:shadow-none border border-gray-100 dark:border-slate-800/50">
          <h2 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Dados pessoais</h2>
          <Campo
            label="Nome completo"
            valor={form.nome}
            placeholder="Como deseja aparecer para os clientes"
            disabled={carregando}
            onChange={v => alterar('nome', v)}
          />
          <CampoLeitura label="E-mail" valor={email} dica="Para alterar o e-mail use Privacidade e Segurança." />
          <Campo
            label="Telefone / WhatsApp"
            valor={form.telefone}
            placeholder="(00) 00000-0000"
            disabled={carregando}
            onChange={v => alterar('telefone', v)}
          />
          <CidadeEstadoSelect
            estado={form.estado || null}
            cidade={form.cidade || null}
            disabled={carregando}
            rotuloCidade="Cidade onde atende"
            onChange={({ estado, cidade }) =>
              setForm((anterior) => ({ ...anterior, estado: estado || '', cidade: cidade || '' }))
            }
          />
        </section>

        <section className="bg-white dark:bg-slate-900/80 rounded-2xl p-5 space-y-4 shadow-sm dark:shadow-none border border-gray-100 dark:border-slate-800/50">
          <div>
            <h2 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Apresentação profissional</h2>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">Esse texto aparece no seu perfil para os clientes que te encontrarem.</p>
          </div>
          <CampoTexto
            label="Sobre seu trabalho"
            valor={form.bio}
            placeholder="Conte sua experiência, especialidades e diferenciais"
            disabled={carregando}
            onChange={v => alterar('bio', v)}
          />
          <Campo
            label="Anos de experiência"
            valor={form.experienciaAnos}
            placeholder="Ex.: 7"
            disabled={carregando}
            onChange={v => alterar('experienciaAnos', v.replace(/\D/g, ''))}
          />
          <CampoTexto
            label="Histórico profissional"
            valor={form.historicoProfissional}
            placeholder="Conte resumo de trabalhos, certificações e principais clientes"
            disabled={carregando}
            onChange={v => alterar('historicoProfissional', v)}
          />
        </section>

        <section className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-lg" aria-hidden>🛠️</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-900">Categorias e serviços</p>
            <p className="text-xs text-emerald-900/80 mt-1 leading-relaxed">
              Defina em quais áreas você atua e cadastre seus pacotes de serviço — isso alimenta buscas e demandas públicas.
            </p>
            <Link
              href="/profissional/servicos"
              className="inline-block mt-2 text-xs font-bold text-emerald-800 underline-offset-2 hover:underline"
            >
              Abrir categorias e serviços →
            </Link>
          </div>
        </section>

        {aviso && (
          <div
            className={`rounded-2xl p-3 text-sm font-medium ${
              aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {aviso.texto}
          </div>
        )}

        <button
          type="submit"
          disabled={salvando || carregando}
          className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold py-3 rounded-2xl text-sm shadow-md hover:from-emerald-700 hover:to-teal-700 transition-colors disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </form>
      </div>
    </main>
  )
}

function Campo(props: {
  label: string
  valor: string
  placeholder: string
  disabled?: boolean
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide">{props.label}</span>
      <input
        type="text"
        value={props.valor}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={e => props.onChange(e.target.value)}
        className="mt-1 w-full bg-gray-50 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600 focus:bg-white dark:bg-slate-900"
      />
    </label>
  )
}

function CampoLeitura(props: { label: string; valor: string; dica?: string }) {
  return (
    <div>
      <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide">{props.label}</span>
      <div className="mt-1 w-full bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-gray-500 dark:text-slate-400">
        {props.valor || '—'}
      </div>
      {props.dica && <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">{props.dica}</p>}
    </div>
  )
}

function CampoTexto(props: {
  label: string
  valor: string
  placeholder: string
  disabled?: boolean
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide">{props.label}</span>
      <textarea
        value={props.valor}
        placeholder={props.placeholder}
        disabled={props.disabled}
        rows={4}
        onChange={e => props.onChange(e.target.value)}
        className="mt-1 w-full bg-gray-50 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600 focus:bg-white dark:bg-slate-900 resize-none"
      />
    </label>
  )
}
