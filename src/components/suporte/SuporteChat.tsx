'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type PerfilResumo = {
  id: string
  nome: string | null
  avatar_url: string | null
  tipo?: string | null
}

type Conversa = {
  id: string
  user_id: string
  admin_id: string
  status: string
  last_message_at: string
  created_at: string
  usuario?: PerfilResumo | null
  admin?: PerfilResumo | null
}

type Mensagem = {
  id: string
  conversa_id: string
  remetente_id: string
  conteudo: string
  created_at: string
}

function iniciais(nome?: string | null) {
  const base = nome?.trim() || 'Admin'
  return base
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('')
}

function Avatar({ perfil, className = 'w-10 h-10' }: { perfil: PerfilResumo | null | undefined; className?: string }) {
  if (perfil?.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={perfil.avatar_url}
        alt={perfil.nome || 'Administrador'}
        className={`${className} rounded-full object-cover bg-gray-100 dark:bg-slate-800`}
      />
    )
  }

  return (
    <div className={`${className} rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-200 flex items-center justify-center text-xs font-bold`}>
      {iniciais(perfil?.nome)}
    </div>
  )
}

function ChatBox({
  conversaId,
  meuId,
  outro,
  subtitulo,
}: {
  conversaId: string
  meuId: string
  outro: PerfilResumo | null
  subtitulo: string
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [texto, setTexto] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const fimRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    let ativo = true
    const canalNome = `suporte:${conversaId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const canal = supabase
      .channel(canalNome)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'suporte_mensagens',
          filter: `conversa_id=eq.${conversaId}`,
        },
        (payload) => {
          const nova = payload.new as Mensagem
          setMensagens((atuais) => (atuais.some((m) => m.id === nova.id) ? atuais : [...atuais, nova]))
        },
      )
      .subscribe()

    setCarregando(true)
    supabase
      .from('suporte_mensagens')
      .select('id, conversa_id, remetente_id, conteudo, created_at')
      .eq('conversa_id', conversaId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) {
          setErro(`Não foi possível carregar o chat: ${error.message}`)
        } else {
          setMensagens((data as Mensagem[]) || [])
        }
        setCarregando(false)
      })

    return () => {
      ativo = false
      void supabase.removeChannel(canal)
    }
  }, [conversaId])

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const conteudo = texto.trim()
    if (!conteudo || enviando) return

    setEnviando(true)
    setErro(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('suporte_mensagens')
      .insert({ conversa_id: conversaId, remetente_id: meuId, conteudo })
      .select('id, conversa_id, remetente_id, conteudo, created_at')
      .single()

    setEnviando(false)
    if (error) {
      setErro(`Falha ao enviar: ${error.message}`)
      return
    }

    setTexto('')
    if (data) {
      const msg = data as Mensagem
      setMensagens((atuais) => (atuais.some((m) => m.id === msg.id) ? atuais : [...atuais, msg]))
    }
  }

  return (
    <section className="bg-white dark:bg-slate-900/80 rounded-2xl border border-gray-100 dark:border-slate-800/50 shadow-sm dark:shadow-none overflow-hidden">
      <header className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-slate-800">
        <Avatar perfil={outro} />
        <div className="min-w-0">
          <p className="font-bold text-sm text-gray-900 dark:text-slate-100 truncate">{outro?.nome || 'Administrador'}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400">{subtitulo}</p>
        </div>
      </header>

      <div className="h-[360px] overflow-y-auto px-3 py-4 space-y-2 bg-gray-50/70 dark:bg-slate-950/40">
        {carregando && (
          <p className="text-center text-xs text-gray-400 dark:text-slate-500 py-8">Carregando conversa...</p>
        )}
        {!carregando && mensagens.length === 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-slate-500 py-8">
            Envie sua mensagem para iniciar o atendimento com o suporte.
          </p>
        )}
        {mensagens.map((mensagem) => {
          const minha = mensagem.remetente_id === meuId
          return (
            <div key={mensagem.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  minha
                    ? 'bg-purple-700 text-white'
                    : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 border border-gray-100 dark:border-slate-700'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{mensagem.conteudo}</p>
                <p className={`text-[10px] mt-1 ${minha ? 'text-white/70' : 'text-gray-400 dark:text-slate-500'}`}>
                  {new Date(mensagem.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={fimRef} />
      </div>

      {erro && <p className="text-xs text-red-700 bg-red-50 border-t border-red-100 px-3 py-2">{erro}</p>}

      <form onSubmit={enviar} className="border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 flex gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              enviar(e as unknown as FormEvent)
            }
          }}
          placeholder="Escreva sua mensagem..."
          rows={1}
          className="flex-1 resize-none bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500/30 max-h-32"
        />
        <button
          type="submit"
          disabled={enviando || !texto.trim()}
          className="shrink-0 bg-purple-700 text-white font-semibold px-4 rounded-xl text-sm hover:bg-purple-800 disabled:opacity-50"
        >
          {enviando ? '...' : 'Enviar'}
        </button>
      </form>
    </section>
  )
}

export function UsuarioSuporteChat() {
  const [meuId, setMeuId] = useState<string | null>(null)
  const [admin, setAdmin] = useState<PerfilResumo | null>(null)
  const [conversaId, setConversaId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    void (async () => {
      setCarregando(true)
      setErro(null)
      const supabase = createClient()
      const { data: auth } = await supabase.auth.getUser()
      const user = auth.user
      if (!user) {
        if (ativo) {
          setErro('Faça login para falar com o suporte.')
          setCarregando(false)
        }
        return
      }

      const { data: adminData, error: adminError } = await supabase
        .from('profiles')
        .select('id, nome, avatar_url, tipo')
        .eq('tipo', 'administrador')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!ativo) return
      if (adminError || !adminData) {
        setErro(adminError?.message || 'Nenhum administrador disponível para suporte.')
        setCarregando(false)
        return
      }

      const adminPerfil = adminData as PerfilResumo
      const { data: conversaExistente, error: conversaError } = await supabase
        .from('suporte_conversas')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'aberta')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!ativo) return
      if (conversaError) {
        setErro(conversaError.message)
        setCarregando(false)
        return
      }

      let id = (conversaExistente as { id: string } | null)?.id
      if (!id) {
        const { data: nova, error: insertError } = await supabase
          .from('suporte_conversas')
          .insert({ user_id: user.id, admin_id: adminPerfil.id })
          .select('id')
          .single()

        if (!ativo) return
        if (insertError || !nova) {
          setErro(insertError?.message || 'Não foi possível abrir o chat de suporte.')
          setCarregando(false)
          return
        }
        id = (nova as { id: string }).id
      }

      setMeuId(user.id)
      setAdmin(adminPerfil)
      setConversaId(id)
      setCarregando(false)
    })()

    return () => {
      ativo = false
    }
  }, [])

  if (carregando) {
    return (
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 text-sm text-gray-500 dark:text-slate-400">
        Abrindo chat com a equipe...
      </section>
    )
  }

  if (erro || !meuId || !conversaId) {
    return (
      <section className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 rounded-2xl p-4 text-sm text-red-700 dark:text-red-300">
        {erro || 'Não foi possível abrir o chat.'}
      </section>
    )
  }

  return <ChatBox conversaId={conversaId} meuId={meuId} outro={admin} subtitulo="Administrador do suporte" />
}

export function AdminSuporteChat() {
  const [adminId, setAdminId] = useState<string | null>(null)
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const jaCarregouRef = useRef(false)

  const carregar = useCallback(async () => {
    if (!jaCarregouRef.current) setCarregando(true)
    setErro(null)
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user
    if (!user) {
      setErro('Faça login como administrador.')
      setCarregando(false)
      return
    }
    setAdminId(user.id)

    const { data, error } = await supabase
      .from('suporte_conversas')
      .select(`
        id, user_id, admin_id, status, last_message_at, created_at,
        usuario:user_id ( id, nome, avatar_url, tipo ),
        admin:admin_id ( id, nome, avatar_url, tipo )
      `)
      .order('last_message_at', { ascending: false })
      .limit(50)

    if (error) {
      setErro(error.message)
      setConversas([])
    } else {
      const rows = (data as unknown as Conversa[]) || []
      setConversas(rows)
      setSelecionadaId((atual) => atual || rows[0]?.id || null)
    }
    jaCarregouRef.current = true
    setCarregando(false)
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel(`suporte-admin:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suporte_conversas' }, () => void carregar())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'suporte_mensagens' }, () => void carregar())
      .subscribe()

    return () => {
      void supabase.removeChannel(canal)
    }
  }, [carregar])

  const selecionada = useMemo(
    () => conversas.find((conversa) => conversa.id === selecionadaId) || null,
    [conversas, selecionadaId],
  )

  if (carregando) {
    return (
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 text-sm text-gray-500 dark:text-slate-400">
        Carregando conversas de suporte...
      </section>
    )
  }

  if (erro || !adminId) {
    return (
      <section className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 rounded-2xl p-4 text-sm text-red-700 dark:text-red-300">
        {erro || 'Não foi possível carregar o suporte.'}
      </section>
    )
  }

  return (
    <section className="grid lg:grid-cols-[18rem,1fr] gap-3">
      <aside className="bg-white dark:bg-slate-900/80 rounded-2xl border border-gray-100 dark:border-slate-800/50 shadow-sm dark:shadow-none overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-slate-800">
          <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100 uppercase tracking-wide">Chats de suporte</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{conversas.length} conversa(s)</p>
        </div>
        {conversas.length === 0 && (
          <p className="p-4 text-xs text-gray-500 dark:text-slate-400">Nenhum usuário chamou o suporte ainda.</p>
        )}
        {conversas.map((conversa) => (
          <button
            key={conversa.id}
            type="button"
            onClick={() => setSelecionadaId(conversa.id)}
            className={`w-full flex items-center gap-3 p-3 text-left border-b border-gray-100 dark:border-slate-800 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/50 ${
              conversa.id === selecionadaId ? 'bg-purple-50 dark:bg-purple-950/20' : ''
            }`}
          >
            <Avatar perfil={conversa.usuario} className="w-9 h-9" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">
                {conversa.usuario?.nome || 'Usuário'}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-slate-500">
                {new Date(conversa.last_message_at).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </button>
        ))}
      </aside>

      {selecionada ? (
        <ChatBox conversaId={selecionada.id} meuId={adminId} outro={selecionada.usuario || null} subtitulo="Usuário em atendimento" />
      ) : (
        <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 text-sm text-gray-500 dark:text-slate-400">
          Selecione uma conversa para responder.
        </section>
      )}
    </section>
  )
}
