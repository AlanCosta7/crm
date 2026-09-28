/**
 * janitorNoteAttachments.ts — recolhe anexos órfãos no Storage.
 *
 * Sobra arquivo no bucket em situações que nenhum caminho feliz cobre:
 *  - alguém anexou, mudou de ideia e fechou o card sem salvar a nota
 *  - o rascunho ficou parado até o navegador limpar o `localStorage`
 *  - uma exclusão falhou no meio (rede caiu entre apagar o objeto e o doc)
 *
 * A varredura é por prefixo (`tenants/{tid}/notes/{noteId}/`): tudo que não
 * tem nota correspondente no Firestore vai embora.
 *
 * A trava importante é a IDADE MÍNIMA: um arquivo recém-enviado pode ser de um
 * rascunho que a pessoa ainda está escrevendo, e a nota só existe quando ela
 * clica em salvar. Apagar isso seria arrancar o anexo debaixo de quem está
 * digitando — por isso só mexemos no que passou de 48h.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

/** Tempo mínimo de vida antes de um arquivo poder ser considerado órfão. */
export const MIN_ORPHAN_AGE_MS = 48 * 60 * 60 * 1000;

/** Teto de prefixos apagados por execução, para a função não estourar o tempo. */
const MAX_DELETIONS_PER_RUN = 500;

/** Extrai `tenantId` e `noteId` de um caminho de anexo. */
export function parseAttachmentPath(path: string): { tenantId: string; noteId: string } | null {
  const m = /^tenants\/([^/]+)\/notes\/([^/]+)\//.exec(path);
  return m ? { tenantId: m[1], noteId: m[2] } : null;
}

/**
 * Decide se um prefixo pode ser apagado: a nota não existe e o arquivo mais
 * recente dele já passou da idade mínima.
 */
export function isOrphanPrefix(
  noteExists: boolean,
  newestFileMs: number,
  nowMs: number,
  minAgeMs = MIN_ORPHAN_AGE_MS
): boolean {
  if (noteExists) return false;
  return nowMs - newestFileMs >= minAgeMs;
}

export const janitorNoteAttachments = onSchedule(
  {
    schedule: "0 4 * * 0", // domingo, 4h BRT
    timeZone: "America/Sao_Paulo",
    retryCount: 1,
    timeoutSeconds: 540,
    memory: "512MiB",
    region: "southamerica-east1",
  },
  async () => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const now = Date.now();

    const [files] = await bucket.getFiles({ prefix: "tenants/" });

    /** Prefixo da nota → instante do arquivo mais recente dentro dele. */
    const prefixes = new Map<string, { tenantId: string; noteId: string; newest: number }>();

    for (const file of files) {
      const parsed = parseAttachmentPath(file.name);
      if (!parsed) continue;

      const key = `tenants/${parsed.tenantId}/notes/${parsed.noteId}/`;
      const created = Date.parse(String(file.metadata?.timeCreated ?? "")) || 0;
      const current = prefixes.get(key);

      if (!current) prefixes.set(key, { ...parsed, newest: created });
      else if (created > current.newest) current.newest = created;
    }

    let apagados = 0;
    let mantidosPorIdade = 0;

    for (const [prefix, info] of prefixes) {
      if (apagados >= MAX_DELETIONS_PER_RUN) {
        console.warn(
          `[janitor] teto de ${MAX_DELETIONS_PER_RUN} prefixos atingido; o restante fica para a próxima execução`
        );
        break;
      }

      const noteSnap = await db.doc(`tenants/${info.tenantId}/notes/${info.noteId}`).get();

      if (!isOrphanPrefix(noteSnap.exists, info.newest, now)) {
        if (!noteSnap.exists) mantidosPorIdade += 1;
        continue;
      }

      try {
        await bucket.deleteFiles({ prefix });
        apagados += 1;
        console.log(`[janitor] prefixo órfão removido: ${prefix}`);
      } catch (err) {
        console.error(`[janitor] falha ao remover ${prefix}:`, err);
      }
    }

    console.log(
      `[janitor] ${prefixes.size} prefixo(s) analisado(s); ${apagados} removido(s); ` +
        `${mantidosPorIdade} sem nota mas ainda dentro da janela de ${MIN_ORPHAN_AGE_MS / 3600000}h`
    );
  }
);
