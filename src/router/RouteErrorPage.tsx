import { useEffect } from 'react';
import { useRouteError } from 'react-router-dom';

// Erros de DOM ("insertBefore"/"removeChild" — nó não é filho) e de chunk
// desatualizado (deploy novo com a aba antiga aberta) se resolvem recarregando.
const RECOVERABLE = /NotFoundError|insertBefore|removeChild|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const RELOAD_KEY = 'wizmart:route-error-reload';

export default function RouteErrorPage() {
  const error = useRouteError();
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const recoverable = RECOVERABLE.test(text);

  useEffect(() => {
    console.error('[RouteError]', error);
    if (!recoverable) return;
    // Recarrega automaticamente uma única vez por minuto, para não entrar em loop.
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      /* sessionStorage indisponível — o usuário usa o botão */
    }
  }, [error, recoverable]);

  return (
    <div
      translate="no"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 12,
        padding: 24,
        textAlign: 'center',
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>Algo deu errado nesta tela</div>
      <div style={{ maxWidth: 420, fontSize: 14, color: 'var(--text-2)' }}>
        Recarregue a página para continuar. Se estiver usando o tradutor do navegador, desative-o para este site.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
        >
          Recarregar
        </button>
        <button
          onClick={() => { window.location.href = '/'; }}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer' }}
        >
          Ir ao início
        </button>
      </div>
      <details style={{ marginTop: 16, maxWidth: 640, fontSize: 12, color: 'var(--text-2)' }}>
        <summary style={{ cursor: 'pointer' }}>Detalhes técnicos</summary>
        <pre style={{ whiteSpace: 'pre-wrap', textAlign: 'left' }}>{text}</pre>
      </details>
    </div>
  );
}
