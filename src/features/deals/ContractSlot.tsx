/**
 * ContractSlot.tsx — anexo do contrato de Comodato Smart Café, no card do deal
 *
 * Fase 5.4 do PLANO_DESENHO_CRM.md (slide 11): "Gostaria de ter um espaço
 * dentro do card da Smart Café para anexar o contrato e um 'check' para
 * alguém do time financeiro clicar dizendo que foi pago."
 *
 * Este componente é a metade "anexar" — quem fecha o negócio (rep/gestão) sobe
 * o PDF assinado aqui. A metade "check" é `FinanceiroContratosPage.tsx`: o
 * papel `financeiro` marca como pago de lá, nunca daqui — este componente nem
 * renderiza um botão de confirmar pagamento, só o status.
 *
 * Só aparece quando `deal.mainProduct === 'smartcafe_comodato'`
 * (`isComodato`, `contractStatus.ts`).
 */

import { useRef, useState } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../config/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useFirestoreMutations } from '../../hooks/useFirestore';
import { Icon } from '../../components/ui/Icon';
import type { Deal } from '../../types/crm';
import { contractStatus } from './contractStatus';
import { validateContractFile, contractStoragePath, newContractAttachmentId } from './contractAttachment';

const STATUS_VISUAL: Record<'sem_contrato' | 'pendente' | 'pago', { label: string; bg: string; color: string; icon: string }> = {
  sem_contrato: { label: 'Sem contrato anexado', bg: 'var(--bg-2)', color: 'var(--text-2)', icon: 'FileX' },
  pendente:     { label: 'Aguardando validação do financeiro', bg: '#FEF3C7', color: '#92400E', icon: 'Clock' },
  pago:         { label: 'Pagamento confirmado', bg: '#E5F0E5', color: 'var(--primary)', icon: 'CheckCircle2' },
};

interface Props {
  deal: Deal;
  onUploaded?: () => void;
}

export function ContractSlot({ deal, onUploaded }: Props) {
  const { user } = useAuthStore();
  const { updateDocument } = useFirestoreMutations('deals');
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const status = contractStatus(deal);
  if (status === 'nao_aplica') return null;

  const visual = STATUS_VISUAL[status];

  const handleFile = async (file: File) => {
    setError('');
    const check = validateContractFile(file);
    if (!check.ok) {
      setError(check.error ?? 'Arquivo inválido.');
      return;
    }
    if (!user?.tenantId || !user?.uid) return;

    setBusy(true);
    setProgress(0);
    try {
      const path = contractStoragePath(user.tenantId, deal.id, newContractAttachmentId(), file.name);
      const task = uploadBytesResumable(ref(storage, path), file, {
        contentType: 'application/pdf',
        contentDisposition: `inline; filename="${file.name}"`,
        customMetadata: { ownerUid: user.uid, dealId: deal.id },
      });

      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          snap => setProgress(snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0),
          reject,
          resolve,
        );
      });

      const url = await getDownloadURL(task.snapshot.ref);
      await updateDocument(deal.id, {
        contract: {
          url, storagePath: path, fileName: file.name, mime: 'application/pdf',
          size: file.size, uploadedBy: user.uid, uploadedAt: new Date(),
        },
      });
      onUploaded?.();
    } catch (err) {
      console.error('[ContractSlot] Falha ao enviar o contrato:', err);
      setError('Falha ao enviar o arquivo. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="label" style={{ fontSize: 10.5 }}>Contrato de Comodato</div>
        <span className="badge" style={{ background: visual.bg, color: visual.color, fontSize: 11 }}>
          <Icon name={visual.icon} size={11} style={{ marginRight: 4 }} />
          {visual.label}
        </span>
      </div>

      {deal.contract && (
        <a
          href={deal.contract.url}
          target="_blank"
          rel="noreferrer"
          className="row"
          style={{ gap: 8, fontSize: 12.5, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
        >
          <Icon name="FileText" size={14} />
          {deal.contract.fileName}
        </a>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      <button
        type="button"
        className="btn btn-outline btn-sm"
        style={{ alignSelf: 'flex-start' }}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <Icon name="Upload" size={13} />
        {busy ? `Enviando... ${progress}%` : deal.contract ? 'Substituir PDF' : 'Anexar PDF do contrato'}
      </button>

      {error && <p style={{ fontSize: 11.5, color: '#B91C1C', margin: 0 }}>{error}</p>}

      {status === 'pendente' && (
        <p className="muted" style={{ fontSize: 11, margin: 0 }}>
          Todo dia 09 o financeiro recebe um lembrete dos contratos pendentes — não precisa avisar por fora.
        </p>
      )}
    </div>
  );
}

export default ContractSlot;
