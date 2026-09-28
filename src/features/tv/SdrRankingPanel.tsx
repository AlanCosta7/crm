/**
 * SdrRankingPanel.tsx — Ranking do Time de SDRs para a TV
 * (PLANO_DESENHO_CRM_2.md, Fase B — slides 1–3 do "Desenho CRM 2")
 *
 * Pódio dos 3 primeiros e lista dos demais, ordenados pelas VISITAS AGENDADAS
 * (o peso pedido pelo cliente). Cada SDR mostra os quatro indicadores: atividades
 * feitas x programadas, reuniões agendadas, reuniões realizadas e visitas.
 *
 * O período (dia/semana/mês) é um filtro na própria TV; o servidor já manda os
 * três (`ranking_sdr.day|week|month`), então trocar de filtro é instantâneo e
 * não depende de nova leitura. A ordem vem pronta do servidor — a TV só exibe.
 */
import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { Av } from '../../components/ui/Av';

export type RankingPeriod = 'day' | 'week' | 'month';

export interface RankingRow {
  name: string;
  initials: string;
  color: string;
  actDone: number;
  actTotal: number;
  actPct: number;
  meetingsScheduled: number;
  meetingsDone: number;
  visits: number;
}

export type SdrRankingData = Partial<Record<RankingPeriod, RankingRow[]>>;

export interface TvTheme {
  accent: string;
  textMuted: string;
  border: string;
  bgDark: string;
}

const PERIODS: { id: RankingPeriod; label: string }[] = [
  { id: 'day', label: 'Dia' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
];

const PERIOD_TITLE: Record<RankingPeriod, string> = { day: 'hoje', week: 'na semana', month: 'no mês' };

// Faixas da tabela de referência do cliente: verde ao bater a meta, laranja
// perto dela, vermelho longe. Tons claros: a TV tem fundo escuro e o verde da
// marca (#1A6B1A) some nele.
export function pctColor(pct: number): string {
  if (pct >= 100) return '#4ADE80';
  if (pct >= 70) return '#FBBF24';
  return '#F87171';
}

const MEDAL = ['#FFD54A', '#C9D1D9', '#E0A15A'];

function Indicators({ row, compact }: { row: RankingRow; compact?: boolean }) {
  const cell = (label: string, value: string | number, testId: string) => (
    <div style={{ textAlign: 'center', minWidth: compact ? 62 : 74 }} data-testid={testId}>
      <div style={{ fontSize: compact ? 18 : 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10.5, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: compact ? 10 : 14, justifyContent: 'center' }}>
      {cell('Ativ.', `${row.actDone}/${row.actTotal}`, 'ind-atividades')}
      {cell('Reun. agend.', row.meetingsScheduled, 'ind-reunioes-agendadas')}
      {cell('Reun. realiz.', row.meetingsDone, 'ind-reunioes-realizadas')}
    </div>
  );
}

function ActivityBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 6, borderRadius: 6, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pctColor(pct) }} />
    </div>
  );
}

export function SdrRankingPanel({
  data,
  theme,
  defaultPeriod = 'week',
}: {
  data: SdrRankingData;
  theme: TvTheme;
  defaultPeriod?: RankingPeriod;
}) {
  const [period, setPeriod] = useState<RankingPeriod>(defaultPeriod);
  const rows = data[period] ?? [];
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  // Ordem visual clássica de pódio: 2º · 1º · 3º
  const podiumOrder = [1, 0, 2].filter((i) => podium[i]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: theme.textMuted }}>
          <Icon name="Trophy" size={16} color={theme.accent} />
          Ranking do Time de SDRs — visitas agendadas {PERIOD_TITLE[period]}
        </div>
        <div role="group" aria-label="Período do ranking" style={{ display: 'flex', gap: 6 }}>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={period === p.id}
              onClick={() => setPeriod(p.id)}
              style={{
                border: `1px solid ${theme.border}`,
                background: period === p.id ? theme.accent : 'transparent',
                color: period === p.id ? theme.bgDark : theme.textMuted,
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
          Nenhum SDR ativo para exibir.
        </div>
      ) : (
        <>
          <div data-testid="podio" style={{ display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'flex-end' }}>
            {podiumOrder.map((i) => {
              const r = podium[i];
              const first = i === 0;
              return (
                <div
                  key={`${r.name}-${i}`}
                  data-testid={`podio-${i + 1}`}
                  style={{
                    flex: first ? 1.25 : 1,
                    maxWidth: 380,
                    border: `2px solid ${MEDAL[i]}`,
                    borderRadius: 14,
                    padding: first ? '22px 18px' : '16px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 10,
                    background: 'rgba(255,255,255,.03)',
                  }}
                >
                  <div style={{ fontSize: 26, fontWeight: 900, color: MEDAL[i] }}>{i + 1}º</div>
                  <Av initials={r.initials} color={r.color} size={first ? 60 : 48} />
                  <div style={{ fontSize: first ? 22 : 18, fontWeight: 800 }}>{r.name}</div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: first ? 46 : 36, fontWeight: 900, lineHeight: 1, color: theme.accent }} data-testid="visitas">
                      {r.visits}
                    </div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.75 }}>
                      {r.visits === 1 ? 'visita' : 'visitas'}
                    </div>
                  </div>
                  <Indicators row={r} compact={!first} />
                  <div style={{ width: '100%' }}>
                    <ActivityBar pct={r.actPct} />
                    <div style={{ textAlign: 'right', fontSize: 11, marginTop: 3, color: pctColor(r.actPct), fontWeight: 800 }}>
                      {r.actPct}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {rest.length > 0 && (
            <div data-testid="lista" style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', minHeight: 0 }}>
              {rest.map((r, idx) => (
                <div
                  key={`${r.name}-${idx}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '36px 40px minmax(90px, 1.2fr) 70px 1.6fr 60px',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 14px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,.04)',
                  }}
                >
                  <div style={{ fontWeight: 800, color: theme.textMuted }}>{idx + 4}º</div>
                  <Av initials={r.initials} color={r.color} size={32} />
                  <div style={{ fontWeight: 700 }}>{r.name}</div>
                  <div style={{ fontWeight: 900, fontSize: 20, color: theme.accent }} data-testid="visitas">
                    {r.visits} <span style={{ fontSize: 10, opacity: 0.7 }}>{r.visits === 1 ? 'visita' : 'visitas'}</span>
                  </div>
                  <Indicators row={r} compact />
                  <div style={{ textAlign: 'right', fontWeight: 800, color: pctColor(r.actPct) }}>{r.actPct}%</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
