/**
 * reassignPendingActivities.ts — acompanha a troca de responsável do card
 *
 * Autorização `manage_deal_cards` (BDR/Gestor/Master trocam o SDR ou o Rep de
 * um card — DealSidebar › "Trocar responsável", 21/09/2026). O client só
 * escreve o campo do deal (`assignedSdrId`/`assignedRepId`); as regras de
 * `activities` só deixam cada um mexer nas PRÓPRIAS atividades, então o que
 * ficou pendente no nome de quem saiu precisa ser movido aqui, no servidor.
 *
 * Sem isto, o SDR antigo ficava com atividades soltas de um card que ele nem
 * lê mais, e a tela do novo SDR recriava as de hoje (`ensureTodaySteps` só
 * enxerga as atividades dele) — dobrando o trabalho.
 *
 * O que acontece, por campo trocado (ambos preenchidos e diferentes — a
 * primeira atribuição e a devolução ao BDR não têm "de → para"):
 *  1. Atividades `pending` do card no nome de quem saiu passam para quem
 *     entrou. Concluídas ficam onde estão (histórico e moedas são de quem fez).
 *  2. Se o novo responsável já tem a mesma modalidade pendente no card (ex.:
 *     abriu a tela antes da função rodar e o client recriou), a antiga é
 *     APAGADA em vez de movida — nada de atividade duplicada.
 *  3. Google Calendar: o gatilho `onActivityScheduled` não recria evento quando
 *     só o `userId` muda, então o evento do antigo é apagado e o do novo criado
 *     aqui (se ele tiver Calendar conectado).
 *  4. Só para SDR: tira as atividades movidas da fila do dia do SDR antigo
 *     (`cadence_queues/{sdr}/daily/{hoje}`); senão o card seguia aparecendo lá
 *     como fantasma. `assignedAt` (âncora da régua) NÃO é tocado: o novo SDR
 *     continua de onde o card estava (D+5, D+8…), não recomeça no D0.
 *
 * Idempotente: uma segunda execução não encontra mais pendentes no nome de
 * quem saiu. A escrita do `userId` re-dispara `onActivityScheduled`, mas ele só
 * age em mudança de `scheduledAt`/`outcome`/`status` — aqui nenhuma muda.
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getTodayBRT } from "../cadence/cadenceUtils";
import { createCalendarEvent, deleteCalendarEvent } from "../integrations/calendar/calendarService";

export type ResponsibleField = "assignedSdrId" | "assignedRepId";

export interface ResponsibleChange {
  field: ResponsibleField;
  oldUid: string;
  newUid: string;
}

const FIELDS: ResponsibleField[] = ["assignedSdrId", "assignedRepId"];

/** Trocas "de → para" entre before/after. Primeira atribuição e limpeza não contam. */
export function responsibleChanges(
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData | undefined,
): ResponsibleChange[] {
  if (!before || !after) return [];
  const changes: ResponsibleChange[] = [];
  for (const field of FIELDS) {
    const oldUid = before[field];
    const newUid = after[field];
    if (typeof oldUid === "string" && oldUid && typeof newUid === "string" && newUid && oldUid !== newUid) {
      changes.push({ field, oldUid, newUid });
    }
  }
  return changes;
}

interface QueueCardLike {
  dealId: string;
  activities: Record<string, { activityId?: string } | undefined>;
  [k: string]: unknown;
}

/**
 * Remove da fila do dia as atividades que saíram do SDR. Um card que fica sem
 * nenhuma atividade some; os contadores acompanham. Função pura.
 */
export function stripActivitiesFromQueue<Q extends { cards?: QueueCardLike[]; activitiesRequired?: number }>(
  queue: Q,
  dealId: string,
  removedActivityIds: Set<string>,
): { cards: QueueCardLike[]; cardsDistributed: number; activitiesRequired: number; removed: number } {
  let removed = 0;
  const cards: QueueCardLike[] = [];
  for (const card of queue.cards ?? []) {
    if (card.dealId !== dealId) { cards.push(card); continue; }
    const kept: QueueCardLike["activities"] = {};
    for (const [type, act] of Object.entries(card.activities ?? {})) {
      if (act?.activityId && removedActivityIds.has(act.activityId)) removed++;
      else kept[type] = act;
    }
    if (Object.keys(kept).length > 0) cards.push({ ...card, activities: kept });
  }
  return {
    cards,
    cardsDistributed: cards.length,
    activitiesRequired: Math.max(0, (queue.activitiesRequired ?? 0) - removed),
    removed,
  };
}

/** Efeitos externos injetáveis — o teste de emulador troca o Calendar por um falso. */
export interface CalendarPort {
  deleteEvent(tenantId: string, userId: string, eventId: string): Promise<unknown>;
  createEvent(tenantId: string, userId: string, input: Record<string, unknown>): Promise<string | null>;
}

const realCalendar = (db: admin.firestore.Firestore): CalendarPort => ({
  deleteEvent: (tenantId, userId, eventId) => deleteCalendarEvent(db, tenantId, userId, eventId),
  createEvent: (tenantId, userId, input) => createCalendarEvent(db, tenantId, userId, input as any),
});

export interface ReassignResult {
  moved: number;
  deletedDuplicates: number;
}

export async function reassignPendingActivities(
  db: admin.firestore.Firestore,
  params: {
    tenantId: string;
    dealId: string;
    change: ResponsibleChange;
    todayBRT?: string;
    calendar?: CalendarPort;
    rtdb?: admin.database.Database;
  },
): Promise<ReassignResult> {
  const { tenantId, dealId, change } = params;
  const calendar = params.calendar ?? realCalendar(db);
  const todayBRT = params.todayBRT ?? getTodayBRT();
  const activitiesCol = db.collection(`tenants/${tenantId}/activities`);

  const [oldSnap, newSnap] = await Promise.all([
    activitiesCol.where("dealId", "==", dealId).where("userId", "==", change.oldUid).where("status", "==", "pending").get(),
    activitiesCol.where("dealId", "==", dealId).where("userId", "==", change.newUid).where("status", "==", "pending").get(),
  ]);
  if (oldSnap.empty) return { moved: 0, deletedDuplicates: 0 };

  const newUserTypes = new Set(newSnap.docs.map(d => d.data().type as string));
  const newUserCalendarOn = !!(await db.doc(`tenants/${tenantId}/calendar_tokens/${change.newUid}`).get()).data()?.isConnected;

  const batch = db.batch();
  const removedIds = new Set<string>();
  const toCreateEvent: { ref: FirebaseFirestore.DocumentReference; input: Record<string, unknown> }[] = [];
  let moved = 0;
  let deletedDuplicates = 0;

  for (const doc of oldSnap.docs) {
    const act = doc.data();
    removedIds.add(doc.id);

    // Evento do antigo sai da agenda dele em qualquer dos dois caminhos.
    if (act.calendarEventId) {
      await calendar.deleteEvent(tenantId, change.oldUid, act.calendarEventId).catch(err =>
        console.error(`[reassignPendingActivities] Calendar: falha ao apagar evento ${act.calendarEventId}:`, err));
    }

    if (newUserTypes.has(act.type)) {
      batch.delete(doc.ref);
      deletedDuplicates++;
      continue;
    }

    batch.update(doc.ref, {
      userId: change.newUid,
      calendarEventId: FieldValue.delete(),
      reassignedFrom: change.oldUid,
      reassignedAt: FieldValue.serverTimestamp(),
    });
    moved++;

    const scheduledAt: Date | null = act.scheduledAt?.toDate ? act.scheduledAt.toDate() : null;
    if (newUserCalendarOn && scheduledAt) {
      toCreateEvent.push({
        ref: doc.ref,
        input: {
          activityId: doc.id,
          activityType: act.type || "email",
          contactName: act.contactName || "Contato",
          companyName: act.companyName || "Empresa",
          productId: act.productId,
          scheduledAt,
          dealId,
          outcome: act.outcome,
          notes: act.notes,
        },
      });
    }
  }

  // Fila do dia do SDR antigo — só existe para o campo do SDR.
  if (change.field === "assignedSdrId") {
    const queueRef = db.doc(`tenants/${tenantId}/cadence_queues/${change.oldUid}/daily/${todayBRT}`);
    const queueSnap = await queueRef.get();
    if (queueSnap.exists) {
      const { cards, cardsDistributed, activitiesRequired, removed } =
        stripActivitiesFromQueue(queueSnap.data() as any, dealId, removedIds);
      if (removed > 0) batch.update(queueRef, { cards, cardsDistributed, activitiesRequired });
    }
  }

  await batch.commit();

  // Eventos novos só depois do commit: o id do evento é gravado na atividade já movida.
  for (const { ref, input } of toCreateEvent) {
    try {
      const calendarEventId = await calendar.createEvent(tenantId, change.newUid, input);
      if (calendarEventId) await ref.update({ calendarEventId, calendarSyncedAt: FieldValue.serverTimestamp() });
    } catch (err) {
      console.error("[reassignPendingActivities] Calendar: falha ao criar evento do novo responsável:", err);
    }
  }

  // Refresh imediato da tela do SDR antigo (mesmo nó que o motor diário atualiza).
  if (change.field === "assignedSdrId" && params.rtdb) {
    try {
      const queueSnap = await db.doc(`tenants/${tenantId}/cadence_queues/${change.oldUid}/daily/${todayBRT}`).get();
      if (queueSnap.exists) {
        const q = queueSnap.data()!;
        await params.rtdb.ref(`tenants/${tenantId}/cadence/${change.oldUid}`).update({
          cardsDistributed: q.cardsDistributed ?? 0,
          activitiesRequired: q.activitiesRequired ?? 0,
          lastUpdated: admin.database.ServerValue.TIMESTAMP,
        });
      }
    } catch (err) {
      console.error("[reassignPendingActivities] RTDB: falha ao atualizar o SDR antigo:", err);
    }
  }

  console.log(`[reassignPendingActivities] deal ${dealId} ${change.field}: ${change.oldUid} → ${change.newUid} | ${moved} movida(s), ${deletedDuplicates} duplicada(s) apagada(s)`);
  return { moved, deletedDuplicates };
}

export const onDealResponsibleChanged = onDocumentUpdated(
  { document: "tenants/{tenantId}/deals/{dealId}", region: "southamerica-east1", timeoutSeconds: 120 },
  async (event) => {
    const changes = responsibleChanges(event.data?.before.data(), event.data?.after.data());
    if (changes.length === 0) return;

    const db = admin.firestore();
    for (const change of changes) {
      try {
        await reassignPendingActivities(db, {
          tenantId: event.params.tenantId,
          dealId: event.params.dealId,
          change,
          rtdb: admin.database(),
        });
      } catch (err) {
        console.error(`[onDealResponsibleChanged] Erro ao mover atividades do deal ${event.params.dealId}:`, err);
      }
    }
  },
);
