/**
 * applyAgendaRuler.ts — quebra a cadência e instala a régua de agenda
 *
 * Fase 3 do PLANO_DESENHO_CRM.md (slide 8). Chamado por `onDealStageChanged`
 * quando o deal entra numa etapa de agendamento.
 *
 * O que faz, em ordem:
 *  1. Cancela as atividades PENDENTES da cadência diária do deal — é a "quebra"
 *     que o slide 8 pede. Marca como `skipped` (não apaga): a auditoria da
 *     jornada do lead precisa mostrar que a régua foi interrompida, e por quê.
 *  2. Cancela também uma régua de agenda anterior, se o compromisso foi
 *     remarcado — senão o SDR acumularia duas réguas para o mesmo card.
 *  3. Cria as tarefas da régua nova (`buildAgendaSchedule`), carimbando o bloco
 *     de horário da Fase 2 para caírem no "Follow Up de Agenda" das 16h.
 *
 * Idempotente pelo passo 2: rodar de novo com o mesmo compromisso cancela a
 * régua anterior e recria uma idêntica.
 */

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  agendaActivityType, agendaTaskLabel, buildAgendaSchedule,
  type AgendaReason,
} from "./agendaRuler";
import { blockForType, blockStartAt, normalizeTimeBlocks } from "./timeBlocks";
import { getTodayBRT } from "./cadenceUtils";

/** `cadenceType` das atividades desta régua — separa das diárias e do Standby. */
export const AGENDA_CADENCE_TYPE = "agenda";

/** Data do compromisso conforme o motivo. Undefined quando o campo não está preenchido. */
export function eventDateFor(
  reason: AgendaReason,
  deal: FirebaseFirestore.DocumentData,
): Date | undefined {
  const raw = reason === "meeting_scheduled" ? deal.meetingScheduledAt : deal.visitScheduledAt;
  if (!raw) return undefined;
  const d = typeof raw?.toDate === "function" ? raw.toDate() : new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export interface ApplyResult {
  canceladasDaCadencia: number;
  canceladasDaAgenda: number;
  criadas: number;
  motivoSemRegua?: "sem_data" | "compromisso_proximo" | "sem_responsavel";
}

export async function applyAgendaRuler(
  db: admin.firestore.Firestore,
  tenantId: string,
  dealId: string,
  deal: FirebaseFirestore.DocumentData,
  reason: AgendaReason,
  now: Date = new Date(),
): Promise<ApplyResult> {
  const out: ApplyResult = { canceladasDaCadencia: 0, canceladasDaAgenda: 0, criadas: 0 };

  // ── 1 e 2. Cancela o que estava pendente — SEMPRE, antes de qualquer saída ──
  //
  // A quebra da cadência é o que o slide 8 pede quando o cliente levanta a mão,
  // e independe de dar para montar a régua: sem data, sem responsável ou com o
  // compromisso em cima da hora, o SDR continua sem dever prospectar quem já
  // aceitou reunião. (A primeira versão desta função saía por falta de data
  // ANTES deste passo — o teste de emulador pegou.)
  const pendentes = await db
    .collection(`tenants/${tenantId}/activities`)
    .where("dealId", "==", dealId)
    .where("status", "==", "pending")
    .get();

  const batch = db.batch();
  for (const doc of pendentes.docs) {
    const tipoCadencia = doc.data().cadenceType;
    const daAgenda = tipoCadencia === AGENDA_CADENCE_TYPE;
    batch.update(doc.ref, {
      status: "skipped",
      skippedReason: daAgenda ? "agenda_remarcada" : "agenda_iniciada",
      skippedAt: FieldValue.serverTimestamp(),
    });
    if (daAgenda) out.canceladasDaAgenda++;
    else out.canceladasDaCadencia++;
  }

  // A partir daqui, toda saída precisa gravar o batch — senão a quebra acima se perde.
  const ownerId: string = deal.assignedSdrId || deal.responsibleId || deal.owner || "";
  if (!ownerId) {
    out.motivoSemRegua = "sem_responsavel";
    await batch.commit();
    return out;
  }

  const eventAt = eventDateFor(reason, deal);
  if (!eventAt) {
    // Sem data não há régua possível. Acontece quando o card é movido por um
    // caminho que não pede a data (drag no Kanban antes do modal, importação).
    out.motivoSemRegua = "sem_data";
    await batch.commit();
    return out;
  }

  const tasks = buildAgendaSchedule(now, eventAt);

  // ── 3. Cria a régua nova ────────────────────────────────────────────────────
  if (tasks.length === 0) {
    // Compromisso muito perto: nada a agendar (ver buildAgendaSchedule). A
    // quebra da cadência acima vale de todo jeito — o SDR não deve continuar
    // prospectando quem já marcou hora.
    out.motivoSemRegua = "compromisso_proximo";
    await batch.commit();
    return out;
  }

  const blocks = await lerBlocos(db, tenantId);
  const type = agendaActivityType(reason);
  const block = blockForType(blocks, type);

  for (const task of tasks) {
    const diaBRT = getTodayBRT(task.at);
    // `scheduledAt` na hora do bloco (consistente com o dailyCadenceEngine);
    // `dueAt` no fim do dia, para o activityOverdueChecker manter o sentido.
    const scheduledAt = block ? blockStartAt(block, diaBRT) : task.at;
    const dueAt = new Date(task.at);
    dueAt.setHours(23, 59, 0, 0);

    const ref = db.collection(`tenants/${tenantId}/activities`).doc();
    batch.set(ref, {
      dealId,
      userId: ownerId,
      type,
      cadenceType: AGENDA_CADENCE_TYPE,
      agendaKind: task.kind,
      agendaReason: reason,
      status: "pending",
      scheduledAt,
      blockId: block?.id ?? null,
      dueAt,
      text: agendaTaskLabel(task, reason),
      coinsAwarded: 0,
      wasOnTime: false,
      overdueNotificationCount: 0,
      contactName: deal.company || "Contato",
      companyName: deal.company || "Empresa",
      productId: deal.productId || "wizmart",
      createdAt: FieldValue.serverTimestamp(),
    });
    out.criadas++;
  }

  await batch.commit();
  return out;
}

/**
 * Cancela a régua de agenda de um deal — usado quando o compromisso acontece
 * (entra em `reuniao_realizada`/`visita_realizada`) ou o lead é perdido. Sem
 * isso o SDR seguiria vendo "confirmar a reunião" depois da reunião feita.
 */
export async function cancelAgendaRuler(
  db: admin.firestore.Firestore,
  tenantId: string,
  dealId: string,
  reasonLabel: string,
): Promise<number> {
  const pendentes = await db
    .collection(`tenants/${tenantId}/activities`)
    .where("dealId", "==", dealId)
    .where("status", "==", "pending")
    .where("cadenceType", "==", AGENDA_CADENCE_TYPE)
    .get();

  if (pendentes.empty) return 0;

  const batch = db.batch();
  for (const doc of pendentes.docs) {
    batch.update(doc.ref, {
      status: "skipped",
      skippedReason: reasonLabel,
      skippedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return pendentes.size;
}

async function lerBlocos(db: admin.firestore.Firestore, tenantId: string) {
  try {
    const snap = await db.doc(`tenants/${tenantId}/settings/cadence`).get();
    return normalizeTimeBlocks(snap.data()?.sdr?.timeBlocks);
  } catch (err) {
    console.warn("[applyAgendaRuler] Não foi possível ler os blocos, usando o padrão:", err);
    return normalizeTimeBlocks(undefined);
  }
}
