/**
 * onHandoffCreated.ts — Rastreio da oferta de handoff SDR→Rep
 *
 * Fase C do PLANO_CARD_ASSINATURAS_VISIBILIDADE.md (raiz do repo `CRM/`).
 *
 * O SDR oferece o handoff diretamente do client (`onHandoffConfirm` em
 * PipelinePage.tsx, batch com o update do deal). O client não pode escrever em
 * `deal_timeline` (rule é write:false, só Cloud Functions) — este trigger
 * fecha esse rastro assim que o doc de handoff é criado.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const onHandoffCreated = onDocumentCreated(
  { document: "tenants/{tenantId}/handoffs/{handoffId}", region: "southamerica-east1" },
  async (event) => {
    const handoff = event.data?.data();
    if (!handoff) return;

    const { tenantId, handoffId } = event.params;
    const db = admin.firestore();

    try {
      const [sdrSnap, repSnap] = await Promise.all([
        db.doc(`tenants/${tenantId}/users/${handoff.fromSdrId}`).get(),
        db.doc(`tenants/${tenantId}/users/${handoff.toRepId}`).get(),
      ]);
      const sdrName: string = sdrSnap.data()?.name || "SDR";
      const repName: string = repSnap.data()?.name || "Representante";

      await db
        .collection(`tenants/${tenantId}/deal_timeline`)
        .doc(handoff.dealId)
        .collection("events")
        .add({
          type: "handoff_offered",
          dealId: handoff.dealId,
          handoffId,
          fromSdrId: handoff.fromSdrId,
          toRepId: handoff.toRepId,
          message: `🤝 Passagem de bastão oferecida a ${repName} por ${sdrName}`,
          createdBy: handoff.fromSdrId,
          createdAt: FieldValue.serverTimestamp(),
        });
    } catch (err) {
      console.error("[onHandoffCreated] Erro ao gravar timeline:", err);
    }
  }
);
