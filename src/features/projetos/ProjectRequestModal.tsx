/**
 * ProjectRequestModal.tsx — Formulário de solicitação de projeto de layout
 *
 * Disponível para BDR / SDR / Rep do card (e gestão) em deals WizMart — ver projectAccess.ts.
 * Após submit, grava na coleção `project_requests` no Firestore.
 *
 * Campos (REQUISITOS-V3 §5):
 *  - Tipos de PDV (multi-select)
 *  - Quantidades de equipamentos (gôndola, geladeira, freezer V/H, luminário, placa)
 *  - Paredes (3 campos texto)
 *  - Observações gerais
 *  - Upload de mídias (URLs simuladas — produção: Firebase Storage)
 */

import { useMemo, useState } from 'react';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Icon } from '../../components/ui/Icon';
import { ProjectFilePicker } from './ProjectFilePicker';
import { useProjectUpload } from './useProjectUpload';
import { REQUEST_ACCEPT, MAX_REQUEST_FILES } from './projectAttachments';
import { useAuthStore } from '../../stores/authStore';
import type { Deal, PDVType } from '../../types/crm';
import {
  PDV_OPTIONS, EQUIPMENT_FIELDS, EMPTY_QUANTITIES, MAX_QTY, clampQty, hasAnyEquipment,
  type EquipKey, type Quantities,
} from './projectRequestForm';

interface Props {
  deal: Deal;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FormState {
  pdvTypes: PDVType[];
  quantities: Quantities;
  walls: { wall1: string; wall2: string; wall3: string };
  notes: string;
}

const INITIAL: FormState = {
  pdvTypes: [],
  quantities: { ...EMPTY_QUANTITIES },
  walls: { wall1: '', wall2: '', wall3: '' },
  notes: '',
};

export function ProjectRequestModal({ deal, onClose, onSuccess }: Props) {
  const { user } = useAuthStore();
  const [form, setForm]     = useState<FormState>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [step, setStep]     = useState<1 | 2 | 3>(1);

  // O id da solicitação nasce ANTES do upload: as fotos já vão para o caminho
  // definitivo `project_requests/{id}/request/...` (mesmo padrão das notas).
  const requestId = useMemo(
    () => (user ? doc(collection(db, 'tenants', user.tenantId, 'project_requests')).id : ''),
    [user],
  );
  const media = useProjectUpload(requestId, 'request');

  const togglePdv = (id: PDVType) => {
    setForm(f => ({
      ...f,
      pdvTypes: f.pdvTypes.includes(id)
        ? f.pdvTypes.filter(p => p !== id)
        : [...f.pdvTypes, id],
    }));
  };

  const setQty = (key: EquipKey, val: number) => {
    setForm(f => ({ ...f, quantities: { ...f.quantities, [key]: clampQty(val) } }));
  };

  const setWall = (k: 'wall1' | 'wall2' | 'wall3', v: string) => {
    setForm(f => ({ ...f, walls: { ...f.walls, [k]: v } }));
  };

  const canNext1 = form.pdvTypes.length > 0;
  const canNext2 = hasAnyEquipment(form.quantities);

  const handleSubmit = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      await setDoc(doc(db, 'tenants', user.tenantId, 'project_requests', requestId), {
        dealId:          deal.id,
        companyName:     deal.company,
        requestedBy:     user.uid,
        requestedByName: user.name ?? '',
        requestedByRole: user.role ?? 'rep',
        pdvTypes:        form.pdvTypes,
        quantities:      form.quantities,
        walls:           form.walls,
        notes:           form.notes,
        mediaUrls:       media.attachments.map(a => a.url),
        attachments:     media.attachments,
        status:          'pending',
        requestedAt:     serverTimestamp(),
        updatedAt:       serverTimestamp(),
      });
      onSuccess?.();
      onClose();
    } catch (e: any) {
      setError('Erro ao salvar: ' + (e.message ?? 'tente novamente'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 540, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: '#F0F7F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="PenLine" size={15} color="#1A6B1A" />
              </div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Solicitar Projeto de Layout</span>
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>{deal.company}</p>
          </div>
          <button className="icon-btn" style={{ width: 28, height: 28, flexShrink: 0 }} onClick={onClose}>
            <Icon name="X" size={15} />
          </button>
        </div>

        {/* Steps indicator */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          {(['Tipo de PDV', 'Equipamentos', 'Detalhes'] as const).map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3;
            const active = step === n;
            const done   = step > n;
            return (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                  background: done ? '#1A6B1A' : active ? '#1A6B1A18' : 'var(--bg-2)',
                  color: done ? '#fff' : active ? '#1A6B1A' : 'var(--text-3)',
                  border: `1.5px solid ${done || active ? '#1A6B1A' : 'var(--border)'}`,
                  transition: 'all 0.2s',
                }}>
                  {done ? <Icon name="Check" size={11} color="#fff" strokeWidth={3} /> : n}
                </div>
                <span style={{ fontSize: 12, fontWeight: active ? 700 : 400, color: active ? 'var(--text)' : 'var(--text-2)', transition: 'all 0.2s' }}>{label}</span>
                {n < 3 && <div style={{ flex: 1, height: 1, background: done ? '#1A6B1A44' : 'var(--border)', marginLeft: 4 }} />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* STEP 1 — Tipos de PDV */}
          {step === 1 && (
            <>
              <div>
                <div className="label" style={{ marginBottom: 10 }}>Selecione os tipos de PDV do projeto <span style={{ color: '#EF4444' }}>*</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {PDV_OPTIONS.map(opt => {
                    const sel = form.pdvTypes.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => togglePdv(opt.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '14px 16px', borderRadius: 10, textAlign: 'left',
                          border: `2px solid ${sel ? '#1A6B1A' : 'var(--border)'}`,
                          background: sel ? '#F0F7F0' : 'var(--card)',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: 9, background: sel ? '#1A6B1A' : 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                          <Icon name={opt.icon as any} size={17} color={sel ? '#fff' : 'var(--text-2)'} />
                        </div>
                        <span style={{ fontWeight: sel ? 700 : 400, fontSize: 13.5, color: sel ? '#1A6B1A' : 'var(--text)' }}>{opt.label}</span>
                        {sel && (
                          <div style={{ marginLeft: 'auto', width: 18, height: 18, borderRadius: '50%', background: '#1A6B1A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Icon name="Check" size={10} color="#fff" strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {!canNext1 && <p style={{ fontSize: 11.5, color: '#EF4444', marginTop: 8 }}>Selecione ao menos um tipo de PDV.</p>}
              </div>
            </>
          )}

          {/* STEP 2 — Equipamentos */}
          {step === 2 && (
            <>
              <div>
                <div className="label" style={{ marginBottom: 4 }}>Quantidade de equipamentos</div>
                <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>De 1 a {MAX_QTY} unidades por item. Deixe em 0 o que não será utilizado.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {EQUIPMENT_FIELDS.map(f => (
                    <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: form.quantities[f.key] > 0 ? '#F0F7F0' : 'var(--card)' }}>
                      <Icon name={f.icon as any} size={16} color={form.quantities[f.key] > 0 ? '#1A6B1A' : 'var(--text-3)'} />
                      <span style={{ flex: 1, fontSize: 13.5, fontWeight: form.quantities[f.key] > 0 ? 600 : 400 }}>{f.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => setQty(f.key, form.quantities[f.key] - 1)}
                          aria-label={`Diminuir ${f.label}`}
                          className="icon-btn"
                          style={{ width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 6 }}
                        >
                          <Icon name="Minus" size={12} />
                        </button>
                        <span style={{ width: 32, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{form.quantities[f.key]}</span>
                        <button
                          onClick={() => setQty(f.key, form.quantities[f.key] + 1)}
                          disabled={form.quantities[f.key] >= MAX_QTY}
                          aria-label={`Aumentar ${f.label}`}
                          className="icon-btn"
                          style={{ width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 6, background: '#F0F7F0', opacity: form.quantities[f.key] >= MAX_QTY ? 0.4 : 1 }}
                        >
                          <Icon name="Plus" size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {!canNext2 && <p style={{ fontSize: 11.5, color: '#EF4444', marginTop: 8 }}>Informe a quantidade de ao menos 1 equipamento.</p>}
              </div>
            </>
          )}

          {/* STEP 3 — Paredes + Obs */}
          {step === 3 && (
            <>
              <div>
                <div className="label" style={{ marginBottom: 10 }}>Dimensões das paredes</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(['wall1', 'wall2', 'wall3'] as const).map((k, i) => (
                    <div key={k}>
                      <label style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4, display: 'block' }}>Parede {i + 1}</label>
                      <input
                        className="input"
                        placeholder={`Ex: 3,00m x 2,80m — parede ${i === 0 ? 'frontal' : i === 1 ? 'lateral direita' : 'lateral esquerda'}`}
                        value={form.walls[k]}
                        onChange={e => setWall(k, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Observações</div>
                <textarea
                  className="input"
                  style={{ resize: 'vertical', minHeight: 88 }}
                  placeholder="Instruções especiais, referências de cor, logomarca, etc."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Anexar fotos e vídeos</div>
                <ProjectFilePicker
                  uploads={media.uploads}
                  onAdd={media.addFiles}
                  onRemove={media.remove}
                  accept={REQUEST_ACCEPT}
                  maxFiles={MAX_REQUEST_FILES}
                  label="Adicionar fotos e vídeos do local"
                  hint={`Até ${MAX_REQUEST_FILES} arquivos. Foto até 15 MB, vídeo até 100 MB. O Design recebe o arquivo original.`}
                />
              </div>
              {error && <p style={{ fontSize: 12, color: '#EF4444' }}>{error}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {step > 1 && (
              <button className="btn btn-outline btn-sm" onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}>
                <Icon name="ArrowLeft" size={13} /> Voltar
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
            {step < 3 ? (
              <button
                className="btn btn-primary"
                onClick={() => setStep(s => (s + 1) as 1 | 2 | 3)}
                disabled={step === 1 ? !canNext1 : !canNext2}
                style={{ opacity: (step === 1 ? !canNext1 : !canNext2) ? 0.45 : 1 }}
              >
                Próximo <Icon name="ArrowRight" size={13} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={saving || media.busy}
                title={media.busy ? 'Aguarde o envio dos arquivos terminar' : undefined}
              >
                {saving
                  ? <Icon name="Loader2" size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Icon name="Send" size={14} />}
                {media.busy ? 'Enviando arquivos…' : 'Enviar solicitação'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
