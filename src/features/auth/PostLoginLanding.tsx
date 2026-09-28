/**
 * PostLoginLanding.tsx — onde cada papel cai ao entrar no CRM
 *
 * Fase 2.4 do PLANO_DESENHO_CRM.md. Slide 9 do deck: "O SDR abriu o CRM e a
 * primeira página é a de Atividades com o Bloco de Horários."
 *
 * Por que não um redirect fixo na rota `/`: o SDR continua precisando do
 * Dashboard (o painel dele tem alertas de agenda, cards vencidos e o
 * Fechamento do Dia). Um redirect permanente tornaria o item "Dashboard" da
 * sidebar inalcançável — clicar nele voltaria para Atividades.
 *
 * Então o desvio é de UMA VEZ, na primeira renderização depois do login:
 * `LoginPage` deixa a marca em `sessionStorage`, e este componente a consome.
 * Navegação posterior para `/` mostra o Dashboard normalmente.
 *
 * `sessionStorage` (e não state de rota) porque `useAuth` só resolve o papel
 * depois do redirect do login — quando este componente monta, a marca já está
 * lá e o papel já está no store.
 */

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

/** Marca consumida uma única vez. Exportada para o LoginPage gravar. */
export const POST_LOGIN_FLAG = 'wm_post_login';

/** Papel → rota inicial. Quem não está aqui cai no Dashboard, como antes. */
const LANDING_BY_ROLE: Record<string, string> = {
  sdr: '/activities',
};

/**
 * Lê e apaga a marca. Devolve a rota de pouso do papel, ou null.
 *
 * Roda uma única vez, no inicializador do `useState` — sem efeito, para não
 * pintar o Dashboard num frame antes de desviar (e sem `setState` dentro de
 * `useEffect`, que dispara render em cascata).
 */
function consumirMarca(role: string | undefined): string | null {
  if (!role) return null;
  try {
    if (!sessionStorage.getItem(POST_LOGIN_FLAG)) return null;
    sessionStorage.removeItem(POST_LOGIN_FLAG);
  } catch {
    // Navegador com storage bloqueado: sem a marca, cai no Dashboard. É o
    // comportamento antigo, não um erro.
    return null;
  }
  return LANDING_BY_ROLE[role] ?? null;
}

export function PostLoginLanding({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();

  // `ProtectedRoute` só renderiza os filhos com o usuário já carregado, então o
  // papel existe neste primeiro render. Se por algum caminho não existir, a
  // marca é preservada e o Dashboard aparece — degradação, não erro.
  const [destino] = useState<string | null>(() => consumirMarca(user?.role));

  if (destino) return <Navigate to={destino} replace />;
  return <>{children}</>;
}

export default PostLoginLanding;
