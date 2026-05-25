// Limites de plano conforme Entrega 1 (POO II): regras RN02-RN17, RN32

export type PlanoUsuario = 'free' | 'basico' | 'premium'

export type LimitesPlano = {
  // ----- CLIENTE -----
  podePublicarDemanda: boolean              // RN02
  maxDemandasAtivas: number                 // RN03/RN04/RN05/RN32
  maxPropostasPorDemanda: number            // RN06 (qtas conversas dentro de uma demanda)
  maxNegociacoesForaDemanda: number         // RN08 (qtos prestadores fora da demanda)
  maxServicosSimultaneosCliente: number     // RN09/RN10
  // ----- PRESTADOR -----
  maxCategorias: number                     // RN12
  maxServicos: number                       // RN13
  maxServicosSimultaneosPrestador: number   // RN14/RN15
  maxPropostasSimultaneasPrestador: number  // RN16
  podeAceitarDemandas: boolean              // RN11
  podeEnviarPropostas: boolean              // RN11
}

export const LIMITES_PLANO: Record<PlanoUsuario, LimitesPlano> = {
  free: {
    // Cliente Free (RN02, RN03)
    podePublicarDemanda: false,
    maxDemandasAtivas: 0,
    maxPropostasPorDemanda: 0,
    maxNegociacoesForaDemanda: 1,
    maxServicosSimultaneosCliente: 1,
    // Prestador Free (RN11)
    maxCategorias: 0,
    maxServicos: 0,
    maxServicosSimultaneosPrestador: 0,
    maxPropostasSimultaneasPrestador: 0,
    podeAceitarDemandas: false,
    podeEnviarPropostas: false,
  },
  basico: {
    // Cliente Básico (RN04, RN06, RN08, RN09)
    podePublicarDemanda: true,
    maxDemandasAtivas: 2,
    maxPropostasPorDemanda: 2,
    maxNegociacoesForaDemanda: 5,
    maxServicosSimultaneosCliente: 2,
    // Prestador Básico (RN12, RN13, RN14)
    maxCategorias: 2,
    maxServicos: 3,
    maxServicosSimultaneosPrestador: 2,
    maxPropostasSimultaneasPrestador: 1,
    podeAceitarDemandas: true,
    podeEnviarPropostas: true,
  },
  premium: {
    // Cliente Premium Plus (RN05/RN32, RN10) — ilimitadas de verdade
    podePublicarDemanda: true,
    maxDemandasAtivas: Number.POSITIVE_INFINITY,
    maxPropostasPorDemanda: Number.POSITIVE_INFINITY,
    maxNegociacoesForaDemanda: Number.POSITIVE_INFINITY,
    maxServicosSimultaneosCliente: Number.POSITIVE_INFINITY,
    // Prestador Premium (RN15, RN16) — tambem ilimitado
    maxCategorias: Number.POSITIVE_INFINITY,
    maxServicos: Number.POSITIVE_INFINITY,
    maxServicosSimultaneosPrestador: Number.POSITIVE_INFINITY,
    maxPropostasSimultaneasPrestador: Number.POSITIVE_INFINITY,
    podeAceitarDemandas: true,
    podeEnviarPropostas: true,
  },
}

/**
 * Formata um limite numerico no padrao do app. Infinito vira "ilimitadas".
 */
export function formatarLimite(n: number): string {
  if (!Number.isFinite(n)) return 'ilimitadas'
  return String(n)
}

export function nomePlano(plano: string | null | undefined) {
  if (plano === 'basico') return 'Pro'
  if (plano === 'premium') return 'Premium Pro'
  return 'Free'
}

export function obterLimitesPlano(plano: string | null | undefined): LimitesPlano {
  if (plano === 'basico') return LIMITES_PLANO.basico
  if (plano === 'premium') return LIMITES_PLANO.premium
  return LIMITES_PLANO.free
}
