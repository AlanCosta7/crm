/**
 * agendaOrigin.test.tsx — Fase 4 do PLANO_DESENHO_CRM.md
 *
 * Cobre o painel de detalhe (slide 2: "se eu clicar, me mostra detalhes, como
 * população, cidade e SDR que agendou") e a quebra por origem nos indicadores
 * de Reuniões e Visitas Agendadas do painel da gestão.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgendaOriginPanel, OriginChip } from './AgendaOriginPanel';
import type { AgendaRow } from '../../utils/originBreakdown';
import type { Deal, UserRole } from '../../types/crm';

const rows: AgendaRow[] = [
  { key: 'a', company: 'Mercado do Bairro', city: 'Campinas', state: 'SP', population: 1200, scheduledBy: 'Giulia', origin: 'inbound' },
  { key: 'b', company: 'Atacado Vale Verde', city: 'Curitiba', state: 'PR', population: 800, scheduledBy: 'Bruno', origin: 'outbound' },
  { key: 'c', company: 'Rede Horizonte', city: 'Belo Horizonte', state: 'MG', scheduledBy: 'Bruno', origin: 'outbound' },
  { key: 'd', company: 'Empresa Órfã', city: '', state: '', scheduledBy: '', origin: null },
];

const breakdown = { inbound: 1, outbound: 2, unresolved: 1, total: 4 };

describe('AgendaOriginPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra cidade, população e quem agendou — o detalhe que o slide 2 pede', () => {
    render(
      <AgendaOriginPanel title="Visitas" rows={rows} breakdown={breakdown} onClose={vi.fn()} emptyLabel="vazio" />,
    );
    expect(screen.getByText('Mercado do Bairro')).toBeInTheDocument();
    expect(screen.getByText(/Campinas/)).toBeInTheDocument();
    expect(screen.getByText(/1\.200 colaboradores/)).toBeInTheDocument();
    expect(screen.getByText(/agendou: Giulia/)).toBeInTheDocument();
  });

  it('os contadores do filtro vêm da quebra, não da lista visível', () => {
    render(
      <AgendaOriginPanel title="Visitas" rows={rows} breakdown={breakdown} onClose={vi.fn()} emptyLabel="vazio" />,
    );
    expect(screen.getByRole('button', { name: 'Todas (4)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inbound (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Outbound (2)' })).toBeInTheDocument();
  });

  it('filtrar Inbound deixa só a linha inbound', async () => {
    render(
      <AgendaOriginPanel title="Visitas" rows={rows} breakdown={breakdown} onClose={vi.fn()} emptyLabel="vazio" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Inbound (1)' }));
    expect(screen.getByText('Mercado do Bairro')).toBeInTheDocument();
    expect(screen.queryByText('Atacado Vale Verde')).toBeNull();
    expect(screen.queryByText('Empresa Órfã')).toBeNull();
  });

  it('filtrar Outbound exclui as linhas sem origem', async () => {
    render(
      <AgendaOriginPanel title="Visitas" rows={rows} breakdown={breakdown} onClose={vi.fn()} emptyLabel="vazio" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Outbound (2)' }));
    expect(screen.getByText('Atacado Vale Verde')).toBeInTheDocument();
    expect(screen.getByText('Rede Horizonte')).toBeInTheDocument();
    expect(screen.queryByText('Empresa Órfã')).toBeNull();
  });

  // O total do widget tem que bater com a lista aberta — daí as linhas sem
  // origem aparecerem em "Todas" em vez de sumirem.
  it('a linha sem origem aparece em Todas, marcada como tal', () => {
    render(
      <AgendaOriginPanel title="Reuniões" rows={rows} breakdown={breakdown} onClose={vi.fn()} emptyLabel="vazio" />,
    );
    expect(screen.getByText('Empresa Órfã')).toBeInTheDocument();
    expect(screen.getByText('sem origem')).toBeInTheDocument();
  });

  it('avisa quantos registros estão sem origem e por quê', () => {
    render(
      <AgendaOriginPanel title="Reuniões" rows={rows} breakdown={breakdown} onClose={vi.fn()} emptyLabel="vazio" />,
    );
    expect(screen.getByText(/1 registro\(s\) sem origem/)).toBeInTheDocument();
  });

  it('não mostra o aviso quando tudo tem origem', () => {
    const limpo = rows.slice(0, 3);
    render(
      <AgendaOriginPanel title="Visitas" rows={limpo} breakdown={{ inbound: 1, outbound: 2, total: 3 }} onClose={vi.fn()} emptyLabel="vazio" />,
    );
    expect(screen.queryByText(/sem origem/)).toBeNull();
  });

  it('lista vazia mostra o rótulo de vazio; filtro vazio mostra outra mensagem', async () => {
    render(
      <AgendaOriginPanel
        title="Visitas"
        rows={[rows[1]]}
        breakdown={{ inbound: 0, outbound: 1, total: 1 }}
        onClose={vi.fn()}
        emptyLabel="Nenhuma visita no período"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Inbound (0)' }));
    expect(screen.getByText('Nenhum registro Inbound neste período.')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma visita no período')).toBeNull();
  });

  it('o botão de fechar chama onClose', async () => {
    const onClose = vi.fn();
    render(
      <AgendaOriginPanel title="Visitas" rows={rows} breakdown={breakdown} onClose={onClose} emptyLabel="vazio" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fechar Visitas' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renderiza o aside (mapa) só quando recebido', () => {
    const { rerender } = render(
      <AgendaOriginPanel title="Visitas" rows={rows} breakdown={breakdown} onClose={vi.fn()} emptyLabel="v"
        aside={<div>MAPA AQUI</div>} />,
    );
    expect(screen.getByText('MAPA AQUI')).toBeInTheDocument();

    rerender(
      <AgendaOriginPanel title="Reuniões" rows={rows} breakdown={breakdown} onClose={vi.fn()} emptyLabel="v" />,
    );
    expect(screen.queryByText('MAPA AQUI')).toBeNull();
  });
});

describe('OriginChip', () => {
  it('rotula inbound e outbound', () => {
    const { rerender } = render(<OriginChip origin="inbound" />);
    expect(screen.getByText('Inbound')).toBeInTheDocument();
    rerender(<OriginChip origin="outbound" />);
    expect(screen.getByText('Outbound')).toBeInTheDocument();
  });

  it('origem nula explica o motivo no title, em vez de sumir', () => {
    render(<OriginChip origin={null} />);
    const chip = screen.getByText('sem origem');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('title', expect.stringContaining('não foi encontrado'));
  });
});

// ── Integração: os indicadores da gestão no DashboardPage ─────────────────────
//
// Aqui o mock do Firestore é POR COLEÇÃO (o mock global de `dashboard.test.tsx`
// devolve tudo vazio, o que não serviria para conferir a quebra).

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const { animeStub } = vi.hoisted(() => ({
  animeStub: Object.assign(() => {}, { timeline: () => ({ add: () => ({}) }), stagger: () => 0 }),
}));
vi.mock('animejs', () => ({ default: animeStub }));

// Registro das coleções mockadas. Vive no globalThis porque `vi.mock` é
// hoisted acima das declarações do módulo — uma const local não existiria ainda
// no momento em que a factory roda.
declare global {
  var __collections: Record<string, unknown[]> | undefined;
}

vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreCollection: (name: string) => ({
    data: globalThis.__collections?.[name] ?? [],
    loading: false,
    error: null,
  }),
  useFirestoreMutations: () => ({ addDocument: vi.fn(), updateDocument: vi.fn(), deleteDocument: vi.fn() }),
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: () => ({ productId: 'wizmart', productScope: 'all', setProductId: vi.fn() }),
}));

const mockAuth = vi.fn();
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => mockAuth() }));

vi.mock('../../hooks/useLeaderboard', () => ({
  useLeaderboard: () => ({ data: [], loading: false, error: null }),
}));

function makeUser(role: UserRole) {
  return {
    uid: `uid-${role}`, name: `Usuário ${role}`, email: `${role}@w.com`,
    initials: 'US', color: '#1A6B1A', role, tenantId: 'wizmart_sp', coinBalance: 0,
  };
}

const dealFix = (id: string, over: Partial<Deal> = {}): Deal => ({
  id, name: `Deal ${id}`, company: `Empresa ${id}`, value: 0, stage: 'prospeccao',
  productId: 'wizmart', owner: 'sdr-1', assignedSdrId: 'sdr-1', due: '—',
  tasks: { e: false, w: false, m: false },
  ...over,
} as Deal);

describe('DashboardPage (gestão) — quebra por origem nos indicadores', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.mockReturnValue({ user: makeUser('master') });

    // 3 visitas: 1 Inbound / 2 Outbound — o exemplo do slide 2.
    const deals = [
      dealFix('v1', { stage: 'visita_agendada', origin: 'inbound', location: { state: 'SP', city: 'Campinas' }, visitPopulation: 1200 }),
      dealFix('v2', { stage: 'visita_agendada', origin: 'outbound', location: { state: 'PR', city: 'Curitiba' } }),
      dealFix('v3', { stage: 'degustacao_agendada', origin: 'outbound', productId: 'smart_cafe' }),
      dealFix('m1', { origin: 'outbound' }),
    ];
    // 3 reuniões, todas Outbound (o outro exemplo do slide 2).
    const activities = [
      { id: 'a1', type: 'meeting', productId: 'wizmart', dealId: 'm1', userId: 'sdr-1' },
      { id: 'a2', type: 'meeting', productId: 'wizmart', dealId: 'v2', userId: 'sdr-1' },
      { id: 'a3', type: 'meeting', productId: 'wizmart', dealId: 'v3', userId: 'sdr-1' },
      { id: 'a4', type: 'email', productId: 'wizmart', dealId: 'm1', userId: 'sdr-1' },
    ];
    globalThis.__collections = {
      deals, activities,
      users: [{ id: 'sdr-1', uid: 'sdr-1', name: 'Giulia', role: 'sdr', productIds: ['wizmart'] }],
      sellers: [], stages: [], user_goals: [], handoffs: [],
    };
  });

  it('o hover do indicador de Visitas mostra a quebra do slide 2', async () => {
    const { DashboardPage } = await import('./DashboardPage');
    render(<DashboardPage />);
    expect(screen.getByTitle('3 Visitas — 1 Inbound / 2 Outbound')).toBeInTheDocument();
  });

  it('o hover do indicador de Reuniões mostra a quebra do slide 2', async () => {
    const { DashboardPage } = await import('./DashboardPage');
    render(<DashboardPage />);
    expect(screen.getByTitle('3 Reuniões — 0 Inbound / 3 Outbound')).toBeInTheDocument();
  });

  it('clicar em "Ver detalhes" abre o painel de reuniões com o detalhe', async () => {
    const { DashboardPage } = await import('./DashboardPage');
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole('button', { name: /Ver detalhes/i }));
    expect(screen.getByText('Reuniões Agendadas — por origem')).toBeInTheDocument();
  });

  it('clicar em "Ver por estado" abre o painel de visitas com população e cidade', async () => {
    const { DashboardPage } = await import('./DashboardPage');
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole('button', { name: /Ver por estado/i }));
    expect(screen.getByText('Visitas Agendadas — por estado e origem')).toBeInTheDocument();
    expect(screen.getByText(/1\.200 colaboradores/)).toBeInTheDocument();
    // As três visitas do fixture são da Giulia — daí getAllByText.
    expect(screen.getAllByText(/agendou: Giulia/)).toHaveLength(3);
  });

  // Um painel por vez: abrir reuniões fecha visitas.
  it('abrir um painel fecha o outro', async () => {
    const { DashboardPage } = await import('./DashboardPage');
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole('button', { name: /Ver por estado/i }));
    expect(screen.getByText('Visitas Agendadas — por estado e origem')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Ver detalhes/i }));
    expect(screen.getByText('Reuniões Agendadas — por origem')).toBeInTheDocument();
    expect(screen.queryByText('Visitas Agendadas — por estado e origem')).toBeNull();
  });
});

describe('DashboardPage (SDR) — fechamento do dia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockReturnValue({ user: makeUser('sdr') });
    globalThis.__collections = {
      deals: [
        dealFix('v1', { stage: 'visita_agendada', origin: 'inbound', assignedSdrId: 'uid-sdr' }),
        dealFix('v2', { stage: 'visita_agendada', origin: 'outbound', assignedSdrId: 'uid-sdr' }),
      ],
      activities: [
        { id: 'a1', type: 'meeting', productId: 'wizmart', dealId: 'v1', userId: 'uid-sdr' },
        { id: 'a2', type: 'meeting', productId: 'wizmart', dealId: 'v2', userId: 'outro-sdr' },
      ],
      users: [], sellers: [], stages: [], user_goals: [], handoffs: [],
    };
  });

  it('mostra as minhas reuniões e visitas com a quebra por origem (slide 10)', async () => {
    const { DashboardPage } = await import('./DashboardPage');
    render(<DashboardPage />);
    expect(screen.getByText('Fechamento do Dia')).toBeInTheDocument();
    expect(screen.getByText('Minhas Reuniões Agendadas')).toBeInTheDocument();
    expect(screen.getByText('Minhas Visitas Agendadas')).toBeInTheDocument();
    // 2 visitas próprias: 1 Inbound / 1 Outbound
    expect(screen.getByText('1 Inbound / 1 Outbound')).toBeInTheDocument();
  });

  it('conta só as MINHAS reuniões, não as do time', async () => {
    const { DashboardPage } = await import('./DashboardPage');
    render(<DashboardPage />);
    // a2 é de outro SDR — a quebra própria fica 1 Inbound / 0 Outbound
    expect(screen.getByText('1 Inbound / 0 Outbound')).toBeInTheDocument();
  });

  it('sem ranking calculado, a posição aparece como travessão em vez de zero', async () => {
    const { DashboardPage } = await import('./DashboardPage');
    render(<DashboardPage />);
    expect(screen.getByText('Minha Posição no Time')).toBeInTheDocument();
    expect(screen.getByText('ranking ainda não calculado')).toBeInTheDocument();
  });
});
