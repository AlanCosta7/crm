import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { Logo } from '../../components/ui/Logo';
import { Icon } from '../../components/ui/Icon';

// Usuários de teste seedados via `npm run emulators:seed` (scripts/seed-emulators.mjs).
// Disponíveis apenas em ambiente de desenvolvimento (emulador), nunca em produção.
const QUICK_LOGIN_USERS = [
  { email: 'master@wizmart.com.br', label: 'Ricardo', role: 'Master', icon: 'Crown', color: '#1A6B1A' },
  { email: 'manager@wizmart.com.br', label: 'Fernanda', role: 'Manager', icon: 'ShieldCheck', color: '#0E7490' },
  { email: 'bdr@wizmart.com.br', label: 'Lucas', role: 'BDR', icon: 'PhoneCall', color: '#7C3AED' },
  { email: 'sdr@wizmart.com.br', label: 'João', role: 'SDR', icon: 'Mail', color: '#B45309' },
  { email: 'rep@wizmart.com.br', label: 'Carla', role: 'Rep', icon: 'Handshake', color: '#B91C1C' },
  { email: 'design@wizmart.com.br', label: 'Fernanda D.', role: 'Design', icon: 'Palette', color: '#7C3AED' },
  { email: 'viewer@wizmart.com.br', label: 'Paulo', role: 'Viewer', icon: 'Eye', color: '#4B5563' },
];
const QUICK_LOGIN_PASSWORD = 'senha_de_teste_123';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [quickLoginEmail, setQuickLoginEmail] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  // Rota para redirecionamento após o login correto
  const from = location.state?.from?.pathname || '/';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Credenciais inválidas. Verifique seu e-mail e senha.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (quickEmail: string) => {
    setError('');
    setQuickLoginEmail(quickEmail);
    try {
      await signInWithEmailAndPassword(auth, quickEmail, QUICK_LOGIN_PASSWORD);
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('Quick login error:', err);
      setError('Não foi possível entrar com esse perfil. Rode "npm run emulators:seed".');
    } finally {
      setQuickLoginEmail(null);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        background: 'radial-gradient(circle at 10% 20%, var(--primary-light) 0%, var(--bg) 90%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Elementos geométricos decorativos em gradiente */}
      <div
        style={{
          position: 'absolute',
          width: 350,
          height: 350,
          borderRadius: '50%',
          background: 'var(--grad)',
          opacity: 0.08,
          top: '-10%',
          left: '-5%',
          filter: 'blur(40px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 450,
          height: 450,
          borderRadius: '50%',
          background: 'var(--grad)',
          opacity: 0.06,
          bottom: '-15%',
          right: '-5%',
          filter: 'blur(50px)',
        }}
      />

      {/* Card de Login */}
      <div
        className="card card-pad"
        style={{
          width: 420,
          boxShadow: '0 20px 50px rgba(26,107,26,0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          zIndex: 10,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
          <Logo size={42} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--text-primary)' }}>
            Bem-vindo ao CRM
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
            Insira suas credenciais para gerenciar suas vendas.
          </div>
        </div>

        {error && (
          <div
            className="badge badge-danger"
            style={{
              padding: '10px 14px',
              height: 'auto',
              borderRadius: 'var(--r-input)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'normal',
              lineHeight: 1.3,
            }}
          >
            <Icon name="AlertTriangle" size={16} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field" style={{ margin: 0 }}>
            <div className="fl">E-mail corporativo</div>
            <input
              type="email"
              className="input"
              required
              placeholder="ex: joao@suaempresa.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="field" style={{ margin: 0 }}>
            <div className="fl">Senha de acesso</div>
            <input
              type="password"
              className="input"
              required
              placeholder="Digite sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            disabled={loading}
          >
            {loading ? (
              <span className="row" style={{ gap: 8 }}>
                <span className="sk" style={{ width: 14, height: 14, borderRadius: '50%' }} />
                Carregando...
              </span>
            ) : (
              <>
                Entrar no Sistema
                <Icon name="ArrowRight" size={16} />
              </>
            )}
          </button>
        </form>

        {import.meta.env.DEV && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: 'var(--text-2)',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              Login rápido (dev)
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {QUICK_LOGIN_USERS.map((qu) => (
                <button
                  key={qu.email}
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleQuickLogin(qu.email)}
                  disabled={loading || quickLoginEmail !== null}
                  style={{
                    justifyContent: 'flex-start',
                    gap: 8,
                    padding: '8px 10px',
                    fontSize: 12,
                  }}
                  title={qu.email}
                >
                  {quickLoginEmail === qu.email ? (
                    <span className="sk" style={{ width: 14, height: 14, borderRadius: '50%' }} />
                  ) : (
                    <Icon name={qu.icon} size={14} color={qu.color} />
                  )}
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
                    <span style={{ fontWeight: 600 }}>{qu.role}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{qu.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginPage;
