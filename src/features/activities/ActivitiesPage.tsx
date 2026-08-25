import { useState } from 'react';
import { useFirestoreCollection } from '../../hooks/useFirestore';
import type { ActivityFeedItem, Seller } from '../../types/crm';
import { Av } from '../../components/ui/Av';
import { Icon } from '../../components/ui/Icon';
import { sellerById } from '../../utils/crmFormat';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { matchesProductId } from '../../utils/productScope';

const ACT_ICON: Record<string, { i: string; c: string }> = {
  win: { i: 'Trophy', c: '#1A6B1A' },
  whatsapp: { i: 'MessageCircle', c: '#25D366' },
  meeting: { i: 'Calendar', c: '#F59E0B' },
  email: { i: 'Mail', c: '#1A6B1A' },
  note: { i: 'StickyNote', c: '#6B7280' },
  call: { i: 'Phone', c: '#F59E0B' },
  linkedin: { i: 'Linkedin', c: '#0077B5' },
  visit: { i: 'MapPin', c: '#3B82F6' },
};

const ACT_FILTERS = ['Todos', 'Ligação', 'LinkedIn', 'WhatsApp', 'Email', 'Reunião', 'Ganho', 'Nota'];
const ACT_FILTER_MAP: Record<string, string> = {
  'Ligação': 'call', LinkedIn: 'linkedin', Email: 'email', WhatsApp: 'whatsapp', 'Reunião': 'meeting', Ganho: 'win', Nota: 'note',
};

export function ActivitiesPage() {
  const [filter, setFilter] = useState('Todos');
  const { user } = useAuthStore();
  const ui = useUIStore();
  const productScope = ui.productScope ?? ui.productId;

  // Coleção real (cadência, standby, handoff, notas) + feed legado v1
  const { data: legacyFeed, loading } = useFirestoreCollection<ActivityFeedItem>('activity');
  const { data: realActivities } = useFirestoreCollection<ActivityFeedItem>('activities');
  const { data: sellers } = useFirestoreCollection<Seller>('sellers');

  // Cloud Functions gravam `userId`; protótipo antigo usava `who` — suporta ambos
  const actorId = (a: ActivityFeedItem) => (a as any).userId || a.who || '';
  const getSellerForActivity = (a: ActivityFeedItem) => sellerById(sellers, actorId(a));

  // Merge das duas coleções (dedupe por id)
  const seen = new Set<string>();
  const allActivities = [...(realActivities ?? []), ...(legacyFeed ?? [])].filter(a => {
    const key = a.id ?? Math.random().toString(36);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Cada SDR vê apenas as próprias atividades (Observações do cliente, jul/2026).
  // Gestão, BDR e demais papéis continuam vendo o time todo.
  const isSdr = user?.role === 'sdr';

  const scopedActivities = allActivities
    .filter(a => matchesProductId(productScope, a.productId || 'wizmart'))
    .filter(a => !isSdr || actorId(a) === user?.uid)
    .sort((x, y) => {
      const t = (a: any) => a.createdAt?.toDate?.()?.getTime?.() ?? 0;
      return t(y) - t(x);
    });
  const filtered = filter === 'Todos'
    ? scopedActivities
    : scopedActivities.filter(a => a.type === ACT_FILTER_MAP[filter]);

  // Formata timestamp do Firestore ou string legível
  const fmtTime = (a: ActivityFeedItem) => {
    if ((a as any).createdAt?.toDate) {
      return (a as any).createdAt.toDate().toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    return a.time || '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="h1">Atividades</h1>
          <p className="muted" style={{ marginTop: 2, fontSize: 13 }}>
            {isSdr
              ? 'Suas atividades: cadência do dia, follow-ups de Standby e registros nos seus leads.'
              : 'Histórico de todas as interações comerciais do time.'}
          </p>
        </div>
        <span className="badge badge-gray" style={{ height: 28, padding: '0 12px', fontSize: 13 }}>
          {filtered.length} registros
        </span>
      </div>

      <div className="chips">
        {ACT_FILTERS.map(f => (
          <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }} className="muted">
            Carregando timeline de atividades...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Icon name="Activity" size={36} color="var(--primary)" style={{ margin: '0 auto 12px' }} />
            <div className="muted" style={{ fontWeight: 600 }}>Nenhuma atividade registrada</div>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              As atividades aparecem automaticamente quando tarefas são concluídas no pipeline.
            </p>
          </div>
        ) : (
          <div style={{ padding: '8px 20px' }}>
            <div className="tl">
              {filtered.map((a, i) => {
                const s = getSellerForActivity(a);
                const ic = ACT_ICON[a.type] || { i: 'StickyNote', c: '#6B7280' };
                return (
                  <div key={a.id || i} className="tl-item">
                    <div className="tl-ic" style={{ background: ic.c }}>
                      <Icon name={ic.i} size={15} />
                    </div>
                    <div className="tl-body">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {s.name !== 'Desconhecido' && (
                          <Av initials={s.initials} color={s.color} size={22} />
                        )}
                        <div>
                          <strong>{s.name}</strong>{' '}
                          {a.text ?? (a as any).notes ?? `${(a as any).companyName ? `— ${(a as any).companyName}` : 'atividade registrada'}`}
                          {a.val && (
                            <span style={{ color: 'var(--primary)', fontWeight: 700 }}> {a.val}</span>
                          )}
                          {(a as any).cadenceType === 'standby' && (
                            <span className="badge" style={{ marginLeft: 6, background: '#FEF3C7', color: '#92400E', fontSize: 10 }}>
                              ⏸ Standby {(a as any).standbyIndex}/{(a as any).standbyTotal}
                            </span>
                          )}
                          {(a as any).status === 'pending' && (
                            <span className="badge" style={{ marginLeft: 6, background: '#FEF3C7', color: '#B45309', fontSize: 10 }}>Agendada</span>
                          )}
                          {(a as any).status === 'overdue' && (
                            <span className="badge" style={{ marginLeft: 6, background: '#FEE2E2', color: '#B91C1C', fontSize: 10 }}>Atrasada</span>
                          )}
                        </div>
                      </div>
                      <div className="tl-time">{fmtTime(a)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ActivitiesPage;
