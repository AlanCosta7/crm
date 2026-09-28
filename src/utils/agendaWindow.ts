/**
 * agendaWindow.ts — prevê, na tela, se a régua de agenda vai nascer vazia
 *
 * Fase 3 do PLANO_DESENHO_CRM.md. A régua é montada no servidor
 * (`functions/src/cadence/agendaRuler.ts`), mas o modal de agendamento precisa
 * AVISAR o SDR quando o compromisso está perto demais para haver confirmação
 * "24h úteis antes". Para o aviso bater com o que o servidor faz, a regra tem
 * que ser a mesma — daí este espelho pequeno.
 *
 * A primeira versão do modal usava "menos de 2 dias corridos", e errava nos
 * dois sentidos por ignorar o fim de semana: segunda 10h vista na sexta 21h
 * (2,5 dias) nasce SEM régua, e quarta 10h vista na terça 9h (25h) nasce COM
 * confirmação. Os testes deste arquivo cobrem exatamente esses dois casos.
 *
 * ⚠️ ESPELHO: `subtractBusinessDays` e a condição de `reguaFicaVazia` replicam
 * `agendaRuler.ts`. Ao mudar a regra lá, mude aqui.
 */

/** "24h úteis" antes do compromisso — espelha AGENDA_CONFIRM_BUSINESS_DAYS. */
export const CONFIRM_BUSINESS_DAYS = 1;

function isWeekendUTC(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

/** Recua dias úteis preservando a hora, pelo calendário de Brasília (UTC-3). */
export function subtractBusinessDays(from: Date, days: number): Date {
  const brt = new Date(from.getTime() - 3 * 3600_000);
  let restantes = Math.max(0, Math.round(days));
  while (restantes > 0) {
    brt.setUTCDate(brt.getUTCDate() - 1);
    if (!isWeekendUTC(brt)) restantes--;
  }
  while (isWeekendUTC(brt)) brt.setUTCDate(brt.getUTCDate() - 1);
  return new Date(brt.getTime() + 3 * 3600_000);
}

/**
 * A régua nasce vazia? Espelha as saídas antecipadas de `buildAgendaSchedule`:
 * compromisso inválido, no passado, ou com a confirmação já no passado.
 */
export function reguaFicaVazia(now: Date, eventAt: Date): boolean {
  if (!(eventAt instanceof Date) || Number.isNaN(eventAt.getTime())) return true;
  if (eventAt.getTime() <= now.getTime()) return true;
  return subtractBusinessDays(eventAt, CONFIRM_BUSINESS_DAYS).getTime() <= now.getTime();
}

/**
 * Sugestão padrão do modal: dia útil às 10h, pelo menos 3 dias à frente, e com
 * espaço para a régua. A primeira versão sugeria "amanhã às 10h" — que sempre
 * nascia sem régua, ou seja, o valor padrão disparava o próprio aviso.
 */
export function sugestaoDeReuniao(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 3);
  d.setHours(10, 0, 0, 0);
  for (let i = 0; i < 14 && (d.getDay() === 0 || d.getDay() === 6 || reguaFicaVazia(now, d)); i++) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}
