/**
 * onNoteWritten.ts — espelho das notas no feed geral de Atividades.
 *
 * As notas ricas moram em `tenants/{tid}/notes` (markdown + anexos), fora de
 * `activities` — que é assinada inteira por várias telas e alimenta KPIs.
 * Mas o time continua esperando ver as notas no feed geral, então cada nota
 * ganha aqui um espelho enxuto em `activities`:
 *
 *  - texto convertido a texto puro e truncado (o feed não renderiza markdown)
 *  - NENHUM anexo — só a contagem, decidida com o cliente em 31/08/2026
 *  - `noteId` de volta para a nota completa (e é por ele que a aba Notas
 *    reconhece e descarta o espelho, para a nota não aparecer duplicada lá)
 *
 * O espelho segue o ciclo de vida da nota: criado junto, atualizado na edição
 * e apagado na exclusão (veja `onNoteDeleted`).
 *
 * A função também dispara as notificações de menção — só para quem PASSOU a
 * ser mencionado nesta escrita, comparando `mentions` antes e depois. Reeditar
 * o texto não avisa de novo quem já tinha sido avisado.
 */

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { resolveMentionRecipients, buildMentionBody } from "./mentionNotifier";

/** Limite do trecho que vai para o feed. */
const SUMMARY_LIMIT = 280;

/**
 * Converte markdown em texto puro. Não é um parser: só remove a marcação que
 * atrapalha a leitura de um trecho curto. Espelha `markdownToPlainText` do
 * client (src/features/deals/notes/markdownEdit.ts) — mudou lá, mude aqui.
 */
export function markdownToPlainText(md: string): string {
  return (md || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/gm, "")
    .replace(/(\*\*|__|~~|\*|_)/g, "")
    .replace(/^\s*([-*_]\s*){3,}$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Trecho para o feed, cortado em limite de palavra quando dá. */
export function summarize(md: string, limit = SUMMARY_LIMIT): string {
  const plain = markdownToPlainText(md);
  if (plain.length <= limit) return plain;
  const cut = plain.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}

export const onNoteWritten = onDocumentWritten(
  { document: "tenants/{tenantId}/notes/{noteId}", region: "southamerica-east1" },
  async (event) => {
    const { tenantId, noteId } = event.params;
    const after = event.data?.after;

    // Exclusão é tratada em onNoteDeleted (que também limpa o Storage)
    if (!after?.exists) return;

    const note = after.data();
    if (!note) return;

    const db = admin.firestore();
    const activitiesRef = db.collection(`tenants/${tenantId}/activities`);

    const attachmentCount = Array.isArray(note.attachments) ? note.attachments.length : 0;
    const mirror = {
      type: "note",
      dealId: note.dealId ?? note.entityId ?? null,
      productId: note.productId ?? "wizmart",
      userId: note.authorId,
      text: summarize(note.body ?? ""),
      noteId,
      attachmentCount,
      status: "completed",
      cadenceType: "manual",
      coinsAwarded: 0,
      wasOnTime: true,
      updatedAt: Timestamp.now(),
    };

    // Um espelho por nota: procura pelo noteId em vez de guardar o id do
    // espelho na nota (que exigiria uma segunda escrita no doc do usuário).
    const existing = await activitiesRef.where("noteId", "==", noteId).limit(1).get();

    if (existing.empty) {
      await activitiesRef.add({ ...mirror, createdAt: note.createdAt ?? Timestamp.now() });
      console.log(`[onNoteWritten] espelho criado p/ nota ${noteId} (${attachmentCount} anexo(s))`);
    } else {
      await existing.docs[0].ref.update(mirror);
      console.log(`[onNoteWritten] espelho atualizado p/ nota ${noteId}`);
    }

    await notifyMentions({
      db,
      tenantId,
      noteId,
      note,
      before: event.data?.before?.data(),
      resumo: mirror.text,
    });
  }
);

interface NotifyArgs {
  db: admin.firestore.Firestore;
  tenantId: string;
  noteId: string;
  note: admin.firestore.DocumentData;
  before?: admin.firestore.DocumentData;
  resumo: string;
}

/**
 * Cria as notificações in-app dos novos mencionados.
 *
 * Menção NÃO concede acesso: se a pessoa não puder ver o deal, ela recebe o
 * aviso sem `dealId` — o sino mostra o texto, mas não oferece um link que
 * bateria numa tela vazia (ou pior, vazaria dado por meio do título).
 */
async function notifyMentions({ db, tenantId, noteId, note, before, resumo }: NotifyArgs) {
  const current: string[] = Array.isArray(note.mentions) ? note.mentions : [];
  if (current.length === 0) return;

  const previous: string[] = Array.isArray(before?.mentions) ? before!.mentions : [];
  const base = `tenants/${tenantId}`;

  // Só quem existe, está ativo e tem o produto do deal no escopo
  const usersSnap = await db.collection(`${base}/users`).get();
  const users = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));
  const activeUids = usersSnap.docs
    .filter((d) => d.data()?.isActive !== false)
    .map((d) => d.id);

  const recipients = resolveMentionRecipients({
    previous,
    current,
    authorId: note.authorId,
    activeUids,
  });

  if (recipients.length === 0) return;

  const dealId: string | undefined = note.dealId ?? note.entityId;
  const dealSnap = dealId ? await db.doc(`${base}/deals/${dealId}`).get() : null;
  const deal = dealSnap?.data();
  const dealName: string = deal?.name ?? "";

  const autor = users.get(note.authorId)?.name ?? "Alguém do time";
  const productId: string = note.productId ?? "wizmart";

  const batch = db.batch();
  let enviadas = 0;

  for (const uid of recipients) {
    const destinatario = users.get(uid);
    const produtos: string[] = destinatario?.productIds ?? ["wizmart"];
    // Sem acesso ao produto do deal, a notificação vai sem link
    const podeAbrir = !!deal && produtos.includes(productId);

    batch.set(db.collection(`${base}/notifications`).doc(), {
      userId: uid,
      type: "note_mention",
      title: "Você foi mencionado",
      body: buildMentionBody(autor, podeAbrir ? dealName : "", resumo),
      ...(podeAbrir && dealId ? { dealId } : {}),
      sourceId: noteId,
      read: false,
      createdAt: Timestamp.now(),
    });
    enviadas += 1;
  }

  await batch.commit();
  console.log(`[onNoteWritten] nota ${noteId}: ${enviadas} notificação(ões) de menção`);
}
