/**
 * CadenceConfigPage.tsx — Programação manual da cadência (gestão)
 *
 * Rota: /settings/cadencia (master + manager)
 * Pedido do cliente (Observações CRM, jul/2026): "Programar a cadência
 * manualmente para SDRs e representantes."
 *
 * Salva em `tenants/{tid}/settings/cadence`:
 *   sdr.newCardsPerDay      — máximo de cards novos por dia (padrão 3)
 *   sdr.weeklyContacts      — contatos por semana de vida do lead (padrão [3,2,1])
 *   rep.firstContactBusinessDays — SLA do 1º contato do Rep (padrão 3 dias úteis)
 *
 * O motor de cadência (dailyCadenceEngine, 7h BRT) e o repSlaChecker leem
 * esta configuração a cada execução.
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuthStore } from '../../stores/authStore';
import { Icon } from '../../components/ui/Icon';
import {
  SDR_ACTIVITY_TYPES, ACTIVITY_TYPE_CONFIG, PERIOD_LABEL, DAY_OFFSET_OPTIONS, dayOffsetLabel,
  DEFAULT_PERIOD_TIMES, type Period, type SequenceStep, type PeriodTimes,
} from '../../utils/cadenceUtils';

const DEFAULTS = { newCardsPerDay: 3, weeklyContacts: [3, 2, 1], repSla: 3 };

const LEGACY_SEQUENCE: SequenceStep[] = SDR_ACTIVITY_TYPES.map(type => ({ type, dayOffset: 0, period: 'manha' as Period }));

export default function CadenceConfigPage() {
  const { user } = useAuthStore();

  const [newCardsPerDay, setNewCardsPerDay] = useState(DEFAULTS.newCardsPerDay);
  const [week1, setWeek1] = useState(DEFAULTS.weeklyContacts[0]);
  const [week2, setWeek2] = useState(DEFAULTS.weeklyContacts[1]);
  const [week3, setWeek3] = useState(DEFAULTS.weeklyContacts[2]);
  const [repSla, setRepSla] = useState(DEFAULTS.repSla);
  const [periodTimes, setPeriodTimes] = useState<PeriodTimes>(DEFAULT_PERIOD_TIMES);
  const [sequence, setSequence] = useState<SequenceStep[]>(LEGACY_SEQUENCE);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null);

  useEffect(() => {
    if (!user?.tenantId) return;
    const ref = doc(db, 'tenants', user.tenantId, 'settings', 'cadence');
    const unsub = onSnapshot(ref, snap => {
      const d = snap.data();
      if (d) {
        setNewCardsPerDay(d.sdr?.newCardsPerDay ?? DEFAULTS.newCardsPerDay);
        const wc = Array.isArray(d.sdr?.weeklyContacts) ? d.sdr.weeklyContacts : DEFAULTS.weeklyContacts;
        setWeek1(wc[0] ?? 3); setWeek2(wc[1] ?? 2); setWeek3(wc[2] ?? 1);
        setRepSla(d.rep?.firstContactBusinessDays ?? DEFAULTS.repSla);
        setPeriodTimes(d.sdr?.periodTimes ?? DEFAULT_PERIOD_TIMES);
        const seq = Array.isArray(d.sdr?.sequence) && d.sdr.sequence.length === SDR_ACTIVITY_TYPES.length
          ? d.sdr.sequence
          : LEGACY_SEQUENCE;
        setSequence(seq);
      }
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [user?.tenantId]);

  const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const isValidPeriodTimes = (['manha', 'tarde', 'fim_dia'] as Period[]).every(p => HHMM_RE.test(periodTimes[p]));

  const moveStep = (index: number, dir: -1 | 1) => {
    setSequence(prev => {
      const next = prev.slice();
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const updateStep = (index: number, patch: Partial<SequenceStep>) => {
    setSequence(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  };

  const handleSave = async () => {
    if (!user?.tenantId) return;
    if (!isValidPeriodTimes) { setFeedback('error'); return; }
    setSaving(true);
    setFeedback(null);
    try {
      await setDoc(doc(db, 'tenants', user.tenantId, 'settings', 'cadence'), {
        sdr: {
          newCardsPerDay: clamp(newCardsPerDay, 0, 10),
          weeklyContacts: [clamp(week1, 0, 7), clamp(week2, 0, 7), clamp(week3, 0, 7)],
          periodTimes,
          sequence,
        },
        rep: { firstContactBusinessDays: clamp(repSla, 1, 15) },
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      }, { merge: true });
      setFeedback('saved');
    } catch (err) {
      console.error('[CadenceConfigPage] Erro ao salvar:', err);
      setFeedback('error');
    } finally {
      setSaving(false);
    }
  };

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v || 0)));

  const NumField = ({ label, hint, value, onChange, min, max }: {
    label: string; hint: string; value: number; onChange: (v: number) => void; min: number; max: number;
  }) => (
    <div className="field" style={{ margin: 0 }}>
      <div className="fl">{label}</div>
      <input
        className="input"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ maxWidth: 120 }}
      />
      <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{hint}</p>
    </div>
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h1 className="h1">Programação da Cadência</h1>
        {[0, 1].map(i => <div key={i} className="sk" style={{ height: 180, borderRadius: 10 }} />)}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>
      <div>
        <h1 className="h1">Programação da Cadência</h1>
        <p className="muted" style={{ marginTop: 2, fontSize: 13 }}>
          As mudanças valem a partir da próxima distribuição diária (7h, horário de Brasília).
        </p>
      </div>

      {/* SDR */}
      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="row" style={{ gap: 8 }}>
          <Icon name="ListChecks" size={18} color="var(--primary)" />
          <h3 style={{ margin: 0 }}>Cadência dos SDRs</h3>
        </div>

        <NumField
          label="Novos cards por dia"
          hint="Máximo de leads novos distribuídos por SDR a cada manhã. A quantidade real depende da taxa de conclusão do dia anterior."
          value={newCardsPerDay} onChange={setNewCardsPerDay} min={0} max={10}
        />

        <div>
          <div className="fl" style={{ marginBottom: 8 }}>Contatos de follow-up por semana do lead</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 440 }}>
            {[
              { label: '1ª semana', value: week1, set: setWeek1 },
              { label: '2ª semana', value: week2, set: setWeek2 },
              { label: '3ª semana', value: week3, set: setWeek3 },
            ].map(w => (
              <div key={w.label} className="card" style={{ padding: '10px 12px', textAlign: 'center' }}>
                <div className="label" style={{ fontSize: 10.5, marginBottom: 6 }}>{w.label}</div>
                <input
                  className="input"
                  type="number" min={0} max={7}
                  value={w.value}
                  onChange={e => w.set(Number(e.target.value))}
                  style={{ textAlign: 'center' }}
                />
                <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>contatos</div>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Régua decrescente padrão: 3 contatos na 1ª semana do lead na fila, 2 na 2ª e 1 na 3ª.
            Os contatos usam os canais prioritários em rodízio (ligação → LinkedIn → WhatsApp).
          </p>
        </div>
      </div>

      {/* Sequência de contato dos cards novos */}
      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="row" style={{ gap: 8 }}>
          <Icon name="ListOrdered" size={18} color="var(--primary)" />
          <h3 style={{ margin: 0 }}>Sequência de Contato dos Cards Novos</h3>
        </div>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
          Instrua os SDRs sobre em que dia e período executar cada canal de um card novo (ex.: e-mail e ligação
          hoje de manhã, LinkedIn à tarde, WhatsApp só amanhã no fim do dia). O SDR ainda pode adiantar uma etapa
          se quiser — isto orienta a ordem sugerida, não trava o botão.
        </p>

        {/* Horário dos períodos */}
        <div>
          <div className="fl" style={{ marginBottom: 8 }}>Horário dos períodos</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 440 }}>
            {(['manha', 'tarde', 'fim_dia'] as Period[]).map(p => (
              <div key={p} className="card" style={{ padding: '10px 12px', textAlign: 'center' }}>
                <div className="label" style={{ fontSize: 10.5, marginBottom: 6 }}>{PERIOD_LABEL[p]}</div>
                <input
                  className="input"
                  type="time"
                  value={periodTimes[p]}
                  onChange={e => setPeriodTimes(prev => ({ ...prev, [p]: e.target.value }))}
                  style={{ textAlign: 'center' }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Linhas por canal */}
        <div>
          <div className="fl" style={{ marginBottom: 8 }}>Ordem de execução e quando cada canal vence</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sequence.map((step, i) => {
              const cfg = ACTIVITY_TYPE_CONFIG[step.type];
              return (
                <div key={step.type} className="row" style={{ gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button className="icon-btn" style={{ width: 22, height: 16 }} disabled={i === 0} onClick={() => moveStep(i, -1)} aria-label="Mover pra cima">
                      <Icon name="ChevronUp" size={13} />
                    </button>
                    <button className="icon-btn" style={{ width: 22, height: 16 }} disabled={i === sequence.length - 1} onClick={() => moveStep(i, 1)} aria-label="Mover pra baixo">
                      <Icon name="ChevronDown" size={13} />
                    </button>
                  </div>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={cfg.icon} size={14} color={cfg.color} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 80 }}>{cfg.label}</span>
                  <select
                    className="input" style={{ maxWidth: 130 }}
                    value={step.dayOffset}
                    onChange={e => updateStep(i, { dayOffset: Number(e.target.value) })}
                  >
                    {DAY_OFFSET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <select
                    className="input" style={{ maxWidth: 170 }}
                    value={step.period}
                    onChange={e => updateStep(i, { period: e.target.value as Period })}
                  >
                    {(['manha', 'tarde', 'fim_dia'] as Period[]).map(p => (
                      <option key={p} value={p}>{PERIOD_LABEL[p]} ({periodTimes[p]})</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
          {!isValidPeriodTimes && (
            <p style={{ fontSize: 11.5, color: '#B91C1C', marginTop: 8 }}>Horário de período inválido — use o formato HH:mm.</p>
          )}
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            {sequence.map(s => `${ACTIVITY_TYPE_CONFIG[s.type].label} → ${dayOffsetLabel(s.dayOffset).toLowerCase()} às ${periodTimes[s.period]}`).join(' · ')}
          </p>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 4, alignSelf: 'flex-start' }} onClick={() => setSequence(LEGACY_SEQUENCE)}>
            <Icon name="RotateCcw" size={13} />Restaurar padrão
          </button>
        </div>
      </div>

      {/* Rep */}
      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="row" style={{ gap: 8 }}>
          <Icon name="UserCheck" size={18} color="#7C3AED" />
          <h3 style={{ margin: 0 }}>Cadência dos Representantes</h3>
        </div>
        <NumField
          label="SLA do 1º contato (dias úteis)"
          hint="Prazo máximo para o representante fazer o primeiro contato após aceitar a passagem de bastão. O monitor diário alerta a gestão quando estoura."
          value={repSla} onChange={setRepSla} min={1} max={15}
        />
      </div>

      {/* Salvar */}
      <div className="row" style={{ gap: 10 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Icon name="Save" size={15} />
          {saving ? 'Salvando...' : 'Salvar configuração'}
        </button>
        {feedback === 'saved' && (
          <span style={{ color: 'var(--primary)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="CheckCircle2" size={15} /> Salvo — vale a partir da próxima distribuição
          </span>
        )}
        {feedback === 'error' && (
          <span style={{ color: '#B91C1C', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="AlertTriangle" size={15} /> Não foi possível salvar. Tente novamente.
          </span>
        )}
      </div>
    </div>
  );
}
