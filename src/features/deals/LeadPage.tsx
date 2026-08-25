/**
 * LeadPage.tsx — Página inteira do lead (rota /lead/:dealId)
 *
 * Pedido do cliente (Observações CRM, jul/2026): "Ao clicar no card, abrir uma
 * página inteira, em vez de uma aba." Reaproveita o DealSidebar em modo 'page'.
 * Voltar retorna à tela anterior (Pipeline, Cadência, Dashboard...).
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DealSidebar } from './DealSidebar';

interface Toast {
  id: string;
  text: string;
}

export function LeadPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (g: { pts: number; label?: string; custom?: string }) => {
    const id = Math.random().toString(36).slice(2, 9);
    const text = g.custom ?? g.label ?? (g.pts > 0 ? `+${g.pts} pts` : '');
    if (!text) return;
    setToasts(p => [...p, { id, text }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3200);
  };

  if (!dealId) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <div style={{ padding: '4px 0 24px' }}>
      <DealSidebar
        dealId={dealId}
        variant="page"
        onClose={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
        onPoints={pushToast}
      />

      {/* Toasts simples da página */}
      <div style={{ position: 'fixed', right: 18, bottom: 18, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 400 }}>
        {toasts.map(t => (
          <div
            key={t.id}
            role="status"
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '10px 14px', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 24px rgba(0,0,0,.12)',
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export default LeadPage;
