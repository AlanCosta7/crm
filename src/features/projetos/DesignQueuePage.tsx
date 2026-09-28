/**
 * DesignQueuePage.tsx — Fila FIFO de projetos para o role 'design'
 *
 * Visível exclusivamente para role 'design'.
 * Funcionalidades:
 *  - Lista projetos pendentes em ordem de chegada (FIFO por requestedAt)
 *  - Botão "Pegar próximo" → muda status para in_progress e atribui designer
 *  - Botão "Marcar entregue" → muda status para delivered
 *  - Separação visual: "Em andamento" (meu) | "Aguardando" (fila)
 *  - Não participa de gamificação (sem moedas)
 */

import { useState, useMemo } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useFirestoreCollection } from '../../hooks/useFirestore';
import type { NoteAttachment, ProjectRequest } from '../../types/crm';
import { Icon } from '../../components/ui/Icon';
import { useAuthStore } from '../../stores/authStore';
import { ProjectFilePicker } from './ProjectFilePicker';
import { useProjectUpload } from './useProjectUpload';
import { DELIVERY_ACCEPT } from './projectAttachments';

const PDV_LABEL: Record<string, string> = {
  nanomarket:  'Nanomarket',
  micromarket: 'Micromarket',
  store:       'Loja',
  container:   'Container',
};

function fmtDate(ts: any): string {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function EquipRow({ q }: { q: ProjectRequest['quantities'] }) {
  const items = [
    ['Gôndola',                      q.gondola],
    ['Geladeira',                    q.fridge],
    ['Freezer Vertical',             q.freezerVertical],
    ['Freezer Horizontal — Picolé',  q.freezerHorizontal],
    ['Luminária WizMart',            q.luminary],
    ['Letreiro WizMart',             q.sign],
  ].filter(([, v]) => (v as number) > 0);

  if (!items.length) return <span className="muted">—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map(([k, v]) => (
        <span key={k as string} style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 100, background: 'var(--bg-2)', color: 'var(--text-2)' }}>
          {v}× {k}
        </span>
      ))}
    </div>
  );
}

function ProjectCard({ proj, isMine, onTake, onDeliver }: {
  proj: ProjectRequest;
  isMine: boolean;
  onTake?: () => void;
  onDeliver?: (d: { url: string; attachments: NoteAttachment[] }) => void;
}) {
  const [deliverUrl, setDeliverUrl] = useState('');
  const [showDelivery, setShowDelivery] = useState(false);
  const delivery = useProjectUpload(proj.id ?? '', 'delivery');
  const canConfirm = !delivery.busy && (delivery.attachments.length > 0 || deliverUrl.trim().length > 0);

  const elapsed = useMemo(() => {
    const ts = proj.requestedAt?.toDate?.()?.getTime();
    if (!ts) return null;
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 60) return `${mins}min`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  }, [proj.requestedAt]);

  return (
    <div className="card" style={{
      padding: '18px 20px',
      border: `2px solid ${isMine ? '#1D4ED8' : 'var(--border)'}`,
      background: isMine ? '#F0F5FF' : 'var(--card)',
    }}>
      {/* Topo */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            {isMine && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: '#1D4ED8', color: '#fff' }}>
                EM ANDAMENTO
              </span>
            )}
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>
              {elapsed ? `há ${elapsed}` : ''}
            </span>
          </div>
          <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>{proj.companyName}</h3>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {proj.pdvTypes.map(t => PDV_LABEL[t] ?? t).join(' + ')} · Solicitado por {proj.requestedByName.split(' ')[0]}
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'right', flexShrink: 0 }}>
          <div>{fmtDate(proj.requestedAt)}</div>
        </div>
      </div>

      {/* Equipamentos */}
      <div style={{ marginBottom: 10 }}>
        <div className="label" style={{ marginBottom: 6, fontSize: 11 }}>EQUIPAMENTOS</div>
        <EquipRow q={proj.quantities} />
      </div>

      {/* Paredes */}
      {(proj.walls.wall1 || proj.walls.wall2 || proj.walls.wall3) && (
        <div style={{ marginBottom: 10 }}>
          <div className="label" style={{ marginBottom: 6, fontSize: 11 }}>PAREDES</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            {[proj.walls.wall1, proj.walls.wall2, proj.walls.wall3].filter(Boolean).join(' · ')}
          </div>
        </div>
      )}

      {/* Fotos e vídeos do local — o Design precisa ver o que o solicitante mandou */}
      {(proj.attachments?.length ?? 0) > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div className="label" style={{ marginBottom: 6, fontSize: 11 }}>FOTOS E VÍDEOS DO LOCAL ({proj.attachments!.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {proj.attachments!.map(a => (
              <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" data-testid="anexo-solicitacao"
                 style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', textDecoration: 'none' }}>
                <Icon name={a.kind === 'video' ? 'Video' : 'Image'} size={13} /> {a.name}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Observações */}
      {proj.notes && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-2)', fontSize: 12.5 }}>
          {proj.notes}
        </div>
      )}

      {/* Ações */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        {!isMine && onTake && (
          <button className="btn btn-primary btn-sm" onClick={onTake}>
            <Icon name="Play" size={13} /> Pegar este projeto
          </button>
        )}
        {isMine && onDeliver && !showDelivery && (
          <button
            className="btn btn-sm"
            style={{ background: '#15803D', color: '#fff', border: 'none' }}
            onClick={() => setShowDelivery(true)}
          >
            <Icon name="CheckCircle2" size={13} /> Marcar como entregue
          </button>
        )}
        {isMine && showDelivery && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 260 }}>
            <ProjectFilePicker
              uploads={delivery.uploads}
              onAdd={delivery.addFiles}
              onRemove={delivery.remove}
              accept={DELIVERY_ACCEPT}
              label="Anexar o projeto pronto"
              hint="PDF, imagem ou vídeo. O solicitante abre direto do card."
            />
            <input
              className="input"
              placeholder="Ou cole um link do projeto (Drive, etc.) — opcional"
              value={deliverUrl}
              onChange={e => setDeliverUrl(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-sm"
                style={{ background: '#15803D', color: '#fff', border: 'none', flexShrink: 0, opacity: canConfirm ? 1 : 0.5 }}
                onClick={() => onDeliver && onDeliver({ url: deliverUrl.trim(), attachments: delivery.attachments })}
                disabled={!canConfirm}
                title={delivery.busy ? 'Aguarde o envio dos arquivos terminar' : undefined}
              >
                <Icon name="Send" size={13} /> {delivery.busy ? 'Enviando…' : 'Confirmar entrega'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setShowDelivery(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DesignQueuePage() {
  const { user } = useAuthStore();
  const { data: rawProjects } = useFirestoreCollection<ProjectRequest>('project_requests');
  const [working, setWorking] = useState<string | null>(null);

  // Separar: meu projeto em andamento | fila pendente
  const myActive = useMemo(
    () => rawProjects.filter(p => p.status === 'in_progress' && p.assignedToDesignerId === user?.uid),
    [rawProjects, user?.uid],
  );

  const queue = useMemo(
    () => rawProjects
      .filter(p => p.status === 'pending')
      .sort((a, b) => {
        const ta = a.requestedAt?.toDate?.()?.getTime() ?? 0;
        const tb = b.requestedAt?.toDate?.()?.getTime() ?? 0;
        return ta - tb; // FIFO — mais antigo primeiro
      }),
    [rawProjects],
  );

  const handleTake = async (proj: ProjectRequest) => {
    if (!proj.id || !user) return;
    setWorking(proj.id);
    try {
      await updateDoc(doc(db, 'tenants', user.tenantId, 'project_requests', proj.id), {
        status: 'in_progress',
        assignedToDesignerId: user.uid,
        assignedToDesignerName: user.name ?? '',
        assignedAt: new Date(),
        updatedAt: new Date(),
      });
    } finally {
      setWorking(null);
    }
  };

  const handleDeliver = async (proj: ProjectRequest, d: { url: string; attachments: NoteAttachment[] }) => {
    if (!proj.id || !user) return;
    setWorking(proj.id);
    try {
      await updateDoc(doc(db, 'tenants', user.tenantId, 'project_requests', proj.id), {
        status: 'delivered',
        deliveredFileUrl: d.url,
        deliveredAttachments: d.attachments,
        deliveredByName: user.name ?? '',
        deliveredAt: new Date(),
        updatedAt: new Date(),
      });
    } finally {
      setWorking(null);
    }
  };

  const totalDone = rawProjects.filter(p => p.status === 'delivered' && p.assignedToDesignerId === user?.uid).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 760, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: 20, marginBottom: 2 }}>Fila de Projetos</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            Ordem de chegada (FIFO) · {queue.length} aguardando · {totalDone} entregues por você
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ padding: '6px 14px', borderRadius: 8, background: queue.length > 0 ? '#FEF3C7' : '#F0F7F0', border: `1px solid ${queue.length > 0 ? '#F59E0B44' : '#1A6B1A22'}` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: queue.length > 0 ? '#B45309' : '#1A6B1A' }}>
              {queue.length > 0 ? `${queue.length} na fila` : 'Fila vazia ✓'}
            </span>
          </div>
        </div>
      </div>

      {/* Em andamento */}
      {myActive.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Icon name="Pencil" size={15} color="#1D4ED8" />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1D4ED8' }}>Meu projeto em andamento</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myActive.map(p => (
              <ProjectCard
                key={p.id}
                proj={p}
                isMine
                onDeliver={d => handleDeliver(p, d)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Fila */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Icon name="Clock" size={15} color="#B45309" />
          <span style={{ fontWeight: 700, fontSize: 14, color: '#B45309' }}>
            Aguardando ({queue.length})
          </span>
          <span className="muted" style={{ fontSize: 11.5 }}>— primeiro a chegar, primeiro a sair</span>
        </div>

        {queue.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <Icon name="CheckCircle2" size={42} color="#15803D" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Fila vazia!</div>
            <p className="muted" style={{ fontSize: 13 }}>Nenhum projeto aguardando. Bom trabalho!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {queue.map((p, idx) => (
              <div key={p.id} style={{ position: 'relative' }}>
                {/* Número na fila */}
                <div style={{
                  position: 'absolute', top: 16, left: -36, width: 26, height: 26, borderRadius: '50%',
                  background: idx === 0 ? '#B45309' : 'var(--bg-2)',
                  border: `1.5px solid ${idx === 0 ? '#B45309' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: idx === 0 ? '#fff' : 'var(--text-2)',
                  zIndex: 1,
                }}>
                  {idx + 1}
                </div>
                <ProjectCard
                  proj={p}
                  isMine={false}
                  onTake={working === p.id ? undefined : () => handleTake(p)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
