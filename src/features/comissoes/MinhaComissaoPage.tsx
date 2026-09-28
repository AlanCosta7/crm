/**
 * MinhaComissaoPage.tsx — tela do próprio vendedor (Fase 5.1 do PLANO_DESENHO_CRM.md)
 *
 * Slide 11 do deck "Desenho CRM": "SDR e Representante comissionaram
 * (individualmente, sem um ter a visão do outro)."
 *
 * `/comissoes` e `/comissoes/relatorio` já existiam, mas eram `master`/`manager`
 * only — BDR, SDR e Rep, que são justamente quem RECEBE a comissão, não tinham
 * nenhuma tela. As `firestore.rules` já liberavam a leitura do próprio registro
 * (`request.auth.uid in resource.data.beneficiaryIds`, ver `commissions` em
 * `firestore.rules`); faltava a rota e uma UI que mostrasse só a fatia de quem
 * está olhando — nunca o total do card nem a fatia dos colegas.
 *
 * A query usa `where('beneficiaryIds', 'array-contains', uid)`: sem ela, uma
 * leitura ampla de `commissions` seria negada inteira pelas rules (Firestore
 * recusa a query completa se ela puder retornar documento que a regra não
 * permite — não filtra documento a documento). Com o `where`, o Firestore
 * consegue provar estaticamente que todo resultado bate com a regra.
 *
 * Não mostra "modo Uber" (acúmulo ao vivo, slide 11) — isso é a Fase 5.2,
 * pendente de decisão sobre a fonte do faturamento diário. Esta tela mostra o
 * que já existe: as comissões calculadas/confirmadas/pagas do próprio usuário.
 */

import { where } from 'firebase/firestore';
import { useFirestoreCollection } from '../../hooks/useFirestore';
import { useAuthStore } from '../../stores/authStore';
import { fmtCurrency } from '../../utils/crmFormat';
import { PRODUCT_SKU_LABELS } from '../../types/crm';
import { Icon } from '../../components/ui/Icon';
import type { Commission, CommissionStatus } from './types';
import { resumoMinhaComissao, linhasMinhaComissao } from './minhaComissao';

const STATUS_LABEL: Record<CommissionStatus, { label: string; bg: string; color: string }> = {
  projetada:  { label: 'Projetada',  bg: 'var(--bg-2)', color: 'var(--text-2)' },
  confirmada: { label: 'Confirmada', bg: '#FEF3C7',     color: '#92400E' },
  paga:       { label: 'Paga',       bg: '#E5F0E5',     color: 'var(--primary)' },
  cancelada:  { label: 'Cancelada',  bg: '#FEE2E2',     color: '#B91C1C' },
};

const ROLE_LABEL: Record<'bdr' | 'sdr' | 'rep', string> = {
  bdr: 'BDR', sdr: 'SDR', rep: 'Representante',
};

export function MinhaComissaoPage() {
  const { user } = useAuthStore();
  const uid = user?.uid ?? '';

  // Escopo pela própria fatia — casa com a rule de `commissions` e é o que
  // permite ao Firestore aceitar a query sem exigir acesso amplo à coleção.
  const { data: comissoes, loading } = useFirestoreCollection<Commission>(
    'commissions',
    uid ? [where('beneficiaryIds', 'array-contains', uid)] : [],
  );

  const resumo = resumoMinhaComissao(comissoes, uid);
  const linhas = linhasMinhaComissao(comissoes, uid);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h1 className="h1">Minha Comissão</h1>
        {[0, 1].map(i => <div key={i} className="sk" style={{ height: 100, borderRadius: 10 }} />)}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 className="h1">Minha Comissão</h1>
        <p className="muted" style={{ marginTop: 2, fontSize: 13 }}>
          Só a sua fatia de cada negócio — ninguém mais vê estes valores, e você não vê os dos colegas.
        </p>
      </div>

      <div className="grid-cols-4-responsive">
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="label">A Receber</span>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtCurrency(resumo.totalAReceber)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>projetado + confirmado + pago</div>
        </div>
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="label">Já Pago</span>
          <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {fmtCurrency(resumo.totalPago)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>ciclos com status Paga</div>
        </div>
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="label">Confirmadas</span>
          <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {resumo.contagemPorStatus.confirmada}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>aguardando o dia 15</div>
        </div>
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="label">Projetadas</span>
          <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {resumo.contagemPorStatus.projetada}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>avaliação do dia 10 em andamento</div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <h3>Meus Negócios Comissionados</h3>
          <span className="badge badge-gray" style={{ fontSize: 12 }}>{linhas.length} registro(s)</span>
        </div>
        {linhas.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <Icon name="Wallet" size={32} color="var(--text-2)" style={{ margin: '0 auto 10px' }} />
            <div className="muted" style={{ fontWeight: 600 }}>Nenhuma comissão registrada ainda</div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              Aparece aqui assim que a gestão avaliar um negócio seu (avaliação do dia 10).
            </p>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>{['Negócio', 'Produto', 'Meu Papel', 'Minha Fatia', 'Pagamento', 'Status'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={l.id} className={i % 2 ? 'alt' : ''}>
                  <td>{l.dealName}</td>
                  <td className="muted">{PRODUCT_SKU_LABELS[l.sku] ?? l.sku}</td>
                  <td>{ROLE_LABEL[l.meuPapel]}</td>
                  <td style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(l.minhaFatia)}</td>
                  <td className="muted">
                    {l.dataPagamento ? new Date(l.dataPagamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'}
                  </td>
                  <td>
                    <span className="badge" style={{ background: STATUS_LABEL[l.status].bg, color: STATUS_LABEL[l.status].color, fontSize: 11.5 }}>
                      {STATUS_LABEL[l.status].label}
                    </span>
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

export default MinhaComissaoPage;
