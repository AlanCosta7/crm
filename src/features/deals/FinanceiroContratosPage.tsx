/**
 * FinanceiroContratosPage.tsx — fila do financeiro (Fase 5.4 do PLANO_DESENHO_CRM.md)
 *
 * Slide 11 do deck "Desenho CRM": "...um 'check' para alguém do time financeiro
 * clicar dizendo que foi pago." Esta é a metade "check" — a metade "anexar" é
 * `ContractSlot.tsx`, no card do deal.
 *
 * Único ponto de entrada do papel `financeiro` no CRM (além do e-mail do dia 09,
 * que só avisa — não tem link direto por deal, de propósito: uma lista sempre
 * atualizada é mais confiável que um link que pode ficar velho).
 *
 * A query usa `where('mainProduct', '==', 'smartcafe_comodato')`, a MESMA
 * condição de `isFinanceiro(tid) && isComodatoDeal(...)` nas rules — sem essa
 * correspondência exata, o Firestore recusaria a leitura ampla inteira (mesmo
 * raciocínio de `MinhaComissaoPage`, com `beneficiaryIds array-contains`).
 */

import { useState } from 'react';
import { where } from 'firebase/firestore';
import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { fmtCurrency } from '../../utils/crmFormat';
import { Icon } from '../../components/ui/Icon';
import type { Deal } from '../../types/crm';
import { contractStatus, isPendingValidation } from './contractStatus';

export function FinanceiroContratosPage() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const { updateDocument } = useFirestoreMutations('deals');
  const [confirming, setConfirming] = useState<string | null>(null);

  const { data: deals, loading } = useFirestoreCollection<Deal>(
    'deals',
    [where('mainProduct', '==', 'smartcafe_comodato')],
  );

  const pendentes = deals.filter(isPendingValidation);
  const pagos = deals.filter(d => contractStatus(d) === 'pago');

  const confirmarPagamento = async (deal: Deal) => {
    if (!user?.uid) return;
    setConfirming(deal.id);
    try {
      await updateDocument(deal.id, {
        contractPaidAt: new Date().toISOString(),
        contractPaidBy: user.uid,
      });
      addToast({ type: 'success', message: 'Pagamento confirmado', sub: deal.company });
    } catch (err) {
      console.error('[FinanceiroContratosPage] Erro ao confirmar pagamento:', err);
      addToast({ type: 'error', message: 'Falha ao confirmar', sub: String(err) });
    } finally {
      setConfirming(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h1 className="h1">Contratos — Comodato Smart Café</h1>
        <div className="sk" style={{ height: 180, borderRadius: 10 }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 className="h1">Contratos — Comodato Smart Café</h1>
        <p className="muted" style={{ marginTop: 2, fontSize: 13 }}>
          Confirme o pagamento da 1ª mensalidade para liberar a comissão do SDR e do Representante do card.
        </p>
      </div>

      <div className="card">
        <div className="card-hd">
          <h3>Pendentes de validação</h3>
          <span className="badge" style={{ background: '#FEF3C7', color: '#92400E', fontSize: 12 }}>
            {pendentes.length}
          </span>
        </div>
        {pendentes.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <Icon name="CheckCircle2" size={28} color="var(--primary)" style={{ margin: '0 auto 8px' }} />
            <div className="muted" style={{ fontWeight: 600 }}>Nada pendente no momento</div>
          </div>
        ) : (
          <div>
            {pendentes.map(d => (
              <div
                key={d.id}
                className="row"
                style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
              >
                <div style={{ minWidth: 200 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.company}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{d.name} · {fmtCurrency(d.value)}</div>
                </div>
                {d.contract && (
                  <a
                    href={d.contract.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-outline btn-sm"
                  >
                    <Icon name="FileText" size={13} />
                    Ver contrato
                  </a>
                )}
                <button
                  className="btn btn-primary btn-sm"
                  disabled={confirming === d.id}
                  onClick={() => confirmarPagamento(d)}
                >
                  <Icon name="CheckCircle2" size={14} />
                  {confirming === d.id ? 'Confirmando...' : 'Confirmar Pagamento'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-hd">
          <h3>Já validados</h3>
          <span className="badge badge-gray" style={{ fontSize: 12 }}>{pagos.length}</span>
        </div>
        {pagos.length === 0 ? (
          <div className="muted" style={{ padding: '20px 18px', fontSize: 12.5 }}>Nenhum contrato validado ainda.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>{['Empresa', 'Negócio', 'Pago em'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {pagos.map((d, i) => (
                <tr key={d.id} className={i % 2 ? 'alt' : ''}>
                  <td>{d.company}</td>
                  <td className="muted">{d.name}</td>
                  <td className="muted">
                    {d.contractPaidAt ? new Date(d.contractPaidAt).toLocaleDateString('pt-BR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default FinanceiroContratosPage;
