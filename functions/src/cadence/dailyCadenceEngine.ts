/**
 * dailyCadenceEngine.ts — Motor de Cadência SDR
 *
 * Schedule: toda manhã às 7h BRT (dias úteis e fins de semana).
 * Trigger: pubsub schedule via Cloud Scheduler.
 *
 * Algoritmo por SDR ativo (REQUISITOS-V2.md §6 + documento "Cadência Comercial
 * SDRs do Dia 1 ao Dia 30", confirmado com o Alan em 27/08/2026):
 *  1. Busca a fila de ontem → calcula taxaConclusao (só informativa)
 *  2. Passos tardios da régua (configurável em settings/cadence.sdr.steps,
 *     padrão D+1, D+3, D+5, D+8, D+12, D+17, D+23, D+29) p/ leads já
 *     atribuídos: cada um nasce no dia exato em que vence, olhando quantos
 *     dias fazem desde `assignedAt`.
 *     Deals em Standby (`standbyActive`) saem da régua automática — o
 *     prospect respondeu e está em tratamento personalizado.
 *  3. Escreve `cadence_queues/{sdrId}/daily/{hoje}`
 *  4. Atualiza RTDB para refresh imediato na tela
 *
 * NÃO distribui leads: a atribuição BDR → SDR é sempre manual (AssignSdrModal,
 * no card e no painel do BDR). Leads em `in_queue` ficam parados até alguém
 * atribuí-los; o passo D0 da régua é criado no cliente (ensureTodaySteps).
 *
 * Idempotência: verifica se a queue de hoje já existe antes de processar.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { ServerValue } from "firebase-admin/database";
import {
  calcCompletionRate,
  getTodayBRT,
  getYesterdayBRT,
  normalizeCadenceConfig,
  findCadenceStep,
  daysBetweenBRT,
  type ActivityType,
  type CadenceCard,
  type CadenceConfig,
  type DailyQueue,
} from "./cadenceUtils";
import { blockForType, blockStartAt } from "./timeBlocks";
import { listActiveTenantIds } from "../shared/tenants";

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

    // Busca todos os tenants ativos (ver functions/src/shared/tenants.ts —
    // não existe documento em tenants/{tenantId}, só subcoleções)
    const tenantIds = await listActiveTenantIds(db);

    for (const tenantId of tenantIds) {
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
    try {
      await processSDR(db, rtdb, tenantId, sdrId, todayBRT, yesterdayBRT, config);
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
  ) => {
    // Blocos de horário (Fase 2 do PLANO_DESENHO_CRM.md, slide 6): o motor
    // decide O QUE fazer no dia e, desde aqui, também QUANDO.
    //
    // `scheduledAt` passa a ser a hora do bloco do canal — é o que a fila do dia
    // ordena e agrupa. `dueAt` continua às 23:59: se virasse o fim do bloco, a
    // atividade das 10h ficaria "atrasada" às 11h e o activityOverdueChecker
    // passaria a disparar notificação a cada troca de bloco.
    //
    // Canal sem bloco configurado cai em `blockId: null` e vai para o balde
    // "Sem horário" da tela — visível, nunca descartado.
    const block = blockForType(config.timeBlocks, type);
    const scheduledAt = block ? blockStartAt(block, todayBRT) : dueAt;

    const actRef = db.collection(`tenants/${tenantId}/activities`).doc();
    batch.set(actRef, {
      dealId,
      userId: sdrId,
      type,
      cadenceType,
      status: "pending",
      scheduledAt,
      blockId: block?.id ?? null,
      dueAt,
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

  // 2. Passos tardios da régua (D+1, D+3, D+5, D+8, D+12, D+17, D+23,
  //    D+29): leads já atribuídos a este SDR, olhando quantos dias fazem desde
  //    a distribuição (assignedAt). Nada é criado com antecedência — cada
  //    passo nasce no dia exato em que vence.
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
    // Prospect respondeu e está em Standby (follow-up personalizado) → régua
    // automática pausa até a fila de Standby terminar (documento "Cadência
    // Comercial SDRs": "resposta do prospect interrompe a cadência automática").
    if (deal.standbyActive) continue;
    const assignedAt: Date | null = deal.assignedAt?.toDate?.() ?? null;
    if (!assignedAt) continue; // legado sem âncora — não gera passo

    const days = daysBetweenBRT(assignedAt, now);
    if (days <= 0) continue;

    const step = findCadenceStep(config.steps, days);
    if (!step) continue; // hoje não é dia de contato pra este lead

    const activities: CadenceCard["activities"] = {};
    for (const type of step.types) {
      const activityId = makeActivity(dealDoc.id, deal, type, "sdr_daily", todayStart);
      activities[type] = { type, status: "pending", activityId };
    }

    cards.push({
      dealId: dealDoc.id,
      contactName: deal.company || "Contato",
      companyName: deal.company || "Empresa",
      productId: deal.productId || "wizmart",
      isNew: false,
      sequenceStep: true,
      sequenceLabel: step.label,
      activities,
    });
  }

  // 3. Grava a fila diária no Firestore
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
  batch.set(todayQueueRef, queueDoc);

  await batch.commit();

  // 4. Atualiza RTDB para refresh imediato na tela do SDR
  await rtdb.ref(`tenants/${tenantId}/cadence/${sdrId}`).update({
    date: todayBRT,
    cardsDistributed: cards.length,
    activitiesRequired: requiredCount,
    activitiesCompleted: 0,
    lastUpdated: ServerValue.TIMESTAMP,
  });

  console.log(`[dailyCadenceEngine] SDR ${sdrId}: ${cards.length} card(s) na fila, ${requiredCount} atividades criadas.`);
}
