/**
 * onActivityCompleted.ts — Premia moedas ao completar atividade
 *
 * Trigger: onUpdate /tenants/{tenantId}/activities/{activityId}
 * Quando: status muda de pending/overdue → completed
 *
 * Regras (REQUISITOS-V2.md §8):
 *  - Atividade concluída no prazo (wasOnTime = true)  → +1 moeda
 *  - Reunião agendada     → +1 moeda (meeting_scheduled)
 *  - Visita agendada      → +1 moeda (visit_scheduled) — SDR que fez handoff
 *  - Visita realizada     → +1 moeda (visit_done)     — Rep
 *  - Proposta apresentada → +1 moeda (proposal_presented)
 *  - Contrato assinado    → +1 moeda (contract_signed)
 *
 * A premiação por milestone de PDV (pdv_3k, pdv_10k, pdv_20k)
 * fica em onPaymentEventCreated (Fase futura).
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

type CoinEventType =
  | "activity_ontime"
  | "meeting_scheduled"
  | "visit_scheduled"
  | "visit_done"
  | "proposal_presented"
  | "contract_signed";

function getCurrentCycle(): string {
  const d = new Date();
  const quarter = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${quarter}-${d.getFullYear()}`;
}

export const onActivityCompleted = onDocumentUpdated(
  "tenants/{tenantId}/activities/{activityId}",
  async (event) => {
    const before = event.data?.before.data();
    const after  = event.data?.after.data();
    if (!before || !after) return;

    const { tenantId, activityId } = event.params;

    // Verifica se status mudou para 'completed'
    const wasCompleted = before.status !== "completed" && after.status === "completed";
    if (!wasCompleted) return;

    // Ignora se já foi premiado (idempotência)
    if (after.coinsAwarded > 0) return;

    const userId: string = after.userId;
    if (!userId) return;

    const db   = admin.firestore();
    const cycle = getCurrentCycle();
    const productId: string = after.productId || "wizmart";

    // Determina o tipo de evento e quantidade de moedas
    const events: { type: CoinEventType; amount: number; condition: boolean }[] = [
      {
        type:      "activity_ontime",
        amount:    1,
        condition: after.wasOnTime === true,
      },
      {
        type:      "meeting_scheduled",
        amount:    1,
        condition: after.type === "meeting",
      },
      {
        type:      "visit_scheduled",
        amount:    1,
        condition: after.type === "visit" && after.cadenceType === "sdr_daily",
      },
      {
        type:      "visit_done",
        amount:    1,
        condition: after.type === "visit" && after.cadenceType === "rep_followup",
      },
      {
        type:      "proposal_presented",
        amount:    1,
        condition: after.type === "proposal",
      },
    ];

    // Filtra apenas os eventos que se aplicam
    const applicableEvents = events.filter(e => e.condition);

    if (applicableEvents.length === 0) return;

    const batch = db.batch();

    // Cria uma transação de moeda para cada evento aplicável
    for (const evt of applicableEvents) {
      const txRef = db.collection(`tenants/${tenantId}/coin_ledger`).doc();
      batch.set(txRef, {
        userId,
        amount:     evt.amount,
        type:       evt.type,
        activityId,
        dealId:     after.dealId || null,
        productId,
        note:       `Atividade concluída: ${after.type || "atividade"}`,
        cycle,
        createdAt:  FieldValue.serverTimestamp(),
        createdBy:  "system",
      });
    }

    // Marca a activity como premiada
    batch.update(event.data!.after.ref, {
      coinsAwarded:    applicableEvents.reduce((sum, e) => sum + e.amount, 0),
      coinsAwardedAt:  FieldValue.serverTimestamp(),
    });

    await batch.commit();

    // ── v3: incrementar cohortKeys.activitiesCount no deal vinculado ──────────
    const dealId: string | undefined = after.dealId;
    if (dealId) {
      try {
        const dealRef = db.doc(`tenants/${tenantId}/deals/${dealId}`);
        await dealRef.update({
          "cohortKeys.activitiesCount": FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (err) {
        // Não bloqueia se o deal não existir
        console.warn("[onActivityCompleted] Não foi possível incrementar activitiesCount:", err);
      }
    }

    console.log(
      `[onActivityCompleted] ${userId}: ${applicableEvents.length} evento(s) de moeda criado(s) — ` +
      applicableEvents.map(e => `${e.type}(+${e.amount})`).join(", "),
    );
  }
);
