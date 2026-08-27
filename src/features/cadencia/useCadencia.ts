/**
 * useCadencia.ts — Hook de dados para a tela de Cadência Diária
 *
 * O doc `cadence_queues/{uid}/daily/{hoje}` (gerado pelo Cloud Function
 * dailyCadenceEngine às 7h BRT) é a fonte de ORDEM/estrutura dos cards que
 * vieram da fila BDR — novo hoje, passo tardio da régua — mas nunca é
 * reescrito depois de criado. Quem sabe o status real de cada atividade é a
 * própria activity. Por isso toda leitura (inicial ou via `refreshQueue`)
 * passa por `buildFallbackQueue`: pega o esqueleto do doc da fila (se
 * existir) e sobrepõe o status atual de cada activity.
 *
 * Deals atribuídos ao SDR fora do motor (atribuição manual BDR→SDR — Fase
 * D2, pedido do Alan 27/08/2026) não esperam o cron do dia seguinte:
 * `ensureTodaySteps` roda a cada carregamento/refresh e, pra cada deal
 * `open` do SDR sem `handoffStatus`/`standbyActive`, verifica se o passo da
 * régua devido hoje (mesma lógica pura do dailyCadenceEngine, olhando
 * `assignedAt`) já tem activity — se não tiver, cria na hora. O card
 * resultante entra na fila mesmo que o doc do cron não o conheça.
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
  getDocs,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuthStore } from '../../stores/authStore';
import {
  getTodayBRT,
  missingCadenceTypesForDeal,
  calcCompletionRate,
  SDR_ACTIVITY_TYPES,
  type DailyQueue,
  type CadenceCard,
  type CadenceActivity,
  type ActivityType,
  type CadenceStepDef,
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
  contactName?: string;
  companyName?: string;
  productId?: string;
}

/** Monta um CadenceCard a partir das activities avulsas de um deal (sem
 * depender do doc da fila gerado pelo cron). */
function cardFromActivities(dealId: string, acts: RawActivity[]): CadenceCard {
  const activities: Partial<Record<ActivityType, CadenceActivity>> = {};
  for (const type of SDR_ACTIVITY_TYPES) {
    const act = acts.find(a => a.type === type);
    if (act) activities[type] = { type, status: act.status, activityId: act.id };
  }
  return {
    dealId,
    contactName: acts[0]?.contactName || 'Contato',
    companyName: acts[0]?.companyName || 'Empresa',
    productId: acts[0]?.productId || 'wizmart',
    isNew: true,
    activities,
  };
}

export function useCadencia(steps: CadenceStepDef[], stepsLoading: boolean = false) {
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

  // Garante que todo deal `open` do SDR já tenha, hoje, as activities do
  // passo da régua que vence hoje — sem depender do cron do dia seguinte.
  // Mesma lógica pura de dailyCadenceEngine.ts (bloco "passos tardios"),
  // rodando do lado do cliente pra reagir na hora da atribuição manual.
  const ensureTodaySteps = useCallback(
    async (tenantId: string, sdrId: string, statusById: Map<string, RawActivity>): Promise<boolean> => {
      if (steps.length === 0) return false;
      let assignedSnap;
      try {
        assignedSnap = await getDocs(query(
          collection(db, 'tenants', tenantId, 'deals'),
          where('assignedSdrId', '==', sdrId),
          where('status', '==', 'open'),
        ));
      } catch (err) {
        console.error('[useCadencia] Erro ao buscar deals atribuídos:', err);
        return false;
      }
      if (assignedSnap.empty) return false;

      const existingTypesByDeal = new Map<string, Set<ActivityType>>();
      statusById.forEach(a => {
        const set = existingTypesByDeal.get(a.dealId) ?? new Set<ActivityType>();
        set.add(a.type);
        existingTypesByDeal.set(a.dealId, set);
      });

      const todayDue = new Date();
      todayDue.setHours(23, 59, 0, 0);

      let created = false;
      for (const dealDoc of assignedSnap.docs) {
        const deal = dealDoc.data() as Record<string, any>;
        const assignedAt: Date | null = deal.assignedAt?.toDate?.() ?? null;
        const existing = existingTypesByDeal.get(dealDoc.id) ?? new Set<ActivityType>();
        const missing = missingCadenceTypesForDeal(steps, { ...deal, assignedAt }, existing);
        if (missing.length === 0) continue;

        for (const type of missing) {
          try {
            await addDoc(collection(db, 'tenants', tenantId, 'activities'), {
              dealId: dealDoc.id,
              userId: sdrId,
              type,
              cadenceType: 'sdr_daily',
              status: 'pending',
              scheduledAt: todayDue,
              dueAt: todayDue,
              coinsAwarded: 0,
              wasOnTime: false,
              overdueNotificationCount: 0,
              contactName: deal.company || 'Contato',
              companyName: deal.company || 'Empresa',
              productId: deal.productId || 'wizmart',
              createdAt: serverTimestamp(),
            });
            created = true;
          } catch (err) {
            // Não deixa um deal problemático (ex.: productId fora do escopo
            // do SDR) travar a montagem da fila inteira — segue pros demais.
            console.error(`[useCadencia] Erro ao montar a cadência do deal ${dealDoc.id}:`, err);
          }
        }
      }
      return created;
    },
    [steps],
  );

  const buildFallbackQueue = useCallback(
    async (tenantId: string, sdrId: string): Promise<DailyQueue | null> => {
      let [statusById, queueSnap] = await Promise.all([
        fetchTodayActivityStatuses(tenantId, sdrId),
        getDoc(doc(db, 'tenants', tenantId, 'cadence_queues', sdrId, 'daily', todayKey)),
      ]);

      const created = await ensureTodaySteps(tenantId, sdrId, statusById);
      if (created) statusById = await fetchTodayActivityStatuses(tenantId, sdrId);

      // Caminho principal: já existe a fila gerada pelo motor — ela é a fonte
      // certa de ORDEM dos cards e dos badges (novo hoje / passo tardio da
      // régua) pros deals que vieram da fila BDR. Só precisamos atualizar o
      // `status` de cada atividade com o valor real (o doc da fila em si
      // nunca muda depois de criado). Reconstruir do zero a partir das
      // activities (como o código antigo fazia) perdia ordem e badges a
      // cada "Concluir" — corrigido aqui.
      if (queueSnap.exists()) {
        const base = queueSnap.data() as DailyQueue;
        const knownDealIds = new Set(base.cards.map(c => c.dealId));
        const cards: CadenceCard[] = base.cards.map(card => ({
          ...card,
          activities: Object.fromEntries(
            Object.entries(card.activities).map(([type, act]) => {
              const live = act?.activityId ? statusById.get(act.activityId) : null;
              return [type, live ? { ...act, status: live.status } : act];
            }),
          ) as CadenceCard['activities'],
        }));

        // Cards fora do doc do cron (ex.: deal atribuído manualmente ao SDR,
        // ou cadência montada agora mesmo por ensureTodaySteps) — precisam
        // aparecer também, não só os que o motor já conhecia hoje de manhã.
        const extraByDeal = new Map<string, RawActivity[]>();
        statusById.forEach((a, id) => {
          if (knownDealIds.has(a.dealId)) return;
          const list = extraByDeal.get(a.dealId) ?? [];
          list.push({ ...a, id });
          extraByDeal.set(a.dealId, list);
        });
        extraByDeal.forEach((acts, dealId) => cards.push(cardFromActivities(dealId, acts)));

        const completed = cards.reduce((sum, c) => sum + Object.values(c.activities).filter(a => a?.status === 'completed').length, 0);
        const required = cards.reduce((sum, c) => sum + Object.keys(c.activities).length, 0);
        return {
          ...base,
          cardsDistributed: cards.length,
          cards,
          activitiesCompleted: completed,
          activitiesRequired: required,
          completionRate: calcCompletionRate(completed, required),
        };
      }

      // Fallback: doc da fila do cron ainda não existe hoje (antes das 7h,
      // emulador sem cron, ou o SDR só tem deals atribuídos manualmente) —
      // monta inteiramente a partir das activities avulsas.
      if (statusById.size === 0) return null;

      const byDeal = new Map<string, RawActivity[]>();
      statusById.forEach((a, id) => {
        const list = byDeal.get(a.dealId) ?? [];
        list.push({ ...a, id });
        byDeal.set(a.dealId, list);
      });

      const cards: CadenceCard[] = Array.from(byDeal.entries()).map(([dealId, acts]) => cardFromActivities(dealId, acts));

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
    [todayKey, fetchTodayActivityStatuses, ensureTodaySteps],
  );

  useEffect(() => {
    if (!user?.tenantId || !user?.uid) {
      setLoading(false);
      return;
    }
    // Espera a régua configurada carregar antes de gerar qualquer activity —
    // `steps` cai no padrão do documento enquanto settings/cadence ainda não
    // resolveu, e usar isso pra criar activities criaria passos errados que
    // ensureTodaySteps nunca mais corrige (ele só completa o que falta).
    if (stepsLoading) return;
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
  }, [user?.tenantId, user?.uid, todayKey, buildFallbackQueue, stepsLoading]);

  const completionPct = queue
    ? Math.round(calcCompletionRate(queue.activitiesCompleted, queue.activitiesRequired) * 100)
    : 0;

  const refreshQueue = useCallback(async () => {
    if (!user?.tenantId || !user?.uid || stepsLoading) return;
    const fallback = await buildFallbackQueue(user.tenantId, user.uid);
    setQueue(fallback);
  }, [user?.tenantId, user?.uid, buildFallbackQueue, stepsLoading]);

  return { queue, loading, todayKey, completionPct, refreshQueue };
}
