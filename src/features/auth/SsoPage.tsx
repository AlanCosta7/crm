/**
 * SsoPage.tsx — recebe o handoff de SSO vindo do wizmart-rep-app.
 *
 * Rota pública (`/sso`, sem ProtectedRoute — o usuário ainda não está
 * autenticado NESTA origem quando ela carrega): lê `token` + `next` da URL,
 * troca o custom token por uma sessão real (`signInWithCustomToken`) e
 * navega para `next`, removendo o token da URL/histórico.
 *
 * Não fica linkada em nenhum menu — só é alcançada pelo redirecionamento
 * controlado que `mintHandoffToken` (Rep App) produz. Ver
 * PLANO_PWA_REPRESENTANTES.md §3.3.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { Logo } from '../../components/ui/Logo';
import { Icon } from '../../components/ui/Icon';

export function SsoPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const next = searchParams.get('next') || '/';

    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    let cancelled = false;

    signInWithCustomToken(auth, token)
      .then(() => {
        if (cancelled) return;
        // Substitui a entrada atual do histórico — o token nunca fica
        // navegável via "voltar" do navegador.
        navigate(next, { replace: true });
      })
      .catch((err) => {
        console.error('[SsoPage] falha ao trocar o token de handoff:', err);
        if (cancelled) return;
        setError('Não foi possível entrar automaticamente. Faça login normalmente.');
        window.setTimeout(() => {
          if (!cancelled) navigate('/login', { replace: true });
        }, 2500);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        height: '100vh',
        width: '100vw',
        background: 'var(--bg)',
      }}
    >
      <Logo size={44} />
      {error ? (
        <div className="row" style={{ gap: 8, color: 'var(--danger)' }}>
          <Icon name="AlertTriangle" size={16} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>{error}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-2)' }}>
          <span className="sk" style={{ width: 14, height: 14, borderRadius: '50%' }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Entrando…</span>
        </div>
      )}
    </div>
  );
}

export default SsoPage;
