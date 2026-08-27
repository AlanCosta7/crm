/**
 * CadenceConfigPage.tsx — Programação da cadência (gestão)
 *
 * Rota: /settings/cadencia (master + manager)
 * Pedido do cliente (Observações CRM, jul/2026): "Programar a cadência
 * manualmente para SDRs e representantes."
 *
 * Salva em `tenants/{tid}/settings/cadence`:
 *   sdr.newCardsPerDay           — máximo de cards novos por dia (padrão 3)
 *   sdr.steps                    — régua de contato do SDR (dia + canais)
 *   rep.firstContactBusinessDays — SLA do 1º contato do Rep (padrão 3 dias úteis)
 *
 * A régua vem pré-carregada com o padrão do documento "Cadência Comercial
 * SDRs do Dia 1 ao Dia 30" (confirmado com o Alan, 27/08/2026), mas master e
 * manager podem editar livremente (pedido do Alan, 27/08/2026).
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
  SDR_ACTIVITY_TYPES, ACTIVITY_TYPE_CONFIG, DEFAULT_SDR_CADENCE_STEPS, normalizeSteps,
  type ActivityType, type CadenceStepDef,
} from '../../utils/cadenceUtils';

const DEFAULTS = { newCardsPerDay: 3, repSla: 3 };
const MAX_STEP_DAY_OFFSET = 90;

/** Validação com mensagens específicas pro admin — mais amigável que o
 * fallback silencioso de `normalizeSteps` (usado só como rede de segurança). */
function validateSteps(steps: CadenceStepDef[]): string | null {
  if (steps.length === 0) return 'A régua precisa ter pelo menos 1 passo.';
  if (!steps.some(s => s.dayOffset === 0)) return 'É preciso ter um passo no Dia 0 (contato inicial, feito ao distribuir o card).';
  const seen = new Set<number>();
  for (const s of steps) {
    if (!Number.isInteger(s.dayOffset) || s.dayOffset < 0 || s.dayOffset > MAX_STEP_DAY_OFFSET) {
      return `O dia do passo precisa ser um número inteiro entre 0 e ${MAX_STEP_DAY_OFFSET}.`;
    }
    if (seen.has(s.dayOffset)) return `Já existe um passo no dia ${s.dayOffset} — cada dia só pode ter 1 passo.`;
    seen.add(s.dayOffset);
    if (s.types.length === 0) return `O passo do dia ${s.dayOffset} precisa de pelo menos 1 canal selecionado.`;
  }
  return null;
}

export default function CadenceConfigPage() {
  const { user } = useAuthStore();

  const [newCardsPerDay, setNewCardsPerDay] = useState(DEFAULTS.newCardsPerDay);
  const [repSla, setRepSla] = useState(DEFAULTS.repSla);
  const [steps, setSteps] = useState<CadenceStepDef[]>(DEFAULT_SDR_CADENCE_STEPS);

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
        setRepSla(d.rep?.firstContactBusinessDays ?? DEFAULTS.repSla);
        setSteps(normalizeSteps(d.sdr?.steps));
      }
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [user?.tenantId]);

  const stepsError = validateSteps(steps);

  const updateStep = (index: number, patch: Partial<CadenceStepDef>) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  };

  const toggleStepType = (index: number, type: ActivityType) => {
    setSteps(prev => prev.map((s, i) => {
      if (i !== index) return s;
      const types = s.types.includes(type) ? s.types.filter(t => t !== type) : [...s.types, type];
      return { ...s, types };
    }));
  };

  const removeStep = (index: number) => setSteps(prev => prev.filter((_, i) => i !== index));

  const addStep = () => {
    const nextOffset = steps.length ? Math.min(MAX_STEP_DAY_OFFSET, Math.max(...steps.map(s => s.dayOffset)) + 1) : 0;
    setSteps(prev => [...prev, { dayOffset: nextOffset, types: [], label: '' }]);
  };

  const handleSave = async () => {
    if (!user?.tenantId || stepsError) return;
    setSaving(true);
    setFeedback(null);
    try {
      const stepsToSave = steps
        .slice()
        .sort((a, b) => a.dayOffset - b.dayOffset)
        .map(s => ({ ...s, label: s.label.trim() || s.types.map(t => ACTIVITY_TYPE_CONFIG[t].label).join(' + ') }));
      await setDoc(doc(db, 'tenants', user.tenantId, 'settings', 'cadence'), {
        sdr: { newCardsPerDay: clamp(newCardsPerDay, 0, 10), steps: stepsToSave },
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
      </div>

      {/* Régua de contato — editável */}
      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div className="row" style={{ gap: 8 }}>
            <Icon name="ListOrdered" size={18} color="var(--primary)" />
            <h3 style={{ margin: 0 }}>Régua de Contato dos SDRs</h3>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
            Um passo por dia desde a distribuição do card (Dia 0). Cada passo nasce pro SDR no dia exato em que
            vence. Clique nos ícones pra escolher os canais de cada passo.
          </p>
        </div>

        {/* Legenda dos ícones — os botões de canal abaixo não têm texto, só o ícone */}
        <div className="row" style={{ gap: 14, flexWrap: 'wrap', padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 8 }}>
          {SDR_ACTIVITY_TYPES.map(type => {
            const cfg = ACTIVITY_TYPE_CONFIG[type];
            return (
              <div key={type} className="row" style={{ gap: 5 }}>
                <Icon name={cfg.icon} size={13} color={cfg.color} />
                <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{cfg.label}</span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {steps.map((step, i) => (
            <div key={i} className="row" style={{ gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, flexWrap: 'wrap' }}>
              <div className="field" style={{ margin: 0 }}>
                <div className="label" style={{ fontSize: 10 }}>Dia</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={MAX_STEP_DAY_OFFSET}
                  value={step.dayOffset}
                  onChange={e => updateStep(i, { dayOffset: Number(e.target.value) })}
                  style={{ width: 68, textAlign: 'center' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {SDR_ACTIVITY_TYPES.map(type => {
                  const cfg = ACTIVITY_TYPE_CONFIG[type];
                  const active = step.types.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      title={cfg.label}
                      onClick={() => toggleStepType(i, type)}
                      style={{
                        width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: active ? cfg.bg : 'var(--bg-2)',
                        border: `1.5px solid ${active ? cfg.color : 'var(--border)'}`,
                        opacity: active ? 1 : 0.5,
                        cursor: 'pointer',
                      }}
                    >
                      <Icon name={cfg.icon} size={14} color={active ? cfg.color : 'var(--text-2)'} />
                    </button>
                  );
                })}
              </div>

              <input
                className="input"
                placeholder={step.types.length ? step.types.map(t => ACTIVITY_TYPE_CONFIG[t].label).join(' + ') : 'Rótulo do passo'}
                value={step.label}
                onChange={e => updateStep(i, { label: e.target.value })}
                style={{ flex: 1, minWidth: 140 }}
              />

              <button
                type="button"
                className="icon-btn"
                onClick={() => removeStep(i)}
                title="Remover passo"
                style={{ flexShrink: 0 }}
              >
                <Icon name="Trash2" size={15} color="#B91C1C" />
              </button>
            </div>
          ))}
        </div>

        {stepsError && (
          <p style={{ fontSize: 11.5, color: '#B91C1C', margin: 0 }}>{stepsError}</p>
        )}

        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={addStep}>
            <Icon name="Plus" size={14} />Adicionar passo
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSteps(DEFAULT_SDR_CADENCE_STEPS)}>
            <Icon name="RotateCcw" size={13} />Restaurar padrão do documento
          </button>
        </div>

        <p className="muted" style={{ fontSize: 11.5 }}>
          Depois do último passo, o lead sai da régua automática — segue por tratamento manual (Standby, handoff ou perda).
        </p>
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
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !!stepsError} title={stepsError ?? undefined}>
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
