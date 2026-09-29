/**
 * GamificacaoPane.tsx — Aba "Pontuação" nas Configurações
 * (PLANO_DESENHO_CRM_2.md — pontuação configurável pelo master).
 *
 * Três blocos, os três sistemas de pontuação do CRM que hoje eram valor fixo
 * no código:
 *  1. Ações do checklist do card + bônus de negócio ganho — não são etapa de
 *     funil, ficam em `settings/gamification.actionPoints`.
 *  2. Moedas e pontos por etapa — `coinsOnEnter`/`pointsOnEnter`, irmãos, no
 *     próprio documento do funil (compatível com funil totalmente dinâmico:
 *     o master pode criar/renomear etapa a qualquer momento e ela já aparece
 *     aqui, zerada).
 *  3. Peso do pódio de SDRs na TV — critério dominante continua visitas
 *     agendadas nos padrões (D5, já confirmado com o cliente); o master pode
 *     reequilibrar.
 */
import { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import type { Funnel } from '../../types/crm';
import { sortedStages } from '../../utils/funnelUtils';
import { useGamificationSettings } from './useGamificationSettings';
import { Icon } from '../../components/ui/Icon';

function NumberField({ label, value, onChange, suffix }: { label: string; value: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <div className="field" style={{ margin: 0 }}>
      <div className="fl">{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          className="input"
          type="number"
          min={0}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          style={{ maxWidth: 120 }}
        />
        {suffix && <span className="muted" style={{ fontSize: 12.5 }}>{suffix}</span>}
      </div>
    </div>
  );
}

export function GamificacaoPane() {
  const { user } = useAuthStore();
  const { actionPoints, sdrRankingWeights, loading } = useGamificationSettings();
  const { data: funnels } = useFirestoreCollection<Funnel>('funnels');
  const { updateDocument: updateFunnel } = useFirestoreMutations('funnels');

  const [pts, setPts] = useState(actionPoints);
  const [weights, setWeights] = useState(sdrRankingWeights);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sincroniza com o documento quando ele carrega/muda em outra aba/sessão —
  // sem sobrescrever o que o master está digitando agora (só quando ainda não
  // mexeu nada, `loading` cobre a primeira carga).
  useEffect(() => { if (loading) return; setPts(actionPoints); setWeights(sdrRankingWeights); }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!user?.tenantId) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'tenants', user.tenantId, 'settings', 'gamification'),
        { actionPoints: pts, sdrRankingWeights: weights },
        { merge: true },
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const activeFunnels = funnels.filter((f) => f.isActive !== false);

  const handleStageField = async (funnel: Funnel, stageId: string, field: 'coinsOnEnter' | 'pointsOnEnter', value: number) => {
    const stages = sortedStages(funnel).map((s) => (s.id === stageId ? { ...s, [field]: value } : s));
    await updateFunnel(funnel.id!, { stages });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name="Trophy" size={20} color="var(--primary)" />
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Pontuação do Ranking Geral de Pontos, moedas por etapa do funil, e o peso do pódio de SDRs na TV.
          Nada muda até você salvar — os valores de hoje são exatamente os que já valiam fixos no código.
        </div>
      </div>

      {/* Bloco 1 — ações fixas (não são etapa) */}
      <div className="card">
        <div className="card-hd"><h3>Ações do checklist do card</h3></div>
        <div className="card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <NumberField label="Negócio criado" value={pts.dealCreated} onChange={(n) => setPts({ ...pts, dealCreated: n })} suffix="pts" />
          <NumberField label="Email enviado" value={pts.emailSent} onChange={(n) => setPts({ ...pts, emailSent: n })} suffix="pts" />
          <NumberField label="Mensagem WhatsApp" value={pts.whatsappSent} onChange={(n) => setPts({ ...pts, whatsappSent: n })} suffix="pts" />
          <NumberField label="Reunião (tarefa do card)" value={pts.meetingTaskDone} onChange={(n) => setPts({ ...pts, meetingTaskDone: n })} suffix="pts" />
          <NumberField label="Negócio ganho" value={pts.dealWon} onChange={(n) => setPts({ ...pts, dealWon: n })} suffix="pts" />
        </div>
      </div>

      {/* Bloco 2 — pesos do pódio de SDRs na TV */}
      <div className="card">
        <div className="card-hd"><h3>Pódio de SDRs na TV</h3></div>
        <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            O pódio soma <code>visitas × peso + reuniões realizadas × peso + % de atividades × peso</code> pra ordenar.
            Nos valores padrão, visitas agendadas sempre decide primeiro — é o que foi combinado com o cliente.
            Aumentar o peso de reuniões ou atividades muda esse equilíbrio.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <NumberField label="Peso — visitas agendadas" value={weights.visits} onChange={(n) => setWeights({ ...weights, visits: n })} />
            <NumberField label="Peso — reuniões realizadas" value={weights.meetingsDone} onChange={(n) => setWeights({ ...weights, meetingsDone: n })} />
            <NumberField label="Peso — % de atividades" value={weights.actPct} onChange={(n) => setWeights({ ...weights, actPct: n })} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Icon name="Save" size={14} />{saving ? 'Salvando…' : 'Salvar pontuação'}
        </button>
        {saved && <span style={{ color: 'var(--primary)', fontSize: 13, fontWeight: 600 }}>Salvo ✓</span>}
      </div>

      {/* Bloco 3 — por etapa do funil (auto-salva por campo, mesmo padrão das
          flags ⚡/🤝 da aba Pipelines) */}
      <div className="card">
        <div className="card-hd">
          <h3>Moedas e pontos por etapa</h3>
          <span className="badge badge-gray">por funil</span>
        </div>
        <div style={{ padding: '0 0 4px' }}>
          {activeFunnels.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center' }} className="muted">Nenhum funil ativo.</div>
          )}
          {activeFunnels.map((funnel) => (
            <div key={funnel.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '10px 20px 4px', fontWeight: 700, fontSize: 12.5, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {funnel.name}
              </div>
              {sortedStages(funnel).map((st) => (
                <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 20px' }}>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{st.name}</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    🪙 Moedas
                    <input
                      className="input" type="number" min={0} style={{ width: 70 }}
                      defaultValue={st.coinsOnEnter || 0}
                      onBlur={(e) => handleStageField(funnel, st.id, 'coinsOnEnter', Math.max(0, Number(e.target.value) || 0))}
                    />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    🏆 Pontos
                    <input
                      className="input" type="number" min={0} style={{ width: 70 }}
                      defaultValue={st.pointsOnEnter || 0}
                      onBlur={(e) => handleStageField(funnel, st.id, 'pointsOnEnter', Math.max(0, Number(e.target.value) || 0))}
                    />
                  </label>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default GamificacaoPane;
