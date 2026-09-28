import { Fragment, useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { Av } from '../ui/Av';
import { Icon } from '../ui/Icon';
import { NotificationsBell } from './NotificationsBell';
import { ViewAsModal } from './ViewAsModal';
import type { ProductId, ProductScope } from '../../types/crm';
import { allowedProductIds, canUseAllScope, ensureAllowedScope } from '../../utils/productScope';

interface TopbarProps {
  crumbs?: string[];
}

const PRODUCT_CONFIG: Record<ProductId, { label: string; color: string; accent: string }> = {
  wizmart:    { label: 'WizMart',    color: '#1A6B1A', accent: '#8DB600' },
  smart_cafe: { label: 'Smart Café', color: '#92400E', accent: '#D97706' },
};

const ALL_PRODUCT_CONFIG = { label: 'Todos', color: '#374151', accent: '#6B7280' };

const PATH_CRUMBS: Record<string, string[]> = {
  '/':            ['Dashboard'],
  '/pipeline':    ['Pipeline'],
  '/contacts':    ['Contatos'],
  '/companies':   ['Empresas'],
  '/tasks':       ['Tarefas'],
  '/activities':  ['Atividades'],
  '/cadencia':    ['Cadência', 'Diária'],
  '/handoffs':    ['Handoffs'],
  '/leaderboard': ['Gamificação', 'Leaderboard'],
  '/carteira':    ['Gamificação', 'Carteira de Moedas'],
  '/loja':        ['Gamificação', 'Loja de Prêmios'],
  '/kpi':         ['Análise', 'KPIs'],
  '/settings':    ['Admin', 'Configurações'],
};

export function Topbar({ crumbs }: TopbarProps) {
  const { user } = useAuthStore();
  const { productScope, setProductScope, toggleSidebar } = useUIStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [productOpen, setProductOpen] = useState(false);
  const productRef = useRef<HTMLDivElement>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const [viewAsOpen, setViewAsOpen] = useState(false);

  const handleLogout = () => {
    useAuthStore.getState().setUser(null);
    import('../../config/firebase').then(({ auth }) => auth.signOut());
  };

  // Fecha dropdowns ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (productRef.current && !productRef.current.contains(e.target as Node)) {
        setProductOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const nextScope = ensureAllowedScope(productScope, user);
    if (nextScope !== productScope) setProductScope(nextScope);
  }, [productScope, setProductScope, user]);

  const getCrumbs = () => {
    if (crumbs) return crumbs;
    const path = location.pathname;
    if (PATH_CRUMBS[path]) return PATH_CRUMBS[path];
    if (path.startsWith('/contacts/'))  return ['Contatos', 'Detalhe'];
    if (path.startsWith('/deals/'))     return ['Pipeline', 'Negócio'];
    if (path.startsWith('/handoffs/'))  return ['Handoffs', 'Detalhe'];
    if (path.startsWith('/tv/'))        return ['TV Display'];
    return ['Dashboard'];
  };

  const currentCrumbs = getCrumbs();
  const prod = productScope === 'all' ? ALL_PRODUCT_CONFIG : PRODUCT_CONFIG[productScope];
  const canSwitchProduct = allowedProductIds(user).length > 1;
  const userProducts = allowedProductIds(user);
  const productOptions: ProductScope[] = [
    ...(canUseAllScope(user) ? ['all' as const] : []),
    ...userProducts,
  ];

  return (
    <header className="topbar">
      {/* Botão Hambúrguer para Mobile */}
      <button
        className="icon-btn menu-toggle-btn"
        onClick={toggleSidebar}
        style={{ display: 'none' }}
        title="Menu lateral"
        aria-label="Abrir menu lateral"
      >
        <Icon name="Menu" size={20} />
      </button>

      {/* Breadcrumbs */}
      <div className="crumb">
        {currentCrumbs.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <Icon name="ChevronRight" size={14} color="#cdd3da" />}
            <span className={i === currentCrumbs.length - 1 ? 'cur' : undefined}>{c}</span>
          </Fragment>
        ))}
      </div>

      {/* Busca Global */}
      <div className="search">
        <span className="ic"><Icon name="Search" size={16} /></span>
        <input aria-label="Buscar..." placeholder="Buscar negócios, contatos..." />
      </div>

      {/* Direita: seletor de produto + notificações + perfil */}
      <div className="tb-right">

        {/* ── Seletor de Produto ─────────────────────────────── */}
        <div ref={productRef} style={{ position: 'relative' }}>
          <button
            onClick={() => canSwitchProduct && setProductOpen((o) => !o)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '5px 10px',
              borderRadius: 8,
              border: `1.5px solid ${prod.color}22`,
              background: `${prod.color}0D`,
              cursor: canSwitchProduct ? 'pointer' : 'default',
              transition: 'all 0.15s',
            }}
            title={canSwitchProduct ? 'Trocar produto' : `Produto: ${prod.label}`}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: prod.color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: prod.color }}>
              {prod.label}
            </span>
            {canSwitchProduct && (
              <Icon name="ChevronDown" size={13} color={prod.color} />
            )}
          </button>

          {/* Dropdown de produtos */}
          {productOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                background: '#fff',
                border: '1px solid var(--border)',
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                minWidth: 180,
                zIndex: 200,
                overflow: 'hidden',
              }}
            >
              {productOptions.map((key) => {
                const cfg = key === 'all' ? ALL_PRODUCT_CONFIG : PRODUCT_CONFIG[key];
                return (
                <button
                  key={key}
                  onClick={() => { setProductScope(key); setProductOpen(false); }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    background: productScope === key ? `${cfg.color}0D` : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${cfg.color}15`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = productScope === key ? `${cfg.color}0D` : 'transparent'; }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      {key === 'all' ? 'Visão consolidada' : key === 'wizmart' ? 'Varejo e Distribuição' : 'Café e Bebidas'}
                    </div>
                  </div>
                  {productScope === key && <Icon name="Check" size={14} color={cfg.color} />}
                </button>
              );
              })}
            </div>
          )}
        </div>

        {/* Notificações */}
        <NotificationsBell />

        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

        {/* Perfil */}
        {user ? (
          <div ref={profileRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setProfileOpen((o) => !o)}
              className="row"
              style={{
                gap: 8,
                padding: '4px 6px',
                borderRadius: 8,
                background: profileOpen ? 'var(--bg)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              title="Menu do Perfil"
              aria-label="Abrir menu do perfil"
            >
              <Av name={user.name} initials={user.initials} color={user.color} size={32} />
              <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name.split(' ')[0]}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-2)', textTransform: 'capitalize' }}>
                  {user.role}
                </span>
              </div>
              <Icon name="ChevronDown" size={15} color="#9aa3af" style={{ transform: profileOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {/* Dropdown do perfil */}
            {profileOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  background: '#fff',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                  minWidth: 220,
                  zIndex: 200,
                  padding: '6px 0',
                }}
              >
                {/* Detalhes do Usuário */}
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                    {user.email}
                  </div>
                </div>

                {/* Ações */}
                <button
                  onClick={() => { navigate('/settings'); setProfileOpen(false); }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 16px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 12.5,
                    color: 'var(--text-primary)',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <Icon name="Settings" size={14} color="var(--text-2)" />
                  <span>Configurações</span>
                </button>

                {['master', 'manager'].includes(user.role) && (
                  <button
                    onClick={() => { navigate('/settings/metas'); setProfileOpen(false); }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 16px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 12.5,
                      color: 'var(--text-primary)',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <Icon name="Target" size={14} color="var(--text-2)" />
                    <span>Metas</span>
                  </button>
                )}

                {user.role === 'master' && (
                  <button
                    onClick={() => { setViewAsOpen(true); setProfileOpen(false); }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 16px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 12.5,
                      color: 'var(--text-primary)',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <Icon name="Eye" size={14} color="var(--text-2)" />
                    <span>Visualizar como...</span>
                  </button>
                )}

                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

                <button
                  onClick={() => { handleLogout(); setProfileOpen(false); }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 16px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 12.5,
                    color: 'var(--danger)',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--danger-light)0D'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <Icon name="LogOut" size={14} color="var(--danger)" />
                  <span>Sair do Sistema</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="sk" style={{ width: 100, height: 32, borderRadius: 8 }} />
        )}
      </div>

      {viewAsOpen && <ViewAsModal onClose={() => setViewAsOpen(false)} />}
    </header>
  );
}

export default Topbar;
