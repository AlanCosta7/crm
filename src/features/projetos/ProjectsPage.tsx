/**
 * ProjectsPage.tsx — Módulo de projetos de layout (visão equipe comercial)
 *
 * Visível para: master, manager, bdr, sdr, rep
 * (role 'design' tem rota própria: /design-queue)
 *
 * Funcionalidades:
 *  - Lista de solicitações com filtro por status
 *  - KPI de topo: total pendente / em andamento / entregues
 *  - Detalhe expandido ao clicar
 */

import { useState, useMemo } from 'react';
import { useFirestoreCollection } from '../../hooks/useFirestore';
import type { ProjectRequest, ProjectStatus } from '../../types/crm';
import { Icon } from '../../components/ui/Icon';
import { useAuthStore } from '../../stores/authStore';

const STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending:     { label: 'Aguardando',    color: '#B45309', bg: '#FEF3C7', icon: 'Clock'       },
  in_progress: { label: 'Em andamento',  color: '#1D4ED8', bg: '#DBEAFE', icon: 'Pencil'      },
  delivered:   { label: 'Entregue',      color: '#15803D', bg: '#DCFCE7', icon: 'CheckCircle2' },
};

const PDV_LABEL: Record<string, string> = {
  nanomarket:  'Nanomarket',
  micromarket: 'Micromarket',
  store:       'Loja',
  container:   'Container',
};

function fmtDate(ts: any): string {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function EquipSummary({ q }: { q: ProjectRequest['quantities'] }) {
  const items = Object.entries(q).filter(([, v]) => v > 0).map(([k, v]) => {
    const labels: Record<string, string> = { gondola: 'gônd', fridge: 'gel', freezerVertical: 'frzV', freezerHorizontal: 'frzH', luminary: 'lum', sign: 'placa' };
    return `${v}× ${labels[k] ?? k}`;
  });
  return items.length ? <span>{items.join(' · ')}</span> : <span className="muted">—</span>;
}

export default function ProjectsPage() {
  const { user } = useAuthStore();
  const { data: projects } = useFirestoreCollection<ProjectRequest>('project_requests');
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // BDR/SDR/Rep vê só os próprios; manager/master vê todos
  const canSeeAll = user?.role === 'master' || user?.role === 'manager';

  const filtered = useMemo(() => {
    let list = canSeeAll ? projects : projects.filter(p => p.requestedBy === user?.uid);
    if (filter !== 'all') list = list.filter(p => p.status === filter);
    return [...list].sort((a, b) => {
      const ta = a.requestedAt?.toDate?.()?.getTime() ?? 0;
      const tb = b.requestedAt?.toDate?.()?.getTime() ?? 0;
      return tb - ta;
    });
  }, [projects, filter, canSeeAll, user?.uid]);

  const counts = useMemo(() => ({
    pending:     projects.filter(p => p.status === 'pending').length,
    in_progress: projects.filter(p => p.status === 'in_progress').length,
    delivered:   projects.filter(p => p.status === 'delivered').length,
  }), [projects]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: 20, marginBottom: 2 }}>Projetos de Layout</h2>
          <p className="muted" style={{ fontSize: 13 }}>Solicitações de projeto para WizMart Minimercado</p>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {(Object.entries(STATUS_CONFIG) as [ProjectStatus, typeof STATUS_CONFIG[ProjectStatus]][]).map(([k, cfg]) => (
          <button
            key={k}
            onClick={() => setFilter(f => f === k ? 'all' : k)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 18px', borderRadius: 12, textAlign: 'left',
              border: `2px solid ${filter === k ? cfg.color : 'var(--border)'}`,
              background: filter === k ? cfg.bg : 'var(--card)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 10, background: filter === k ? cfg.color : 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
              <Icon name={cfg.icon as any} size={18} color={filter === k ? '#fff' : cfg.color} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: filter === k ? cfg.color : 'var(--text)', lineHeight: 1 }}>{counts[k]}</div>
              <div style={{ fontSize: 12, color: filter === k ? cfg.color : 'var(--text-2)', fontWeight: 600, marginTop: 2 }}>{cfg.label}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Icon name="PenLine" size={40} color="var(--text-3)" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Nenhuma solicitação encontrada</div>
          <p className="muted" style={{ fontSize: 13 }}>
            {filter !== 'all' ? 'Sem projetos com este status.' : 'Use o botão "Solicitar Projeto" no painel de um negócio WizMart Minimercado.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(proj => {
            const cfg = STATUS_CONFIG[proj.status];
            const expanded = expandedId === proj.id;
            return (
              <div
                key={proj.id}
                className="card"
                style={{ overflow: 'hidden', transition: 'border-color 0.15s', border: `1.5px solid ${expanded ? 'var(--primary)' : 'var(--border)'}` }}
              >
                {/* Row principal */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer' }}
                  onClick={() => setExpandedId(expanded ? null : (proj.id ?? null))}
                >
                  {/* Status dot */}
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />

                  {/* Empresa + PDV */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {proj.companyName}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                      {proj.pdvTypes.map(t => PDV_LABEL[t] ?? t).join(', ')} · Solicitado por {proj.requestedByName.split(' ')[0]}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 100, background: cfg.bg, color: cfg.color, flexShrink: 0 }}>
                    {cfg.label}
                  </span>

                  {/* Data */}
                  <span className="muted" style={{ fontSize: 12, flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
                    {fmtDate(proj.requestedAt)}
                  </span>

                  <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={15} color="var(--text-2)" />
                </div>

                {/* Expandido */}
                {expanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div className="field">
                        <div className="fl">Equipamentos</div>
                        <div className="fv" style={{ fontSize: 12 }}><EquipSummary q={proj.quantities} /></div>
                      </div>
                      <div className="field">
                        <div className="fl">Tipo de PDV</div>
                        <div className="fv" style={{ fontSize: 12 }}>{proj.pdvTypes.map(t => PDV_LABEL[t] ?? t).join(', ')}</div>
                      </div>
                      {(proj.walls.wall1 || proj.walls.wall2 || proj.walls.wall3) && (
                        <div className="field" style={{ gridColumn: '1 / -1' }}>
                          <div className="fl">Paredes</div>
                          <div className="fv" style={{ fontSize: 12 }}>
                            {[proj.walls.wall1, proj.walls.wall2, proj.walls.wall3].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      )}
                      {proj.notes && (
                        <div className="field" style={{ gridColumn: '1 / -1' }}>
                          <div className="fl">Observações</div>
                          <div className="fv" style={{ fontSize: 12 }}>{proj.notes}</div>
                        </div>
                      )}
                    </div>
                    {proj.status === 'delivered' && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} data-testid="entrega">
                        {(proj.deliveredAttachments ?? []).map(a => (
                          <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                            <Icon name="Download" size={13} /> {a.name}
                          </a>
                        ))}
                        {proj.deliveredFileUrl && (
                          <a href={proj.deliveredFileUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                            <Icon name="ExternalLink" size={13} /> Abrir link do projeto
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
