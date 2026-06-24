/**
 * commissionEvaluationQueue.ts — Fila de avaliação de comissão (dia 10)
 *
 * Schedule: todo dia 10 às 9h BRT (Cloud Scheduler).
 *
 * Regra de negócio: "No dia 10 realizo as avaliações". Todo cliente
 * inaugurado/instalado até o último dia do mês anterior é elegível ao pagamento
 * no dia 15 do mês corrente. Esta função NÃO calcula a comissão sozinha — o
 * faturamento dos 30 dias é informado manualmente pelo gerente (decisão do
 * cliente). O que ela faz é montar a FILA de avaliação: lista os negócios
 * ativados no mês anterior que ainda não têm comissão registrada, para o gerente
 * não esquecer nenhum.
 *
 * Escreve em: tenants/{tid}/commission_queues/{cicloKey}
 *   cicloKey = mês corrente (mês do pagamento, dia 15) — 'YYYY-MM'
 *
 * Idempotente: regrava (set) a fila a cada execução.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// Estágios que marcam ativação (espelha onDealWon/onDealStageChanged)
const CONQUEST_STAGES = ["inaugurado", "instalacao_realizada"];

/** 'YYYY-MM' do mês corrente. */
function mesCorrenteKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 'YYYY-MM' do mês anterior (vira o ano em janeiro). */
function mesAnteriorKey(d: Date): string {
  const m0 = d.getMonth(); // 0-based
  const pm = m0 === 0 ? 12 : m0;            // nº do mês anterior (1..12)
  const py = m0 === 0 ? d.getFullYear() - 1 : d.getFullYear();
  return `${py}-${String(pm).padStart(2, "0")}`;
}

export const commissionEvaluationQueue = onSchedule(
  {
    schedule: "0 9 10 * *", // dia 10, 9h BRT
    timeZone: "America/Sao_Paulo",
    retryCount: 3,
    timeoutSeconds: 540,
  },
  async () => {
    const db = admin.firestore();
    const now = new Date();
    const cicloKey = mesCorrenteKey(now);
    const priorMonth = mesAnteriorKey(now);

    console.log(`[commissionEvaluationQueue] ciclo ${cicloKey} — avaliando ativações de ${priorMonth}`);

    const tenantsSnap = await db.collection("tenants").get();
    for (const tenantDoc of tenantsSnap.docs) {
      const tenantId = tenantDoc.id;
      try {
        await processarTenant(db, tenantId, cicloKey, priorMonth);
      } catch (err) {
        console.error(`[commissionEvaluationQueue] erro no tenant ${tenantId}:`, err);
      }
    }
  }
);

async function processarTenant(
  db: admin.firestore.Firestore,
  tenantId: string,
  cicloKey: string,
  priorMonth: string,
) {
  // 1. Negócios ativados no mês anterior
  const dealsSnap = await db
    .collection(`tenants/${tenantId}/deals`)
    .where("cohortKeys.conquestMonth", "==", priorMonth)
    .get();

  if (dealsSnap.empty) {
    await escreverFila(db, tenantId, cicloKey, priorMonth, []);
    return;
  }

  // 2. dealIds que já têm comissão registrada (1 leitura da coleção)
  const comSnap = await db.collection(`tenants/${tenantId}/commissions`).get();
  const jaComissionados = new Set(comSnap.docs.map(d => (d.data() as any).dealId));

  // 3. Usuários (para resolver nomes/tier das assinaturas)
  const usersSnap = await db.collection(`tenants/${tenantId}/users`).get();
  const userById = new Map(usersSnap.docs.map(d => [d.id, d.data() as any]));
  const nome = (id?: string) => (id ? userById.get(id)?.name ?? null : null);
  const tier = (id?: string) => (id ? userById.get(id)?.commissionTier ?? null : null);

  // 4. Monta itens pendentes
  const items: any[] = [];
  for (const doc of dealsSnap.docs) {
    const d = doc.data() as any;
    if (jaComissionados.has(doc.id)) continue;
    if (d.stage && !CONQUEST_STAGES.includes(d.stage)) {
      // conquestMonth presente mas saiu do estágio de ativação — ainda assim lista
    }
    items.push({
      dealId: doc.id,
      dealName: d.name ?? "(sem nome)",
      company: d.company ?? null,
      sku: d.mainProduct ?? null,
      productId: d.productId ?? null,
      bdrId: d.bdrId ?? null,
      bdrName: nome(d.bdrId),
      sdrId: d.assignedSdrId ?? null,
      sdrName: nome(d.assignedSdrId),
      sdrTier: tier(d.assignedSdrId),
      repId: d.assignedRepId ?? null,
      repName: nome(d.assignedRepId),
    });
  }

  await escreverFila(db, tenantId, cicloKey, priorMonth, items);
  console.log(`[commissionEvaluationQueue] tenant ${tenantId}: ${items.length} pendente(s) de avaliação`);
}

async function escreverFila(
  db: admin.firestore.Firestore,
  tenantId: string,
  cicloKey: string,
  priorMonth: string,
  items: any[],
) {
  await db
    .collection(`tenants/${tenantId}/commission_queues`)
    .doc(cicloKey)
    .set({
      cicloKey,
      priorMonth,
      count: items.length,
      items,
      generatedAt: FieldValue.serverTimestamp(),
    });
}
