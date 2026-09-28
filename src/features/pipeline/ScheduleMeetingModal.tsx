/**
 * ScheduleMeetingModal.tsx — pede a data da reunião ao mover o card
 *
 * Fase 3 do PLANO_DESENHO_CRM.md. A etapa "Reunião Agendada" nasceu na Fase 1.1
 * e a régua de agenda (slide 8) precisa de uma data para calcular a confirmação
 * "24h úteis antes". Sem este modal o card entraria na etapa sem data, e a régua
 * não teria como ser montada.
 *
 * A visita já tinha esse caminho pelo `HandoffModal` (que coleta
 * `visitScheduledAt` junto com a passagem de bastão). A reunião é do SDR e não
 * envolve handoff, então precisa de um passo próprio, mais simples.
 */

import { useMemo, useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import type { Deal } from '../../types/crm';
import { reguaFicaVazia, sugestaoDeReuniao } from '../../utils/agendaWindow';

interface Props {
  deal: Deal;
  onConfirm: (meetingScheduledAt: Date) => void;
  onCancel: () => void;
}

/** "YYYY-MM-DDTHH:mm" no fuso local, formato aceito por `datetime-local`. */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ScheduleMeetingModal({ deal, onConfirm, onCancel }: Props) {
  // "Agora" fixado na abertura do modal: chamar `Date.now()` durante o render é
  // impuro (o React Compiler recusa), e o modal vive segundos — a diferença é
  // irrelevante para validar a data escolhida.
  const [agora] = useState(() => new Date());

  // Sugestão com espaço para a régua (ver `sugestaoDeReuniao`). A primeira
  // versão sugeria "amanhã às 10h" — que sempre nascia sem régua, ou seja, o
  // valor padrão disparava o próprio aviso de régua vazia.
  const sugestao = useMemo(() => sugestaoDeReuniao(agora), [agora]);

  const [valor, setValor] = useState(() => toLocalInput(sugestao));
  const agoraMin = useMemo(() => toLocalInput(agora), [agora]);

  const escolhida = valor ? new Date(valor) : null;
  const valida = !!escolhida && !Number.isNaN(escolhida.getTime()) && escolhida.getTime() > agora.getTime();

  /**
   * Aviso, não impedimento: quando a confirmação "24h úteis antes" já cairia no
   * passado, a régua nasce vazia. Usa a MESMA regra do servidor —
   * `reguaFicaVazia` espelha `buildAgendaSchedule`. A primeira versão usava
   * "menos de 2 dias corridos", que errava nos dois sentidos por ignorar o fim
   * de semana. O SDR pode ter marcado mesmo para amanhã; bloquear não ajuda.
   */
  const semEspacoParaRegua = valida && reguaFicaVazia(agora, escolhida!);

  return (
    <div className="modal-ov" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <h3 style={{ fontSize: 15 }}>Agendar Reunião</h3>
          <button className="icon-btn" aria-label="Fechar" onClick={onCancel}>
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            <strong style={{ color: 'var(--text-1)' }}>{deal.company || deal.name}</strong> aceitou uma reunião.
            Informe quando ela acontece — o CRM monta a régua de follow-up até lá e
            agenda a confirmação com o cliente 24h úteis antes.
          </p>

          <div className="field" style={{ margin: 0 }}>
            <div className="fl">Data e hora da reunião</div>
            <input
              className="input"
              type="datetime-local"
              value={valor}
              min={agoraMin}
              aria-label="Data e hora da reunião"
              onChange={e => setValor(e.target.value)}
            />
            {!valida && valor && (
              <p style={{ fontSize: 11.5, color: '#B91C1C', marginTop: 4 }}>
                A reunião precisa ser no futuro.
              </p>
            )}
          </div>

          {semEspacoParaRegua && (
            <div role="status" style={{
              display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 8,
              background: '#FFFBEB', border: '1px solid #FDE68A',
            }}>
              <Icon name="Info" size={15} color="#B45309" />
              <span style={{ fontSize: 12, color: '#92400E' }}>
                A confirmação 24h úteis antes já cairia no passado — o card entra na
                etapa, mas sem régua automática de follow-up.
              </span>
            </div>
          )}
        </div>

        <div className="modal-ft">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={!valida}
            onClick={() => valida && onConfirm(escolhida!)}
          >
            <Icon name="CalendarCheck" size={15} />Agendar
          </button>
        </div>
      </div>
    </div>
  );
}

export default ScheduleMeetingModal;
