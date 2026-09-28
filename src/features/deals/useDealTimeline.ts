/**
 * useDealTimeline.ts — assina `tenants/{tid}/deal_timeline/{dealId}/events`.
 * As rules só liberam a leitura a quem pode ver o deal pai; erro de permissão
 * vira lista vazia (o Histórico segue funcionando sem os eventos).
 */
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuthStore } from '../../stores/authStore';
import type { DealTimelineEvent } from './dealTimeline';

export function useDealTimeline(dealId: string | undefined): DealTimelineEvent[] {
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const [events, setEvents] = useState<DealTimelineEvent[]>([]);

  useEffect(() => {
    if (!tenantId || !dealId) { setEvents([]); return; }
    const unsub = onSnapshot(
      collection(db, 'tenants', tenantId, 'deal_timeline', dealId, 'events'),
      (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as DealTimelineEvent)),
      (err) => { console.warn('[useDealTimeline] sem acesso à timeline:', err.code); setEvents([]); },
    );
    return unsub;
  }, [tenantId, dealId]);

  return events;
}
