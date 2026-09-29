/**
 * gamificationSettings.ts — padrão + efetivo da pontuação configurável
 * (PLANO_DESENHO_CRM_2.md). Espelha `src/utils/gamificationSettings.ts` do
 * front — os dois lados leem/escrevem `tenants/{tid}/settings/gamification` e
 * precisam concordar nos mesmos padrões, mas front e functions são projetos
 * TypeScript separados (sem import cruzado), daí a duplicação deliberada.
 *
 * Documento ausente ou parcial cai nos valores abaixo, que são os mesmos que
 * já valiam fixos no código antes desta mudança — ninguém tem a pontuação
 * alterada até o master mexer na tela.
 */

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

export interface GamificationSettingsDoc {
  actionPoints?: Partial<ActionPoints>;
  sdrRankingWeights?: Partial<SdrRankingWeights>;
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

export function effectiveActionPoints(doc: GamificationSettingsDoc | null | undefined): ActionPoints {
  return { ...DEFAULT_ACTION_POINTS, ...(doc?.actionPoints ?? {}) };
}

export function effectiveSdrRankingWeights(doc: GamificationSettingsDoc | null | undefined): SdrRankingWeights {
  return { ...DEFAULT_SDR_RANKING_WEIGHTS, ...(doc?.sdrRankingWeights ?? {}) };
}
