/**
 * dailyCadenceEngine.ts — Motor de Cadência SDR
 *
 * Schedule: toda manhã às 7h BRT (dias úteis e fins de semana).
 * Trigger: pubsub schedule via Cloud Scheduler.
 *
 * Algoritmo por SDR ativo (REQUISITOS-V2.md §6 + Observações do cliente jul/2026):
 *  1. Busca a fila de ontem → calcula taxaConclusao
 *  2. novosCards = Math.floor(max × taxa) (1º dia → max; max configurável)
 *  3. Busca próximos N deals da fila BDR por RECÊNCIA (mais novo primeiro)
 *  4. Para cada deal novo: cria 4 activities (call, linkedin, whatsapp, email)
 *     e ancora `assignedAt` para a régua semanal
 *  4b. Follow-ups decrescentes p/ leads já atribuídos: semana 1 = 3 contatos,
 *      semana 2 = 2, semana 3 = 1 (configurável em settings/cadence)
 *  5. Escreve `cadence_queues/{sdrId}/daily/{hoje}`
 *  6. Atualiza RTDB para refresh imediato na tela
 *
 * Idempotência: verifica se a queue de hoje já existe antes de processar.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { ServerValue } from "firebase-admin/database";
import {
  calcNewCards,
  calcCompletionRate,
  getTodayBRT,
  getYesterdayBRT,
  SDR_ACTIVITY_TYPES,
  ACTIVITY_TYPE_CONFIG,
  normalizeCadenceConfig,
  followUpForDay,
  followUpChannel,
  daysBetweenBRT,
  pickBalancedCandidates,
  stepsForDayOffset,
  periodTimeOnDay,
  type ActivityType,
  type CadenceCard,
  type CadenceConfig,
  type DailyQueue,
  type SequenceStep,
} from "./cadenceUtils";

export const dailyCadenceEngine = onSchedule(
  {
    schedule: "0 7 * * *",   // 7h BRT (UTC-3) = 10h UTC
    timeZone: "America/Sao_Paulo",
    retryCount: 3,
    timeoutSeconds: 540,    // 9 min (max para cron)
    region: "southamerica-east1",
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

  // Config de cadência do tenant (editável pela gestão em settings/cadence)
  let config: CadenceConfig;
  try {
    const cfgSnap = await db.doc(`tenants/${tenantId}/settings/cadence`).get();
    config = normalizeCadenceConfig(cfgSnap.exists ? cfgSnap.data() : null);
  } catch (err) {
    console.error(`[dailyCadenceEngine] Erro ao ler settings/cadence de ${tenantId} — usando padrão:`, err);
    config = normalizeCadenceConfig(null);
  }
  console.log(`[dailyCadenceEngine] ${tenantId}: config = ${JSON.stringify(config)}`);

  for (const sdrDoc of sdrsSnap.docs) {
    const sdrId = sdrDoc.id;
    const sdrName: string = sdrDoc.data().name || "SDR";
    try {
      await processSDR(db, rtdb, tenantId, sdrId, sdrName, todayBRT, yesterdayBRT, config);
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
  sdrName: string,
  todayBRT: string,
  yesterdayBRT: string,
  config: CadenceConfig,
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
  const newCardCount = calcNewCards(previousRate, config.newCardsPerDay);
  console.log(`[dailyCadenceEngine] SDR ${sdrId}: receberá ${newCardCount} novo(s) card(s)`);

  const cards: CadenceCard[] = [];
  const batch = db.batch();
  const todayStart = new Date();
  todayStart.setHours(23, 59, 0, 0); // vence às 23:59 hoje

  const makeActivity = (
    dealId: string,
    deal: FirebaseFirestore.DocumentData,
    type: ActivityType,
    cadenceType: string,
    dueAt: Date = todayStart,
    sequenceOrder?: number,
  ) => {
    const actRef = db.collection(`tenants/${tenantId}/activities`).doc();
    batch.set(actRef, {
      dealId,
      userId: sdrId,
      type,
      cadenceType,
      status: "pending",
      scheduledAt: dueAt,
      dueAt,
      ...(sequenceOrder !== undefined ? { sequenceOrder } : {}),
      coinsAwarded: 0,
      wasOnTime: false,
      overdueNotificationCount: 0,
      contactName: deal.company || "Contato",
      companyName: deal.company || "Empresa",
      productId: deal.productId || "wizmart",
      createdAt: FieldValue.serverTimestamp(),
    });
    return actRef.id;
  };

  // Sequência de contato configurada pelo admin (settings/cadence.sdr.sequence).
  // Vazia = comportamento legado (os 4 canais no dia 0, sem período, dueAt = hoje 23:59).
  const hasCustomSequence = config.sequence.length === SDR_ACTIVITY_TYPES.length;
  const day0Steps: SequenceStep[] = hasCustomSequence
    ? stepsForDayOffset(config.sequence, 0)
    : SDR_ACTIVITY_TYPES.map(type => ({ type, dayOffset: 0, period: "manha" as const }));
  const sequenceOrderOf = (type: ActivityType): number =>
    hasCustomSequence ? config.sequence.findIndex(s => s.type === type) : SDR_ACTIVITY_TYPES.indexOf(type);

  // 3. Novos cards — fila BDR ordenada por RECÊNCIA dentro de cada porte (regra
  //    de recência confirmada pelo cliente em 15/07/2026; distribuição
  //    balanceada por porte é a Fase D3 do plano de assinaturas, 22/08/2026).
  if (newCardCount > 0) {
    // Pool maior que o necessário (ainda por recência) pra ter candidatos de
    // portes diferentes pra escolher — sem isso, a regra de porte não teria
    // margem: já pegaria só os N mais recentes antes de olhar composição.
    const poolSize = Math.min(newCardCount * 4, 40);
    const poolSnap = await db
      .collection(`tenants/${tenantId}/deals`)
      .where("status", "==", "in_queue")
      .orderBy("createdAt", "desc")
      .limit(poolSize)
      .get();

    // Carga atual do SDR por porte — de onde ele está mais defasado.
    const assignedSnapForSize = await db
      .collection(`tenants/${tenantId}/deals`)
      .where("assignedSdrId", "==", sdrId)
      .where("status", "==", "open")
      .get();
    const bySize: Record<"P" | "M" | "G", number> = { P: 0, M: 0, G: 0 };
    for (const d of assignedSnapForSize.docs) {
      const size = (d.data().companySizeEstimate || "M") as "P" | "M" | "G";
      bySize[size] = (bySize[size] ?? 0) + 1;
    }

    // Candidatos em ordem de recência (poolSnap.docs preserva a ordem da
    // query) — a escolha em si (qual porte priorizar a cada vaga) é uma
    // função pura testada isoladamente em cadenceUtils.test.ts.
    const candidates = poolSnap.docs.map(doc => ({
      doc,
      size: (doc.data().companySizeEstimate || "M") as "P" | "M" | "G",
    }));
    const picked = pickBalancedCandidates(candidates, newCardCount, bySize);

    for (const { doc: dealDoc } of picked) {
      const deal = dealDoc.data();
      const activities: CadenceCard["activities"] = {};

      // Só os canais do dia 0 (imediatos) entram no card no momento da distribuição.
      // Canais de dias seguintes (ex.: WhatsApp amanhã) são criados pelo bloco de
      // "passos futuros da sequência" abaixo, no dia exato em que vencem — mesmo
      // padrão que a régua semanal de follow-up já usa.
      for (const step of day0Steps) {
        const dueAt = hasCustomSequence ? periodTimeOnDay(step.period, config.periodTimes, todayBRT) : todayStart;
        const order = sequenceOrderOf(step.type);
        const activityId = makeActivity(dealDoc.id, deal, step.type, "sdr_daily", dueAt, order);
        activities[step.type] = { type: step.type, status: "pending", activityId, sequenceOrder: order };
      }

      // Marca o deal como atribuído ao SDR (sai da fila BDR).
      // assignedAt ancora a régua semanal decrescente de follow-ups.
      batch.update(dealDoc.ref, {
        status: "open",
        assignedSdrId: sdrId,
        assignedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Rastreio da passagem de bastão BDR→SDR (Fase C do plano de assinaturas)
      const timelineRef = db
        .collection(`tenants/${tenantId}/deal_timeline`)
        .doc(dealDoc.id)
        .collection("events")
        .doc();
      batch.set(timelineRef, {
        type: "bdr_to_sdr_assigned",
        dealId: dealDoc.id,
        sdrId,
        bdrId: deal.bdrId || null,
        message: `📤 Lead atribuído a ${sdrName} pelo motor de cadência`,
        createdBy: "system",
        createdAt: FieldValue.serverTimestamp(),
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
    if (poolSnap.empty) {
      console.log(`[dailyCadenceEngine] SDR ${sdrId}: fila BDR vazia.`);
    }
  }

  // 4. Passos tardios da sequência (dayOffset > 0, ex.: WhatsApp no dia seguinte)
  //    + follow-ups da cadência semanal decrescente (3 → 2 → 1 contatos/semana):
  //    leads já atribuídos a este SDR, olhando quantos dias fazem desde a
  //    distribuição (assignedAt). Mesmo mecanismo pros dois: nada é criado com
  //    antecedência, cada passo nasce no dia exato em que vence.
  const now = new Date();
  const assignedSnap = await db
    .collection(`tenants/${tenantId}/deals`)
    .where("assignedSdrId", "==", sdrId)
    .where("status", "==", "open")
    .get();

  for (const dealDoc of assignedSnap.docs) {
    const deal = dealDoc.data();
    // Lead já passou o bastão (ou está em handoff) → sai da régua do SDR
    if (deal.handoffStatus) continue;
    const assignedAt: Date | null = deal.assignedAt?.toDate?.() ?? null;
    if (!assignedAt) continue; // legado sem âncora — não gera passo/follow-up

    const days = daysBetweenBRT(assignedAt, now);

    // 4a. Passo(s) da sequência configurada que vencem exatamente hoje.
    if (hasCustomSequence && days > 0) {
      for (const step of stepsForDayOffset(config.sequence, days)) {
        const dueAt = periodTimeOnDay(step.period, config.periodTimes, todayBRT);
        const order = sequenceOrderOf(step.type);
        const activityId = makeActivity(dealDoc.id, deal, step.type, "sdr_daily", dueAt, order);
        cards.push({
          dealId: dealDoc.id,
          contactName: deal.company || "Contato",
          companyName: deal.company || "Empresa",
          productId: deal.productId || "wizmart",
          isNew: false,
          sequenceStep: true,
          sequenceLabel: `Sequência · ${ACTIVITY_TYPE_CONFIG[step.type].label}`,
          activities: { [step.type]: { type: step.type, status: "pending", activityId, sequenceOrder: order } },
        });
      }
    }

    // 4b. Follow-up da régua semanal decrescente.
    const followUp = followUpForDay(days, config.weeklyContacts);
    if (!followUp) continue;

    const channel = followUpChannel(followUp.week, followUp.contactIndex, config.weeklyContacts);
    const activityId = makeActivity(dealDoc.id, deal, channel, "sdr_followup");

    cards.push({
      dealId: dealDoc.id,
      contactName: deal.company || "Contato",
      companyName: deal.company || "Empresa",
      productId: deal.productId || "wizmart",
      isNew: false,
      followUp: true,
      weekLabel: `Semana ${followUp.week} · contato ${followUp.contactIndex}`,
      activities: { [channel]: { type: channel, status: "pending", activityId } },
    });
  }

  // 5. Grava a fila diária no Firestore
  const requiredCount = cards.reduce((sum, c) => sum + Object.keys(c.activities).length, 0);
  const queueDoc: Record<string, any> = {
    sdrId,
    date: todayBRT,
    cardsDistributed: cards.length,
    previousCompletionRate: previousRate ?? 1,
    activitiesRequired: requiredCount,
    activitiesCompleted: 0,
    completionRate: requiredCount > 0 ? 0 : 1,
    cards,
    generatedAt: FieldValue.serverTimestamp(),
  };
  if (newCardCount === 0) {
    // Performance de ontem abaixo do mínimo — sem cards novos (follow-ups continuam)
    queueDoc.blockedReason = "taxa_insuficiente";
  }
  batch.set(todayQueueRef, queueDoc);

  await batch.commit();

  // 6. Atualiza RTDB para refresh imediato na tela do SDR
  await rtdb.ref(`tenants/${tenantId}/cadence/${sdrId}`).update({
    date: todayBRT,
    cardsDistributed: cards.length,
    activitiesRequired: requiredCount,
    activitiesCompleted: 0,
    lastUpdated: ServerValue.TIMESTAMP,
  });

  console.log(`[dailyCadenceEngine] SDR ${sdrId}: ${cards.length} card(s) distribuído(s), ${requiredCount} atividades criadas.`);
}
