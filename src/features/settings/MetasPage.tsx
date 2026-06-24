/**
 * MetasPage.tsx — Configuração de metas por usuário (admin)
 *
 * Rota: /settings/metas (master + manager)
 *
 * Permite ao administrador definir:
 *  - activitiesPerDay  — meta diária de atividades (SDR)
 *  - visitsPerMonth    — meta mensal de visitas (Rep)
 *  - meetingsPerMonth  — meta mensal de reuniões (SDR)
 *  - conquestsPerMonth — meta mensal de conquistas (Rep)
 *
 * Default: activitiesPerDay = 4 para novos SDRs.
 * Salva em `user_goals/{userId}` no Firestore.
 */

import { useState, useMemo } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useFirestoreCollection } from '../../hooks/useFirestore';
import type { SettingUser, UserGoal } from '../../types/crm';
import { Icon } from '../../components/ui/Icon';
import { useAuthStore } from '../../stores/authStore';
import { Av } from '../../components/ui/Av';

// ── Configuração de campos por role ──────────────────────────────────────────

const SDR_FIELDS = [
  { key: 'activitiesPerDay',  label: 'Atividades/dia',    min: 1, max: 30, icon: 'Zap'       },
  { key: 'meetingsPerMonth',  label: 'Reuniões/mês',      min: 0, max: 60, icon: 'Calendar'  },
] as const;

const REP_FIELDS = [
  { key: 'visitsPerMonth',    label: 'Visitas/mês',       min: 0, max: 60, icon: 'MapPin'    },
  { key: 'conquestsPerMonth', label: 'Conquistas/mês',    min: 0, max: 30, icon: 'Trophy'    },
] as const;

type GoalKey = 'activitiesPerDay' | 'meetingsPerMonth' | 'visitsPerMonth' | 'conquestsPerMonth';

const DEFAULTS: Record<GoalKey, number> = {
  activitiesPerDay:  4,
  meetingsPerMonth:  8,
  visitsPerMonth:    10,
  conquestsPerMonth: 2,
};

// ── Componente principal ──────────────────────────────────────────────────────

export default function MetasPage() {
  const { user } = useAuthStore();
  const { data: allUsers }  = useFirestoreCollection<SettingUser>('users');
  const { data: userGoals } = useFirestoreCollection<UserGoal>('user_goals');

  const [saving, setSaving]   = useState<Record<string, boolean>>({});
  const [saved,  setSaved]    = useState<Record<string, boolean>>({});
  const [edits,  setEdits]    = useState<Record<string, Partial<Record<GoalKey, number>>>>({});
  const [filterRole, setFilterRole] = useState<'all' | 'sdr' | 'rep'>('all');

  // Filtra usuários operacionais (SDR e Rep)
  const targetUsers = useMemo(
    () => allUsers
      .filter(u => (u.role === 'sdr' || u.role === 'rep') && u.isActive !== false)
      .filter(u => filterRole === 'all' || u.role === filterRole),
    [allUsers, filterRole],
  );

  // Mapa userId → UserGoal
  const goalsMap = useMemo(
    () => Object.fromEntries(userGoals.map(g => [g.userId, g])),
    [userGoals],
  );

  const getVal = (userId: string, key: GoalKey): number => {
    if (edits[userId]?.[key] !== undefined) return edits[userId][key]!;
    return goalsMap[userId]?.[key] ?? DEFAULTS[key];
  };

  const setEdit = (userId: string, key: GoalKey, val: number) => {
    setEdits(prev => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? {}), [key]: Math.max(0, val) },
    }));
  };

  const saveUser = async (u: SettingUser) => {
    if (!user || !u.id) return;
    setSaving(p => ({ ...p, [u.id!]: true }));
    try {
      const fields: Partial<UserGoal> = {
        userId: u.id!,
        role: u.role as 'sdr' | 'rep',
        updatedBy: user.uid ?? '',
        updatedAt: serverTimestamp() as any,
      };
      const keys: GoalKey[] = u.role === 'sdr'
        ? ['activitiesPerDay', 'meetingsPerMonth']
        : ['visitsPerMonth', 'conquestsPerMonth'];
      for (const k of keys) fields[k] = getVal(u.id!, k);

      await setDoc(doc(db, 'user_goals', u.id!), fields, { merge: true });
      setSaved(p => ({ ...p, [u.id!]: true }));
      setTimeout(() => setSaved(p => ({ ...p, [u.id!]: false })), 2500);
      setEdits(p => { const next = { ...p }; delete next[u.id!]; return next; });
    } finally {
      setSaving(p => ({ ...p, [u.id!]: false }));
    }
  };

  const isDirty = (userId: string) => Object.keys(edits[userId] ?? {}).length > 0;

  const roleColor = (role: string) => role === 'sdr' ? '#B45309' : '#B91C1C';
  const roleBg    = (role: string) => role === 'sdr' ? '#FEF3C7' : '#FEE2E2';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 820, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>Metas por Usuário</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            Configure as metas individuais de atividades, visitas e conquistas. Padrão: {DEFAULTS.activitiesPerDay} ativ./dia.
          </p>
        </div>
        <div className="seg">
          <button className={filterRole === 'all' ? 'on' : ''} onClick={() => setFilterRole('all')}>Todos</button>
          <button className={filterRole === 'sdr' ? 'on' : ''} onClick={() => setFilterRole('sdr')}>SDR</button>
          <button className={filterRole === 'rep' ? 'on' : ''} onClick={() => setFilterRole('rep')}>Rep</button>
        </div>
      </div>

      {/* Legenda de campos */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[...SDR_FIELDS, ...REP_FIELDS].map(f => (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
            <Icon name={f.icon as any} size={13} />
            <span>{f.label}</span>
          </div>
        ))}
      </div>

      {/* Tabela de usuários */}
      {targetUsers.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <Icon name="Users" size={36} color="var(--text-3)" style={{ margin: '0 auto 12px' }} />
          <p className="muted">Nenhum usuário SDR ou Rep encontrado.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {targetUsers.map(u => {
            const fields = u.role === 'sdr' ? SDR_FIELDS : REP_FIELDS;
            const dirty  = isDirty(u.id ?? '');
            const isSaving = saving[u.id ?? ''];
            const wasSaved = saved[u.id ?? ''];

            return (
              <div
                key={u.id}
                className="card"
                style={{
                  padding: '16px 20px',
                  border: `1.5px solid ${dirty ? 'var(--primary)' : 'var(--border)'}`,
                  transition: 'border-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>

                  {/* Avatar + nome */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
                    <Av initials={u.initials} color={u.color} size={36} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{u.name}</div>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 100,
                        background: roleBg(u.role), color: roleColor(u.role),
                      }}>
                        {u.role.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Campos numéricos */}
                  <div style={{ display: 'flex', gap: 14, flex: 1, flexWrap: 'wrap' }}>
                    {fields.map(f => (
                      <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Icon name={f.icon as any} size={11} /> {f.label}
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            className="icon-btn"
                            style={{ width: 26, height: 26, border: '1px solid var(--border)', borderRadius: 6, flexShrink: 0 }}
                            onClick={() => setEdit(u.id!, f.key, getVal(u.id!, f.key) - 1)}
                          >
                            <Icon name="Minus" size={11} />
                          </button>
                          <input
                            type="number"
                            min={f.min}
                            max={f.max}
                            value={getVal(u.id!, f.key)}
                            onChange={e => setEdit(u.id!, f.key, parseInt(e.target.value, 10) || 0)}
                            style={{
                              width: 52, textAlign: 'center', fontWeight: 700, fontSize: 14,
                              border: '1px solid var(--border)', borderRadius: 6, padding: '4px 0',
                              background: 'var(--card)', color: 'var(--text)',
                            }}
                          />
                          <button
                            className="icon-btn"
                            style={{ width: 26, height: 26, border: '1px solid var(--border)', borderRadius: 6, background: '#F0F7F0', flexShrink: 0 }}
                            onClick={() => setEdit(u.id!, f.key, getVal(u.id!, f.key) + 1)}
                          >
                            <Icon name="Plus" size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Botão salvar */}
                  <button
                    className="btn btn-sm"
                    style={{
                      background: wasSaved ? '#15803D' : dirty ? 'var(--primary)' : 'var(--bg-2)',
                      color: wasSaved || dirty ? '#fff' : 'var(--text-3)',
                      border: 'none',
                      cursor: dirty || wasSaved ? 'pointer' : 'default',
                      transition: 'all 0.2s',
                      minWidth: 80,
                    }}
                    onClick={() => dirty && saveUser(u)}
                    disabled={isSaving || (!dirty && !wasSaved)}
                  >
                    {isSaving
                      ? <Icon name="Loader2" size={13} style={{ animation: 'spin 1s linear infinite' }} />
                      : wasSaved
                        ? <><Icon name="Check" size={13} /> Salvo!</>
                        : <><Icon name="Save" size={13} /> {dirty ? 'Salvar' : 'Ok'}</>
                    }
                  </button>
                </div>

                {/* Indicador de meta atual gravada */}
                {!dirty && goalsMap[u.id ?? ''] && (
                  <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-2)', display: 'flex', gap: 14 }}>
                    {fields.map(f => (
                      <span key={f.key}>
                        {f.label}: <strong>{goalsMap[u.id ?? '']?.[f.key] ?? DEFAULTS[f.key]}</strong>
                        {!goalsMap[u.id ?? '']?.[f.key] && <span style={{ color: 'var(--text-3)' }}> (padrão)</span>}
                      </span>
                    ))}
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
