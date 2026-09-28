/**
 * projectAttachments.ts — anexos do fluxo de Solicitação de Projeto
 * (PLANO_DESENHO_CRM_2.md, A3 e A4).
 *
 * Duas pastas no Storage, com dono e regra diferentes:
 *   .../project_requests/{requestId}/request/{attId}/{arquivo}   → fotos e vídeos
 *       do local, enviados por quem SOLICITA (bdr/sdr/rep/gestão);
 *   .../project_requests/{requestId}/delivery/{attId}/{arquivo}  → o projeto
 *       pronto, enviado pelo DESIGN (ou gestão) na entrega.
 *
 * Este arquivo é o espelho client-side de `storage.rules`: mudou aqui, mude lá.
 * A validação local só dá erro imediato e legível — não autoriza nada.
 */
import { detectKind, sanitizeFileName, formatBytes, SIZE_LIMITS } from '../deals/notes/attachments';
import type { NoteAttachmentKind } from '../../types/crm';

export type ProjectFolder = 'request' | 'delivery';

/** Word: "Anexar Fotos e Vídeos". */
const REQUEST_KINDS: NoteAttachmentKind[] = ['image', 'video'];
/** Entrega: o layout costuma vir em PDF, ou em imagem/vídeo de render. */
const DELIVERY_KINDS: NoteAttachmentKind[] = ['image', 'video', 'document'];

/** Só PDF entre os documentos — planilha/zip não é entrega de layout. */
const DELIVERY_DOCUMENT_MIME = 'application/pdf';

export const REQUEST_ACCEPT = 'image/*,video/*';
export const DELIVERY_ACCEPT = 'image/*,video/*,application/pdf';

/** Máximo de arquivos por solicitação — evita um pedido virar depósito. */
export const MAX_REQUEST_FILES = 10;

export interface ProjectFileCheck {
  ok: boolean;
  kind?: NoteAttachmentKind;
  error?: string;
}

export function validateProjectFile(
  folder: ProjectFolder,
  file: { name: string; type: string; size: number },
): ProjectFileCheck {
  const kind = detectKind(file.type);
  const allowed = folder === 'request' ? REQUEST_KINDS : DELIVERY_KINDS;

  if (!kind || !allowed.includes(kind)) {
    return {
      ok: false,
      error: folder === 'request'
        ? `"${file.name}": envie apenas fotos ou vídeos.`
        : `"${file.name}": envie PDF, imagem ou vídeo.`,
    };
  }
  if (kind === 'document' && file.type.toLowerCase() !== DELIVERY_DOCUMENT_MIME) {
    return { ok: false, error: `"${file.name}": em documento, só PDF.` };
  }
  if (file.size === 0) return { ok: false, kind, error: `"${file.name}" está vazio.` };
  const limit = SIZE_LIMITS[kind];
  if (file.size > limit) {
    return { ok: false, kind, error: `"${file.name}" tem ${formatBytes(file.size)}. O limite é ${formatBytes(limit)}.` };
  }
  return { ok: true, kind };
}

/** Caminho do objeto — o layout que `storage.rules` autoriza. */
export function projectAttachmentPath(
  tenantId: string,
  requestId: string,
  folder: ProjectFolder,
  attachmentId: string,
  fileName: string,
): string {
  return `tenants/${tenantId}/project_requests/${requestId}/${folder}/${attachmentId}/${sanitizeFileName(fileName)}`;
}
