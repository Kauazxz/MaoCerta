'use client'

import { ChangeEvent, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import CabecalhoAjuste from '@/screens/configuracoes/CabecalhoAjuste'

type Documento = {
  id: string
  tipo_documento: string
  arquivo_url: string
  status: string
  motivo_rejeicao: string | null
  criado_em: string
}

function badgeStatus(status: string) {
  const s = (status || '').toLowerCase()
  if (s === 'aprovado')   return { label: 'Aprovado',     cls: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900/40' }
  if (s === 'rejeitado')  return { label: 'Rejeitado',    cls: 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-900/40' }
  if (s === 'em_analise') return { label: 'Em análise',   cls: 'bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-900/40' }
  return                     { label: 'Aguardando análise', cls: 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900/40' }
}

const TIPOS = ['CPF', 'CNPJ', 'Documento com foto', 'Comprovante de endereço']

export default function ValidacaoProfissionalScreen() {
  const [tipo, setTipo] = useState(TIPOS[0])
  const [enviando, setEnviando] = useState(false)
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    async function carregar() {
      const supabase = createClient()
      const { data: auth } = await supabase.auth.getUser()
      const user = auth.user
      if (!user) return

      const { data } = await supabase
        .from('documentos_validacao')
        .select('id, tipo_documento, arquivo_url, status, motivo_rejeicao, criado_em')
        .eq('profissional_id', user.id)
        .order('criado_em', { ascending: false })

      setDocumentos((data as Documento[] | null) || [])
    }
    carregar()
  }, [])

  async function enviarDocumento(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    e.target.value = ''

    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user
    if (!user) return

    setEnviando(true)
    setAviso(null)

    const extensao = arquivo.name.split('.').pop() || 'jpg'
    const caminho = `${user.id}/${Date.now()}-${tipo.replace(/\s+/g, '-').toLowerCase()}.${extensao}`
    const { error: uploadError } = await supabase.storage.from('documentos-validacao').upload(caminho, arquivo, {
      upsert: true,
      cacheControl: '3600',
      contentType: arquivo.type,
    })

    if (uploadError) {
      setEnviando(false)
      setAviso('Falha no upload. Crie o bucket "documentos-validacao" no Supabase.')
      return
    }

    const { data: urlData } = supabase.storage.from('documentos-validacao').getPublicUrl(caminho)
    const arquivoUrl = urlData.publicUrl

    const { data, error } = await supabase
      .from('documentos_validacao')
      .insert({
        profissional_id: user.id,
        tipo_documento: tipo,
        arquivo_url: arquivoUrl,
      })
      .select('id, tipo_documento, arquivo_url, status, motivo_rejeicao, criado_em')
      .single()

    setEnviando(false)
    if (error) {
      setAviso('Falha ao registrar documento. Verifique se aplicou a migration RF11.')
      return
    }

    setDocumentos((atual) => [data as Documento, ...atual])
    setAviso('Documento enviado para validação.')
  }

  return (
    <main className="min-h-screen pb-10">
      <CabecalhoAjuste
        tema="prestador"
        titulo="Validação de documentos"
        subtitulo="Envie seus documentos para liberar selo verificado"
        voltarHref="/profissional/configuracoes"
      />
      <div className="max-w-lg mx-auto px-4 -mt-6 space-y-4 relative z-10">

      <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide">Tipo de documento</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="mt-1 w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm"
          >
            {TIPOS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="w-full bg-emerald-700 text-white text-sm font-semibold py-3 rounded-xl text-center cursor-pointer block">
          {enviando ? 'Enviando...' : 'Selecionar arquivo e enviar'}
          <input type="file" accept="image/*,.pdf" onChange={enviarDocumento} className="hidden" disabled={enviando} />
        </label>
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Histórico de envios</p>
        {documentos.length === 0 && <p className="text-sm text-gray-500 dark:text-slate-400">Nenhum documento enviado ainda.</p>}
        {documentos.map((doc) => {
          const badge = badgeStatus(doc.status)
          return (
            <div key={doc.id} className="border border-gray-100 dark:border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{doc.tipo_documento}</p>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${badge.cls} shrink-0`}>
                  {badge.label}
                </span>
              </div>
              {doc.motivo_rejeicao && doc.status === 'rejeitado' && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">Motivo da rejeição</p>
                  <p className="text-xs text-red-900 dark:text-red-200 mt-0.5 leading-relaxed">{doc.motivo_rejeicao}</p>
                  <p className="text-[10px] text-red-700 dark:text-red-300 italic mt-1">Envie o documento novamente corrigindo o problema acima.</p>
                </div>
              )}
              <a href={doc.arquivo_url} target="_blank" className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold inline-block">
                Ver arquivo
              </a>
            </div>
          )
        })}
      </section>

      {aviso && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">{aviso}</p>}
      </div>
    </main>
  )
}
