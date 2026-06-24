/**
 * useLogActivity.ts — registro automático de atividades no card do negócio
 *
 * Centraliza a gravação de uma Activity (email/whatsapp/meeting) na coleção
 * `activities`, atualiza a flag legada `tasks.{e|w|m}` do deal (compatibilidade
 * com o card atual) e dispara a premiação de moedas via callback `onPoints`.
 *
 * Os 3 modais de ação (Email/WhatsApp/Reunião) usam este hook para que o
 * registro aconteça sem ação manual extra do usuário.
 */

import { useFirestoreMutations } from '../../../hooks/useFirestore';
import { useAuthStore } from '../../../stores/authStore';
import type { Activity, ActivityType, Deal } from '../../../types/crm';

// Mapa de tipo de atividade → flag legada de tarefa + pontos do card
const ACTIVITY_TASK_FLAG: Partial<Record<ActivityType, 'e' | 'w' | 'm'>> = {
  email: 'e',
  whatsapp: 'w',
  meeting: 'm',
};

const ACTIVITY_POINTS: Partial<Record<ActivityType, number>> = {
  email: 15,
  whatsapp: 20,
  meeting: 30,
};

const ACTIVITY_TITLE: Partial<Record<ActivityType, string>> = {
  email: 'Enviar email',
  whatsapp: 'Mensagem WhatsApp',
  meeting: 'Agendar reunião',
};

export interface LogActivityInput {
  type: ActivityType;
  /** Resumo livre exibido na timeline (ex: assunto do email / texto do whatsapp). */
  outcome?: string;
  templateId?: string;
  contactId?: string;
  /** Para reunião: data/hora agendada. */
  scheduledAt?: Date;
  /** Campos extras específicos (ex: calendarEventId será preenchido pelo backend). */
  extra?: Record<string, unknown>;
}

type OnPoints = (g: { k?: string; title?: string; pts: number; label?: string; custom?: string }) => void;

export function useLogActivity(deal: Deal | undefined, onPoints?: OnPoints) {
  const { user } = useAuthStore();
  const { addDocument: addActivity } = useFirestoreMutations('activities');
  const { updateDocument: updateDeal } = useFirestoreMutations('deals');

  /**
   * Grava a atividade e atualiza o card. Retorna o id da activity criada.
   * Reunião entra como `pending` (aguardando acontecer); email/whatsapp como `completed`.
   */
  const logActivity = async (input: LogActivityInput): Promise<string | null> => {
    if (!deal || !user) return null;

    const isScheduled = input.type === 'meeting';
    const now = new Date();

    const activity: Omit<Activity, 'id'> = {
      dealId: deal.id,
      contactId: input.contactId,
      productId: deal.productId,
      userId: user.uid,
      type: input.type,
      cadenceType: 'manual',
      status: isScheduled ? 'pending' : 'completed',
      ...(isScheduled
        ? { scheduledAt: input.scheduledAt ?? now, dueAt: input.scheduledAt ?? now }
        : { completedAt: now }),
      templateId: input.templateId,
      templateUsed: !!input.templateId,
      outcome: input.outcome,
      coinsAwarded: 0,
      createdAt: now,
      ...input.extra,
    };

    let activityId: string | null = null;
    try {
      const ref = await addActivity(activity);
      activityId = (ref as { id?: string })?.id ?? null;

      // Atualiza a flag legada de tarefa do card (e/w/m), preservando as demais.
      const flag = ACTIVITY_TASK_FLAG[input.type];
      if (flag) {
        await updateDeal(deal.id, {
          tasks: { ...(deal.tasks ?? { e: false, w: false, m: false }), [flag]: true },
          updatedAt: now,
        });
      }

      // Dispara o toast de pontos/moedas reaproveitando o fluxo existente do card.
      const pts = ACTIVITY_POINTS[input.type] ?? 0;
      onPoints?.({
        k: flag,
        title: ACTIVITY_TITLE[input.type],
        pts,
        custom: isScheduled
          ? `📅 Reunião agendada — registrada no card!`
          : undefined,
      });
    } catch (err) {
      console.error('[useLogActivity] Erro ao registrar atividade:', err);
      throw err;
    }

    return activityId;
  };

  return { logActivity };
}
