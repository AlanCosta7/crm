/**
 * onActivityScheduled.ts — Trigger Firestore para criar/atualizar eventos no Calendar
 *
 * Trigger: onWrite /tenants/{tenantId}/activities/{activityId}
 *
 * Regras (REQUISITOS-V2.md §10.1):
 *  - CREATE com scheduledAt → cria evento no Calendar do userId
 *  - UPDATE com scheduledAt mudado → atualiza evento existente (não duplica)
 *  - UPDATE status → 'completed' ou 'skipped' → deleta evento (se existir)
 *  - Só processa se o usuário tem Calendar conectado (calendar_tokens/{userId})
 *
 * Callable para re-sync manual: syncCalendarEvent({ activityId, tenantId })
 */

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "./calendarService";

// ── Trigger automático ────────────────────────────────────────────────────────
export const onActivityScheduled = onDocumentWritten(
  "tenants/{tenantId}/activities/{activityId}",
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData  = event.data?.after.data();
    const { tenantId, activityId } = event.params;
    const db = admin.firestore();

    // DELETE — atividade removida: deleta evento Calendar se existia
    if (!afterData) {
      if (beforeData?.calendarEventId && beforeData?.userId) {
        await deleteCalendarEvent(db, tenantId, beforeData.userId, beforeData.calendarEventId);
      }
      return;
    }

    const userId: string = afterData.userId;
    if (!userId) return;

    // Verifica se o usuário tem Calendar conectado
    const tokenDoc = await db.doc(`tenants/${tenantId}/calendar_tokens/${userId}`).get();
    if (!tokenDoc.exists || !tokenDoc.data()?.isConnected) return;

    // Determina o scheduledAt (Timestamp → Date)
    const scheduledAt: Date | null = afterData.scheduledAt?.toDate
      ? afterData.scheduledAt.toDate()
      : afterData.scheduledAt ? new Date(afterData.scheduledAt) : null;

    // Atividade completada ou cancelada → remove evento do Calendar
    if (afterData.status === "completed" || afterData.status === "skipped") {
      if (afterData.calendarEventId) {
        await deleteCalendarEvent(db, tenantId, userId, afterData.calendarEventId);
        await event.data!.after.ref.update({ calendarEventId: null, calendarSyncedAt: FieldValue.serverTimestamp() });
      }
      return;
    }

    // Sem data agendada → nada a fazer
    if (!scheduledAt) return;

    const input = {
      activityId,
      activityType: afterData.type || "email",
      contactName:  afterData.contactName  || "Contato",
      companyName:  afterData.companyName  || "Empresa",
      productId:    afterData.productId,
      scheduledAt,
      dealId:       afterData.dealId,
      outcome:      afterData.outcome,
      notes:        afterData.notes,
    };

    // CREATE — nova atividade com data agendada
    if (!beforeData && scheduledAt) {
      const calendarEventId = await createCalendarEvent(db, tenantId, userId, input);
      if (calendarEventId) {
        await event.data!.after.ref.update({
          calendarEventId,
          calendarSyncedAt: FieldValue.serverTimestamp(),
        });
      }
      return;
    }

    // UPDATE — scheduledAt ou outcome mudou
    const beforeScheduledAt: Date | null = beforeData?.scheduledAt?.toDate
      ? beforeData.scheduledAt.toDate()
      : beforeData?.scheduledAt ? new Date(beforeData.scheduledAt) : null;

    const scheduledChanged = scheduledAt.getTime() !== beforeScheduledAt?.getTime();
    const outcomeChanged   = afterData.outcome !== beforeData?.outcome;

    if ((scheduledChanged || outcomeChanged) && afterData.calendarEventId) {
      await updateCalendarEvent(db, tenantId, userId, afterData.calendarEventId, {
        scheduledAt: scheduledChanged ? scheduledAt : undefined,
        outcome: outcomeChanged ? afterData.outcome : undefined,
      });
      await event.data!.after.ref.update({ calendarSyncedAt: FieldValue.serverTimestamp() });
    } else if (scheduledChanged && !afterData.calendarEventId) {
      // Ainda não tinha evento criado → cria agora
      const calendarEventId = await createCalendarEvent(db, tenantId, userId, input);
      if (calendarEventId) {
        await event.data!.after.ref.update({
          calendarEventId,
          calendarSyncedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  }
);

// ── Callable: syncCalendarEvent ────────────────────────────────────────────────
export const syncCalendarEvent = onCall(async (request) => {
  const { activityId, tenantId } = request.data as { activityId: string; tenantId: string };
  const uid = request.auth?.uid;

  if (!uid)         throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  if (!activityId)  throw new HttpsError("invalid-argument", "activityId obrigatório.");
  if (!tenantId)    throw new HttpsError("invalid-argument", "tenantId obrigatório.");

  const db = admin.firestore();
  const actSnap = await db.doc(`tenants/${tenantId}/activities/${activityId}`).get();

  if (!actSnap.exists) {
    throw new HttpsError("not-found", `Atividade ${activityId} não encontrada.`);
  }

  const act = actSnap.data()!;
  const scheduledAt: Date | null = act.scheduledAt?.toDate ? act.scheduledAt.toDate() : null;

  if (!scheduledAt) {
    throw new HttpsError("failed-precondition", "Atividade sem data agendada — não há evento a sincronizar.");
  }

  const tokenDoc = await db.doc(`tenants/${tenantId}/calendar_tokens/${uid}`).get();
  if (!tokenDoc.exists || !tokenDoc.data()?.isConnected) {
    throw new HttpsError("failed-precondition", "Google Calendar não está conectado para este usuário.");
  }

  const input = {
    activityId,
    activityType: act.type || "email",
    contactName:  act.contactName || "Contato",
    companyName:  act.companyName || "Empresa",
    productId:    act.productId,
    scheduledAt,
    dealId:       act.dealId,
    outcome:      act.outcome,
    notes:        act.notes,
  };

  // Se já tem evento, atualiza; senão, cria
  if (act.calendarEventId) {
    await updateCalendarEvent(db, tenantId, uid, act.calendarEventId, input);
    return { action: "updated", calendarEventId: act.calendarEventId };
  } else {
    const calendarEventId = await createCalendarEvent(db, tenantId, uid, input);
    if (calendarEventId) {
      await actSnap.ref.update({ calendarEventId, calendarSyncedAt: FieldValue.serverTimestamp() });
    }
    return { action: "created", calendarEventId };
  }
});

// ── Callable: disconnectCalendar ───────────────────────────────────────────────
export const disconnectCalendar = onCall(async (request) => {
  const { tenantId } = request.data as { tenantId: string };
  const uid = request.auth?.uid;

  if (!uid)      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  if (!tenantId) throw new HttpsError("invalid-argument", "tenantId obrigatório.");

  const db = admin.firestore();

  await db.doc(`tenants/${tenantId}/calendar_tokens/${uid}`).update({
    isConnected: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db.doc(`tenants/${tenantId}/users/${uid}`).update({
    calendarConnected: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log(`[disconnectCalendar] Usuário ${uid} desconectou o Google Calendar.`);
  return { success: true };
});
