/**
 * acceptHandoff.ts — Callable: Rep aceita ou recusa handoff
 *
 * Chamada pelo cliente via Firebase Functions SDK (httpsCallable).
 *
 * acceptHandoff({ handoffId, tenantId }):
 *  1. Atualiza handoffs/{id}.status = 'accepted'
 *  2. Cria primeira atividade Rep no funil Hunter (cadenceType: 'rep_followup')
 *  3. Atualiza deal.handoffStatus = 'accepted'
 *  4. Registra atividade no feed de atividades do tenant
 *
 * declineHandoff({ handoffId, tenantId, reason }):
 *  1. Atualiza handoffs/{id}.status = 'declined'
 *  2. Notifica gestor via atividade no feed
 *  3. Cria atividade de "redesignação" para o gestor resolver
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { normalizeCadenceConfig } from "../cadence/cadenceUtils";

const REGION = "southamerica-east1";

// ── acceptHandoff ─────────────────────────────────────────────────────────────
export const acceptHandoff = onCall({ region: REGION }, async (request) => {
  const { handoffId, tenantId } = request.data as { handoffId: string; tenantId: string };
  const uid = request.auth?.uid;

  if (!uid)        throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  if (!handoffId)  throw new HttpsError("invalid-argument", "handoffId é obrigatório.");
  if (!tenantId)   throw new HttpsError("invalid-argument", "tenantId é obrigatório.");

  const db = admin.firestore();
  const handoffRef = db.doc(`tenants/${tenantId}/handoffs/${handoffId}`);
  const handoffSnap = await handoffRef.get();

  if (!handoffSnap.exists) {
    throw new HttpsError("not-found", `Handoff ${handoffId} não encontrado.`);
  }

  const handoff = handoffSnap.data()!;

  if (handoff.status !== "pending_rep_acceptance") {
    throw new HttpsError("failed-precondition", `Handoff já está com status "${handoff.status}".`);
  }

  if (handoff.toRepId !== uid) {
    // Permite gestor/master aceitar por outro Rep
    const repSnap = await db.doc(`tenants/${tenantId}/users/${uid}`).get();
    const role = repSnap.data()?.role;
    if (role !== "master" && role !== "manager") {
      throw new HttpsError("permission-denied", "Apenas o Rep designado pode aceitar este handoff.");
    }
  }

  const dealRef = db.doc(`tenants/${tenantId}/deals/${handoff.dealId}`);
  const dealSnap = await dealRef.get();
  const deal = dealSnap.data();
  const productId = deal?.productId || handoff.productId || "wizmart";

  // Nome do Rep que assume de fato (pode ser diferente de quem chamou, se foi
  // um gestor aceitando em nome dele) — usado na mensagem da timeline.
  const repProfileSnap = await db.doc(`tenants/${tenantId}/users/${handoff.toRepId}`).get();
  const repName: string = repProfileSnap.data()?.name || "Representante";

  // Calcula data máxima da primeira atividade (hoje + SLA configurável, padrão 3 dias úteis)
  let slaDays = 3;
  try {
    const cfgSnap = await db.doc(`tenants/${tenantId}/settings/cadence`).get();
    slaDays = normalizeCadenceConfig(cfgSnap.exists ? cfgSnap.data() : null).repFirstContactBusinessDays;
  } catch { /* mantém padrão */ }
  const firstActivityDate = addBusinessDays(new Date(), slaDays);

  const batch = db.batch();

  // 1. Aceitar o handoff
  batch.update(handoffRef, {
    status: "accepted",
    acceptedAt: FieldValue.serverTimestamp(),
  });

  // 2. Atualizar o deal
  batch.update(dealRef, {
    handoffStatus: "accepted",
    assignedRepId: uid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 3. Criar primeira atividade do Rep (canal prioritário do handoff)
  const firstActivityRef = db.collection(`tenants/${tenantId}/activities`).doc();
  batch.set(firstActivityRef, {
    dealId: handoff.dealId,
    userId: uid,
    type: handoff.priorityChannel || "call",
    cadenceType: "rep_followup",
    status: "pending",
    scheduledAt: firstActivityDate,
    dueAt: firstActivityDate,
    notes: `Primeiro contato pós-handoff — ${handoff.visitType === "presential" ? "visita presencial" : "video call"} agendada`,
    coinsAwarded: 0,
    wasOnTime: false,
    overdueNotificationCount: 0,
    contactName: deal?.company || "Contato",
    companyName: deal?.company || "Empresa",
    productId,
    handoffId,
    createdAt: FieldValue.serverTimestamp(),
  });

  // 4. Registrar no feed de atividades
  const feedRef = db.collection(`tenants/${tenantId}/activities`).doc();
  batch.set(feedRef, {
    type: "note",
    productId,
    userId: uid,
    dealId: handoff.dealId,
    text: `Handoff aceito — assumindo o negócio "${deal?.name || handoff.dealId}"`,
    status: "completed",
    coinsAwarded: 0,
    wasOnTime: true,
    cadenceType: "manual",
    createdAt: FieldValue.serverTimestamp(),
  });

  // 5. Rastreio da passagem de bastão SDR→Rep (Fase C do plano de assinaturas)
  const acceptTimelineRef = db
    .collection(`tenants/${tenantId}/deal_timeline`)
    .doc(handoff.dealId)
    .collection("events")
    .doc();
  batch.set(acceptTimelineRef, {
    type: "handoff_accepted",
    dealId: handoff.dealId,
    handoffId,
    repId: handoff.toRepId,
    message: `✅ ${repName} aceitou a passagem de bastão`,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  console.log(`[acceptHandoff] Rep ${uid} aceitou handoff ${handoffId} no tenant ${tenantId}`);
  return { success: true, firstActivityId: firstActivityRef.id };
});

// ── declineHandoff ────────────────────────────────────────────────────────────
export const declineHandoff = onCall({ region: REGION }, async (request) => {
  const { handoffId, tenantId, reason } = request.data as {
    handoffId: string;
    tenantId: string;
    reason: string;
  };
  const uid = request.auth?.uid;

  if (!uid)       throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  if (!handoffId) throw new HttpsError("invalid-argument", "handoffId é obrigatório.");
  if (!reason)    throw new HttpsError("invalid-argument", "Motivo da recusa é obrigatório.");

  const db = admin.firestore();
  const handoffRef = db.doc(`tenants/${tenantId}/handoffs/${handoffId}`);
  const handoffSnap = await handoffRef.get();

  if (!handoffSnap.exists) {
    throw new HttpsError("not-found", `Handoff ${handoffId} não encontrado.`);
  }

  const handoff = handoffSnap.data()!;
  const dealSnap = await db.doc(`tenants/${tenantId}/deals/${handoff.dealId}`).get();
  const deal = dealSnap.data();
  const productId = deal?.productId || handoff.productId || "wizmart";

  const repProfileSnap = await db.doc(`tenants/${tenantId}/users/${handoff.toRepId}`).get();
  const repName: string = repProfileSnap.data()?.name || "Representante";

  const batch = db.batch();

  // 1. Marcar como recusado
  batch.update(handoffRef, {
    status: "declined",
    declinedReason: reason,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 2. Reverter deal para aguardando designação
  batch.update(dealSnap.ref, {
    handoffStatus: "pending",
    assignedRepId: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 2b. Rastreio da recusa (Fase C do plano de assinaturas) — ÚNICA fonte de
  // histórico dessa exceção: participantIds não preserva quem foi substituído.
  const declineTimelineRef = db
    .collection(`tenants/${tenantId}/deal_timeline`)
    .doc(handoff.dealId)
    .collection("events")
    .doc();
  batch.set(declineTimelineRef, {
    type: "handoff_declined",
    dealId: handoff.dealId,
    handoffId,
    repId: handoff.toRepId,
    reason,
    message: `❌ ${repName} recusou a passagem de bastão — ${reason}`,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  // 3. Notificar gestores via atividade no feed
  const managersSnap = await db
    .collection(`tenants/${tenantId}/users`)
    .where("role", "in", ["master", "manager"])
    .get();

  for (const mgr of managersSnap.docs) {
    const feedRef = db.collection(`tenants/${tenantId}/activities`).doc();
    batch.set(feedRef, {
      type: "note",
      productId,
      userId: mgr.id,
      dealId: handoff.dealId,
      text: `Handoff recusado por Rep — "${deal?.name || handoff.dealId}" precisa de novo representante. Motivo: ${reason}`,
      status: "pending",
      coinsAwarded: 0,
      wasOnTime: false,
      cadenceType: "manual",
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();

  console.log(`[declineHandoff] Rep ${uid} recusou handoff ${handoffId}. Motivo: ${reason}`);
  return { success: true };
});

// ── Helper ────────────────────────────────────────────────────────────────────
function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  result.setHours(23, 59, 0, 0);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}
