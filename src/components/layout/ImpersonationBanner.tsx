/**
 * Faixa fixa no topo, visível em toda tela enquanto o Master está
 * "Visualizando como" outra pessoa — para nunca ficar ambíguo em qual
 * identidade uma ação está sendo tomada.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { useAuthStore } from '../../stores/authStore';
import { useImpersonationSession } from '../../features/auth/useImpersonationSession';
import { stopImpersonation } from '../../features/auth/impersonation';

const ROLE_LABEL: Record<string, string> = {
  master: 'Admin Master',
  manager: 'Gestor',
  bdr: 'BDR',
  sdr: 'SDR',
  rep: 'Representante',
  design: 'Design',
  viewer: 'Visualizador',
};

export function ImpersonationBanner() {
  const user = useAuthStore(s => s.user);
  const info = useImpersonationSession();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  if (!info || !user) return null;

  const handleLeave = async () => {
    setLeaving(true);
    try {
      const result = await stopImpersonation(user.uid);
      if (result === 'signed-out') {
        navigate('/login', { state: { impersonationEnded: true } });
      }
      // 'returned': onAuthStateChanged assume a partir daqui — a própria
      // troca de sessão já faz o app inteiro re-renderizar como o Master.
    } catch (err) {
      console.error('[ImpersonationBanner] falha ao encerrar visualização:', err);
      setLeaving(false);
    }
  };

  return (
    <div className="imp-banner" role="status">
      <Icon name="Eye" size={15} />
      <span>
        Visualizando como <strong>{user.name}</strong>
        {' '}({ROLE_LABEL[user.role] ?? user.role}) — iniciado por {info.actorName}
      </span>
      <button type="button" className="imp-banner-btn" onClick={handleLeave} disabled={leaving}>
        <Icon name="LogOut" size={13} />
        {leaving ? 'Voltando...' : 'Voltar para Admin'}
      </button>
    </div>
  );
}
