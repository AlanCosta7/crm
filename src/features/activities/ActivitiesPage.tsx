/**
 * ActivitiesPage.tsx — duas telas com o mesmo nome, finalmente separadas
 *
 * Fase 2 do PLANO_DESENHO_CRM.md (slides 6 e 9). O deck pedia que esta página
 * mostrasse a FILA DO DIA em blocos de horário, mas ela era (e continua sendo,
 * na aba Histórico) um FEED do que já aconteceu. São necessidades diferentes:
 *
 *   Meu Dia   → o que precisa acontecer hoje, agrupado por bloco de horário.
 *               É a tela que o SDR abre ao entrar no CRM (slide 9).
 *   Histórico → a timeline de tudo que já foi registrado. O comportamento
 *               anterior desta página, intacto.
 *
 * O escopo por papel continua o de jul/2026: o SDR vê só as próprias
 * atividades; gestão e BDR veem o time todo (e abrem "Meu Dia" em leitura).
 */

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useFirestoreCollection } from '../../hooks/useFirestore';
import type { ActivityFeedItem, Seller } from '../../types/crm';
import { Av } from '../../components/ui/Av';
import { Icon } from '../../components/ui/Icon';
import { sellerById } from '../../utils/crmFormat';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { matchesProductId } from '../../utils/productScope';
import { MeuDiaPanel } from './MeuDiaPanel';
import { DEFAULT_TIME_BLOCKS, normalizeTimeBlocks, type TimeBlockDef } from '../../utils/timeBlocks';
import { getTodayBRT } from '../../utils/cadenceUtils';

const ACT_ICON: Record<string, { i: string; c: string }> = {
  win: { i: 'Trophy', c: '#1A6B1A' },
  whatsapp: { i: 'MessageCircle', c: '#25D366' },
  meeting: { i: 'Calendar', c: '#F59E0B' },
  email: { i: 'Mail', c: '#1A6B1A' },
  note: { i: 'StickyNote', c: '#6B7280' },
  call: { i: 'Phone', c: '#F59E0B' },
  linkedin: { i: 'Linkedin', c: '#0077B5' },
  visit: { i: 'MapPin', c: '#3B82F6' },
  // Tarefas da régua de agenda (Fase 3) — follow-up e confirmação de compromisso.
  agenda: { i: 'CalendarCheck', c: '#B45309' },
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

  // Cada SDR vê apenas as próprias atividades (Observações do cliente, jul/2026).
  // Gestão, BDR e demais papéis continuam vendo o time todo.
  const isSdr = user?.role === 'sdr';

  // O SDR abre na fila do dia (slide 9); quem não tem fila própria abre no
  // histórico, que é o que interessa a gestão e BDR.
  const [tab, setTab] = useState<'dia' | 'historico'>(isSdr ? 'dia' : 'historico');

  // Blocos de horário configurados pelo admin em settings/cadence. A leitura é
  // liberada a todo o tenant justamente para esta tela (ver firestore.rules).
  const [blocks, setBlocks] = useState<TimeBlockDef[]>(DEFAULT_TIME_BLOCKS);
  useEffect(() => {
    if (!user?.tenantId) return;
    const ref = doc(db, 'tenants', user.tenantId, 'settings', 'cadence');
    return onSnapshot(
      ref,
      snap => setBlocks(normalizeTimeBlocks(snap.data()?.sdr?.timeBlocks)),
      err => console.warn('[ActivitiesPage] Não foi possível ler os blocos de horário:', err),
    );
  }, [user?.tenantId]);

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

  const scopedActivities = allActivities
    .filter(a => matchesProductId(productScope, a.productId || 'wizmart'))
    .filter(a => !isSdr || actorId(a) === user?.uid)
    .sort((x, y) => {
      const t = (a: any) => a.createdAt?.toDate?.()?.getTime?.() ?? 0;
      return t(y) - t(x);
    });
  // Fila do dia: só as atividades DE HOJE e DO PRÓPRIO usuário. `scheduledAt`
  // é o horário do bloco (gravado pelo motor); atividades anteriores à Fase 2
  // não têm bloco e caem no balde "Sem horário" do painel.
  const minhasDeHoje = useMemo(() => {
    const hoje = getTodayBRT();
    const diaDe = (v: unknown): string => {
      const d = (v as { toDate?: () => Date })?.toDate?.() ?? (v ? new Date(v as string) : null);
      return d && !Number.isNaN(d.getTime()) ? getTodayBRT(d) : '';
    };
    return allActivities
      .filter(a => actorId(a) === user?.uid)
      .filter(a => a.type !== 'note' && a.type !== 'win')
      .filter(a => {
        const ref = (a as any).scheduledAt ?? (a as any).dueAt ?? (a as any).completedAt ?? (a as any).createdAt;
        return diaDe(ref) === hoje;
      })
      .sort((x, y) => {
        const t = (a: any) => a.scheduledAt?.toDate?.()?.getTime?.() ?? 0;
        return t(x) - t(y);
      });
  }, [allActivities, user?.uid]);

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
            {tab === 'dia'
              ? (isSdr
                  ? 'A fila de hoje, na ordem dos blocos de horário definidos pela gestão.'
                  : 'Sua fila de hoje. A fila de cada SDR aparece no painel dele.')
              : (isSdr
                  ? 'Suas atividades: cadência do dia, follow-ups de Standby e registros nos seus leads.'
                  : 'Histórico de todas as interações comerciais do time.')}
          </p>
        </div>
        <span className="badge badge-gray" style={{ height: 28, padding: '0 12px', fontSize: 13 }}>
          {tab === 'dia' ? `${minhasDeHoje.length} hoje` : `${filtered.length} registros`}
        </span>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'dia' ? 'active' : ''}`} onClick={() => setTab('dia')}>
          Meu Dia
          {minhasDeHoje.filter(a => a.status !== 'completed').length > 0 && (
            <span className="badge badge-primary" style={{ marginLeft: 6, fontSize: 10 }}>
              {minhasDeHoje.filter(a => a.status !== 'completed').length}
            </span>
          )}
        </button>
        <button className={`tab ${tab === 'historico' ? 'active' : ''}`} onClick={() => setTab('historico')}>
          Histórico
        </button>
      </div>

      {tab === 'dia' ? (
        <MeuDiaPanel activities={minhasDeHoje} blocks={blocks} readOnly={!isSdr} />
      ) : (
      <>
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
      </>
      )}
    </div>
  );
}

export default ActivitiesPage;
