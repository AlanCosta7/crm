/**
 * onLeadCreated.ts — Pós-processamento de lead captado (WizMart Forms).
 *
 * Dispara na criação de docs em tenants/{tid}/leads. Para leads convertidos
 * (deal novo criado pelo captureLead):
 *  1. registra activity "Lead recebido via [fonte]" no deal
 *  2. cria notificação in-app em tenants/{tid}/notifications para o owner
 *     do deal — ou para todos os masters/managers se a fonte não tem owner
 *
 * Fica FORA do captureLead de propósito: o endpoint público responde rápido
 * e este trabalho é assíncrono/retriável.
 *
 * Leads "duplicate" já ganham activity no próprio captureLead; "discarded"
 * são só auditoria — ambos ignorados aqui.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export const onLeadCreated = onDocumentCreated(
  { document: "tenants/{tenantId}/leads/{leadId}", region: "southamerica-east1" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const lead = snapshot.data();
    const { tenantId, leadId } = event.params;

    if (lead.status !== "converted" || !lead.dealId) return;

    const db = admin.firestore();
    const base = `tenants/${tenantId}`;
    const nowTs = Timestamp.now();

    const sourceSnap = await db.doc(`${base}/lead_sources/${lead.sourceId}`).get();
    const sourceName: string = sourceSnap.data()?.name ?? "site";
    const contact = lead.data?.email ?? lead.data?.phone ?? "";

    // 1. activity no deal (aparece na aba Atividades do DealSidebar)
    await db.collection(`${base}/activities`).add({
      dealId: lead.dealId,
      userId: "system",
      type: "note",
      status: "completed",
      completedAt: nowTs,
      coinsAwarded: 0,
      who: "WizMart Forms",
      text: `Lead recebido via "${sourceName}"${contact ? ` (${contact})` : ""}`,
      createdAt: nowTs,
    });

    // 2. destinatários da notificação: owner do deal ou masters/managers
    const dealSnap = await db.doc(`${base}/deals/${lead.dealId}`).get();
    const owner: string = dealSnap.data()?.owner ?? "";

    let recipients: string[];
    if (owner) {
      recipients = [owner];
    } else {
      const managersSnap = await db
        .collection(`${base}/users`)
        .where("role", "in", ["master", "manager"])
        .get();
      recipients = managersSnap.docs.map((d) => d.id);
    }

    if (recipients.length === 0) {
      console.warn(`[onLeadCreated] lead ${leadId}: nenhum destinatário p/ notificação`);
      return;
    }

    const batch = db.batch();
    for (const userId of recipients) {
      batch.set(db.collection(`${base}/notifications`).doc(), {
        userId,
        type: "lead_received",
        title: "Novo lead recebido",
        body: `${lead.data?.name ?? "Lead"} — via ${sourceName}`,
        dealId: lead.dealId,
        leadId,
        sourceId: lead.sourceId,
        read: false,
        createdAt: nowTs,
      });
    }
    await batch.commit();

    console.log(
      `[onLeadCreated] lead ${leadId} → activity + ${recipients.length} notificação(ões)`
    );
  }
);
