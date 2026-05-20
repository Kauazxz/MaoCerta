import type { IntencaoDetectada, TipoAcordo } from '@/types/acordos'

// Detector deterministico de intencoes a partir do texto do chat.
// Fase 1: regex puras. Fase 2 pode evoluir para classificador.
// Retorna null quando a confianca e' baixa demais.

const LIMITE_CONFIANCA_MINIMA = 60

type Regra = {
  tipo: TipoAcordo
  palavras: RegExp[]
  pesoBase: number
  resumoPadrao: string
}

const REGRAS: Regra[] = [
  {
    tipo: 'vistoria',
    palavras: [
      /\bvistoria(?:r|ria)?\b/i,
      /\bver\s+o\s+local\b/i,
      /\bpassar\s+(?:a[ií]|l[áa])\b/i,
      /\bavaliar\s+(?:no\s+local|presencial)\b/i,
      /\binspe(?:c|ç)[aã]o\b/i,
    ],
    pesoBase: 70,
    resumoPadrao: 'Combinar vistoria/visita técnica no local',
  },
  {
    tipo: 'consulta',
    palavras: [
      /\bconsulta\b/i,
      /\bavalia(?:r|ç[aã]o)\b/i,
      /\bdiagn(?:o|ó)stico\b/i,
    ],
    pesoBase: 65,
    resumoPadrao: 'Combinar consulta/avaliação inicial',
  },
  {
    tipo: 'orcamento',
    palavras: [
      /\bor[çc]amento\b/i,
      /\bquanto\s+(?:custa|fica|sai)\b/i,
      /\bfecho\s+por\b/i,
      /\b(?:R\$|reais?|rs)\s*\d/i,
      /\bvalor\s+(?:total|do\s+servi[çc]o|do\s+trabalho)\b/i,
      /\bpre[çc]o\b/i,
    ],
    pesoBase: 75,
    resumoPadrao: 'Acordar valor do serviço',
  },
  {
    tipo: 'agendamento',
    palavras: [
      /\bagendar\b/i,
      /\bmarcar\b/i,
      /\b(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:-feira)?\b/i,
      /\b(?:amanh[ãa]|hoje|depois\s+de\s+amanh[ãa])\b/i,
      /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
      /\b\d{1,2}h(?:\d{2})?\b/i,
      /\bdia\s+\d{1,2}\b/i,
      /\b[àa]s?\s+\d{1,2}\b/i,
    ],
    pesoBase: 70,
    resumoPadrao: 'Confirmar data e horário',
  },
  {
    tipo: 'execucao',
    palavras: [
      /\bcome[çc]ar\s+(?:o\s+servi[çc]o|o\s+trabalho|hoje|amanh[ãa])\b/i,
      /\bexecu[çc][aã]o\b/i,
      /\biniciar\s+(?:o\s+)?servi[çc]o\b/i,
      /\bfazer\s+o\s+servi[çc]o\b/i,
      /\bpartir\s+pra\s+execu[çc][aã]o\b/i,
    ],
    pesoBase: 65,
    resumoPadrao: 'Iniciar execução do serviço',
  },
  {
    tipo: 'conclusao',
    palavras: [
      /\bconclu(?:[ií]do|s[aã]o|i)\b/i,
      /\bfinaliz(?:ado|ar|amos)\b/i,
      /\bservi[çc]o\s+(?:pronto|entregue|conclu[ií]do)\b/i,
      /\bterminei\b/i,
      /\btudo\s+certo\s+por\s+aqui\b/i,
    ],
    pesoBase: 65,
    resumoPadrao: 'Marcar serviço como concluído',
  },
  {
    tipo: 'cancelamento',
    palavras: [
      /\bcancelar\s+(?:o\s+atendimento|o\s+servi[çc]o|tudo)\b/i,
      /\bdesist(?:o|i|ir|imos)\b/i,
      /\bn[ãa]o\s+vai\s+dar\b/i,
    ],
    pesoBase: 70,
    resumoPadrao: 'Cancelar o atendimento',
  },
]

function extrairValor(texto: string): number | null {
  // Captura R$ X[,XX] ou X reais
  const m1 = texto.match(/R\$\s*([\d.]+(?:,\d{2})?)/i)
  if (m1) {
    const valor = Number(m1[1].replace(/\./g, '').replace(',', '.'))
    if (!Number.isNaN(valor) && valor > 0) return valor
  }
  const m2 = texto.match(/(\d+(?:[.,]\d{1,2})?)\s+reais?\b/i)
  if (m2) {
    const valor = Number(m2[1].replace(',', '.'))
    if (!Number.isNaN(valor) && valor > 0) return valor
  }
  return null
}

function extrairDataHora(texto: string): string | null {
  // Captura padrões básicos: "20/05", "20/05/2026", "às 14h", "às 14:30"
  // Combina com data atual + horário detectado pra montar ISO
  const hoje = new Date()

  // Data DD/MM ou DD/MM/AAAA
  const matchData = texto.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
  let ano = hoje.getFullYear()
  let mes = hoje.getMonth() + 1
  let dia = hoje.getDate()
  let hora = 9
  let minuto = 0
  let temDado = false

  if (matchData) {
    dia = Number(matchData[1])
    mes = Number(matchData[2])
    if (matchData[3]) {
      ano = Number(matchData[3])
      if (ano < 100) ano += 2000
    }
    temDado = true
  }

  // Hora "14h" ou "14h30" ou "14:30" (com "às" ou "as")
  const matchHora = texto.match(/[àa]s?\s+(\d{1,2})(?:[h:](\d{2}))?/i)
  if (matchHora) {
    hora = Number(matchHora[1])
    minuto = matchHora[2] ? Number(matchHora[2]) : 0
    temDado = true
  } else {
    const matchHoraSimples = texto.match(/\b(\d{1,2})h(\d{2})?\b/i)
    if (matchHoraSimples) {
      hora = Number(matchHoraSimples[1])
      minuto = matchHoraSimples[2] ? Number(matchHoraSimples[2]) : 0
      temDado = true
    }
  }

  if (!temDado) return null

  // Sanity checks
  if (mes < 1 || mes > 12) return null
  if (dia < 1 || dia > 31) return null
  if (hora < 0 || hora > 23) return null
  if (minuto < 0 || minuto > 59) return null

  // Monta ISO em UTC assumindo fuso America/Sao_Paulo (-03:00)
  const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00-03:00`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/**
 * Tenta detectar intencao de acordo a partir de uma mensagem.
 * Retorna null se nenhuma regra bate ou confianca < 60.
 */
export function detectarIntencao(texto: string): IntencaoDetectada | null {
  if (!texto || texto.trim().length < 5) return null

  let melhor: { regra: Regra; matches: number } | null = null

  for (const regra of REGRAS) {
    let matches = 0
    for (const re of regra.palavras) {
      if (re.test(texto)) matches++
    }
    if (matches > 0) {
      if (!melhor || matches > melhor.matches) {
        melhor = { regra, matches }
      }
    }
  }

  if (!melhor) return null

  const valor = extrairValor(texto)
  const dataHora = extrairDataHora(texto)

  // Boost de confianca quando temos valor ou data junto da intencao certa
  let confianca = melhor.regra.pesoBase + (melhor.matches - 1) * 5
  if (valor !== null && (melhor.regra.tipo === 'orcamento' || melhor.regra.tipo === 'execucao')) confianca += 10
  if (dataHora !== null && (melhor.regra.tipo === 'agendamento' || melhor.regra.tipo === 'vistoria')) confianca += 10
  confianca = Math.min(100, confianca)

  if (confianca < LIMITE_CONFIANCA_MINIMA) return null

  return {
    tipo: melhor.regra.tipo,
    resumo: melhor.regra.resumoPadrao,
    data_hora: dataHora,
    valor,
    observacoes: texto.length > 200 ? `${texto.slice(0, 197)}...` : texto,
    confianca,
  }
}

export const _internals = { extrairValor, extrairDataHora, LIMITE_CONFIANCA_MINIMA }
