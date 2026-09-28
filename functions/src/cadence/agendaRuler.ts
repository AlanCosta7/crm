/**
 * agendaRuler.ts — a régua que substitui a cadência quando o cliente marca hora
 *
 * Fase 3 do PLANO_DESENHO_CRM.md (slide 8 do deck "Desenho CRM"), literal:
 *
 *   "Uma vez que o cliente levante a mão e queira agendar a Reunião, a sequência
 *    de atividades da cadência deve ser quebrada, e outra iniciada.
 *    A sequência deve ser:
 *      a) Follow-up de 3 em 3 dias
 *      b) Confirmação da Reunião 24h úteis com o cliente"
 *
 * O mesmo vale para a Visita.
 *
 * Só existe no lado do servidor, de propósito: a régua é montada pelo trigger de
 * mudança de etapa e o cliente apenas lê as atividades resultantes. Nada aqui
 * precisa ser duplicado em `src/` (diferente de `timeBlocks.ts`, que a tela usa
 * para agrupar).
 *
 * "24h ÚTEIS" = um dia útil antes, preservando a hora do compromisso. Reunião
 * na segunda 10h → confirmar na sexta (pula o fim de semana). É a leitura
 * comercial corrente da expressão no Brasil, e a que faz sentido operacional:
 * o SDR precisa de um dia de trabalho para reagir a um cancelamento.
 */

export type AgendaReason = "meeting_scheduled" | "visit_scheduled";

/** Intervalo entre follow-ups, em dias corridos (slide 8: "de 3 em 3 dias"). */
export const AGENDA_FOLLOWUP_GAP_DAYS = 3;

/** "24h úteis" antes do compromisso. */
export const AGENDA_CONFIRM_BUSINESS_DAYS = 1;

export type AgendaTaskKind = "followup" | "confirmation";

export interface AgendaTask {
  kind: AgendaTaskKind;
  /** Instante em que a tarefa vence. */
  at: Date;
  /** 1-based, só para follow-up — alimenta o rótulo "Follow-up 2 de 3". */
  index?: number;
  total?: number;
}

function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Recua `days` dias ÚTEIS preservando a hora.
 *
 * Os cálculos são feitos em UTC deslocado para BRT (-3) porque o que importa é
 * o dia da semana no fuso de Brasília: um compromisso na segunda 1h UTC é
 * domingo à noite em BRT, e recuar pelo dia UTC daria a resposta errada.
 */
export function subtractBusinessDays(from: Date, days: number): Date {
  const brt = new Date(from.getTime() - 3 * 3600_000);
  let restantes = Math.max(0, Math.round(days));
  while (restantes > 0) {
    brt.setUTCDate(brt.getUTCDate() - 1);
    if (!isWeekend(brt)) restantes--;
  }
  // Se cair em fim de semana mesmo com 0 dias a recuar (compromisso na
  // segunda com days=0), volta para a sexta — confirmar no sábado não serve.
  while (isWeekend(brt)) brt.setUTCDate(brt.getUTCDate() - 1);
  return new Date(brt.getTime() + 3 * 3600_000);
}

/**
 * Monta a régua de agenda entre agora e o compromisso.
 *
 * Ordem do resultado: follow-ups em ordem cronológica, confirmação por último.
 *
 * Casos de borda, todos deliberados:
 *  - Compromisso no passado (ou agora) → régua vazia. Não há o que confirmar.
 *  - Confirmação já passou (compromisso é hoje ou amanhã) → régua vazia: criar
 *    uma tarefa vencida no instante do agendamento só geraria alerta de atraso
 *    para algo que o SDR não tinha como fazer.
 *  - Compromisso perto (menos de 3 dias até a confirmação) → só a confirmação,
 *    sem follow-up. Follow-up depois da confirmação inverteria a lógica.
 *  - Follow-up que cairia no mesmo instante da confirmação ou depois dela é
 *    descartado — a confirmação é o último toque antes do compromisso.
 */
export function buildAgendaSchedule(now: Date, eventAt: Date): AgendaTask[] {
  if (!(eventAt instanceof Date) || Number.isNaN(eventAt.getTime())) return [];
  if (eventAt.getTime() <= now.getTime()) return [];

  const confirmAt = subtractBusinessDays(eventAt, AGENDA_CONFIRM_BUSINESS_DAYS);
  if (confirmAt.getTime() <= now.getTime()) return [];

  const followUps: Date[] = [];
  const gapMs = AGENDA_FOLLOWUP_GAP_DAYS * 86_400_000;
  for (let t = now.getTime() + gapMs; t < confirmAt.getTime(); t += gapMs) {
    followUps.push(new Date(t));
  }

  return [
    ...followUps.map((at, i) => ({
      kind: "followup" as const, at, index: i + 1, total: followUps.length,
    })),
    { kind: "confirmation" as const, at: confirmAt },
  ];
}

/** Etapas que disparam a régua, e o motivo correspondente. */
export const AGENDA_TRIGGER_STAGES: Record<string, AgendaReason> = {
  reuniao_agendada: "meeting_scheduled",
  visita_agendada: "visit_scheduled",
  degustacao_agendada: "visit_scheduled",
};

/**
 * Tipo de atividade da régua: sempre `agenda`, para reunião e para visita.
 *
 * A primeira versão usava `meeting`/`visit`, para a tarefa cair no bloco
 * "Follow Up de Agenda" das 16h. Funcionava — e inflava todos os indicadores:
 * "Reuniões Agendadas" (dashboard da gestão, painel do SDR, TV) conta
 * atividades `meeting`, então uma reunião com sete follow-ups aparecia como
 * oito reuniões. Follow-up de uma reunião não é reunião.
 *
 * O tipo próprio mantém o bloco certo (`agenda` está no bloco das 16h em
 * `DEFAULT_TIME_BLOCKS`) sem contaminar a contagem. Reunião × visita continua
 * distinguível pelo campo `agendaReason` da atividade.
 */
export function agendaActivityType(_reason: AgendaReason): "agenda" {
  return "agenda";
}

/** Rótulo exibido na fila do SDR. */
export function agendaTaskLabel(task: AgendaTask, reason: AgendaReason): string {
  const compromisso = reason === "meeting_scheduled" ? "reunião" : "visita";
  if (task.kind === "confirmation") {
    return `Confirmar a ${compromisso} com o cliente (24h úteis antes)`;
  }
  const n = task.index && task.total && task.total > 1 ? ` ${task.index}/${task.total}` : "";
  return `Follow-up${n} até a ${compromisso}`;
}
