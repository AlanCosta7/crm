/**
 * useCadenceConfig.ts — Lê tenants/{tid}/settings/cadence em tempo real
 *
 * Usado pelo admin (CadenceConfigPage, pra editar) e pela tela do SDR
 * (CadenciaPage, pra exibir os próximos passos da régua configurada).
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuthStore } from '../../stores/authStore';
import { DEFAULT_SDR_CADENCE_STEPS, normalizeSteps, type CadenceStepDef } from '../../utils/cadenceUtils';

export interface CadenceConfigDoc {
  newCardsPerDay: number;
  repFirstContactBusinessDays: number;
  steps: CadenceStepDef[];
}

const DEFAULTS: CadenceConfigDoc = {
  newCardsPerDay: 3,
  repFirstContactBusinessDays: 3,
  steps: DEFAULT_SDR_CADENCE_STEPS,
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
        repFirstContactBusinessDays: d?.rep?.firstContactBusinessDays ?? DEFAULTS.repFirstContactBusinessDays,
        steps: normalizeSteps(d?.sdr?.steps),
      });
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [user?.tenantId]);

  return { config, loading };
}

export default useCadenceConfig;
