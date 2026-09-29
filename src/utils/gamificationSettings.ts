/**
 * gamificationSettings.ts — padrão + efetivo da pontuação configurável
 * (PLANO_DESENHO_CRM_2.md). Espelha `functions/src/shared/gamificationSettings.ts`
 * — os dois lados leem/escrevem `tenants/{tid}/settings/gamification` e
 * precisam concordar nos mesmos padrões, mas front e functions são projetos
 * TypeScript separados (sem import cruzado), daí a duplicação deliberada.
 *
 * Mesmo padrão de `rolePermissions.ts`: documento ausente ou parcial cai nos
 * valores abaixo, que são os mesmos que já valiam fixos no código antes desta
 * mudança — ninguém tem a pontuação alterada até o master mexer na tela.
 */
import type { GamificationSettings } from '../types/crm';

export interface ActionPoints {
  dealCreated: number;
  emailSent: number;
  whatsappSent: number;
  meetingTaskDone: number;
  dealWon: number;
}

export interface SdrRankingWeights {
  visits: number;
  meetingsDone: number;
  actPct: number;
}

export const DEFAULT_ACTION_POINTS: ActionPoints = {
  dealCreated: 5,
  emailSent: 15,
  whatsappSent: 20,
  meetingTaskDone: 30,
  dealWon: 100,
};

// Pesos grandes o bastante pra reproduzir a ordem de desempate anterior
// (visitas > reuniões realizadas > % de atividades) — visits domina
// meetingsDone (até ~100 reuniões no período) que domina actPct (0–100).
// São só o PADRÃO: o master pode reequilibrar na tela de Configurações.
export const DEFAULT_SDR_RANKING_WEIGHTS: SdrRankingWeights = {
  visits: 10_000,
  meetingsDone: 100,
  actPct: 1,
};

export function effectiveActionPoints(settings: GamificationSettings | null | undefined): ActionPoints {
  return { ...DEFAULT_ACTION_POINTS, ...(settings?.actionPoints ?? {}) };
}

export function effectiveSdrRankingWeights(settings: GamificationSettings | null | undefined): SdrRankingWeights {
  return { ...DEFAULT_SDR_RANKING_WEIGHTS, ...(settings?.sdrRankingWeights ?? {}) };
}
