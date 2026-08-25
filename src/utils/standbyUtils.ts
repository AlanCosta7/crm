/**
 * standbyUtils.ts — Regras puras do gatilho Standby
 *
 * Pedido do cliente (Observações CRM, jul/2026):
 * "Criar um gatilho dentro de Atividade, chamado Standby, onde, quando o
 *  gatilho for ativado, gere automaticamente uma tela com a necessidade de
 *  registrar, no mínimo, 5 follow-ups, com espaço de, no máximo, 1 semana
 *  de um follow-up para o outro."
 *
 * Testes em: src/utils/standbyUtils.test.ts
 */

export const STANDBY_MIN_FOLLOWUPS = 5;
export const STANDBY_MAX_GAP_DAYS = 7;

/**
 * Gera o cronograma de follow-ups do Standby: `count` datas a partir de
 * `start`, espaçadas de `gapDays` (padrão: 5 follow-ups semanais).
 * O 1º follow-up vence `gapDays` após a ativação.
 */
export function buildStandbySchedule(
  start: Date,
  count: number = STANDBY_MIN_FOLLOWUPS,
  gapDays: number = STANDBY_MAX_GAP_DAYS,
): Date[] {
  const safeCount = Math.max(STANDBY_MIN_FOLLOWUPS, Math.round(count));
  const safeGap = Math.min(STANDBY_MAX_GAP_DAYS, Math.max(1, Math.round(gapDays)));
  return Array.from({ length: safeCount }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + safeGap * (i + 1));
    d.setHours(18, 0, 0, 0); // vencimento no fim do expediente
    return d;
  });
}

/** Data normalizada para dia de calendário (ignora horário). */
function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/**
 * Valida um cronograma de Standby: mínimo de 5 follow-ups e no máximo
 * 7 dias de intervalo entre um e outro (e do início ao 1º).
 * A comparação é por dia de calendário — o horário do vencimento não conta.
 */
export function validateStandbySchedule(start: Date, dates: Date[]): { valid: boolean; error?: string } {
  if (dates.length < STANDBY_MIN_FOLLOWUPS) {
    return { valid: false, error: `O Standby exige no mínimo ${STANDBY_MIN_FOLLOWUPS} follow-ups.` };
  }
  let prev = dayNumber(start);
  for (const [i, d] of dates.entries()) {
    const day = dayNumber(d);
    if (day <= prev) {
      return { valid: false, error: `O follow-up ${i + 1} deve ser depois do anterior.` };
    }
    if (day - prev > STANDBY_MAX_GAP_DAYS) {
      return { valid: false, error: `O intervalo até o follow-up ${i + 1} passa de ${STANDBY_MAX_GAP_DAYS} dias.` };
    }
    prev = day;
  }
  return { valid: true };
}
