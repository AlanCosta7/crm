import { useState } from 'react';
import anime from 'animejs';
import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import type { Deal, Seller } from '../../types/crm';
import { Av } from '../../components/ui/Av';
import { Icon } from '../../components/ui/Icon';
import { fmtCurrency, sellerById } from '../../utils/crmFormat';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { matchesProductId } from '../../utils/productScope';

const TASK_DEFS = [
  { k: 'e' as const, icon: 'Mail', color: '#1A6B1A', bg: 'var(--primary-light)', label: 'Email', pts: 15 },
  { k: 'w' as const, icon: 'MessageCircle', color: '#25D366', bg: '#DCFCE7', label: 'WhatsApp', pts: 20 },
  { k: 'm' as const, icon: 'Calendar', color: '#F59E0B', bg: '#FEF3C7', label: 'Reunião', pts: 30 },
];

interface ToastItem {
  id: string;
  pts: number;
  label: string;
}

export function TasksPage() {
  const [filter, setFilter] = useState<'pendentes' | 'concluidas' | 'todas'>('pendentes');
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const { user } = useAuthStore();
  const ui = useUIStore();
  const productScope = ui.productScope ?? ui.productId;
  const { data: deals } = useFirestoreCollection<Deal>('deals');
  const { data: sellers } = useFirestoreCollection<Seller>('sellers');
  const { updateDocument } = useFirestoreMutations('deals');

  const productDeals = deals.filter(d => matchesProductId(productScope, d.productId || 'wizmart'));
  const myDeals = user?.role === 'master'
    ? productDeals
    : productDeals.filter(d => d.owner === user?.uid);

  const filteredDeals = myDeals.filter(d => {
    const hasPending = !d.tasks.e || !d.tasks.w || !d.tasks.m;
    const allDone = d.tasks.e && d.tasks.w && d.tasks.m;
    if (filter === 'pendentes') return hasPending;
    if (filter === 'concluidas') return allDone;
    return true;
  });

  const totalPending = myDeals.reduce((acc, d) =>
    acc + (!d.tasks.e ? 1 : 0) + (!d.tasks.w ? 1 : 0) + (!d.tasks.m ? 1 : 0), 0);

  const totalDone = myDeals.reduce((acc, d) =>
    acc + (d.tasks.e ? 1 : 0) + (d.tasks.w ? 1 : 0) + (d.tasks.m ? 1 : 0), 0);

  const totalPts = myDeals.reduce((acc, d) =>
    acc + (d.tasks.e ? 15 : 0) + (d.tasks.w ? 20 : 0) + (d.tasks.m ? 30 : 0), 0);

  const triggerToast = (pts: number, label: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, pts, label }]);
    setTimeout(() => {
      const toastEl = document.getElementById(`task-toast-${id}`);
      const fillEl = document.getElementById(`task-tbar-${id}`);
      if (toastEl && fillEl) {
        const tl = anime.timeline({ easing: 'easeOutElastic(1, .8)' });
        tl.add({ targets: toastEl, translateX: [220, 0], opacity: [0, 1], duration: 650 })
          .add({
            targets: fillEl, scaleX: [1, 0], duration: 2500, easing: 'linear',
            changeBegin: () => { fillEl.style.transformOrigin = 'left'; },
          });
      }
    }, 20);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  };

  const handleComplete = async (deal: Deal, key: 'e' | 'w' | 'm', pts: number, label: string) => {
    if (deal.tasks[key]) return;
    anime({ targets: `#task-chk-${deal.id}-${key}`, scale: [0.8, 1.2, 1], duration: 400, easing: 'easeOutElastic(1, .5)' });
    try {
      await updateDocument(deal.id, { tasks: { ...deal.tasks, [key]: true } });
      triggerToast(pts, label);
    } catch (err) {
      console.error('Erro ao completar tarefa:', err);
    }
  };

  const chips = [
    { k: 'pendentes' as const, label: 'Pendentes', count: totalPending },
    { k: 'concluidas' as const, label: 'Concluídas', count: totalDone },
    { k: 'todas' as const, label: 'Todos os negócios', count: myDeals.length },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="h1">Tarefas Gamificadas</h1>
          <p className="muted" style={{ marginTop: 2, fontSize: 13 }}>
            Conclua as atividades comerciais e acumule pontos no ranking.
          </p>
        </div>
        <div className="card" style={{ padding: '8px 18px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span className="label" style={{ fontSize: 11 }}>Pts acumulados</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
            {totalPts}
          </span>
        </div>
      </div>

      <div className="chips">
        {chips.map(c => (
          <button key={c.k} className={`chip ${filter === c.k ? 'on' : ''}`} onClick={() => setFilter(c.k)}>
            {c.label}
            <span className="badge" style={{ marginLeft: 5, background: filter === c.k ? 'rgba(255,255,255,0.3)' : 'var(--border)', color: filter === c.k ? '#fff' : 'var(--text-2)', fontSize: 11, height: 18, padding: '0 6px' }}>
              {c.count}
            </span>
          </button>
        ))}
      </div>

      {filteredDeals.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Icon name="CheckSquare" size={30} color="var(--accent)" />
          </div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>
            {filter === 'pendentes' ? 'Nenhuma tarefa pendente!' : 'Nenhum negócio encontrado'}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {filter === 'pendentes' ? 'Parabéns! Todas as tarefas estão em dia.' : 'Crie negócios no pipeline para gerar tarefas.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredDeals.map(deal => {
            const seller = sellerById(sellers, deal.owner);
            const doneCount = (deal.tasks.e ? 1 : 0) + (deal.tasks.w ? 1 : 0) + (deal.tasks.m ? 1 : 0);
            const pct = Math.round((doneCount / 3) * 100);

            return (
              <div key={deal.id} className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{deal.name}</span>
                    <span className="muted" style={{ fontSize: 12.5 }}>{deal.company} · {fmtCurrency(deal.value)}</span>
                  </div>
                  <div className="row" style={{ gap: 10 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <Av initials={seller.initials} color={seller.color} size={22} />
                      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{seller.name.split(' ')[0]}</span>
                    </div>
                    <span className="badge badge-gray" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {doneCount}/3
                    </span>
                  </div>
                </div>

                <div className="prog">
                  <div className="fill" style={{ width: pct + '%', transition: 'width 0.4s ease' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {TASK_DEFS.map(def => {
                    const done = deal.tasks[def.k];
                    return (
                      <button
                        key={def.k}
                        id={`task-chk-${deal.id}-${def.k}`}
                        onClick={() => handleComplete(deal, def.k, def.pts, def.label)}
                        disabled={done}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                          borderRadius: 8, border: done ? 'none' : '1.5px solid var(--border)',
                          background: done ? def.bg : '#fff', cursor: done ? 'default' : 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { if (!done) (e.currentTarget as HTMLElement).style.borderColor = def.color; }}
                        onMouseLeave={e => { if (!done) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: done ? def.color : 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon name={done ? 'Check' : def.icon} size={16} color={done ? '#fff' : def.color} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left' }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: done ? def.color : 'var(--text-primary)' }}>{def.label}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>{done ? 'Concluído' : `+${def.pts} pts`}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} id={`task-toast-${t.id}`} className="toast" style={{ background: 'var(--primary)', opacity: 0, transform: 'translateX(60px)' }}>
            <div className="tmsg">
              <Icon name="Zap" size={18} color="#FFE08A" />
              <span>+{t.pts} pts — {t.label} registrado!</span>
            </div>
            <div id={`task-tbar-${t.id}`} className="tbar" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default TasksPage;
