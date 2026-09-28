/**
 * onProjectRequestChanged.ts — Triggers do Módulo de Projetos
 *
 * PLANO_DESENHO_CRM_2.md (A5 e A7). Três marcos do fluxo viram evento na linha
 * do tempo do card (`deal_timeline/{dealId}/events`), com o texto e os links
 * montados em `projectEvents.ts`:
 *  - solicitado   → evento + aviso para os usuários Design
 *  - em andamento → evento (o Design pegou o pedido)
 *  - entregue     → evento (com os arquivos) + aviso para quem solicitou
 */

import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  deliveredEvent, deliveredNotification, designRecipients, inProgressEvent,
  requestedEvent, requestedNotifications,
  type NotificationDraft, type ProjectDoc, type TimelineEventDraft,
} from "./projectEvents";

async function writeTimeline(tenantId: string, requestId: string, dealId: string, e: TimelineEventDraft) {
  await admin.firestore()
    .collection(`tenants/${tenantId}/deal_timeline`).doc(dealId).collection("events")
    .add({ ...e, dealId, projectRequestId: requestId, createdAt: FieldValue.serverTimestamp() });
}

async function writeNotifications(tenantId: string, drafts: NotificationDraft[]) {
  if (drafts.length === 0) return;
  const db = admin.firestore();
  const batch = db.batch();
  for (const d of drafts) {
    batch.set(db.collection(`tenants/${tenantId}/notifications`).doc(), {
      ...d, read: false, createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

/** Nome de quem está com o pedido: o gravado pela tela, senão o do cadastro. */
async function designerNameOf(tenantId: string, p: ProjectDoc): Promise<string> {
  if (p.assignedToDesignerName) return p.assignedToDesignerName;
  if (p.deliveredByName) return p.deliveredByName;
  if (p.assignedToDesignerId) {
    try {
      const u = await admin.firestore().doc(`tenants/${tenantId}/users/${p.assignedToDesignerId}`).get();
      if (u.exists && u.data()?.name) return String(u.data()!.name);
    } catch (err) {
      console.warn("[onProjectRequest] não consegui ler o nome do designer:", err);
    }
  }
  return "Design";
}

// ── Criação de solicitação ────────────────────────────────────────────────────

export const onProjectRequestCreated = onDocumentCreated(
  "tenants/{tenantId}/project_requests/{requestId}",
  async (event) => {
    const data = event.data?.data() as ProjectDoc | undefined;
    if (!data) return;
    const { tenantId, requestId } = event.params;

    if (data.dealId) {
      try {
        await writeTimeline(tenantId, requestId, data.dealId, requestedEvent(data));
      } catch (err) {
        console.error("[onProjectRequestCreated] Erro ao gravar timeline:", err);
      }
    }

    // Design não era avisado: só descobria o pedido abrindo a fila.
    try {
      const users = await admin.firestore().collection(`tenants/${tenantId}/users`).where("role", "==", "design").get();
      const recipients = designRecipients(users.docs.map((d) => ({ id: d.id, ...(d.data() as object) })));
      await writeNotifications(tenantId, requestedNotifications(data, recipients));
    } catch (err) {
      console.error("[onProjectRequestCreated] Erro ao notificar o Design:", err);
    }
  },
);

// ── Mudança de status (pending → in_progress → delivered) ────────────────────

export const onProjectRequestChanged = onDocumentUpdated(
  "tenants/{tenantId}/project_requests/{requestId}",
  async (event) => {
    const before = event.data?.before.data() as ProjectDoc | undefined;
    const after = event.data?.after.data() as ProjectDoc | undefined;
    if (!before || !after) return;
    if (before.status === after.status) return;

    const { tenantId, requestId } = event.params;

    if (after.status === "in_progress" && after.dealId) {
      try {
        await writeTimeline(tenantId, requestId, after.dealId, inProgressEvent(after, await designerNameOf(tenantId, after)));
      } catch (err) {
        console.error("[onProjectRequestChanged] Erro ao gravar timeline (em andamento):", err);
      }
    }

    if (after.status === "delivered") {
      const designer = await designerNameOf(tenantId, after);
      if (after.dealId) {
        try {
          await writeTimeline(tenantId, requestId, after.dealId, deliveredEvent(after, designer));
        } catch (err) {
          console.error("[onProjectRequestChanged] Erro ao gravar timeline (entrega):", err);
        }
      }
      // Antes gravava uma `activity` do tipo nota para o solicitante; o sino é o
      // canal certo (a nota inflava o feed e nada levava ao card).
      try {
        const n = deliveredNotification(after, designer);
        if (n) await writeNotifications(tenantId, [n]);
      } catch (err) {
        console.error("[onProjectRequestChanged] Erro ao notificar a entrega:", err);
      }
    }
  },
);
