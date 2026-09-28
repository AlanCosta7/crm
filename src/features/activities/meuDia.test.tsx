/**
 * meuDia.test.tsx — Fase 2 do PLANO_DESENHO_CRM.md
 *
 * A fila do dia agrupada por bloco de horário (slides 6 e 9). O que mais
 * importa aqui é o que NÃO desaparece: bloco vazio, pausa, atividade sem bloco
 * e atividade já concluída. Se qualquer um desses sumir, o SDR perde a régua de
 * vista ou perde trabalho da fila.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MeuDiaPanel } from './MeuDiaPanel';
import { DEFAULT_TIME_BLOCKS } from '../../utils/timeBlocks';
import type { Activity } from '../../types/crm';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'sdr-1', tenantId: 'wizmart_sp', role: 'sdr' } }),
}));

/**
 * `type` é `string` e não `ActivityType` de propósito: um dos testes usa um
 * canal inexistente ('carta_pombo') para provar que atividade sem bloco cai no
 * grupo "Sem horário definido" em vez de desaparecer da fila.
 */
const comEmpresa = (id: string, type: string, companyName: string, status = 'pending'): Activity =>
  ({
    id,
    type,
    userId: 'sdr-1',
    status,
    coinsAwarded: 0,
    dealId: `deal-${id}`,
    companyName,
  } as unknown as Activity);

describe('MeuDiaPanel — a régua do dia', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra os seis blocos do slide 6, com horário e rótulo', () => {
    render(<MeuDiaPanel activities={[]} blocks={DEFAULT_TIME_BLOCKS} />);
    for (const label of ['E-mail', 'LinkedIn', 'Pausa', 'Ligação', 'WhatsApp', 'Follow Up de Agenda']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('10h')).toBeInTheDocument();
    expect(screen.getByText('13h–15h')).toBeInTheDocument();
  });

  it('coloca cada cliente no bloco do seu canal', () => {
    render(
      <MeuDiaPanel
        activities={[
          comEmpresa('1', 'email', 'Mercado do Bairro'),
          comEmpresa('2', 'call', 'Atacado Vale Verde'),
        ]}
        blocks={DEFAULT_TIME_BLOCKS}
      />,
    );
    expect(screen.getByText('Mercado do Bairro')).toBeInTheDocument();
    expect(screen.getByText('Atacado Vale Verde')).toBeInTheDocument();
  });

  // Esconder bloco vazio faria a régua parecer diferente a cada dia.
  it('bloco sem atividade continua na tela, dizendo que não há nada', () => {
    render(<MeuDiaPanel activities={[comEmpresa('1', 'email', 'X')]} blocks={DEFAULT_TIME_BLOCKS} />);
    expect(screen.getAllByText('Nada para fazer neste bloco hoje.').length).toBeGreaterThan(0);
  });

  it('a pausa aparece como intervalo, sem lista de clientes', () => {
    render(<MeuDiaPanel activities={[]} blocks={DEFAULT_TIME_BLOCKS} />);
    expect(screen.getByText(/Intervalo — nenhuma atividade/)).toBeInTheDocument();
  });

  // Perder atividade da fila é pior que mostrá-la fora de hora.
  it('atividade de canal sem bloco cai em "Sem horário definido"', () => {
    render(
      <MeuDiaPanel
        activities={[comEmpresa('9', 'carta_pombo', 'Empresa Exótica')]}
        blocks={DEFAULT_TIME_BLOCKS}
      />,
    );
    expect(screen.getByText('Sem horário definido')).toBeInTheDocument();
    expect(screen.getByText('Empresa Exótica')).toBeInTheDocument();
  });

  it('sem atividade órfã, o grupo "Sem horário" não aparece', () => {
    render(<MeuDiaPanel activities={[comEmpresa('1', 'email', 'X')]} blocks={DEFAULT_TIME_BLOCKS} />);
    expect(screen.queryByText('Sem horário definido')).toBeNull();
  });

  // O SDR fecha o dia olhando o que fez e o que não fez (slide 10).
  it('atividade concluída fica na lista, não desaparece', () => {
    render(
      <MeuDiaPanel
        activities={[comEmpresa('1', 'email', 'Já Contatada', 'completed')]}
        blocks={DEFAULT_TIME_BLOCKS}
      />,
    );
    expect(screen.getByText('Já Contatada')).toBeInTheDocument();
  });

  it('o contador do bloco mostra feito/total', () => {
    render(
      <MeuDiaPanel
        activities={[
          comEmpresa('1', 'email', 'A', 'completed'),
          comEmpresa('2', 'email', 'B'),
          comEmpresa('3', 'email', 'C'),
        ]}
        blocks={DEFAULT_TIME_BLOCKS}
      />,
    );
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('resume o dia no topo', () => {
    render(
      <MeuDiaPanel
        activities={[comEmpresa('1', 'email', 'A', 'completed'), comEmpresa('2', 'call', 'B')]}
        blocks={DEFAULT_TIME_BLOCKS}
      />,
    );
    expect(screen.getByText(/1 atividade\(s\) pendente\(s\) · 1 concluída\(s\) hoje/)).toBeInTheDocument();
  });

  it('quando tudo está feito, diz que o dia está fechado', () => {
    render(
      <MeuDiaPanel
        activities={[comEmpresa('1', 'email', 'A', 'completed')]}
        blocks={DEFAULT_TIME_BLOCKS}
      />,
    );
    expect(screen.getByText(/Dia fechado/)).toBeInTheDocument();
  });

  it('oferece registrar a atividade pendente', () => {
    render(<MeuDiaPanel activities={[comEmpresa('1', 'email', 'A')]} blocks={DEFAULT_TIME_BLOCKS} />);
    expect(screen.getByRole('button', { name: /Registrar/ })).toBeInTheDocument();
  });

  it('não oferece registrar a atividade já concluída', () => {
    render(
      <MeuDiaPanel activities={[comEmpresa('1', 'email', 'A', 'completed')]} blocks={DEFAULT_TIME_BLOCKS} />,
    );
    expect(screen.queryByRole('button', { name: /Registrar/ })).toBeNull();
  });

  // A gestão abre a aba para entender a mecânica, não para agir na fila alheia.
  it('em modo leitura, não há botão de registrar', () => {
    render(
      <MeuDiaPanel activities={[comEmpresa('1', 'email', 'A')]} blocks={DEFAULT_TIME_BLOCKS} readOnly />,
    );
    expect(screen.queryByRole('button', { name: /Registrar/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Abrir card/ })).toBeInTheDocument();
  });

  it('respeita blocos customizados pelo admin', () => {
    const custom = [
      { id: 'manha', label: 'Prospecção da Manhã', startHour: 8, startMinute: 0, endHour: 12, endMinute: 0, types: ['call' as const], isBreak: false },
    ];
    render(<MeuDiaPanel activities={[comEmpresa('1', 'call', 'Cliente X')]} blocks={custom} />);
    expect(screen.getByText('Prospecção da Manhã')).toBeInTheDocument();
    expect(screen.getByText('8h–12h')).toBeInTheDocument();
    expect(screen.getByText('Cliente X')).toBeInTheDocument();
  });

  it('marca a reunião com o rótulo certo no bloco de follow-up', () => {
    render(<MeuDiaPanel activities={[comEmpresa('1', 'meeting', 'Reunião Cliente')]} blocks={DEFAULT_TIME_BLOCKS} />);
    expect(screen.getByText('Reunião Cliente')).toBeInTheDocument();
    expect(screen.getByText('Reunião')).toBeInTheDocument();
  });
});
