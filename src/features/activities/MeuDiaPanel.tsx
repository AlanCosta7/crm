/**
 * MeuDiaPanel.tsx — a fila de trabalho do dia, agrupada por bloco de horário
 *
 * Fase 2 do PLANO_DESENHO_CRM.md (slides 6 e 9 do deck "Desenho CRM").
 *
 * O deck pede, literalmente: "Como deve aparecer na página de Atividades
 * também. Só que separada em blocos de horários" — "10h: E-mail (aparecer aqui
 * todos os clientes em que ele precisa enviar e-mail naquele dia)".
 *
 * A DIFERENÇA QUE JUSTIFICA ESTE COMPONENTE: a tela de Atividades era um FEED
 * do que já aconteceu. Isto é a FILA do que precisa acontecer hoje. São duas
 * coisas diferentes que o deck chamava pelo mesmo nome — daí a aba se chamar
 * "Meu Dia" e o histórico manter o nome "Histórico" (slide 9).
 *
 * Decisões de exibição, todas deliberadas:
 *  - Bloco vazio continua aparecendo. "Nada para fazer às 11h" é informação, e
 *    esconder faria a régua parecer diferente a cada dia.
 *  - Bloco de pausa aparece, sem lista — é o intervalo do slide 6.
 *  - Atividade cujo canal não tem bloco cai em "Sem horário definido", nunca é
 *    descartada (ver `groupActivitiesByBlock`).
 *  - Atividade concluída fica na lista, riscada, em vez de sumir: o SDR fecha o
 *    dia olhando o que fez e o que não fez (slide 10).
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/Icon';
import type { Activity } from '../../types/crm';
import {
  groupActivitiesByBlock, formatBlockRange, currentBlock,
  UNSCHEDULED_BLOCK_ID, BLOCK_TYPE_LABELS,
  type TimeBlockDef, type BlockActivityType,
} from '../../utils/timeBlocks';
import { ACTIVITY_TYPE_CONFIG, type ActivityType } from '../../utils/cadenceUtils';
import { CompleteActivityModal } from '../cadencia/CompleteActivityModal';

/** Ícone e cor do canal, cobrindo também reunião e visita (fora dos 4 do SDR). */
function channelVisual(type: string): { icon: string; color: string; bg: string; label: string } {
  const cfg = ACTIVITY_TYPE_CONFIG[type as ActivityType];
  if (cfg) return { icon: cfg.icon, color: cfg.color, bg: cfg.bg, label: cfg.label };
  if (type === 'agenda')  return { icon: 'CalendarCheck', color: '#B45309', bg: '#FEF3C7', label: 'Follow-up de agenda' };
  if (type === 'meeting') return { icon: 'Calendar', color: '#7C3AED', bg: '#EDE9FE', label: 'Reunião' };
  if (type === 'visit')   return { icon: 'MapPin',   color: '#3B82F6', bg: '#EFF6FF', label: 'Visita' };
  return { icon: 'StickyNote', color: '#6B7280', bg: 'var(--bg-2)', label: type };
}

interface Props {
  /** Atividades do dia do próprio usuário (pendentes e concluídas). */
  activities: Activity[];
  blocks: TimeBlockDef[];
  /** Só o dono da fila age nela; a gestão abre a aba em modo leitura. */
  readOnly?: boolean;
}

export function MeuDiaPanel({ activities, blocks, readOnly = false }: Props) {
  const navigate = useNavigate();
  const [completing, setCompleting] = useState<Activity | null>(null);

  const agora = useMemo(() => currentBlock(blocks), [blocks]);

  const secoes = useMemo(
    () => groupActivitiesByBlock(activities, blocks, a => a.type),
    [activities, blocks],
  );

  const totalPendente = activities.filter(a => a.status !== 'completed').length;
  const totalFeito = activities.filter(a => a.status === 'completed').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          {totalPendente === 0 && totalFeito > 0
            ? 'Dia fechado — todas as atividades da fila foram concluídas.'
            : `${totalPendente} atividade(s) pendente(s) · ${totalFeito} concluída(s) hoje.`}
        </p>
        {agora && (
          <span className="badge badge-primary" style={{ fontSize: 11.5 }}>
            Agora: {formatBlockRange(agora)} · {agora.label}
          </span>
        )}
      </div>

      {secoes.map(({ block, items }) => {
        const isAgora = agora?.id === block.id;
        const feitos = items.filter(a => a.status === 'completed').length;
        const semHorario = block.id === UNSCHEDULED_BLOCK_ID;

        return (
          <div
            key={block.id}
            className="card"
            style={isAgora ? { borderColor: 'var(--primary)', boxShadow: '0 0 0 1px var(--primary)' } : undefined}
          >
            <div className="card-hd" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 8, minWidth: 0 }}>
                {!semHorario && (
                  <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>
                    {formatBlockRange(block)}
                  </span>
                )}
                <h3 style={{ fontSize: 14, margin: 0 }}>
                  {semHorario ? 'Sem horário definido' : block.label}
                </h3>
                {block.isBreak && <span className="badge badge-gray" style={{ fontSize: 10 }}>Pausa</span>}
                {!block.isBreak && block.types.length > 0 && (
                  <span className="muted" style={{ fontSize: 11 }}>
                    {block.types.map(t => BLOCK_TYPE_LABELS[t as BlockActivityType]).join(' · ')}
                  </span>
                )}
              </div>
              {!block.isBreak && items.length > 0 && (
                <span
                  className="badge"
                  style={{
                    fontSize: 11.5,
                    background: feitos === items.length ? '#E5F0E5' : 'var(--bg-2)',
                    color: feitos === items.length ? 'var(--primary)' : 'var(--text-2)',
                  }}
                >
                  {feitos}/{items.length}
                </span>
              )}
            </div>

            {block.isBreak ? (
              <div className="muted" style={{ padding: '14px 18px', fontSize: 12.5 }}>
                Intervalo — nenhuma atividade é agendada neste horário.
              </div>
            ) : items.length === 0 ? (
              <div className="muted" style={{ padding: '14px 18px', fontSize: 12.5 }}>
                Nada para fazer neste bloco hoje.
              </div>
            ) : (
              <div>
                {items.map((a, i) => {
                  const v = channelVisual(a.type);
                  const feito = a.status === 'completed';
                  const empresa = (a as { companyName?: string }).companyName
                    || (a as { contactName?: string }).contactName || 'Cliente';
                  return (
                    <div
                      key={a.id ?? i}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 18px', borderTop: '1px solid var(--border)',
                        opacity: feito ? 0.6 : 1,
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                        background: v.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon name={feito ? 'Check' : v.icon} size={14} color={v.color} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 600, fontSize: 13, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          textDecoration: feito ? 'line-through' : undefined,
                        }}>
                          {empresa}
                        </div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {/* Tarefas da régua de agenda trazem o rótulo pronto
                              ("Confirmar a reunião com o cliente…"); as demais
                              mostram o canal. */}
                          {(a as { text?: string }).text || v.label}
                          {a.status === 'overdue' && ' · atrasada'}
                        </div>
                      </div>

                      {a.dealId && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => navigate(`/lead/${a.dealId}`)}
                          title="Abrir o card do cliente"
                        >
                          Abrir card
                        </button>
                      )}

                      {!feito && !readOnly && a.id && a.dealId && (
                        <button className="btn btn-primary btn-sm" onClick={() => setCompleting(a)}>
                          <Icon name="Check" size={14} />Registrar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {completing?.id && completing.dealId && (
        <CompleteActivityModal
          activityId={completing.id}
          activityType={completing.type}
          dealId={completing.dealId}
          contactName={(completing as { contactName?: string }).contactName || 'Cliente'}
          companyName={(completing as { companyName?: string }).companyName || 'Empresa'}
          onSuccess={() => setCompleting(null)}
          onCancel={() => setCompleting(null)}
        />
      )}
    </div>
  );
}

export default MeuDiaPanel;
