/**
 * Upload de anexos de nota para o Firebase Storage.
 *
 * Usa `uploadBytesResumable`: dá progresso por arquivo, permite cancelar e
 * retoma sozinho depois de uma queda breve de rede — importante para quem usa
 * o CRM no 4G, em campo.
 *
 * O `noteId` é decidido ANTES do upload (veja `useNotes.newNoteId`), então o
 * arquivo já nasce no caminho definitivo: nada de pasta temporária, nada de
 * mover objeto depois de salvar a nota.
 *
 * `ownerUid` vai no `customMetadata` porque é o que as rules de Storage usam
 * para saber quem pode excluir — elas não conseguem consultar o Firestore.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  type UploadTask,
} from 'firebase/storage';
import { storage } from '../../../config/firebase';
import { useAuthStore } from '../../../stores/authStore';
import type { NoteAttachment, NoteAttachmentKind, NoteAttachmentSource } from '../../../types/crm';
import {
  attachmentStoragePath,
  contentDispositionFor,
  validateFile,
} from './attachments';
import { processImage, probeVideo, probeAudioDuration, type Dimensions } from './mediaProcess';

export type UploadStatus = 'uploading' | 'done' | 'error' | 'canceled';

export interface PendingUpload {
  id: string;
  name: string;
  size: number;
  mime: string;
  kind: NoteAttachmentKind;
  source: NoteAttachmentSource;
  status: UploadStatus;
  /** 0–100 */
  progress: number;
  error?: string;
  /** Preenchido quando `status === 'done'` */
  attachment?: NoteAttachment;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 20)
    : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

interface PreparedMedia {
  /** Arquivo que vai subir — pode ser o reencodado ou o original */
  file: File;
  /** Miniatura/poster a subir junto, quando o navegador conseguiu gerar */
  thumb: File | null;
  dimensions?: Dimensions;
  durationMs?: number;
}

/**
 * Prepara o arquivo conforme o tipo: imagem é reduzida e reencodada em WebP,
 * vídeo ganha um quadro de capa, áudio só tem a duração medida.
 *
 * Best-effort de ponta a ponta: qualquer falha de decodificação cai no
 * original sem miniatura — o anexo nunca deixa de ser enviado por causa disso.
 */
async function prepareMedia(file: File, kind: NoteAttachmentKind): Promise<PreparedMedia> {
  if (kind === 'image') {
    const processed = await processImage(file);
    return processed
      ? { file: processed.file, thumb: processed.thumb, dimensions: processed.dimensions }
      : { file, thumb: null };
  }

  if (kind === 'video') {
    const probed = await probeVideo(file);
    return probed
      ? { file, thumb: probed.poster, dimensions: probed.dimensions, durationMs: probed.durationMs }
      : { file, thumb: null };
  }

  if (kind === 'audio') {
    return { file, thumb: null, durationMs: await probeAudioDuration(file) };
  }

  return { file, thumb: null };
}

/** Mensagem legível para os erros que o Storage costuma devolver. */
function describeError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'storage/unauthorized') return 'Sem permissão para enviar este arquivo.';
  if (code === 'storage/canceled') return 'Envio cancelado.';
  if (code === 'storage/retry-limit-exceeded') return 'A conexão caiu durante o envio.';
  if (code === 'storage/quota-exceeded') return 'Cota de armazenamento excedida.';
  return 'Falha ao enviar o arquivo.';
}

export function useAttachmentUpload(noteId: string) {
  const { user } = useAuthStore();
  const uid = user?.uid;
  const tenantId = user?.tenantId;

  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  /** Tasks vivas, por id — para cancelar sem re-renderizar por causa disso. */
  const tasks = useRef<Map<string, UploadTask>>(new Map());

  const patch = useCallback((id: string, changes: Partial<PendingUpload>) => {
    setUploads(list => list.map(u => (u.id === id ? { ...u, ...changes } : u)));
  }, []);

  /**
   * Envia um arquivo. Devolve o anexo pronto, ou `null` se falhou/foi
   * cancelado — o chip correspondente já carrega o motivo.
   */
  const upload = useCallback(
    async (file: File, source: NoteAttachmentSource = 'upload'): Promise<NoteAttachment | null> => {
      if (!uid || !tenantId) throw new Error('Usuário não autenticado.');

      const check = validateFile(file);
      const id = newId();

      if (!check.ok || !check.kind) {
        setUploads(list => [
          ...list,
          {
            id,
            name: file.name,
            size: file.size,
            mime: file.type,
            kind: check.kind ?? 'document',
            source,
            status: 'error',
            progress: 0,
            error: check.error,
          },
        ]);
        return null;
      }

      const kind = check.kind;

      setUploads(list => [
        ...list,
        { id, name: file.name, size: file.size, mime: file.type, kind, source, status: 'uploading', progress: 0 },
      ]);

      // Compressão/miniatura antes de subir — pode levar um instante numa foto
      // grande, por isso o chip já está na tela mostrando 0%
      const media = await prepareMedia(file, kind);
      const upFile = media.file;
      const path = attachmentStoragePath(tenantId, noteId, id, upFile.name);

      const task = uploadBytesResumable(ref(storage, path), upFile, {
        contentType: upFile.type,
        contentDisposition: contentDispositionFor(kind, upFile.name),
        customMetadata: { ownerUid: uid, noteId, originalName: file.name },
      });
      tasks.current.set(id, task);

      try {
        await new Promise<void>((resolve, reject) => {
          task.on(
            'state_changed',
            snap => {
              const pct = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
              patch(id, { progress: pct });
            },
            reject,
            resolve
          );
        });

        const url = await getDownloadURL(task.snapshot.ref);

        // Miniatura sobe depois do arquivo principal: se falhar, o anexo já
        // está salvo e a timeline cai no fallback sem thumb.
        let thumbPath: string | undefined;
        let thumbUrl: string | undefined;
        if (media.thumb) {
          try {
            const tPath = attachmentStoragePath(tenantId, noteId, id, 'thumb.webp');
            const tRef = ref(storage, tPath);
            await uploadBytes(tRef, media.thumb, {
              contentType: 'image/webp',
              customMetadata: { ownerUid: uid, noteId, thumbOf: id },
            });
            thumbPath = tPath;
            thumbUrl = await getDownloadURL(tRef);
          } catch (err) {
            console.warn('[useAttachmentUpload] miniatura não enviada:', err);
          }
        }

        const attachment: NoteAttachment = {
          id,
          kind,
          name: file.name,
          mime: upFile.type,
          size: upFile.size,
          storagePath: path,
          url,
          thumbPath,
          thumbUrl,
          width: media.dimensions?.width,
          height: media.dimensions?.height,
          durationMs: media.durationMs,
          source,
          uploadedBy: uid,
          uploadedAt: new Date(),
        };
        patch(id, { status: 'done', progress: 100, attachment });
        return attachment;
      } catch (err) {
        const canceled = (err as { code?: string })?.code === 'storage/canceled';
        console.error('[useAttachmentUpload] falha no upload:', err);
        patch(id, { status: canceled ? 'canceled' : 'error', error: describeError(err) });
        return null;
      } finally {
        tasks.current.delete(id);
      }
    },
    [uid, tenantId, noteId, patch]
  );

  /** Cancela um upload em andamento. */
  const cancel = useCallback((id: string) => {
    tasks.current.get(id)?.cancel();
    tasks.current.delete(id);
  }, []);

  /**
   * Tira o item da lista. Se o arquivo já subiu, apaga o objeto do Storage —
   * é o "removi sem querer" antes mesmo de salvar a nota.
   */
  const remove = useCallback(
    async (id: string) => {
      const item = uploads.find(u => u.id === id);
      cancel(id);
      setUploads(list => list.filter(u => u.id !== id));
      if (item?.attachment) {
        try {
          await deleteAttachmentObject(item.attachment);
        } catch (err) {
          // Objeto órfão é limpo depois pelo janitor — não trava a UI por isso
          console.warn('[useAttachmentUpload] não foi possível apagar o objeto:', err);
        }
      }
    },
    [uploads, cancel]
  );

  /** Zera a lista sem apagar nada — usado depois de salvar a nota. */
  const clear = useCallback(() => {
    tasks.current.clear();
    setUploads([]);
  }, []);

  // Memoizado: o composer usa `ready` como dependência do efeito que grava o
  // rascunho — um array novo a cada render faria o rascunho ser reescrito sem
  // motivo a cada tecla digitada.
  const ready = useMemo(
    () => uploads.filter(u => u.status === 'done' && u.attachment).map(u => u.attachment as NoteAttachment),
    [uploads]
  );
  const busy = uploads.some(u => u.status === 'uploading');

  return { uploads, upload, cancel, remove, clear, ready, busy };
}

/**
 * Apaga um anexo já salvo numa nota — o arquivo e a miniatura. Usado pelo
 * autor na timeline.
 */
export async function deleteAttachmentObject(attachment: NoteAttachment): Promise<void> {
  await deleteObject(ref(storage, attachment.storagePath));
  if (attachment.thumbPath) {
    try {
      await deleteObject(ref(storage, attachment.thumbPath));
    } catch (err) {
      console.warn('[useAttachmentUpload] miniatura não apagada:', err);
    }
  }
}
