/**
 * AuditoriaPane.test.tsx — Aba "Auditoria de Sessão" das Configurações
 * (PLANO_DESENHO_CRM.md Fase 6.1). Mesmo padrão de mock do LeadSourcesPane.test.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditoriaPane } from './AuditoriaPane';

const { collections } = vi.hoisted(() => ({
  collections: { current: {} as Record<string, unknown[]> },
}));

vi.mock('../../hooks/useFirestore', () => ({
  useFirestoreCollection: (name: string) => ({
    data: collections.current[name] ?? [],
    loading: false,
    error: null,
  }),
}));

const EVENTOS = [
  { id: 'ev-1', uid: 'sdr-1', userName: 'João SDR', userRole: 'sdr', event: 'login', at: new Date('2026-09-10T09:00:00'), ip: '203.0.113.5', userAgent: 'Chrome · macOS' },
  { id: 'ev-2', uid: 'sdr-1', userName: 'João SDR', userRole: 'sdr', event: 'logout', at: new Date('2026-09-10T18:00:00'), ip: '203.0.113.5', userAgent: 'Chrome · macOS' },
  { id: 'ev-3', uid: 'rep-1', userName: 'Carla Rep', userRole: 'rep', event: 'revoked', at: new Date('2026-09-11T10:00:00'), ip: '198.51.100.1', userAgent: 'Safari · iOS', endedBy: 'master-1', endedByName: 'Ricardo Master' },
];

function setup(events: unknown[] = []) {
  collections.current = { user_sessions: events };
  return render(<AuditoriaPane />);
}

describe('AuditoriaPane', () => {
  it('mostra estado vazio quando não há eventos', () => {
    setup();
    expect(screen.getByText(/Nenhum evento de sessão registrado/i)).toBeInTheDocument();
  });

  it('lista os eventos com usuário, papel, IP e dispositivo', () => {
    setup(EVENTOS);
    expect(screen.getAllByText('João SDR')).toHaveLength(2);
    expect(screen.getByText('Carla Rep')).toBeInTheDocument();
    expect(screen.getAllByText('203.0.113.5')).toHaveLength(2);
    expect(screen.getByText('198.51.100.1')).toBeInTheDocument();
    expect(screen.getAllByText('Chrome · macOS')).toHaveLength(2);
  });

  it('rotula login/logoff/revoked corretamente', () => {
    setup(EVENTOS);
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByText('Logoff')).toBeInTheDocument();
    expect(screen.getByText(/Encerrada \(admin\)/)).toBeInTheDocument();
  });

  it('mostra quem encerrou a sessão em um evento "revoked"', () => {
    setup(EVENTOS);
    expect(screen.getByText(/por Ricardo Master/)).toBeInTheDocument();
  });
});
