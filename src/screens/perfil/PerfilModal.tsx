'use client'

import { FormEvent, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { iconeCategoria } from '@/lib/categorias-ui'

type Perfil = {
  id: string
  nome: string
  tipo: string
  cidade: string | null
  estado: string | null
  bio: string | null
  avatar_url: string | null
  created_at: string
  experiencia_anos: number | null
  historico_profissional: string | null
}

type Props = {
  perfilId: string
  aberto: boolean
  onFechar: () => void
  rotulo?: 'Cliente' | 'Prestador' | 'Perfil'
  /** Quando true, mostra os botões "Denunciar" e "Bloquear" (default: true para prestador) */
  mostrarAcoes?: boolean
}

function pegarIniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export default function PerfilModal({ perfilId, aberto, onFechar, rotulo = 'Perfil', mostrarAcoes }: Props) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // métricas
  const [notaMedia, setNotaMedia] = useState<number | null>(null)
  const [qtdAvaliacoes, setQtdAvaliacoes] = useState(0)
  const [demandasFeitas, setDemandasFeitas] = useState(0)
  const [denuncias, setDenuncias] = useState(0)
  const [bloqueado, setBloqueado] = useState(false)
  const [categoriasPrest, setCategoriasPrest] = useState<{ id: number; nome: string }[]>([])
  const [avaliacoesComComentario, setAvaliacoesComComentario] = useState<
    { id: string; nota: number; comentario: string; created_at: string; avaliador: { nome: string } | null }[]
  >([])

  // ações
  const [meuId, setMeuId] = useState<string | null>(null)
  const [bloqueioInProgress, setBloqueioInProgress] = useState(false)
  const [denunciaAberta, setDenunciaAberta] = useState(false)
  const [denunciaMotivo, setDenunciaMotivo] = useState('')
  const [denunciaDescricao, setDenunciaDescricao] = useState('')
  const [enviandoDenuncia, setEnviandoDenuncia] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  useEffect(() => {
    if (!aberto || !perfilId) return

    let cancelado = false
    setCarregando(true)
    setErro(null)
    setPerfil(null)
    setNotaMedia(null)
    setQtdAvaliacoes(0)
    setDemandasFeitas(0)
    setDenuncias(0)
    setBloqueado(false)
    setCategoriasPrest([])
    setAvaliacoesComComentario([])
    setAviso(null)
    setDenunciaAberta(false)

    async function carregar() {
      const supabase = createClient()
      const { data: auth } = await supabase.auth.getUser()
      if (!cancelado) setMeuId(auth.user?.id || null)

      const [perfilRes, avalRes, atendRes, denRes, blocRes, catRes, avalComentRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, nome, tipo, cidade, estado, bio, avatar_url, created_at, experiencia_anos, historico_profissional')
          .eq('id', perfilId)
          .maybeSingle(),
        supabase
          .from('avaliacoes')
          .select('nota')
          .eq('avaliado_id', perfilId),
        supabase
          .from('solicitacoes')
          .select('id', { count: 'exact', head: true })
          .or(`profissional_id.eq.${perfilId},cliente_id.eq.${perfilId}`)
          .eq('status', 'concluida'),
        supabase
          .from('denuncias')
          .select('id', { count: 'exact', head: true })
          .eq('denunciado_id', perfilId),
        auth.user?.id
          ? supabase
              .from('bloqueios')
              .select('bloqueado_id')
              .eq('bloqueador_id', auth.user.id)
              .eq('bloqueado_id', perfilId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from('profissional_categorias')
          .select('categoria:categoria_id ( id, nome )')
          .eq('profissional_id', perfilId),
        supabase
          .from('avaliacoes')
          .select('id, nota, comentario, created_at, avaliador:avaliador_id ( nome )')
          .eq('avaliado_id', perfilId)
          .not('comentario', 'is', null)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

      if (cancelado) return

      if (perfilRes.error) {
        setErro(`Não foi possível carregar o perfil: ${perfilRes.error.message}`)
      } else if (!perfilRes.data) {
        setErro('Perfil não encontrado.')
      } else {
        setPerfil(perfilRes.data as Perfil)
      }

      const notas = (avalRes.data as { nota: number }[] | null) || []
      if (notas.length > 0) {
        const soma = notas.reduce((acc, a) => acc + Number(a.nota), 0)
        setNotaMedia(soma / notas.length)
      }
      setQtdAvaliacoes(notas.length)
      setDemandasFeitas(atendRes.count ?? 0)
      setDenuncias(denRes.count ?? 0)
      setBloqueado(!!blocRes.data)

      const cats = ((catRes.data as { categoria: { id: number; nome: string } | null }[] | null) || [])
        .map((c) => c.categoria)
        .filter((c): c is { id: number; nome: string } => !!c)
      setCategoriasPrest(cats)

      type AvalComent = {
        id: string
        nota: number
        comentario: string | null
        created_at: string
        avaliador: { nome: string } | null
      }
      const comComent = ((avalComentRes.data as unknown as AvalComent[] | null) || [])
        .filter((a) => a.comentario && a.comentario.trim().length > 0)
        .map((a) => ({
          id: a.id,
          nota: a.nota,
          comentario: a.comentario as string,
          created_at: a.created_at,
          avaliador: a.avaliador,
        }))
      setAvaliacoesComComentario(comComent)

      setCarregando(false)
    }

    carregar()
    return () => {
      cancelado = true
    }
  }, [perfilId, aberto])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    if (aberto) {
      document.addEventListener('keydown', onKey)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [aberto, onFechar])

  async function alternarBloqueio() {
    if (!meuId || !perfilId || meuId === perfilId) return
    setBloqueioInProgress(true)
    setAviso(null)
    const supabase = createClient()
    if (bloqueado) {
      const { error } = await supabase
        .from('bloqueios')
        .delete()
        .eq('bloqueador_id', meuId)
        .eq('bloqueado_id', perfilId)
      if (error) {
        setAviso({ tipo: 'erro', texto: `Falha ao desbloquear: ${error.message}` })
      } else {
        setBloqueado(false)
        setAviso({ tipo: 'ok', texto: 'Desbloqueado.' })
      }
    } else {
      const { error } = await supabase
        .from('bloqueios')
        .insert({ bloqueador_id: meuId, bloqueado_id: perfilId })
      if (error) {
        setAviso({ tipo: 'erro', texto: `Falha ao bloquear: ${error.message}` })
      } else {
        setBloqueado(true)
        setAviso({ tipo: 'ok', texto: 'Bloqueado. Não vai mais aparecer pra você.' })
      }
    }
    setBloqueioInProgress(false)
  }

  async function enviarDenuncia(e: FormEvent) {
    e.preventDefault()
    if (!meuId || !perfilId || !denunciaMotivo.trim()) return
    setEnviandoDenuncia(true)
    setAviso(null)
    const supabase = createClient()
    const { error } = await supabase.from('denuncias').insert({
      denunciante_id: meuId,
      denunciado_id: perfilId,
      motivo: denunciaMotivo.trim(),
      descricao: denunciaDescricao.trim() || null,
    })
    setEnviandoDenuncia(false)
    if (error) {
      setAviso({ tipo: 'erro', texto: `Falha ao denunciar: ${error.message}` })
      return
    }
    setAviso({ tipo: 'ok', texto: 'Denúncia enviada. A equipe vai analisar.' })
    setDenunciaAberta(false)
    setDenunciaMotivo('')
    setDenunciaDescricao('')
    setDenuncias((d) => d + 1)
  }

  if (!aberto) return null

  const ehProfissional = perfil?.tipo === 'profissional'
  const podeAgir = !!(meuId && perfil && meuId !== perfil.id && (mostrarAcoes ?? ehProfissional))
  const localExibido = [perfil?.cidade, perfil?.estado].filter(Boolean).join(' - ')

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onFechar}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-gray-100 dark:border-slate-800 px-4 py-3 flex items-center justify-between rounded-t-3xl">
          <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{rotulo}</p>
          <button
            type="button"
            onClick={onFechar}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center justify-center text-gray-500 dark:text-slate-400"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {carregando && (
          <div className="p-8 flex items-center justify-center gap-3">
            <span className="inline-block w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600 dark:text-slate-400">Carregando perfil...</p>
          </div>
        )}

        {erro && (
          <p className="m-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-2xl p-3">{erro}</p>
        )}

        {perfil && (
          <div className="p-5 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-200 to-indigo-200 flex items-center justify-center text-2xl font-bold text-purple-900 overflow-hidden shadow-md">
                {perfil.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={perfil.avatar_url} alt={perfil.nome} className="w-full h-full object-cover" />
                ) : (
                  <span>{pegarIniciais(perfil.nome) || '👤'}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100 truncate">{perfil.nome}</h2>
                <p className="text-xs text-gray-500 dark:text-slate-400 capitalize">{perfil.tipo}</p>
                {localExibido && <p className="text-xs text-gray-600 dark:text-slate-400 mt-1">📍 {localExibido}</p>}
              </div>
            </div>

            {/* Métricas */}
            <section className="grid grid-cols-3 gap-2 text-center">
              <CardMetrica
                titulo="Avaliação"
                valor={notaMedia != null ? `${notaMedia.toFixed(1)}★` : '—'}
                dica={qtdAvaliacoes > 0 ? `${qtdAvaliacoes} avaliações` : 'Sem avaliações'}
                cor="text-amber-600"
              />
              <CardMetrica
                titulo={ehProfissional ? 'Atendimentos' : 'Contratações'}
                valor={`${demandasFeitas}`}
                dica="Concluídos"
                cor="text-emerald-700"
              />
              <CardMetrica
                titulo="Denúncias"
                valor={`${denuncias}`}
                dica={denuncias === 0 ? 'Limpo' : 'Recebidas'}
                cor={denuncias === 0 ? 'text-gray-500 dark:text-slate-400' : 'text-red-600'}
              />
            </section>

            {/* Categorias em que atua (apenas prestador) */}
            {ehProfissional && categoriasPrest.length > 0 && (
              <section className="space-y-2">
                <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                  Atua em
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {categoriasPrest.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-800 dark:text-purple-200 bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/40 rounded-full px-2.5 py-1"
                    >
                      <span aria-hidden>{iconeCategoria(c.nome)}</span>
                      {c.nome}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Currículo / Bio */}
            {(perfil.bio || perfil.experiencia_anos != null || perfil.historico_profissional) && (
              <section className="space-y-2">
                <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                  {ehProfissional ? 'Currículo' : 'Sobre'}
                </p>
                {perfil.bio && (
                  <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{perfil.bio}</p>
                )}
                {perfil.experiencia_anos != null && (
                  <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl px-3 py-2">
                    <p className="text-sm text-emerald-900 dark:text-emerald-200">
                      <strong>{perfil.experiencia_anos}</strong> ano(s) de experiência profissional
                    </p>
                  </div>
                )}
                {perfil.historico_profissional && (
                  <div className="bg-gray-50 dark:bg-slate-800 rounded-2xl p-3">
                    <p className="text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                      Histórico
                    </p>
                    <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {perfil.historico_profissional}
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* Avaliações recebidas (RF48 + RF49) */}
            {avaliacoesComComentario.length > 0 && (
              <section className="space-y-2">
                <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                  Avaliações recebidas ({avaliacoesComComentario.length})
                </p>
                <ul className="space-y-2">
                  {avaliacoesComComentario.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/60 p-3 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">
                          {a.avaliador?.nome || 'Anônimo'}
                        </p>
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0">
                          {'★'.repeat(a.nota)}
                          <span className="text-gray-300 dark:text-slate-600">{'★'.repeat(5 - a.nota)}</span>
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {a.comentario}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-slate-500">
                        {new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center">
              Membro desde{' '}
              {new Date(perfil.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </p>

            {/* Aviso */}
            {aviso && (
              <p
                className={`text-xs rounded-2xl p-3 font-medium ${
                  aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}
              >
                {aviso.texto}
              </p>
            )}

            {/* Form de denúncia */}
            {denunciaAberta && (
              <form onSubmit={enviarDenuncia} className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
                <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">Nova denúncia</p>
                <select
                  value={denunciaMotivo}
                  onChange={(e) => setDenunciaMotivo(e.target.value)}
                  required
                  className="w-full bg-white dark:bg-slate-900 border border-amber-200 rounded-2xl px-3 py-2 text-sm"
                >
                  <option value="">Selecione um motivo</option>
                  <option value="comportamento_inadequado">Comportamento inadequado</option>
                  <option value="servico_nao_cumprido">Serviço não cumprido</option>
                  <option value="cobranca_indevida">Cobrança indevida</option>
                  <option value="perfil_falso">Perfil falso</option>
                  <option value="outro">Outro</option>
                </select>
                <textarea
                  value={denunciaDescricao}
                  onChange={(e) => setDenunciaDescricao(e.target.value)}
                  placeholder="Descreva o ocorrido (opcional)"
                  rows={3}
                  className="w-full bg-white dark:bg-slate-900 border border-amber-200 rounded-2xl px-3 py-2 text-sm resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={enviandoDenuncia || !denunciaMotivo}
                    className="flex-1 bg-red-600 text-white font-semibold py-2 rounded-2xl text-xs hover:bg-red-700 disabled:opacity-50"
                  >
                    {enviandoDenuncia ? 'Enviando...' : 'Enviar denúncia'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDenunciaAberta(false)}
                    className="px-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-2xl text-xs hover:bg-gray-50 dark:hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {/* Ações */}
            {podeAgir && !denunciaAberta && (
              <section className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDenunciaAberta(true)}
                  className="text-xs font-semibold py-2.5 rounded-2xl border border-amber-200 text-amber-800 bg-amber-50 hover:bg-amber-100"
                >
                  🚩 Denunciar
                </button>
                <button
                  type="button"
                  onClick={alternarBloqueio}
                  disabled={bloqueioInProgress}
                  className={`text-xs font-semibold py-2.5 rounded-2xl border ${
                    bloqueado
                      ? 'border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700'
                      : 'border-red-200 text-red-700 bg-red-50 hover:bg-red-100'
                  } disabled:opacity-50`}
                >
                  {bloqueado ? '✓ Bloqueado · desbloquear' : '🚫 Bloquear'}
                </button>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CardMetrica({
  titulo,
  valor,
  dica,
  cor,
}: {
  titulo: string
  valor: string
  dica: string
  cor: string
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-3 shadow-sm">
      <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">{titulo}</p>
      <p className={`text-base font-bold mt-0.5 ${cor}`}>{valor}</p>
      <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">{dica}</p>
    </div>
  )
}
