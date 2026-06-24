/**
 * onProjectRequestChanged.ts — Triggers do Módulo de Projetos v3
 *
 * S6-05:
 *  - onProjectRequestCreated  → grava evento na timeline do deal
 *  - onProjectRequestDelivered → grava evento na timeline + atividade no feed
 */

import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// ── Criação de solicitação ────────────────────────────────────────────────────

export const onProjectRequestCreated = onDocumentCreated(
  "tenants/{tenantId}/project_requests/{requestId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { tenantId, requestId } = event.params;
    const db = admin.firestore();

    // Grava evento na timeline do deal
    if (data.dealId) {
      try {
        await db
          .collection(`tenants/${tenantId}/deal_timeline`)
          .doc(data.dealId)
          .collection("events")
          .add({
            type: "project_requested",
            dealId: data.dealId,
            projectRequestId: requestId,
            message: `📐 Projeto de layout solicitado por ${data.requestedByName || "—"} (${
              (data.pdvTypes || []).join(", ") || "PDV"
            })`,
            createdBy: data.requestedBy || "system",
            createdAt: FieldValue.serverTimestamp(),
          });
        console.log(`[onProjectRequestCreated] Timeline atualizada — deal ${data.dealId}`);
      } catch (err) {
        console.error("[onProjectRequestCreated] Erro ao gravar timeline:", err);
      }
    }
  }
);

// ── Mudança de status (pending → in_progress → delivered) ────────────────────

export const onProjectRequestChanged = onDocumentUpdated(
  "tenants/{tenantId}/project_requests/{requestId}",
  async (event) => {
    const before = event.data?.before.data();
    const after  = event.data?.after.data();
    if (!before || !after) return;

    // Ignora se o status não mudou
    if (before.status === after.status) return;

    const { tenantId, requestId } = event.params;
    const db = admin.firestore();

    // ── Entrega do projeto ────────────────────────────────────────────────────
    if (after.status === "delivered") {
      const dealId: string | undefined = after.dealId;

      // 1. Timeline do deal
      if (dealId) {
        try {
          await db
            .collection(`tenants/${tenantId}/deal_timeline`)
            .doc(dealId)
            .collection("events")
            .add({
              type: "project_delivered",
              dealId,
              projectRequestId: requestId,
              message: `✅ Projeto de layout entregue${
                after.deliveredFileUrl ? ` — [ver arquivo](${after.deliveredFileUrl})` : ""
              }`,
              designerName: after.assignedToDesignerId || "Designer",
              createdBy: after.assignedToDesignerId || "system",
              createdAt: FieldValue.serverTimestamp(),
            });
        } catch (err) {
          console.error("[onProjectRequestChanged] Erro ao gravar timeline de entrega:", err);
        }
      }

      // 2. Atividade no feed para o solicitante
      try {
        await db.collection(`tenants/${tenantId}/activities`).add({
          type: "note",
          productId: "wizmart",
          userId: after.requestedBy || "system",
          dealId: dealId || null,
          text: `✅ Seu projeto de layout para "${after.companyName}" foi entregue!${
            after.deliveredFileUrl ? " Acesse o link para baixar." : ""
          }`,
          status: "completed",
          coinsAwarded: 0,
          wasOnTime: true,
          cadenceType: "manual",
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.error("[onProjectRequestChanged] Erro ao gravar atividade de entrega:", err);
      }

      console.log(`[onProjectRequestChanged] Projeto ${requestId} entregue — deal ${after.dealId}`);
    }

    // ── Iniciou (pending → in_progress) ──────────────────────────────────────
    if (before.status === "pending" && after.status === "in_progress") {
      console.log(`[onProjectRequestChanged] Projeto ${requestId} iniciado pelo designer ${after.assignedToDesignerId}`);
    }
  }
);
