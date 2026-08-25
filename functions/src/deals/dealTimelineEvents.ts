/**
 * dealTimelineEvents.ts — Rastreio de transições que não passam por um
 * callable dedicado (Fase C do PLANO_CARD_ASSINATURAS_VISIBILIDADE.md).
 *
 * O client marca perda/devolução/reativação com um `updateDoc` direto no
 * deal (LostReasonModal, PainelBDR "Reativar") — não existe um callable
 * específico pra essas ações, então o rastreio nasce aqui, comparando
 * before/after do próprio documento do deal.
 *
 * Só grava evento quando o campo relevante REALMENTE muda (checa `before`)
 * — evita duplicar o evento a cada escrita subsequente do deal (ex.: a CF
 * onDealParticipantsChanged também escreve no mesmo doc logo em seguida).
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const onDealTimelineEvents = onDocumentUpdated(
  { document: "tenants/{tenantId}/deals/{dealId}", region: "southamerica-east1" },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const { tenantId, dealId } = event.params;
    const db = admin.firestore();
    const eventsRef = db
      .collection(`tenants/${tenantId}/deal_timeline`)
      .doc(dealId)
      .collection("events");

    try {
      // Lead perdido e devolvido ao BDR (fechou_concorrente / sem_interesse_momento)
      if (!before.requeuedForBdr && after.requeuedForBdr) {
        await eventsRef.add({
          type: "requeued_to_bdr",
          dealId,
          previousSdrId: before.assignedSdrId || null,
          lostReason: after.lostReason || null,
          message: `↩️ Lead perdido e devolvido ao BDR para nova tentativa (motivo: ${after.lostReason || "—"})`,
          createdBy: "system",
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // BDR reativa um lead devolvido (PainelBDR → botão "Reativar")
      if (before.requeuedForBdr && !after.requeuedForBdr && after.status === "in_queue") {
        await eventsRef.add({
          type: "reactivated_by_bdr",
          dealId,
          bdrId: after.bdrId || null,
          message: "🔄 Lead reativado pelo BDR para nova tentativa de prospecção",
          createdBy: after.bdrId || "system",
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    } catch (err) {
      console.error("[onDealTimelineEvents] Erro ao gravar timeline:", err);
    }
  }
);
