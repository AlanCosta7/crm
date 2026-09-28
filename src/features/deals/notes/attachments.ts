/**
 * Regras de anexo — tipos aceitos, limites e caminho no Storage.
 *
 * Este arquivo é o espelho client-side de `storage.rules`: qualquer mudança
 * aqui precisa da mudança correspondente lá, senão o upload passa na validação
 * local e é recusado pelo servidor (ou pior: o contrário). A validação local
 * existe para dar erro imediato e legível, não para autorizar nada.
 */
import type { NoteAttachment, NoteAttachmentKind } from '../../../types/crm';

/** Mídia aceita pelo seletor — imagem, vídeo e áudio. */
export const MEDIA_ACCEPT =
  'image/*,video/*,audio/*';

/** Extensões que o seletor de arquivos oferece — só conveniência de UX. */
export const DOCUMENT_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.rtf,.zip,' +
  'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'application/rtf,application/zip,text/csv,text/plain';

const IMAGE_MIME = /^image\/(jpeg|png|webp|heic|heif|gif)$/;
const VIDEO_MIME = /^video\/(mp4|quicktime|webm)$/;
const AUDIO_MIME = /^audio\/(mp4|aac|mpeg|mp4a-latm|webm|ogg|wav|x-m4a)$/;

const DOCUMENT_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'application/zip',
  'text/csv',
  'text/plain',
]);

/** Limites por tipo, em bytes — iguais aos de `storage.rules`. */
export const SIZE_LIMITS: Record<NoteAttachmentKind, number> = {
  image: 15 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  document: 25 * 1024 * 1024,
  video: 100 * 1024 * 1024,
};

const KIND_LABEL: Record<NoteAttachmentKind, string> = {
  image: 'Imagem',
  audio: 'Áudio',
  video: 'Vídeo',
  document: 'Documento',
};

/**
 * Classifica o arquivo pelo MIME. Devolve `null` para tipo fora da allowlist —
 * incluindo SVG e HTML, que o Storage serviria inline e viram XSS no domínio
 * do bucket.
 */
export function detectKind(mime: string): NoteAttachmentKind | null {
  const m = (mime || '').toLowerCase();
  if (IMAGE_MIME.test(m)) return 'image';
  if (VIDEO_MIME.test(m)) return 'video';
  if (AUDIO_MIME.test(m)) return 'audio';
  if (DOCUMENT_MIME.has(m)) return 'document';
  return null;
}

export interface FileValidation {
  ok: boolean;
  kind?: NoteAttachmentKind;
  error?: string;
}

/** Valida tipo e tamanho, com mensagem pronta para exibir. */
export function validateFile(file: { name: string; type: string; size: number }): FileValidation {
  const kind = detectKind(file.type);
  if (!kind) {
    return { ok: false, error: `"${file.name}": tipo de arquivo não suportado.` };
  }
  const limit = SIZE_LIMITS[kind];
  if (file.size > limit) {
    return {
      ok: false,
      kind,
      error: `"${file.name}" tem ${formatBytes(file.size)}. O limite para ${KIND_LABEL[kind].toLowerCase()} é ${formatBytes(limit)}.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, kind, error: `"${file.name}" está vazio.` };
  }
  return { ok: true, kind };
}

/**
 * Nome seguro para o objeto no Storage. O nome original vai no metadado do
 * anexo (é o que o usuário vê); este aqui só precisa ser um caminho inofensivo
 * — sem barras, sem `..`, sem caracteres de controle.
 */
export function sanitizeFileName(name: string): string {
  const cleaned = (name || 'arquivo')
    .normalize('NFKD')
    // acentos viram marcas combinantes no NFKD; sem esta linha "relatório"
    // sairia como "relato_rio"
    .replace(/\p{M}/gu, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[/\\]/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/[^\w.\-() ]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.-]+/, '');

  const safe = cleaned || 'arquivo';
  // Storage aceita nomes longos, mas nomes gigantes quebram a UI e os logs
  return safe.length > 120 ? safe.slice(-120) : safe;
}

/** Caminho do objeto — o mesmo layout que `storage.rules` autoriza. */
export function attachmentStoragePath(
  tenantId: string,
  noteId: string,
  attachmentId: string,
  fileName: string
): string {
  return `tenants/${tenantId}/notes/${noteId}/${attachmentId}/${sanitizeFileName(fileName)}`;
}

/**
 * Só imagem, áudio e vídeo podem ser servidos inline — documento desce como
 * download, para nunca renderizar no domínio do bucket.
 */
export function contentDispositionFor(
  kind: NoteAttachmentKind,
  fileName: string
): string | undefined {
  if (kind !== 'document') return undefined;
  return `attachment; filename="${sanitizeFileName(fileName)}"`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

/** Extensão em maiúsculas para o card de documento. */
export function fileExtension(name: string): string {
  const m = /\.([a-z0-9]{1,6})$/i.exec(name.trim());
  return m ? m[1].toUpperCase() : 'ARQ';
}

/** Ícone (lucide) por tipo de documento. */
export function documentIcon(name: string, mime: string): string {
  const ext = fileExtension(name).toLowerCase();
  if (ext === 'pdf' || mime === 'application/pdf') return 'FileText';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'Sheet';
  if (['ppt', 'pptx'].includes(ext)) return 'Presentation';
  if (['doc', 'docx', 'rtf', 'txt'].includes(ext)) return 'FileType';
  if (ext === 'zip') return 'FileArchive';
  return 'File';
}

/** Soma os bytes de uma lista de anexos — usado no aviso de exclusão. */
export function totalSize(attachments: NoteAttachment[]): number {
  return attachments.reduce((sum, a) => sum + (a.size ?? 0), 0);
}
