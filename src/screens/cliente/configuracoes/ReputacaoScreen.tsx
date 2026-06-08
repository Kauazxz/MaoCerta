'use client'

import { useEffect, useState } from 'react'
import CabecalhoAjuste from '@/screens/configuracoes/CabecalhoAjuste'
import { useReputacao } from '@/hooks/useReputacao'
import { createClient } from '@/lib/supabase/client'

function formatarData(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

export default function ReputacaoScreen() {
  const [userId, setUserId] = useState<string | null>(null)
  const { dados, carregando, erro } = useReputacao(userId)

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  const metricas = {
    notaMedia: dados?.notaMedia ?? 0,
    totalAvaliacoes: dados?.totalAvaliacoes ?? 0,
    taxaCancelamento: dados?.taxaSecundaria ?? 0,
    contratacoesConcluidas: dados?.concluidos ?? 0,
  }
  const avaliacoes = dados?.avaliacoes ?? []
  const semHistorico = metricas.totalAvaliacoes === 0

  return (
    <main className="min-h-screen pb-10">
      <CabecalhoAjuste titulo="Reputação" subtitulo="Como prestadores enxergam você" voltarHref="/cliente/configuracoes" tema="cliente" />
      <div className="max-w-lg mx-auto px-4 -mt-6 space-y-4 relative z-10">

      {carregando && (
        <p className="text-center text-sm text-gray-500 dark:text-slate-400 py-4">Carregando reputação…</p>
      )}
      {erro && !carregando && (
        <p className="text-center text-sm text-red-600 dark:text-red-400 py-4">{erro}</p>
      )}

      <section className="bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 rounded-3xl p-5 text-white">
        <div className="flex items-end gap-2">
          <p className="text-5xl font-bold">{metricas.notaMedia.toFixed(1)}</p>
          <p className="text-white/80 text-sm pb-2">/ 5,0</p>
        </div>
        <p className="text-white/80 text-sm mt-1">
          Baseado em {metricas.totalAvaliacoes} avaliação{metricas.totalAvaliacoes === 1 ? '' : 'ões'} de prestadores
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <CardMetrica
          titulo="Contratações concluídas"
          valor={metricas.contratacoesConcluidas.toString()}
          dica="Atendimentos finalizados sem disputa"
        />
        <CardMetrica
          titulo="Taxa de cancelamento"
          valor={`${metricas.taxaCancelamento}%`}
          dica="Quanto menor, melhor sua reputação"
          alerta={metricas.taxaCancelamento > 20}
        />
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-gray-900 dark:text-slate-100 uppercase tracking-wide">Avaliações recebidas</h2>

        {semHistorico ? (
          <div className="text-center py-8 space-y-2">
            <div className="w-14 h-14 mx-auto bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-2xl">
              ⭐
            </div>
            <p className="text-sm text-gray-600 dark:text-slate-400 font-medium">Você ainda não tem avaliações</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 max-w-[260px] mx-auto">
              Após contratar um prestador e concluir o atendimento, ele poderá avaliar você.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {avaliacoes.map((av) => (
              <li key={av.id} className="border border-gray-100 dark:border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm text-gray-900 dark:text-slate-100">{av.avaliador_nome}</p>
                    <p className="text-[11px] text-gray-400 dark:text-slate-500">{av.servico} · {formatarData(av.created_at)}</p>
                  </div>
                  <span className="text-amber-500 font-bold text-sm">{Number(av.nota).toFixed(1)} ⭐</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-slate-300">{av.comentario}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-purple-50 border border-purple-100 rounded-2xl p-4 space-y-2">
        <p className="text-sm font-semibold text-purple-900">Como melhorar sua reputação</p>
        <ul className="text-xs text-purple-800/80 space-y-1 list-disc pl-4">
          <li>Responda às mensagens dos prestadores</li>
          <li>Evite cancelar contratações em andamento</li>
          <li>Cumpra os horários combinados</li>
          <li>Avalie cada atendimento concluído</li>
        </ul>
      </section>
      </div>
    </main>
  )
}

function CardMetrica({
  titulo,
  valor,
  dica,
  alerta,
}: {
  titulo: string
  valor: string
  dica: string
  alerta?: boolean
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 space-y-1">
      <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">{titulo}</p>
      <p className={`text-2xl font-bold ${alerta ? 'text-red-600' : 'text-gray-900 dark:text-slate-100'}`}>{valor}</p>
      <p className="text-[11px] text-gray-400 dark:text-slate-500">{dica}</p>
    </div>
  )
}
