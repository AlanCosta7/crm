/**
 * CadenceConfigPage.tsx — Programação da cadência (gestão)
 *
 * Rota: /settings/cadencia (master + manager)
 * Pedido do cliente (Observações CRM, jul/2026): "Programar a cadência
 * manualmente para SDRs e representantes."
 *
 * Salva em `tenants/{tid}/settings/cadence`:
 *   sdr.steps                    — régua de contato do SDR (dia + canais)
 *   sdr.timeBlocks               — blocos de horário do dia (Fase 2, slide 6)
 *   rep.firstContactBusinessDays — SLA do 1º contato do Rep (padrão 3 dias úteis)
 *
 * Os blocos de horário são um PADRÃO DA EMPRESA definido aqui pelo admin — não
 * há configuração por SDR (decisão do Alan, 10/09/2026).
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
import {
  DEFAULT_TIME_BLOCKS, BLOCK_ACTIVITY_TYPES, BLOCK_TYPE_LABELS,
  normalizeTimeBlocks, formatBlockRange, blockStartMinutes,
  type BlockActivityType, type TimeBlockDef,
} from '../../utils/timeBlocks';

const DEFAULTS = { repSla: 3 };
const MAX_STEP_DAY_OFFSET = 90;

/** Validação com mensagens específicas pro admin — mais amigável que o
 * fallback silencioso de `normalizeSteps` (usado só como rede de segurança). */
function validateSteps(steps: CadenceStepDef[]): string | null {
  if (steps.length === 0) return 'A régua precisa ter pelo menos 1 passo.';
  if (!steps.some(s => s.dayOffset === 0)) return 'É preciso ter um passo no Dia 0 (contato inicial, feito ao atribuir o card).';
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

/** Validação com mensagem específica pro admin — espelha `normalizeTimeBlocks`,
 * que silenciosamente cai no padrão. Aqui o admin precisa saber o que está errado. */
function validateBlocks(blocks: TimeBlockDef[]): string | null {
  if (blocks.length === 0) return 'É preciso ter pelo menos 1 bloco de horário.';
  if (blocks.length > 12) return 'No máximo 12 blocos.';

  const ids = new Set<string>();
  const canais = new Map<string, string>();

  for (const b of blocks) {
    const faixa = formatBlockRange(b);
    if (!b.id.trim()) return 'Todo bloco precisa de um identificador.';
    if (ids.has(b.id)) return `Já existe um bloco com o identificador "${b.id}".`;
    ids.add(b.id);

    if (blockStartMinutes(b) >= b.endHour * 60 + b.endMinute) {
      return `O bloco de ${faixa} termina antes de começar.`;
    }
    if (!b.isBreak && b.types.length === 0) {
      return `O bloco de ${faixa} não tem canal nenhum — marque como Pausa ou escolha um canal.`;
    }
    for (const t of b.types) {
      const jaEm = canais.get(t);
      if (jaEm) return `${BLOCK_TYPE_LABELS[t]} está em dois blocos (${jaEm} e ${faixa}) — cada canal só pode estar em um.`;
      canais.set(t, faixa);
    }
  }

  // Sobreposição de horário confundiria o SDR sobre o que fazer agora.
  const ordenados = [...blocks].sort((a, b) => blockStartMinutes(a) - blockStartMinutes(b));
  for (let i = 1; i < ordenados.length; i++) {
    const ant = ordenados[i - 1];
    if (blockStartMinutes(ordenados[i]) < ant.endHour * 60 + ant.endMinute) {
      return `Os blocos de ${formatBlockRange(ant)} e ${formatBlockRange(ordenados[i])} se sobrepõem.`;
    }
  }

  return null;
}

/** Visual dos canais de bloco que não são canais de cadência do SDR. */
const EXTRA_BLOCK_VISUAL: Partial<Record<BlockActivityType, { icon: string; color: string; bg: string }>> = {
  meeting: { icon: 'Calendar',      color: '#7C3AED', bg: '#EDE9FE' },
  visit:   { icon: 'MapPin',        color: '#3B82F6', bg: '#EFF6FF' },
  agenda:  { icon: 'CalendarCheck', color: '#B45309', bg: '#FEF3C7' },
};

export default function CadenceConfigPage() {
  const { user } = useAuthStore();

  const [repSla, setRepSla] = useState(DEFAULTS.repSla);
  const [steps, setSteps] = useState<CadenceStepDef[]>(DEFAULT_SDR_CADENCE_STEPS);
  const [blocks, setBlocks] = useState<TimeBlockDef[]>(DEFAULT_TIME_BLOCKS);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null);

  useEffect(() => {
    if (!user?.tenantId) return;
    const ref = doc(db, 'tenants', user.tenantId, 'settings', 'cadence');
    const unsub = onSnapshot(ref, snap => {
      const d = snap.data();
      if (d) {
        setRepSla(d.rep?.firstContactBusinessDays ?? DEFAULTS.repSla);
        setSteps(normalizeSteps(d.sdr?.steps));
        setBlocks(normalizeTimeBlocks(d.sdr?.timeBlocks));
      }
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [user?.tenantId]);

  const stepsError = validateSteps(steps);
  const blocksError = validateBlocks(blocks);

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

  const updateBlock = (index: number, patch: Partial<TimeBlockDef>) => {
    setBlocks(prev => prev.map((b, i) => i === index ? { ...b, ...patch } : b));
  };

  const toggleBlockType = (index: number, type: BlockActivityType) => {
    setBlocks(prev => prev.map((b, i) => {
      if (i !== index) return b;
      const types = b.types.includes(type) ? b.types.filter(t => t !== type) : [...b.types, type];
      return { ...b, types };
    }));
  };

  const removeBlock = (index: number) => setBlocks(prev => prev.filter((_, i) => i !== index));

  const addBlock = () => {
    // Começa onde o último termina, para o admin não ter que calcular.
    const ultimo = [...blocks].sort((a, b) => blockStartMinutes(a) - blockStartMinutes(b)).at(-1);
    const startHour = Math.min(22, ultimo ? ultimo.endHour : 9);
    setBlocks(prev => [...prev, {
      id: `bloco_${Date.now().toString(36)}`,
      label: '', startHour, startMinute: 0, endHour: Math.min(23, startHour + 1), endMinute: 0,
      types: [], isBreak: false,
    }]);
  };

  const handleSave = async () => {
    if (!user?.tenantId || stepsError || blocksError) return;
    setSaving(true);
    setFeedback(null);
    try {
      const stepsToSave = steps
        .slice()
        .sort((a, b) => a.dayOffset - b.dayOffset)
        .map(s => ({ ...s, label: s.label.trim() || s.types.map(t => ACTIVITY_TYPE_CONFIG[t].label).join(' + ') }));
      await setDoc(doc(db, 'tenants', user.tenantId, 'settings', 'cadence'), {
        sdr: {
          steps: stepsToSave,
          timeBlocks: blocks
            .slice()
            .sort((a, b) => blockStartMinutes(a) - blockStartMinutes(b))
            .map(b => ({
              ...b,
              label: b.label.trim() || b.types.map(t => BLOCK_TYPE_LABELS[t]).join(' + ') || 'Pausa',
              types: b.isBreak ? [] : b.types,
            })),
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
          As mudanças valem a partir da próxima geração diária da fila (7h, horário de Brasília). A atribuição de leads aos SDRs é manual.
        </p>
      </div>

      {/* Régua de contato — editável */}
      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div className="row" style={{ gap: 8 }}>
            <Icon name="ListOrdered" size={18} color="var(--primary)" />
            <h3 style={{ margin: 0 }}>Régua de Contato dos SDRs</h3>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
            Um passo por dia desde a atribuição do card ao SDR (Dia 0). Cada passo nasce pro SDR no dia exato em que
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

      {/* Blocos de horário — Fase 2 do PLANO_DESENHO_CRM.md (slide 6) */}
      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div className="row" style={{ gap: 8 }}>
            <Icon name="Clock" size={18} color="var(--primary)" />
            <h3 style={{ margin: 0 }}>Blocos de Horário do Dia</h3>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
            Define em que hora cada canal é trabalhado. O SDR vê a fila do dia agrupada nesses blocos, na
            tela de Atividades. Vale para todo o time — não há configuração individual.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...blocks]
            .map((b, i) => ({ b, i }))
            .sort((x, y) => blockStartMinutes(x.b) - blockStartMinutes(y.b))
            .map(({ b, i }) => (
            <div key={b.id} className="row" style={{ gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, flexWrap: 'wrap' }}>
              <div className="row" style={{ gap: 4, flexShrink: 0 }}>
                <div className="field" style={{ margin: 0 }}>
                  <div className="label" style={{ fontSize: 10 }}>Início</div>
                  <input
                    className="input" type="time" step={300}
                    aria-label={`Início do bloco ${b.label || b.id}`}
                    value={`${String(b.startHour).padStart(2, '0')}:${String(b.startMinute).padStart(2, '0')}`}
                    onChange={e => {
                      const [h, m] = e.target.value.split(':').map(Number);
                      if (Number.isInteger(h) && Number.isInteger(m)) updateBlock(i, { startHour: h, startMinute: m });
                    }}
                    style={{ width: 104 }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="label" style={{ fontSize: 10 }}>Fim</div>
                  <input
                    className="input" type="time" step={300}
                    aria-label={`Fim do bloco ${b.label || b.id}`}
                    value={`${String(b.endHour).padStart(2, '0')}:${String(b.endMinute).padStart(2, '0')}`}
                    onChange={e => {
                      const [h, m] = e.target.value.split(':').map(Number);
                      if (Number.isInteger(h) && Number.isInteger(m)) updateBlock(i, { endHour: h, endMinute: m });
                    }}
                    style={{ width: 104 }}
                  />
                </div>
              </div>

              <label className="row" style={{ gap: 5, fontSize: 11.5, cursor: 'pointer', flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={b.isBreak}
                  onChange={e => updateBlock(i, { isBreak: e.target.checked, types: e.target.checked ? [] : b.types })}
                />
                Pausa
              </label>

              <div style={{ display: 'flex', gap: 4, flexShrink: 0, opacity: b.isBreak ? 0.35 : 1 }}>
                {BLOCK_ACTIVITY_TYPES.map(type => {
                  const cfg = ACTIVITY_TYPE_CONFIG[type as ActivityType];
                  // Canais fora dos 4 do SDR: reunião, visita e a régua de agenda (Fase 3).
                  const extra = EXTRA_BLOCK_VISUAL[type];
                  const icon = cfg?.icon ?? extra?.icon ?? 'Circle';
                  const color = cfg?.color ?? extra?.color ?? 'var(--text-2)';
                  const bg = cfg?.bg ?? extra?.bg ?? 'var(--bg-2)';
                  const active = b.types.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      title={BLOCK_TYPE_LABELS[type]}
                      aria-label={`${BLOCK_TYPE_LABELS[type]} no bloco ${formatBlockRange(b)}`}
                      aria-pressed={active}
                      disabled={b.isBreak}
                      onClick={() => toggleBlockType(i, type)}
                      style={{
                        width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: active ? bg : 'var(--bg-2)',
                        border: `1.5px solid ${active ? color : 'var(--border)'}`,
                        opacity: active ? 1 : 0.5,
                        cursor: b.isBreak ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Icon name={icon} size={14} color={active ? color : 'var(--text-2)'} />
                    </button>
                  );
                })}
              </div>

              <input
                className="input"
                aria-label={`Rótulo do bloco ${formatBlockRange(b)}`}
                placeholder={b.isBreak ? 'Pausa' : (b.types.length ? b.types.map(t => BLOCK_TYPE_LABELS[t]).join(' + ') : 'Rótulo do bloco')}
                value={b.label}
                onChange={e => updateBlock(i, { label: e.target.value })}
                style={{ flex: 1, minWidth: 130 }}
              />

              <button
                type="button" className="icon-btn" style={{ flexShrink: 0 }}
                onClick={() => removeBlock(i)}
                title="Remover bloco"
                aria-label={`Remover bloco ${formatBlockRange(b)}`}
              >
                <Icon name="Trash2" size={15} color="#B91C1C" />
              </button>
            </div>
          ))}
        </div>

        {blocksError && <p style={{ fontSize: 11.5, color: '#B91C1C', margin: 0 }}>{blocksError}</p>}

        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={addBlock}>
            <Icon name="Plus" size={14} />Adicionar bloco
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBlocks(DEFAULT_TIME_BLOCKS)}>
            <Icon name="RotateCcw" size={13} />Restaurar padrão
          </button>
        </div>

        <p className="muted" style={{ fontSize: 11.5 }}>
          Canal sem bloco aparece para o SDR num grupo "Sem horário definido" — nada é escondido da fila.
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
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !!stepsError || !!blocksError} title={stepsError ?? blocksError ?? undefined}>
          <Icon name="Save" size={15} />
          {saving ? 'Salvando...' : 'Salvar configuração'}
        </button>
        {feedback === 'saved' && (
          <span style={{ color: 'var(--primary)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="CheckCircle2" size={15} /> Salvo — vale a partir da próxima geração da fila
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
