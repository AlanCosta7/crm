import { useEffect, useState } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { useAuthStore } from '../stores/authStore';
import type { LeaderboardUser } from '../types/crm';

/**
 * Hook para assinar a classificação do Leaderboard no Realtime Database em tempo real.
 * Utiliza conexão via WebSocket nativa do RTDB (<100ms latência).
 */
export function useLeaderboard() {
  const { user } = useAuthStore();
  const [data, setData] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user?.tenantId) {
      setData([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const leaderboardRef = ref(rtdb, `tenants/${user.tenantId}/leaderboard`);

    const handleValue = (snapshot: any) => {
      const val = snapshot.val();
      if (val) {
        // O valor pode ser retornado como um mapa ou array do Firebase RTDB
        const list: LeaderboardUser[] = [];
        
        if (Array.isArray(val)) {
          val.forEach((item, index) => {
            if (item) {
              list.push({
                id: item.id || `user_${index}`,
                name: item.name || 'Vendedor',
                initials: item.initials || 'V',
                color: item.color || '#6B7280',
                pts: item.pts || 0,
                coinBalance: item.coinBalance || 0,
                productIds: item.productIds || ['wizmart'],
                emails: item.emails || 0,
                whats: item.whats || 0,
                meetings: item.meetings || 0,
                level: item.level || 'Jr',
                streak: item.streak || 0,
                trend: item.trend !== undefined ? item.trend : 0,
                rank: index + 1
              });
            }
          });
        } else {
          Object.entries(val).forEach(([key, value]: [string, any]) => {
            if (value) {
              list.push({
                id: key,
                name: value.name || 'Vendedor',
                initials: value.initials || 'V',
                color: value.color || '#6B7280',
                pts: value.pts || 0,
                coinBalance: value.coinBalance || 0,
                productIds: value.productIds || ['wizmart'],
                emails: value.emails || 0,
                whats: value.whats || 0,
                meetings: value.meetings || 0,
                level: value.level || 'Jr',
                streak: value.streak || 0,
                trend: value.trend !== undefined ? value.trend : 0,
                rank: value.rank || 99
              });
            }
          });
        }

        // Ordena por pontuação descrescente
        list.sort((a, b) => b.pts - a.pts);

        // Recalcula o ranking correspondente baseado nas pontuações ordenadas
        const rankedList = list.map((item, index) => ({
          ...item,
          rank: index + 1
        }));

        setData(rankedList);
      } else {
        setData([]);
      }
      setLoading(false);
    };

    try {
      onValue(leaderboardRef, handleValue, (error) => {
        console.error("[useLeaderboard] Erro ao carregar dados do RTDB:", error);
        setError(error);
        setData([]);
        setLoading(false);
      });
    } catch (err) {
      console.warn("[useLeaderboard] Erro síncrono no onValue do RTDB:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setData([]);
      setLoading(false);
    }

    return () => {
      off(leaderboardRef, 'value', handleValue);
    };
  }, [user?.tenantId]);

  return { data, loading, error };
}

export default useLeaderboard;
