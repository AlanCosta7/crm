/**
 * onNoteDeleted.ts — limpeza quando uma nota é excluída.
 *
 *  1. apaga o espelho da nota no feed de Atividades
 *  2. varre o prefixo da nota no Storage e apaga tudo que sobrou
 *
 * O client já tenta apagar os anexos antes de excluir a nota, mas isso só
 * cobre o caminho feliz do autor. Aqui cobrimos o resto: exclusão pelo master
 * (que não é dono dos objetos), queda de rede no meio do caminho, exclusão
 * pelo console do Firebase.
 *
 * Apagar por prefixo, em vez de percorrer `note.attachments`, é de propósito:
 * pega também o arquivo que subiu e nunca chegou a ser referenciado na nota.
 */

import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

export const onNoteDeleted = onDocumentDeleted(
  { document: "tenants/{tenantId}/notes/{noteId}", region: "southamerica-east1" },
  async (event) => {
    const { tenantId, noteId } = event.params;
    const db = admin.firestore();

    // 1. espelho no feed
    try {
      const mirrors = await db
        .collection(`tenants/${tenantId}/activities`)
        .where("noteId", "==", noteId)
        .get();

      await Promise.all(mirrors.docs.map((d) => d.ref.delete()));
      if (!mirrors.empty) {
        console.log(`[onNoteDeleted] ${mirrors.size} espelho(s) removido(s) da nota ${noteId}`);
      }
    } catch (err) {
      console.error(`[onNoteDeleted] falha ao remover espelho da nota ${noteId}:`, err);
    }

    // 2. anexos no Storage
    const prefix = `tenants/${tenantId}/notes/${noteId}/`;
    try {
      await admin.storage().bucket().deleteFiles({ prefix });
      console.log(`[onNoteDeleted] prefixo ${prefix} limpo no Storage`);
    } catch (err) {
      console.error(`[onNoteDeleted] falha ao limpar ${prefix}:`, err);
    }
  }
);
