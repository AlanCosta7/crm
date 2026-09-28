/**
 * Modal "Visualizar como..." — só Master vê o gatilho (no Topbar).
 *
 * Lista os usuários reais do tenant (não perfis genéricos): escolher um
 * dispara `impersonateUser`, que troca a sessão de verdade — é assim que o
 * teste reflete as Security Rules de cada perfil, não só a aparência da UI.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { Av } from '../ui/Av';
import { useFirestoreCollection } from '../../hooks/useFirestore';
import { useAuthStore } from '../../stores/authStore';
import { startImpersonation } from '../../features/auth/impersonation';
import type { SettingUser } from '../../types/crm';

interface ViewAsModalProps {
  onClose: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  master: 'Admin Master',
  manager: 'Gestor',
  bdr: 'BDR',
  sdr: 'SDR',
  rep: 'Representante',
  design: 'Design',
  viewer: 'Visualizador',
};

const ROLE_ORDER = ['manager', 'bdr', 'sdr', 'rep', 'design', 'viewer', 'master'];

/** Normaliza para comparar sem acento e sem diferença de caixa. */
function fold(value: string): string {
  return (value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

export function ViewAsModal({ onClose }: ViewAsModalProps) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { data: users, loading } = useFirestoreCollection<SettingUser>('users');

  const [query, setQuery] = useState('');
  const [startingUid, setStartingUid] = useState<string | null>(null);
  const [error, setError] = useState('');

  const groups = useMemo(() => {
    const q = fold(query);
    const candidates = users
      .filter(u => u.id !== user?.uid) // não impersonar a si mesmo
      .filter(u => u.isActive !== false) // conta desativada não faz sentido testar
      .filter(u => !q || fold(u.name).includes(q) || fold(u.email).includes(q));

    const byRole = new Map<string, SettingUser[]>();
    for (const u of candidates) {
      const list = byRole.get(u.role) ?? [];
      list.push(u);
      byRole.set(u.role, list);
    }
    for (const list of byRole.values()) list.sort((a, b) => a.name.localeCompare(b.name));

    return ROLE_ORDER.filter(r => byRole.has(r)).map(role => ({ role, users: byRole.get(role)! }));
  }, [users, user?.uid, query]);

  const handlePick = async (u: SettingUser) => {
    if (!u.id || startingUid) return;
    setStartingUid(u.id);
    setError('');
    try {
      await startImpersonation(u.id, user?.name ?? 'Admin Master');
      onClose();
      navigate('/'); // a rota atual pode não existir para o perfil alvo
    } catch (err) {
      console.error('[ViewAsModal] falha ao iniciar visualização:', err);
      const message = (err as { message?: string })?.message;
      setError(message?.includes('permission') ? 'Sem permissão para essa ação.' : 'Não foi possível iniciar a visualização.');
      setStartingUid(null);
    }
  };

  return (
    <div className="modal-ov" style={{ zIndex: 340 }} onClick={onClose}>
      <div className="modal viewas-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <h3>Visualizar como</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="viewas-search">
          <Icon name="Search" size={15} color="var(--text-2)" />
          <input
            autoFocus
            placeholder="Buscar por nome ou e-mail..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Buscar usuário"
          />
        </div>

        {error && (
          <div className="note-error" role="alert" style={{ margin: '0 16px' }}>
            <Icon name="TriangleAlert" size={14} /> {error}
          </div>
        )}

        <div className="viewas-list">
          {loading ? (
            <div className="muted viewas-empty">Carregando usuários...</div>
          ) : groups.length === 0 ? (
            <div className="muted viewas-empty">Nenhum usuário encontrado.</div>
          ) : (
            groups.map(g => (
              <div key={g.role} className="viewas-group">
                <div className="viewas-group-label">{ROLE_LABEL[g.role] ?? g.role}</div>
                {g.users.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    className="viewas-row"
                    disabled={!!startingUid}
                    onClick={() => handlePick(u)}
                  >
                    <Av name={u.name} initials={u.initials} color={u.color} size={30} />
                    <div className="viewas-row-info">
                      <span className="viewas-row-name">{u.name}</span>
                      <span className="muted viewas-row-email">{u.email}</span>
                    </div>
                    {startingUid === u.id ? (
                      <span className="muted" style={{ fontSize: 11.5 }}>Entrando...</span>
                    ) : (
                      <Icon name="ChevronRight" size={15} color="var(--text-2)" />
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
