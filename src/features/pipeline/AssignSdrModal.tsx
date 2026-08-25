/**
 * AssignSdrModal.tsx — Atribuição manual BDR → SDR
 *
 * Fase D2 do PLANO_CARD_ASSINATURAS_VISIBILIDADE.md. Convive com a distribuição
 * automática do `dailyCadenceEngine` (cron 7h) — este modal é a via extra pro
 * BDR reagir na hora (ex.: um SDR zerou a cadência do dia e está disponível
 * pra mais cards, sem esperar o motor do dia seguinte).
 *
 * Mesmo padrão visual do HandoffModal (SDR→Rep), mas sem os campos de visita —
 * só a seleção do SDR (ordenada por menor carga atual primeiro) e uma
 * observação opcional.
 */

import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { Av } from '../../components/ui/Av';
import type { Deal, SettingUser } from '../../types/crm';
import type { SdrWorkload } from '../../utils/sdrWorkload';
import { effectiveCompanySize, COMPANY_SIZE_LABEL, COMPANY_SIZE_COLOR } from '../../utils/companySize';

export interface AssignSdrFormData {
  sdrId: string;
  notes?: string;
}

interface AssignSdrModalProps {
  deal: Deal;
  sdrs: SettingUser[];             // SDRs ativos do produto do deal
  workloadBySdr: SdrWorkload[];    // carga atual — usada só pra ordenar e exibir
  onConfirm: (data: AssignSdrFormData) => Promise<void>;
  onCancel: () => void;
}

export function AssignSdrModal({ deal, sdrs, workloadBySdr, onConfirm, onCancel }: AssignSdrModalProps) {
  const [sdrId,  setSdrId]  = useState('');
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [submitError, setSubmitError] = useState('');

  const workloadOf = (id?: string) => workloadBySdr.find(w => w.sdrId === id);
  const dealSize = effectiveCompanySize(deal);

  // Fase D3: se o card tem porte conhecido, prioriza quem tem MENOS cards
  // DAQUELE porte específico (evita um SDR acumular só contas grandes) —
  // total geral só desempata. Sem porte no card, cai na ordenação antiga
  // (só pelo total).
  const orderedSdrs = [...sdrs].sort((a, b) => {
    const wa = workloadOf(a.id);
    const wb = workloadOf(b.id);
    const sizeA = wa?.bySize[dealSize] ?? 0;
    const sizeB = wb?.bySize[dealSize] ?? 0;
    if (sizeA !== sizeB) return sizeA - sizeB;
    return (wa?.leads ?? 0) - (wb?.leads ?? 0);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sdrId) {
      setError('Selecione o SDR que vai receber o lead.');
      return;
    }
    setSaving(true);
    setSubmitError('');
    try {
      await onConfirm({ sdrId, notes: notes || undefined });
    } catch (err: any) {
      console.error('[AssignSdrModal] Erro ao atribuir SDR:', err);
      setSubmitError(
        err?.code === 'permission-denied'
          ? 'Você não tem permissão para atribuir este lead.'
          : 'Não foi possível atribuir o lead. Verifique sua conexão e tente novamente.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-ov" style={{ zIndex: 300 }}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="UserPlus" size={18} color="var(--primary)" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Atribuir SDR</h3>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                {deal.name}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 100,
                  background: COMPANY_SIZE_COLOR[dealSize].bg, color: COMPANY_SIZE_COLOR[dealSize].text,
                  border: `1px solid ${COMPANY_SIZE_COLOR[dealSize].border}`,
                }}>
                  {COMPANY_SIZE_LABEL[dealSize]}{!deal.companySizeEstimate && ' (padrão)'}
                </span>
              </p>
            </div>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Cancelar">
            <Icon name="X" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            <div className="field" style={{ margin: 0 }}>
              <div className="fl" style={{ marginBottom: 4 }}>SDR responsável *</div>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 0, marginBottom: 8 }}>
                Ordenado por menor carga do porte <strong>{COMPANY_SIZE_LABEL[dealSize]}</strong> primeiro — a cota diária automática não se aplica aqui.
              </p>
              {orderedSdrs.length === 0 ? (
                <p className="muted" style={{ fontSize: 12.5 }}>Nenhum SDR ativo cadastrado para este produto.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {orderedSdrs.map(sdr => {
                    const w = workloadOf(sdr.id);
                    const leads = w?.leads ?? 0;
                    const selected = sdrId === sdr.id;
                    return (
                      <label
                        key={sdr.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                          borderRadius: 8, border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                          background: selected ? 'var(--primary-light)' : '#fff',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        <input type="radio" name="sdrId" value={sdr.id || ''} checked={selected} onChange={() => { setSdrId(sdr.id || ''); setError(''); }} style={{ display: 'none' }} />
                        <Av initials={sdr.initials} color={sdr.color} size={32} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: selected ? 'var(--primary)' : 'var(--text-primary)' }}>{sdr.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                            {leads} card{leads !== 1 ? 's' : ''} em cadência
                            {leads > 0 && w && (
                              <> · {(['P', 'M', 'G'] as const).filter(sz => w.bySize[sz] > 0).map(sz => (
                                <span key={sz} style={{ fontWeight: sz === dealSize ? 700 : 400, color: sz === dealSize ? 'var(--primary)' : 'var(--text-2)' }}>
                                  {w.bySize[sz]}{sz}{' '}
                                </span>
                              ))}</>
                            )}
                          </div>
                        </div>
                        {selected && <Icon name="Check" size={16} color="var(--primary)" style={{ flexShrink: 0 }} />}
                      </label>
                    );
                  })}
                </div>
              )}
              {error && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{error}</p>}
            </div>

            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Observações para o SDR</div>
              <textarea
                className="input"
                rows={3}
                placeholder="Contexto do lead, motivo da atribuição direta..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>

          {submitError && (
            <div role="alert" style={{ margin: '0 20px', padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="AlertTriangle" size={15} color="#B91C1C" />
              {submitError}
            </div>
          )}

          <div className="modal-ft">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Icon name="UserPlus" size={16} />
              {saving ? 'Atribuindo...' : 'Atribuir agora'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AssignSdrModal;
