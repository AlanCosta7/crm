/**
 * useGamificationSettings.ts — lê tenants/{tid}/settings/gamification em tempo
 * real (PLANO_DESENHO_CRM_2.md — pontuação configurável).
 *
 * Mesmo padrão de `useCadenceConfig.ts`: documento ausente ou parcial cai nos
 * padrões de `utils/gamificationSettings.ts` — ninguém tem a pontuação
 * alterada até o master mexer na tela (GamificacaoPane).
 */
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuthStore } from '../../stores/authStore';
import { effectiveActionPoints, effectiveSdrRankingWeights, type ActionPoints, type SdrRankingWeights } from '../../utils/gamificationSettings';

export function useGamificationSettings() {
  const { user } = useAuthStore();
  const [actionPoints, setActionPoints] = useState<ActionPoints>(effectiveActionPoints(undefined));
  const [sdrRankingWeights, setSdrRankingWeights] = useState<SdrRankingWeights>(effectiveSdrRankingWeights(undefined));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.tenantId) { setLoading(false); return; }
    const ref = doc(db, 'tenants', user.tenantId, 'settings', 'gamification');
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      setActionPoints(effectiveActionPoints(d));
      setSdrRankingWeights(effectiveSdrRankingWeights(d));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [user?.tenantId]);

  return { actionPoints, sdrRankingWeights, loading };
}

export default useGamificationSettings;
