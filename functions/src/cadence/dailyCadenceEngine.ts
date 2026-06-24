/**
 * dailyCadenceEngine.ts — Motor de Cadência SDR
 *
 * Schedule: toda manhã às 7h BRT (dias úteis e fins de semana).
 * Trigger: pubsub schedule via Cloud Scheduler.
 *
 * Algoritmo por SDR ativo (REQUISITOS-V2.md §6):
 *  1. Busca a fila de ontem → calcula taxaConclusao
 *  2. novosCards = Math.floor(3 × taxa) (1º dia → 3)
 *  3. Busca próximos N deals da fila BDR (FIFO por createdAt, status='in_queue')
 *  4. Para cada deal: cria 4 activities (email, linkedin, whatsapp, call)
 *  5. Escreve `cadence_queues/{sdrId}/daily/{hoje}`
 *  6. Atualiza RTDB para refresh imediato na tela
 *
 * Idempotência: verifica se a queue de hoje já existe antes de processar.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  calcNewCards,
  calcCompletionRate,
  getTodayBRT,
  getYesterdayBRT,
  SDR_ACTIVITY_TYPES,
  type ActivityType,
  type CadenceCard,
  type DailyQueue,
} from "./cadenceUtils";

export const dailyCadenceEngine = onSchedule(
  {
    schedule: "0 7 * * *",   // 7h BRT (UTC-3) = 10h UTC
    timeZone: "America/Sao_Paulo",
    retryCount: 3,
    timeoutSeconds: 540,    // 9 min (max para cron)
  },
  async () => {
    const db   = admin.firestore();
    const rtdb = admin.database();

    const todayBRT     = getTodayBRT();
    const yesterdayBRT = getYesterdayBRT();

    console.log(`[dailyCadenceEngine] Iniciando para ${todayBRT}`);

    // Busca todos os tenants ativos
    const tenantsSnap = await db.collection("tenants").get();

    for (const tenantDoc of tenantsSnap.docs) {
      const tenantId = tenantDoc.id;

      try {
        await processSDRsForTenant(db, rtdb, tenantId, todayBRT, yesterdayBRT);
      } catch (err) {
        console.error(`[dailyCadenceEngine] Erro no tenant ${tenantId}:`, err);
        // Continua para os próximos tenants
      }
    }

    console.log("[dailyCadenceEngine] Concluído.");
  }
);

// ── Processa todos os SDRs de um tenant ───────────────────────────────────────
async function processSDRsForTenant(
  db: admin.firestore.Firestore,
  rtdb: admin.database.Database,
  tenantId: string,
  todayBRT: string,
  yesterdayBRT: string,
): Promise<void> {
  // Busca SDRs ativos
  const sdrsSnap = await db
    .collection(`tenants/${tenantId}/users`)
    .where("role", "==", "sdr")
    .where("isActive", "==", true)
    .get();

  if (sdrsSnap.empty) {
    console.log(`[dailyCadenceEngine] Nenhum SDR ativo no tenant ${tenantId}`);
    return;
  }

  for (const sdrDoc of sdrsSnap.docs) {
    const sdrId = sdrDoc.id;
    try {
      await processSDR(db, rtdb, tenantId, sdrId, todayBRT, yesterdayBRT);
    } catch (err) {
      console.error(`[dailyCadenceEngine] Erro no SDR ${sdrId}:`, err);
    }
  }
}

// ── Processa um SDR individual ────────────────────────────────────────────────
async function processSDR(
  db: admin.firestore.Firestore,
  rtdb: admin.database.Database,
  tenantId: string,
  sdrId: string,
  todayBRT: string,
  yesterdayBRT: string,
): Promise<void> {
  // Idempotência: verifica se a fila de hoje já foi gerada
  const todayQueueRef = db.doc(
    `tenants/${tenantId}/cadence_queues/${sdrId}/daily/${todayBRT}`,
  );
  const todaySnap = await todayQueueRef.get();

  if (todaySnap.exists) {
    console.log(`[dailyCadenceEngine] Fila de ${sdrId} para ${todayBRT} já existe — pulando.`);
    return;
  }

  // 1. Busca fila de ontem para calcular taxa de conclusão
  const yesterdayRef = db.doc(
    `tenants/${tenantId}/cadence_queues/${sdrId}/daily/${yesterdayBRT}`,
  );
  const yesterdaySnap = await yesterdayRef.get();
  let previousRate: number | null = null;

  if (yesterdaySnap.exists) {
    const yData = yesterdaySnap.data() as DailyQueue;
    previousRate = calcCompletionRate(yData.activitiesCompleted, yData.activitiesRequired);
    console.log(`[dailyCadenceEngine] SDR ${sdrId}: taxa de ontem = ${(previousRate * 100).toFixed(1)}%`);
  } else {
    console.log(`[dailyCadenceEngine] SDR ${sdrId}: primeiro dia — taxa = 1.0`);
  }

  // 2. Calcula quantos novos cards distribuir
  const newCardCount = calcNewCards(previousRate);
  console.log(`[dailyCadenceEngine] SDR ${sdrId}: receberá ${newCardCount} novo(s) card(s)`);

  if (newCardCount === 0) {
    // Grava queue vazia (SDR bloqueado por performance abaixo do mínimo)
    await todayQueueRef.set({
      sdrId,
      date: todayBRT,
      cardsDistributed: 0,
      previousCompletionRate: previousRate ?? 1,
      activitiesRequired: 0,
      activitiesCompleted: 0,
      completionRate: 0,
      cards: [],
      generatedAt: FieldValue.serverTimestamp(),
      blockedReason: "taxa_insuficiente",
    });
    return;
  }

  // 3. Busca próximos deals da fila BDR (FIFO por createdAt)
  const dealsSnap = await db
    .collection(`tenants/${tenantId}/deals`)
    .where("status", "==", "in_queue")
    .orderBy("createdAt", "asc")
    .limit(newCardCount)
    .get();

  if (dealsSnap.empty) {
    console.log(`[dailyCadenceEngine] SDR ${sdrId}: fila BDR vazia.`);
    await todayQueueRef.set({
      sdrId,
      date: todayBRT,
      cardsDistributed: 0,
      previousCompletionRate: previousRate ?? 1,
      activitiesRequired: 0,
      activitiesCompleted: 0,
      completionRate: 1,
      cards: [],
      generatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  // 4. Para cada deal: cria 4 activities e monta o card
  const cards: CadenceCard[] = [];
  const batch = db.batch();
  const todayStart = new Date();
  todayStart.setHours(23, 59, 0, 0); // vence às 23:59 hoje

  for (const dealDoc of dealsSnap.docs) {
    const deal = dealDoc.data();
    const activities: CadenceCard["activities"] = {} as any;

    for (const type of SDR_ACTIVITY_TYPES) {
      const actRef = db.collection(`tenants/${tenantId}/activities`).doc();
      batch.set(actRef, {
        dealId: dealDoc.id,
        userId: sdrId,
        type,
        cadenceType: "sdr_daily",
        status: "pending",
        scheduledAt: todayStart,
        dueAt: todayStart,
        coinsAwarded: 0,
        wasOnTime: false,
        overdueNotificationCount: 0,
        contactName: deal.company || "Contato",
        companyName: deal.company || "Empresa",
        productId: deal.productId || "wizmart",
        createdAt: FieldValue.serverTimestamp(),
      });

      activities[type as ActivityType] = {
        type,
        status: "pending",
        activityId: actRef.id,
      };
    }

    // Marca o deal como atribuído ao SDR (sai da fila BDR)
    batch.update(dealDoc.ref, {
      status: "open",
      assignedSdrId: sdrId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    cards.push({
      dealId: dealDoc.id,
      contactName: deal.company || "Contato",
      companyName: deal.company || "Empresa",
      productId: deal.productId || "wizmart",
      isNew: true,
      activities,
    });
  }

  // 5. Grava a fila diária no Firestore
  const requiredCount = cards.length * SDR_ACTIVITY_TYPES.length;
  batch.set(todayQueueRef, {
    sdrId,
    date: todayBRT,
    cardsDistributed: cards.length,
    previousCompletionRate: previousRate ?? 1,
    activitiesRequired: requiredCount,
    activitiesCompleted: 0,
    completionRate: 0,
    cards,
    generatedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  // 6. Atualiza RTDB para refresh imediato na tela do SDR
  await rtdb.ref(`tenants/${tenantId}/cadence/${sdrId}`).update({
    date: todayBRT,
    cardsDistributed: cards.length,
    activitiesRequired: requiredCount,
    activitiesCompleted: 0,
    lastUpdated: admin.database.ServerValue.TIMESTAMP,
  });

  console.log(`[dailyCadenceEngine] SDR ${sdrId}: ${cards.length} card(s) distribuído(s), ${requiredCount} atividades criadas.`);
}
