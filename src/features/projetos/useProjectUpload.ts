/**
 * useProjectUpload.ts — envio de anexos da Solicitação de Projeto ao Storage
 * (PLANO_DESENHO_CRM_2.md, A3 e A4).
 *
 * Mais enxuto que `useAttachmentUpload` (notas): sem compressão nem miniatura —
 * o Design precisa da foto/vídeo ORIGINAL do local, e reduzir a resolução
 * atrapalharia a medição. Progresso por arquivo e cancelamento, como lá.
 *
 * `ownerUid` vai no `customMetadata` porque é o que as rules de Storage usam
 * (elas não consultam o Firestore).
 */
import { useCallback, useRef, useState } from 'react';
import { ref, uploadBytesResumable, getDownloadURL, type UploadTask } from 'firebase/storage';
import { storage } from '../../config/firebase';
import { useAuthStore } from '../../stores/authStore';
import type { NoteAttachment } from '../../types/crm';
import { contentDispositionFor } from '../deals/notes/attachments';
import { projectAttachmentPath, validateProjectFile, type ProjectFolder } from './projectAttachments';

export interface ProjectUpload {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'done' | 'error' | 'canceled';
  progress: number;
  error?: string;
  attachment?: NoteAttachment;
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function describeError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'storage/unauthorized') return 'Sem permissão para enviar este arquivo.';
  if (code === 'storage/canceled') return 'Envio cancelado.';
  if (code === 'storage/retry-limit-exceeded') return 'A conexão caiu durante o envio.';
  return 'Falha ao enviar o arquivo.';
}

export function useProjectUpload(requestId: string, folder: ProjectFolder) {
  const { user } = useAuthStore();
  const [uploads, setUploads] = useState<ProjectUpload[]>([]);
  const tasks = useRef<Map<string, UploadTask>>(new Map());

  const patch = useCallback((id: string, changes: Partial<ProjectUpload>) => {
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...changes } : u)));
  }, []);

  const upload = useCallback(async (file: File): Promise<void> => {
    if (!user?.uid || !user.tenantId) return;
    const id = newId();
    const check = validateProjectFile(folder, file);
    if (!check.ok || !check.kind) {
      setUploads((l) => [...l, { id, name: file.name, size: file.size, status: 'error', progress: 0, error: check.error }]);
      return;
    }
    const kind = check.kind;
    setUploads((l) => [...l, { id, name: file.name, size: file.size, status: 'uploading', progress: 0 }]);

    const path = projectAttachmentPath(user.tenantId, requestId, folder, id, file.name);
    const task = uploadBytesResumable(ref(storage, path), file, {
      contentType: file.type,
      contentDisposition: contentDispositionFor(kind, file.name),
      customMetadata: { ownerUid: user.uid, requestId, originalName: file.name },
    });
    tasks.current.set(id, task);

    try {
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => patch(id, { progress: snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0 }),
          reject,
          resolve,
        );
      });
      const url = await getDownloadURL(task.snapshot.ref);
      const attachment: NoteAttachment = {
        id, kind, name: file.name, mime: file.type, size: file.size,
        storagePath: path, url, source: 'upload', uploadedBy: user.uid, uploadedAt: new Date(),
      };
      patch(id, { status: 'done', progress: 100, attachment });
    } catch (err) {
      const canceled = (err as { code?: string })?.code === 'storage/canceled';
      patch(id, { status: canceled ? 'canceled' : 'error', error: describeError(err) });
    } finally {
      tasks.current.delete(id);
    }
  }, [user, requestId, folder, patch]);

  const addFiles = useCallback((files: FileList | File[]) => {
    for (const f of Array.from(files)) void upload(f);
  }, [upload]);

  /** Tira da lista (e cancela, se ainda estiver subindo). O objeto já enviado fica no bucket — só master apaga. */
  const remove = useCallback((id: string) => {
    tasks.current.get(id)?.cancel();
    setUploads((l) => l.filter((u) => u.id !== id));
  }, []);

  const attachments = uploads.filter((u) => u.status === 'done' && u.attachment).map((u) => u.attachment!);
  const busy = uploads.some((u) => u.status === 'uploading');

  return { uploads, attachments, busy, addFiles, remove };
}
