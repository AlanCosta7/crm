import { useState } from 'react';
import { useFirestoreCollection, useFirestoreMutations } from '../../hooks/useFirestore';
import type { Company } from '../../types/crm';
import { Icon } from '../../components/ui/Icon';
import { fmtCurrency } from '../../utils/crmFormat';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { matchesProductIds, productIdsForNewEntity } from '../../utils/productScope';

export function CompaniesPage() {
  const { data: companies, loading } = useFirestoreCollection<Company>('companies');
  const { addDocument } = useFirestoreMutations('companies');
  const ui = useUIStore();
  const productScope = ui.productScope ?? ui.productId;
  const { user } = useAuthStore();
  const filteredCompanies = companies.filter(c => matchesProductIds(productScope, c.productIds?.length ? c.productIds : ['wizmart']));

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [segment, setSegment] = useState('Distribuição');
  
  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const newCompanyData = {
      name,
      segment,
      deals: 0,
      value: 0,
      productIds: productIdsForNewEntity(productScope, user),
    };

    try {
      await addDocument(newCompanyData);
      setIsModalOpen(false);
      setName('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 className="h1">Empresas</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setIsModalOpen(true)}>
          <Icon name="Plus" size={15} />
          Nova Empresa
        </button>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }} className="muted">
            Carregando empresas...
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }} className="muted">
            <Icon name="Building2" size={38} color="var(--primary)" style={{ margin: '0 auto 12px' }} />
            <div>Nenhuma empresa cadastrada.</div>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                {['Empresa', 'Segmento', 'Negócios', 'Valor em aberto', ''].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map((c, i) => (
                <tr key={i} className={i % 2 ? 'alt' : ''}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: 'var(--primary-light)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--primary)',
                        }}
                      >
                        <Icon name="Building2" size={17} />
                      </div>
                      <span className="tlink">{c.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-gray">{c.segment}</span>
                  </td>
                  <td className="muted">{c.deals ?? 0} negócios</td>
                  <td className="money">{fmtCurrency(c.value ?? 0)}</td>
                  <td>
                    <Icon name="ChevronRight" size={16} color="#9aa3af" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal - Nova Empresa */}
      {isModalOpen && (
        <div className="modal-ov" onClick={() => setIsModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Cadastrar Nova Empresa</h3>
              <button className="icon-btn" onClick={() => setIsModalOpen(false)} aria-label="Fechar modal">
                <Icon name="X" size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateCompany}>
              <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Razão Social / Nome Fantasia *</div>
                  <input
                    className="input"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="ex: Distribuidora Nordeste Ltda"
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <div className="fl">Segmento de atuação</div>
                  <select
                    className="input"
                    value={segment}
                    onChange={e => setSegment(e.target.value)}
                    style={{ background: '#fff' }}
                  >
                    <option value="Distribuição">Distribuição</option>
                    <option value="Atacado">Atacado</option>
                    <option value="Varejo">Varejo</option>
                    <option value="Logística">Logística</option>
                    <option value="Alimentos e Bebidas">Alimentos e Bebidas</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              </div>
              <div className="modal-ft">
                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  <Icon name="Plus" size={16} />
                  Cadastrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CompaniesPage;
