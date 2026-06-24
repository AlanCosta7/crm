/**
 * useCadencia.ts — Hook de dados para a tela de Cadência Diária
 *
 * Estratégia de leitura (com fallback progressivo):
 *  1. Tenta ler `cadence_queues/{uid}/daily/{hoje}` no Firestore
 *     (gerado pelo Cloud Function dailyCadenceEngine às 7h BRT)
 *  2. Se não existir ainda (antes das 7h ou emulador sem cron),
 *     monta uma fila virtual a partir das `activities` de hoje do SDR
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
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuthStore } from '../../stores/authStore';
import {
  getTodayBRT,
  calcCompletionRate,
  SDR_ACTIVITY_TYPES,
  type DailyQueue,
  type CadenceCard,
  type ActivityType,
} from '../../utils/cadenceUtils';

export function useCadencia() {
  const { user } = useAuthStore();
  const todayKey = getTodayBRT();

  const [queue,   setQueue]   = useState<DailyQueue | null>(null);
  const [loading, setLoading] = useState(true);

  const buildFallbackQueue = useCallback(
    async (tenantId: string, sdrId: string): Promise<DailyQueue | null> => {
      // Lê activities do SDR de hoje com cadenceType sdr_daily
      const activitiesRef = collection(db, 'tenants', tenantId, 'activities');
      const q = query(
        activitiesRef,
        where('userId', '==', sdrId),
        where('cadenceType', '==', 'sdr_daily'),
      );

      return new Promise((resolve) => {
        const unsub = onSnapshot(q, (snap) => {
          unsub();
          // Filtra apenas as de hoje (BRT)
          const todayActivities = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter((a: any) => {
              if (!a.scheduledAt) return false;
              const date: Date = a.scheduledAt?.toDate ? a.scheduledAt.toDate() : new Date(a.scheduledAt);
              return getTodayBRT(date) === todayKey;
            });

          if (todayActivities.length === 0) {
            resolve(null);
            return;
          }

          // Agrupa por dealId para montar os cards
          const byDeal: Record<string, any[]> = {};
          for (const a of todayActivities as any[]) {
            if (!byDeal[a.dealId]) byDeal[a.dealId] = [];
            byDeal[a.dealId].push(a);
          }

          const cards: CadenceCard[] = Object.entries(byDeal).map(([dealId, acts]) => {
            const activities: Partial<Record<ActivityType, any>> = {};
            for (const type of SDR_ACTIVITY_TYPES) {
              const act = acts.find((a: any) => a.type === type);
              activities[type] = act
                ? { type, status: act.status, activityId: act.id }
                : { type, status: 'pending' };
            }
            return {
              dealId,
              contactName: acts[0]?.contactName || 'Contato',
              companyName: acts[0]?.companyName || 'Empresa',
              productId: acts[0]?.productId || 'wizmart',
              isNew: true,
              activities: activities as Record<ActivityType, any>,
            };
          });

          const completed = todayActivities.filter((a: any) => a.status === 'completed').length;
          const required  = todayActivities.length;

          resolve({
            sdrId,
            date: todayKey,
            cardsDistributed: cards.length,
            previousCompletionRate: 1,
            activitiesRequired: required,
            activitiesCompleted: completed,
            completionRate: calcCompletionRate(completed, required),
            cards,
          });
        });
      });
    },
    [todayKey],
  );

  useEffect(() => {
    if (!user?.tenantId || !user?.uid) {
      setLoading(false);
      return;
    }

    const { tenantId, uid } = user;

    // Tenta ler a queue gerada pelo cron
    const queueRef = doc(db, 'tenants', tenantId, 'cadence_queues', uid, 'daily', todayKey);

    let unsubActivities = () => {};

    const init = async () => {
      setLoading(true);
      const snap = await getDoc(queueRef);

      if (snap.exists()) {
        // Queue gerada pelo Cloud Function — assina em tempo real
        unsubActivities = onSnapshot(queueRef, (s) => {
          if (s.exists()) setQueue({ id: s.id, ...s.data() } as DailyQueue);
        });
      } else {
        // Fallback: monta queue a partir das activities individuais
        const fallback = await buildFallbackQueue(tenantId, uid);
        setQueue(fallback);
      }

      setLoading(false);
    };

    init();
    return () => unsubActivities();
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
