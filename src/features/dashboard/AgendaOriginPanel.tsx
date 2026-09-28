/**
 * AgendaOriginPanel.tsx — detalhe de Reuniões e Visitas Agendadas
 *
 * Fase 4 do PLANO_DESENHO_CRM.md, slide 2 do deck:
 *   "Se eu passar mouse em cima, ele já me sinaliza a origem."
 *   "Se eu clicar, me mostra detalhes, como população, cidade e SDR que agendou."
 *
 * Um componente para os DOIS indicadores, de propósito. O detalhe pedido é o
 * mesmo nos dois casos, e as fontes já foram unificadas em `AgendaRow`
 * (`src/utils/originBreakdown.ts`) — visita nasce de deal, reunião nasce de
 * atividade, e aqui a diferença não existe mais.
 *
 * Linhas com `origin: null` são reuniões cujo deal não foi encontrado. Aparecem
 * marcadas como "sem origem" em vez de sumirem: se sumissem, o número grande do
 * widget não bateria com o tamanho da lista aberta.
 */

import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import type { AgendaRow, MeetingBreakdown, OriginBreakdown } from '../../utils/originBreakdown';
import { filterAgendaRows } from '../../utils/originBreakdown';
import type { DealOrigin } from '../../types/crm';

const ORIGIN_STYLE: Record<DealOrigin, { bg: string; fg: string; border: string; label: string }> = {
  inbound:  { bg: '#EFF6FF', fg: '#1E40AF', border: '#3B82F644', label: 'Inbound'  },
  outbound: { bg: '#F0F7F0', fg: '#1A6B1A', border: '#1A6B1A33', label: 'Outbound' },
};

export function OriginChip({ origin }: { origin: DealOrigin | null }) {
  if (!origin) {
    return (
      <span className="badge" title="Reunião cujo negócio não foi encontrado no escopo carregado"
        style={{ fontSize: 10, background: 'var(--bg-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
        sem origem
      </span>
    );
  }
  const s = ORIGIN_STYLE[origin];
  return (
    <span className="badge" style={{ fontSize: 10, background: s.bg, color: s.fg, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  );
}

interface Props {
  title: string;
  rows: AgendaRow[];
  breakdown: OriginBreakdown | MeetingBreakdown;
  onClose: () => void;
  /** Conteúdo extra à esquerda (o mapa do Brasil, no caso das visitas). */
  aside?: React.ReactNode;
  emptyLabel: string;
}

export function AgendaOriginPanel({ title, rows, breakdown, onClose, aside, emptyLabel }: Props) {
  const [filter, setFilter] = useState<'all' | DealOrigin>('all');
  const visible = filterAgendaRows(rows, filter);
  const unresolved = 'unresolved' in breakdown ? breakdown.unresolved : 0;

  return (
    <div className="card kpi-dir-card" style={{ animation: 'fadeIn .25s ease' }}>
      <div className="card-hd">
        <h3>{title}</h3>
        <div className="row" style={{ gap: 8 }}>
          <div className="seg" style={{ fontSize: 12 }}>
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
              Todas ({breakdown.total})
            </button>
            <button className={filter === 'inbound' ? 'on' : ''} onClick={() => setFilter('inbound')}>
              Inbound ({breakdown.inbound})
            </button>
            <button className={filter === 'outbound' ? 'on' : ''} onClick={() => setFilter('outbound')}>
              Outbound ({breakdown.outbound})
            </button>
          </div>
          <button className="icon-btn" aria-label={`Fechar ${title}`} onClick={onClose}>
            <Icon name="X" size={15} />
          </button>
        </div>
      </div>

      {unresolved > 0 && filter === 'all' && (
        <div className="muted" style={{ padding: '6px 16px', fontSize: 11.5, borderBottom: '1px solid var(--border)' }}>
          {unresolved} registro(s) sem origem — o negócio não está no escopo carregado.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: aside ? '1fr 1fr' : '1fr', gap: 0 }}>
        {aside && <div style={{ padding: '8px 16px' }}>{aside}</div>}

        <div style={{ borderLeft: aside ? '1px solid var(--border)' : undefined, maxHeight: 300, overflowY: 'auto' }}>
          {visible.length === 0 ? (
            <div className="muted" style={{ padding: 20, fontSize: 13 }}>
              {filter === 'all' ? emptyLabel : `Nenhum registro ${ORIGIN_STYLE[filter].label} neste período.`}
            </div>
          ) : visible.map(r => (
            <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--border)' }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, background: 'var(--bg-2)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11,
                fontWeight: 700, color: 'var(--text-2)',
              }}>
                {r.state || '—'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.company}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {r.city || '—'}
                  {r.population ? ` · ${r.population.toLocaleString('pt-BR')} colaboradores` : ''}
                  {r.scheduledBy ? ` · agendou: ${r.scheduledBy}` : ''}
                </div>
              </div>
              <OriginChip origin={r.origin} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AgendaOriginPanel;
