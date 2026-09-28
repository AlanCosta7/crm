/**
 * contractAttachment.ts — validação e caminho do contrato de Comodato Smart Café
 *
 * Espelho client-side de `storage.rules` (mesmo papel que `notes/attachments.ts`
 * já cumpre para anexos de nota): a validação aqui só dá erro imediato e
 * legível, não autoriza nada — quem autoriza é o servidor.
 *
 * Só PDF, de propósito: é um contrato assinado para o financeiro conferir, não
 * um anexo genérico. `.doc`/`.docx` editável não serve como comprovante.
 */
import { sanitizeFileName } from './notes/attachments';

export const CONTRACT_ACCEPT = '.pdf,application/pdf';
export const CONTRACT_MAX_SIZE = 15 * 1024 * 1024; // 15MB — mesmo teto de imagem em notes/attachments.ts

export interface ContractFileValidation {
  ok: boolean;
  error?: string;
}

export function validateContractFile(file: { name: string; type: string; size: number }): ContractFileValidation {
  if (file.type !== 'application/pdf') {
    return { ok: false, error: `"${file.name}" precisa ser um PDF.` };
  }
  if (file.size === 0) {
    return { ok: false, error: `"${file.name}" está vazio.` };
  }
  if (file.size > CONTRACT_MAX_SIZE) {
    const mb = (CONTRACT_MAX_SIZE / (1024 * 1024)).toFixed(0);
    return { ok: false, error: `"${file.name}" passa de ${mb}MB.` };
  }
  return { ok: true };
}

/** Id curto e único por envio — ver o porquê em `contractStoragePath`. */
export function newContractAttachmentId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 20)
    : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

/**
 * Caminho do objeto no Storage — o mesmo layout que `storage.rules` autoriza.
 *
 * `attachmentId` entra no caminho pelo mesmo motivo de `notes/attachments.ts`:
 * sem ele, "Substituir PDF" com o MESMO nome de arquivo (comum — o rep corrige
 * um contrato e reenvia com o nome idêntico) viraria um `update` de um objeto
 * já existente no Storage, e as rules tratam o contrato como imutável
 * (`allow update: if false`, igual a notas) — o upload seria negado. Um id novo
 * a cada envio garante que toda substituição é um `create`, nunca um `update`.
 */
export function contractStoragePath(tenantId: string, dealId: string, attachmentId: string, fileName: string): string {
  return `tenants/${tenantId}/deals/${dealId}/contract/${attachmentId}/${sanitizeFileName(fileName)}`;
}
