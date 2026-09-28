/**
 * scheduleMeeting.test.tsx — Fase 3 do PLANO_DESENHO_CRM.md
 *
 * O modal que pede a data ao mover o card para "Reunião Agendada". Sem data a
 * régua de agenda não tem como ser montada, então o que mais importa aqui é:
 * data no passado não passa, o aviso de régua vazia bate com a regra do
 * servidor, e a sugestão padrão não dispara o próprio aviso.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScheduleMeetingModal } from './ScheduleMeetingModal';
import { reguaFicaVazia } from '../../utils/agendaWindow';
import type { Deal } from '../../types/crm';

const deal = {
  id: 'd1', name: 'Deal', company: 'Mercado do Bairro', value: 0, stage: 'conectado',
  owner: 'sdr-1', due: '—', tasks: { e: false, w: false, m: false },
} as Deal;

/** "YYYY-MM-DDTHH:mm" no fuso local — o formato do `datetime-local`. */
function local(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const campo = () => screen.getByLabelText('Data e hora da reunião') as HTMLInputElement;
const botaoAgendar = () => screen.getByRole('button', { name: 'Agendar' });

function renderModal() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(<ScheduleMeetingModal deal={deal} onConfirm={onConfirm} onCancel={onCancel} />);
  return { ...utils, onConfirm, onCancel };
}

describe('ScheduleMeetingModal', () => {
  it('mostra a empresa do card', () => {
    renderModal();
    expect(screen.getByText('Mercado do Bairro')).toBeInTheDocument();
  });

  // A primeira versão sugeria "amanhã às 10h", que sempre nascia sem régua.
  it('a sugestão padrão já tem espaço para a régua — nenhum aviso', () => {
    renderModal();
    expect(reguaFicaVazia(new Date(), new Date(campo().value))).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
    expect(botaoAgendar()).toBeEnabled();
  });

  it('data no passado bloqueia o agendamento e explica', () => {
    renderModal();
    const ontem = new Date(Date.now() - 86_400_000);
    fireEvent.change(campo(), { target: { value: local(ontem) } });
    expect(screen.getByText('A reunião precisa ser no futuro.')).toBeInTheDocument();
    expect(botaoAgendar()).toBeDisabled();
  });

  // Aviso, não bloqueio: o SDR pode ter marcado mesmo para daqui a pouco.
  it('compromisso em cima da hora avisa que não haverá régua, mas deixa agendar', () => {
    renderModal();
    const daquiDuasHoras = new Date(Date.now() + 2 * 3600_000);
    fireEvent.change(campo(), { target: { value: local(daquiDuasHoras) } });
    expect(screen.getByRole('status')).toHaveTextContent(/sem régua automática/);
    expect(botaoAgendar()).toBeEnabled();
  });

  it('compromisso distante agenda sem aviso e devolve a data escolhida', () => {
    const { onConfirm } = renderModal();
    const longe = new Date();
    longe.setDate(longe.getDate() + 20);
    longe.setHours(10, 0, 0, 0);
    fireEvent.change(campo(), { target: { value: local(longe) } });

    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(botaoAgendar());
    expect(onConfirm).toHaveBeenCalledOnce();
    expect((onConfirm.mock.calls[0][0] as Date).getTime()).toBe(new Date(local(longe)).getTime());
  });

  it('Cancelar e Fechar chamam onCancel', () => {
    const { onCancel } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('clicar fora fecha; clicar dentro do modal não', () => {
    const { container, onCancel } = renderModal();
    fireEvent.click(container.querySelector('.modal')!);
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('.modal-ov')!);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
