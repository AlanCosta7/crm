/**
 * useCadencia.ts — Hook de dados para a tela de Cadência Diária
 *
 * O doc `cadence_queues/{uid}/daily/{hoje}` (gerado pelo Cloud Function
 * dailyCadenceEngine às 7h BRT) é a fonte de ORDEM/estrutura dos cards —
 * novo hoje, passo de sequência, follow-up — mas nunca é reescrito depois de
 * criado. Quem sabe o status real de cada atividade é a própria activity.
 * Por isso toda leitura (inicial ou via `refreshQueue`) passa por
 * `buildFallbackQueue`: pega o esqueleto do doc da fila (se existir) e
 * sobrepõe o status atual de cada activity — preserva ordem e badges, só
 * atualiza o que muda. Se o doc da fila ainda não existe (antes das 7h, ou
 * emulador sem cron), monta uma fila degradada a partir das activities
 * avulsas (perde a distinção novo/sequência/follow-up nesse caso transitório).
 *
 * Expõe:
 *  - queue: DailyQueue | null
 *  - loading: boolean
 *  - todayKey: string ("YYYY-MM-DD" em BRT)
 *  - completionPct: number (0–100)
 *  - refreshQueue: () => void
 */

import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  onSnapshot,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuthStore } from '../../stores/authStore';
import {
  getTodayBRT,
  calcCompletionRate,
  SDR_ACTIVITY_TYPES,
  type DailyQueue,
  type CadenceCard,
  type CadenceActivity,
  type ActivityType,
} from '../../utils/cadenceUtils';

// Formato bruto de um doc de `activities` (Firestore) — mais solto que o tipo
// `Activity` completo do app, só com os campos que este hook realmente lê.
// `scheduledAt` sempre chega como Timestamp (o SDK client nunca desserializa
// pra Date nativo), por isso não precisa de união com Date aqui.
interface RawActivity {
  id?: string;
  dealId: string;
  type: ActivityType;
  status: CadenceActivity['status'];
  scheduledAt?: Timestamp;
  sequenceOrder?: number;
  contactName?: string;
  companyName?: string;
  productId?: string;
}

export function useCadencia() {
  const { user } = useAuthStore();
  const todayKey = getTodayBRT();

  const [queue,   setQueue]   = useState<DailyQueue | null>(null);
  const [loading, setLoading] = useState(true);

  // Lê o status ATUAL (em tempo real) de todas as activities sdr_daily de hoje
  // do SDR — a única fonte confiável de status, já que o doc de queue gerado
  // pelo cron nunca é reescrito depois de criado (ninguém grava a conclusão nele).
  const fetchTodayActivityStatuses = useCallback(
    async (tenantId: string, sdrId: string): Promise<Map<string, RawActivity>> => {
      const activitiesRef = collection(db, 'tenants', tenantId, 'activities');
      const q = query(activitiesRef, where('userId', '==', sdrId), where('cadenceType', '==', 'sdr_daily'));
      return new Promise((resolve) => {
        const unsub = onSnapshot(q, (snap) => {
          unsub();
          const byId = new Map<string, RawActivity>();
          snap.docs.forEach(d => {
            const a = d.data() as RawActivity;
            const date = a.scheduledAt?.toDate();
            if (!date || getTodayBRT(date) !== todayKey) return;
            byId.set(d.id, a);
          });
          resolve(byId);
        });
      });
    },
    [todayKey],
  );

  const buildFallbackQueue = useCallback(
    async (tenantId: string, sdrId: string): Promise<DailyQueue | null> => {
      const [statusById, queueSnap] = await Promise.all([
        fetchTodayActivityStatuses(tenantId, sdrId),
        getDoc(doc(db, 'tenants', tenantId, 'cadence_queues', sdrId, 'daily', todayKey)),
      ]);

      // Caminho principal: já existe a fila gerada pelo motor — ela é a fonte
      // certa de ORDEM dos cards e dos badges (novo hoje / passo de sequência /
      // follow-up semanal). Só precisamos atualizar o `status` de cada
      // atividade com o valor real (o doc da fila em si nunca muda depois de
      // criado). Reconstruir do zero a partir das activities (como o código
      // antigo fazia) perdia ordem e badges a cada "Concluir" — corrigido aqui.
      if (queueSnap.exists()) {
        const base = queueSnap.data() as DailyQueue;
        const cards: CadenceCard[] = base.cards.map(card => ({
          ...card,
          activities: Object.fromEntries(
            Object.entries(card.activities).map(([type, act]) => {
              const live = act?.activityId ? statusById.get(act.activityId) : null;
              return [type, live ? { ...act, status: live.status } : act];
            }),
          ) as CadenceCard['activities'],
        }));
        const completed = cards.reduce((sum, c) => sum + Object.values(c.activities).filter(a => a?.status === 'completed').length, 0);
        const required = cards.reduce((sum, c) => sum + Object.keys(c.activities).length, 0);
        return {
          ...base,
          cards,
          activitiesCompleted: completed,
          activitiesRequired: required,
          completionRate: calcCompletionRate(completed, required),
        };
      }

      // Fallback degradado: fila ainda não foi gerada pelo motor (antes das 7h,
      // ou emulador sem cron) — monta a partir das activities avulsas. Perde a
      // distinção novo/sequência/follow-up (não existe ainda), mas é só o
      // estado transitório de antes da primeira geração do dia.
      if (statusById.size === 0) return null;

      const byDeal = new Map<string, RawActivity[]>();
      statusById.forEach((a, id) => {
        const list = byDeal.get(a.dealId) ?? [];
        list.push({ ...a, id });
        byDeal.set(a.dealId, list);
      });

      const cards: CadenceCard[] = Array.from(byDeal.entries()).map(([dealId, acts]) => {
        // Só entra no card o canal que realmente tem uma activity — um card
        // da sequência configurada pode ter menos dos 4 canais (ex. "Ligação"
        // adiada pra amanhã); um placeholder 'pending' pros ausentes gerava um
        // botão sem activityId por trás (clique não fazia nada).
        const activities: Partial<Record<ActivityType, CadenceActivity>> = {};
        for (const type of SDR_ACTIVITY_TYPES) {
          const act = acts.find(a => a.type === type);
          if (act) activities[type] = { type, status: act.status, activityId: act.id, sequenceOrder: act.sequenceOrder };
        }
        return {
          dealId,
          contactName: acts[0]?.contactName || 'Contato',
          companyName: acts[0]?.companyName || 'Empresa',
          productId: acts[0]?.productId || 'wizmart',
          isNew: true,
          activities,
        };
      });

      const allActs = Array.from(statusById.values());
      const completed = allActs.filter(a => a.status === 'completed').length;
      const required = allActs.length;

      return {
        sdrId,
        date: todayKey,
        cardsDistributed: cards.length,
        previousCompletionRate: 1,
        activitiesRequired: required,
        activitiesCompleted: completed,
        completionRate: calcCompletionRate(completed, required),
        cards,
      };
    },
    [todayKey, fetchTodayActivityStatuses],
  );

  useEffect(() => {
    if (!user?.tenantId || !user?.uid) {
      setLoading(false);
      return;
    }
    const { tenantId, uid } = user;
    let cancelled = false;

    setLoading(true);
    buildFallbackQueue(tenantId, uid).then(result => {
      if (!cancelled) {
        setQueue(result);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [user?.tenantId, user?.uid, todayKey, buildFallbackQueue]);

  const completionPct = queue
    ? Math.round(calcCompletionRate(queue.activitiesCompleted, queue.activitiesRequired) * 100)
    : 0;

  const refreshQueue = useCallback(async () => {
    if (!user?.tenantId || !user?.uid) return;
    const fallback = await buildFallbackQueue(user.tenantId, user.uid);
    setQueue(fallback);
  }, [user?.tenantId, user?.uid, buildFallbackQueue]);

  return { queue, loading, todayKey, completionPct, refreshQueue };
}
