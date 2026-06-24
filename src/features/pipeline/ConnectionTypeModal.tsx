/**
 * ConnectionTypeModal.tsx — Seleção de subtipo de conexão para Smart Café
 *
 * Exibido quando um deal é movido para o estágio "Conectado ao Representante"
 * no funil Smart Café. Define clientSize e connectionType conforme porte do cliente.
 *
 * Regras (REQUISITOS-V3 §2.2):
 *  - Pequeno (<30 func)  → connectionType: 'standard_proposal'  → SDR envia Proposta Padrão sem Rep
 *  - Médio   (30–100)    → connectionType: 'meeting_scheduled'  → Reunião com SDR + Rep
 *  - Grande  (>100 func) → connectionType: 'visit_scheduled'    → Rep lidera visita presencial
 */

import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import type { Deal } from '../../types/crm';

export interface ConnectionTypeFormData {
  clientSize: 'small' | 'medium' | 'large';
  connectionType: 'standard_proposal' | 'meeting_scheduled' | 'visit_scheduled';
}

interface Props {
  deal: Deal;
  onConfirm: (data: ConnectionTypeFormData) => void;
  onCancel: () => void;
}

const OPTIONS: {
  size: ConnectionTypeFormData['clientSize'];
  label: string;
  subtitle: string;
  connectionType: ConnectionTypeFormData['connectionType'];
  icon: string;
  color: string;
  bgColor: string;
  tag: string;
}[] = [
  {
    size: 'small',
    label: 'Pequeno',
    subtitle: 'Menos de 30 funcionários',
    connectionType: 'standard_proposal',
    icon: 'Store',
    color: '#5E3A26',
    bgColor: '#FAF2EC',
    tag: 'Proposta Padrão',
  },
  {
    size: 'medium',
    label: 'Médio',
    subtitle: '30 a 100 funcionários',
    connectionType: 'meeting_scheduled',
    icon: 'Building',
    color: '#92400E',
    bgColor: '#FEF3C7',
    tag: 'Reunião Agendada',
  },
  {
    size: 'large',
    label: 'Grande',
    subtitle: 'Mais de 100 funcionários',
    connectionType: 'visit_scheduled',
    icon: 'Building2',
    color: '#1E3A5F',
    bgColor: '#EFF6FF',
    tag: 'Visita Agendada',
  },
];

export function ConnectionTypeModal({ deal, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<ConnectionTypeFormData['clientSize'] | null>(null);
  const chosen = OPTIONS.find(o => o.size === selected);

  const handleConfirm = () => {
    if (!chosen) return;
    onConfirm({ clientSize: chosen.size, connectionType: chosen.connectionType });
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 480, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#FAF2EC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="Coffee" size={15} color="#5E3A26" />
              </div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Tipo de Conexão — Smart Café</span>
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
              Selecione o porte do cliente para definir o fluxo de venda.
            </p>
          </div>
          <button className="icon-btn" style={{ width: 28, height: 28, flexShrink: 0 }} onClick={onCancel}>
            <Icon name="X" size={15} />
          </button>
        </div>

        {/* Deal preview */}
        <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#5E3A26', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.name}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>{deal.company}</div>
          </div>
        </div>

        {/* Opções */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {OPTIONS.map(opt => (
            <button
              key={opt.size}
              onClick={() => setSelected(opt.size)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 14px', borderRadius: 10, textAlign: 'left',
                border: `2px solid ${selected === opt.size ? opt.color : 'var(--border)'}`,
                background: selected === opt.size ? opt.bgColor : 'var(--card)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: selected === opt.size ? opt.color : 'var(--bg-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                <Icon name={opt.icon as any} size={18} color={selected === opt.size ? '#fff' : 'var(--text-2)'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5, color: selected === opt.size ? opt.color : 'var(--text)' }}>
                    {opt.label}
                  </span>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 100,
                    background: selected === opt.size ? opt.color : 'var(--bg-2)',
                    color: selected === opt.size ? '#fff' : 'var(--text-2)',
                    transition: 'all 0.15s',
                  }}>
                    {opt.tag}
                  </span>
                </div>
                <span className="muted" style={{ fontSize: 12 }}>{opt.subtitle}</span>
              </div>
              {selected === opt.size && (
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: opt.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="Check" size={11} color="#fff" strokeWidth={3} />
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Aviso para cliente pequeno */}
        {selected === 'small' && (
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 8, background: '#FEF9EC', border: '1px solid #F59E0B44' }}>
            <Icon name="Info" size={14} color="#B45309" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: '#92400E', margin: 0, lineHeight: 1.5 }}>
              <strong>Proposta Padrão:</strong> o SDR envia a proposta diretamente, sem presença do Representante. O próximo passo será <em>Proposta Apresentada</em>.
            </p>
          </div>
        )}

        {/* Ações */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onCancel}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={!selected}
            onClick={handleConfirm}
            style={{ opacity: selected ? 1 : 0.45, cursor: selected ? 'pointer' : 'default' }}
          >
            <Icon name="ArrowRight" size={14} />
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
