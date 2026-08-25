/**
 * useCadenceConfig.ts — Lê tenants/{tid}/settings/cadence em tempo real
 *
 * Usado pelo admin (CadenceConfigPage, pra editar) e pela tela do SDR
 * (CadenciaPage, só pra saber a ordem/sequência configurada e exibir a
 * orientação da sequência nos cards).
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuthStore } from '../../stores/authStore';
import { DEFAULT_PERIOD_TIMES, type SequenceStep, type PeriodTimes } from '../../utils/cadenceUtils';

export interface CadenceConfigDoc {
  newCardsPerDay: number;
  weeklyContacts: number[];
  repFirstContactBusinessDays: number;
  sequence: SequenceStep[];
  periodTimes: PeriodTimes;
}

const DEFAULTS: CadenceConfigDoc = {
  newCardsPerDay: 3,
  weeklyContacts: [3, 2, 1],
  repFirstContactBusinessDays: 3,
  sequence: [],
  periodTimes: DEFAULT_PERIOD_TIMES,
};

export function useCadenceConfig() {
  const { user } = useAuthStore();
  const [config, setConfig] = useState<CadenceConfigDoc>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.tenantId) { setLoading(false); return; }
    const ref = doc(db, 'tenants', user.tenantId, 'settings', 'cadence');
    const unsub = onSnapshot(ref, snap => {
      const d = snap.data();
      setConfig({
        newCardsPerDay: d?.sdr?.newCardsPerDay ?? DEFAULTS.newCardsPerDay,
        weeklyContacts: Array.isArray(d?.sdr?.weeklyContacts) ? d.sdr.weeklyContacts : DEFAULTS.weeklyContacts,
        repFirstContactBusinessDays: d?.rep?.firstContactBusinessDays ?? DEFAULTS.repFirstContactBusinessDays,
        sequence: Array.isArray(d?.sdr?.sequence) ? d.sdr.sequence : DEFAULTS.sequence,
        periodTimes: d?.sdr?.periodTimes ?? DEFAULTS.periodTimes,
      });
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [user?.tenantId]);

  return { config, loading };
}

export default useCadenceConfig;
