/**
 * repSlaChecker.ts — Verificador diário de SLA do Representante
 *
 * Schedule: todo dia às 8h BRT.
 *
 * Algoritmo por Rep ativo (REQUISITOS-V2.md §7):
 *  1. Busca todos os Reps ativos do tenant
 *  2. Verifica a atividade mais recente de cada Rep (completedAt)
 *  3. Se nenhuma atividade em > 3 dias úteis:
 *     a. Marca atividades pendentes como 'overdue'
 *     b. Cria atividade automática "follow-up pendente"
 *     c. Registra no feed do gestor
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getTodayBRT, normalizeCadenceConfig } from "./cadenceUtils";

export const repSlaChecker = onSchedule(
  {
    schedule: "0 8 * * *",  // 8h BRT
    timeZone: "America/Sao_Paulo",
    retryCount: 2,
    timeoutSeconds: 300,
    region: "southamerica-east1",
  },
  async () => {
    const db = admin.firestore();
    const todayBRT = getTodayBRT();

    console.log(`[repSlaChecker] Iniciando verificação de SLA para ${todayBRT}`);

    const tenantsSnap = await db.collection("tenants").get();

    for (const tenantDoc of tenantsSnap.docs) {
      const tenantId = tenantDoc.id;
      try {
        await checkRepsForTenant(db, tenantId);
      } catch (err) {
        console.error(`[repSlaChecker] Erro no tenant ${tenantId}:`, err);
      }
    }

    console.log("[repSlaChecker] Verificação concluída.");
  }
);

// ── Verifica todos os Reps de um tenant ──────────────────────────────────────
async function checkRepsForTenant(
  db: admin.firestore.Firestore,
  tenantId: string,
): Promise<void> {
  // SLA configurável pela gestão (settings/cadence → rep.firstContactBusinessDays)
  let slaBusinessDays = 3;
  try {
    const cfgSnap = await db.doc(`tenants/${tenantId}/settings/cadence`).get();
    slaBusinessDays = normalizeCadenceConfig(cfgSnap.exists ? cfgSnap.data() : null).repFirstContactBusinessDays;
  } catch { /* mantém padrão */ }

  const repsSnap = await db
    .collection(`tenants/${tenantId}/users`)
    .where("role", "==", "rep")
    .where("isActive", "==", true)
    .get();

  if (repsSnap.empty) return;

  for (const repDoc of repsSnap.docs) {
    const repId = repDoc.id;
    try {
      await checkRepSla(db, tenantId, repId, slaBusinessDays);
    } catch (err) {
      console.error(`[repSlaChecker] Erro no Rep ${repId}:`, err);
    }
  }
}

// ── Verifica o SLA de um Rep específico ─────────────────────────────────────
async function checkRepSla(
  db: admin.firestore.Firestore,
  tenantId: string,
  repId: string,
  SLA_BUSINESS_DAYS: number,
): Promise<void> {
  // Busca a atividade mais recente concluída ou pendente do Rep
  const activitiesSnap = await db
    .collection(`tenants/${tenantId}/activities`)
    .where("userId", "==", repId)
    .where("cadenceType", "==", "rep_followup")
    .where("status", "in", ["pending", "completed"])
    .orderBy("scheduledAt", "desc")
    .limit(5)
    .get();

  const now = new Date();

  // Verifica atividades pendentes em atraso
  let foundOverdue = false;

  for (const actDoc of activitiesSnap.docs) {
    const act = actDoc.data();
    if (act.status !== "pending") continue;

    const dueAt: Date = act.dueAt?.toDate ? act.dueAt.toDate() : new Date(act.dueAt || 0);

    if (now > dueAt) {
      // Marca como overdue
      await actDoc.ref.update({
        status: "overdue",
        updatedAt: FieldValue.serverTimestamp(),
      });
      foundOverdue = true;
      console.log(`[repSlaChecker] Atividade ${actDoc.id} do Rep ${repId} marcada como overdue.`);
    }
  }

  // Verifica se há alguma atividade futura pendente
  const futureSnap = await db
    .collection(`tenants/${tenantId}/activities`)
    .where("userId", "==", repId)
    .where("cadenceType", "==", "rep_followup")
    .where("status", "==", "pending")
    .where("scheduledAt", ">", now)
    .limit(1)
    .get();

  if (!futureSnap.empty) return; // Rep tem próxima atividade agendada — OK

  // Busca última atividade completada
  const lastCompletedSnap = await db
    .collection(`tenants/${tenantId}/activities`)
    .where("userId", "==", repId)
    .where("cadenceType", "==", "rep_followup")
    .where("status", "==", "completed")
    .orderBy("completedAt", "desc")
    .limit(1)
    .get();

  if (lastCompletedSnap.empty && !foundOverdue) return; // Rep sem histórico

  // Verifica se violou o SLA de 3 dias úteis
  if (!lastCompletedSnap.empty) {
    const lastAct = lastCompletedSnap.docs[0].data();
    const lastCompletedAt: Date = lastAct.completedAt?.toDate
      ? lastAct.completedAt.toDate()
      : new Date(lastAct.completedAt || 0);

    const deadline = addBusinessDays(lastCompletedAt, SLA_BUSINESS_DAYS);
    if (now <= deadline && !foundOverdue) return; // Ainda dentro do prazo
  }

  // Rep está em violação de SLA — cria follow-up automático e notifica gestor
  await createAutoFollowUp(db, tenantId, repId, SLA_BUSINESS_DAYS);
}

// ── Cria atividade automática e notifica gestor ───────────────────────────────
async function createAutoFollowUp(
  db: admin.firestore.Firestore,
  tenantId: string,
  repId: string,
  SLA_BUSINESS_DAYS: number,
): Promise<void> {
  const autoDate = addBusinessDays(new Date(), 1);

  // Cria activity de follow-up automático
  const autoRef = await db.collection(`tenants/${tenantId}/activities`).add({
    userId: repId,
    type: "call",
    cadenceType: "rep_followup",
    status: "pending",
    scheduledAt: autoDate,
    dueAt: autoDate,
    notes: "⚠️ Follow-up criado automaticamente — violação de SLA detectada pelo sistema.",
    coinsAwarded: 0,
    wasOnTime: false,
    isAutoCreated: true,
    overdueNotificationCount: 0,
    createdAt: FieldValue.serverTimestamp(),
  });

  // Notifica gestores
  const managersSnap = await db
    .collection(`tenants/${tenantId}/users`)
    .where("role", "in", ["master", "manager"])
    .get();

  const repSnap = await db.doc(`tenants/${tenantId}/users/${repId}`).get();
  const repName = repSnap.data()?.name || repId;

  for (const mgr of managersSnap.docs) {
    await db.collection(`tenants/${tenantId}/activities`).add({
      type: "note",
      userId: mgr.id,
      text: `⚠️ SLA violado: ${repName} está há mais de ${SLA_BUSINESS_DAYS} dias úteis sem próxima atividade agendada. Follow-up automático criado.`,
      status: "pending",
      coinsAwarded: 0,
      wasOnTime: false,
      cadenceType: "manual",
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  console.log(`[repSlaChecker] Follow-up automático criado para Rep ${repId}: ${autoRef.id}`);
}

// ── activityOverdueChecker ────────────────────────────────────────────────────
/**
 * Verifica atividades overdue de SDRs a cada 2h (horário comercial).
 * Marca como 'overdue' e registra no feed (sem WhatsApp nesta fase).
 */
export const activityOverdueChecker = onSchedule(
  {
    schedule: "0 8,10,12,14,16,18 * * 1-5",  // A cada 2h, seg-sex, 8h-18h BRT
    timeZone: "America/Sao_Paulo",
    retryCount: 1,
    timeoutSeconds: 180,
    region: "southamerica-east1",
  },
  async () => {
    const db = admin.firestore();
    const now = new Date();

    console.log(`[activityOverdueChecker] Rodando em ${now.toISOString()}`);

    const tenantsSnap = await db.collection("tenants").get();

    for (const tenantDoc of tenantsSnap.docs) {
      const tenantId = tenantDoc.id;

      try {
        // Busca atividades pending onde dueAt < agora e overdueNotifiedAt não foi hoje
        const overdueSnap = await db
          .collection(`tenants/${tenantId}/activities`)
          .where("status", "==", "pending")
          .where("dueAt", "<", now)
          .get();

        const batch = db.batch();
        let count = 0;

        for (const actDoc of overdueSnap.docs) {
          const act = actDoc.data();

          // Não processa se já notificou hoje
          const notifiedAt: Date | null = act.overdueNotifiedAt?.toDate
            ? act.overdueNotifiedAt.toDate()
            : null;

          if (notifiedAt && getTodayBRT(notifiedAt) === getTodayBRT(now)) continue;

          batch.update(actDoc.ref, {
            status: "overdue",
            overdueNotifiedAt: FieldValue.serverTimestamp(),
            overdueNotificationCount: (act.overdueNotificationCount || 0) + 1,
            updatedAt: FieldValue.serverTimestamp(),
          });
          count++;
        }

        if (count > 0) {
          await batch.commit();
          console.log(`[activityOverdueChecker] ${count} atividade(s) marcadas como overdue no tenant ${tenantId}`);
        }
      } catch (err) {
        console.error(`[activityOverdueChecker] Erro no tenant ${tenantId}:`, err);
      }
    }
  }
);

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
