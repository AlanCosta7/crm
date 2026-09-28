import { describe, it, expect } from 'vitest';
import { validateContractFile, contractStoragePath, CONTRACT_MAX_SIZE } from './contractAttachment';

const pdf = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: 'contrato.pdf', type: 'application/pdf', size: 1024,
  ...over,
});

describe('validateContractFile', () => {
  it('aceita um PDF normal', () => {
    expect(validateContractFile(pdf())).toEqual({ ok: true });
  });

  it('rejeita qualquer coisa que não seja PDF', () => {
    expect(validateContractFile(pdf({ type: 'application/msword', name: 'contrato.doc' })).ok).toBe(false);
    expect(validateContractFile(pdf({ type: 'image/png', name: 'foto.png' })).ok).toBe(false);
  });

  it('rejeita arquivo vazio', () => {
    expect(validateContractFile(pdf({ size: 0 })).ok).toBe(false);
  });

  it('rejeita acima do limite', () => {
    expect(validateContractFile(pdf({ size: CONTRACT_MAX_SIZE + 1 })).ok).toBe(false);
  });

  it('aceita exatamente no limite', () => {
    expect(validateContractFile(pdf({ size: CONTRACT_MAX_SIZE })).ok).toBe(true);
  });

  it('mensagem de erro cita o nome do arquivo', () => {
    const r = validateContractFile(pdf({ type: 'text/plain', name: 'nao-e-pdf.txt' }));
    expect(r.error).toContain('nao-e-pdf.txt');
  });
});

describe('contractStoragePath', () => {
  it('monta o caminho no layout que storage.rules autoriza', () => {
    expect(contractStoragePath('wizmart_sp', 'deal-016', 'att1', 'Contrato Assinado.pdf'))
      .toBe('tenants/wizmart_sp/deals/deal-016/contract/att1/Contrato Assinado.pdf');
  });

  it('sanitiza o nome do arquivo (reaproveita a mesma função de notes/attachments)', () => {
    expect(contractStoragePath('t1', 'd1', 'att1', '../../etc/passaporte.pdf'))
      .toBe('tenants/t1/deals/d1/contract/att1/etc-passaporte.pdf');
  });

  // O motivo de existir attachmentId: dois envios do MESMO nome de arquivo
  // (substituir o contrato) precisam de caminhos DIFERENTES, para o Storage
  // tratar como `create` e não como `update` de um objeto imutável.
  it('o mesmo arquivo enviado duas vezes gera caminhos diferentes com attachmentId diferente', () => {
    const p1 = contractStoragePath('t1', 'd1', 'att1', 'contrato.pdf');
    const p2 = contractStoragePath('t1', 'd1', 'att2', 'contrato.pdf');
    expect(p1).not.toBe(p2);
  });
});
