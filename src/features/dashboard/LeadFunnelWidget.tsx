/**
 * LeadFunnelWidget.tsx — Funil de leads replicado nos dashboards
 *
 * Pedido do cliente (Observações CRM, jul/2026): "Replicar no Dashboard da
 * Gestão, dos SDRs e BDR, quantos leads foram atribuídos, quantos leads
 * geraram visitas, quantos estão em processo de fechamento e assinatura
 * de contrato."
 *
 * Etapas (heurísticas estáveis, independentes dos estágios dinâmicos):
 *  1. Atribuídos     — lead com SDR designado (saiu da fila BDR)
 *  2. Geraram visita — visita agendada (cohort ou campo de visita)
 *  3. Em fechamento  — bastão aceito, em trabalho com o Representante
 *  4. Contrato       — negócio ganho
 */

import type { Deal } from '../../types/crm';
import { Icon } from '../../components/ui/Icon';

export interface LeadFunnelCounts {
  assigned: number;
  visits: number;
  closing: number;
  won: number;
}

/** Calcula as 4 etapas do funil a partir de uma lista de deals já filtrada por escopo. */
export function calcLeadFunnel(deals: Deal[]): LeadFunnelCounts {
  const assigned = deals.filter(d => !!d.assignedSdrId || !!d.assignedRepId || d.status === 'won');
  const visits = assigned.filter(d => !!d.cohortKeys?.visitScheduledMonth || !!d.visitScheduledAt);
  const closing = assigned.filter(d => d.handoffStatus === 'accepted' && d.status !== 'won' && d.status !== 'lost');
  const won = deals.filter(d => d.status === 'won');
  return { assigned: assigned.length, visits: visits.length, closing: closing.length, won: won.length };
}

const STEPS = [
  { key: 'assigned' as const, label: 'Leads atribuídos',  icon: 'Users',          color: '#6366F1' },
  { key: 'visits' as const,   label: 'Geraram visita',    icon: 'MapPin',         color: '#F59E0B' },
  { key: 'closing' as const,  label: 'Em fechamento',     icon: 'ArrowRightLeft', color: '#7C3AED' },
  { key: 'won' as const,      label: 'Contrato assinado', icon: 'Trophy',         color: '#1A6B1A' },
];

export function LeadFunnelWidget({ deals, title = 'Funil de Leads' }: { deals: Deal[]; title?: string }) {
  const counts = calcLeadFunnel(deals);
  const max = Math.max(counts.assigned, 1);

  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {STEPS.map(step => {
        const value = counts[step.key];
        const pctOfAssigned = counts.assigned > 0 ? Math.round((value / counts.assigned) * 100) : 0;
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: step.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={step.icon} size={14} color={step.color} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{step.label}</span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: step.color }}>
                  {value}
                  {step.key !== 'assigned' && (
                    <span className="muted" style={{ fontWeight: 500, fontSize: 11 }}> · {pctOfAssigned}%</span>
                  )}
                </span>
              </div>
              <div className="prog" style={{ height: 7 }}>
                <div className="fill" style={{ width: `${Math.round((value / max) * 100)}%`, background: step.color, transition: 'width 0.8s ease' }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default LeadFunnelWidget;
