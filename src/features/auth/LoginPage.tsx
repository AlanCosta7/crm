import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { Logo } from '../../components/ui/Logo';
import { Icon } from '../../components/ui/Icon';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  type DemoRole = 'master' | 'manager' | 'bdr' | 'sdr' | 'rep' | 'viewer';

  // Login de Demonstração Rápido — todos os 6 roles
  const handleDemoLogin = async (role: DemoRole) => {
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, `${role}@wizmart.com.br`, 'senha_de_teste_123');
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('Demo login failed:', err);
      setError('Conta de teste não encontrada. Rode o seed dos emuladores locais.');
    } finally {
      setLoading(false);
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

        <div style={{ position: 'relative', textAlign: 'center', margin: '6px 0' }}>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--border)', zIndex: 1 }} />
          <span style={{ position: 'relative', background: '#fff', padding: '0 10px', fontSize: 11, fontWeight: 600, color: '#9aa3af', zIndex: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Acesso Rápido de Teste
          </span>
        </div>

        {/* Acesso rápido para os 6 roles v2 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([
              { role: 'master',  label: 'Admin Master',  icon: 'ShieldCheck',      color: '#1A6B1A' },
              { role: 'manager', label: 'Gestor',         icon: 'BarChart3',        color: '#0E7490' },
              { role: 'bdr',     label: 'BDR',            icon: 'Target',           color: '#7C3AED' },
              { role: 'sdr',     label: 'SDR',            icon: 'ListChecks',       color: '#B45309' },
              { role: 'rep',     label: 'Representante',  icon: 'Handshake',        color: '#B91C1C' },
              { role: 'viewer',  label: 'Visualizador',   icon: 'Eye',              color: '#4B5563' },
            ] as const).map(({ role, label, icon, color }) => (
              <button
                key={role}
                onClick={() => handleDemoLogin(role)}
                className="btn btn-sm"
                style={{
                  justifyContent: 'center',
                  background: `${color}0D`,
                  border: `1.5px solid ${color}33`,
                  color,
                  fontWeight: 600,
                  gap: 6,
                }}
                disabled={loading}
              >
                <Icon name={icon} size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
