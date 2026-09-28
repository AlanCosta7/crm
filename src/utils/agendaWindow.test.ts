/**
 * agendaWindow.test.ts — Fase 3 do PLANO_DESENHO_CRM.md
 *
 * Os casos de `subtractBusinessDays` são os mesmos de
 * `functions/src/cadence/agendaRuler.test.ts`: este módulo é um espelho, e o
 * aviso do modal só é confiável se bater com o que o servidor faz.
 */
import { describe, it, expect } from 'vitest';
import { subtractBusinessDays, reguaFicaVazia, sugestaoDeReuniao } from './agendaWindow';

const QUINTA_10 = new Date('2026-09-10T13:00:00Z'); // quinta 10h BRT

describe('subtractBusinessDays — espelho do servidor', () => {
  it('um dia útil antes de quinta é quarta', () => {
    expect(subtractBusinessDays(QUINTA_10, 1).toISOString()).toBe('2026-09-09T13:00:00.000Z');
  });

  it('um dia útil antes de segunda é sexta, não domingo', () => {
    expect(subtractBusinessDays(new Date('2026-09-14T13:00:00Z'), 1).toISOString())
      .toBe('2026-09-11T13:00:00.000Z');
  });

  it('preserva a hora do compromisso', () => {
    expect(subtractBusinessDays(new Date('2026-09-10T20:30:00Z'), 1).toISOString())
      .toBe('2026-09-09T20:30:00.000Z');
  });

  it('compromisso no sábado recua para a sexta mesmo com 0 dias', () => {
    expect(subtractBusinessDays(new Date('2026-09-12T13:00:00Z'), 0).toISOString())
      .toBe('2026-09-11T13:00:00.000Z');
  });

  it('usa o dia da semana em BRT, não em UTC', () => {
    expect(subtractBusinessDays(new Date('2026-09-14T01:00:00Z'), 1).toISOString())
      .toBe('2026-09-12T01:00:00.000Z');
  });
});

describe('reguaFicaVazia', () => {
  it('compromisso distante tem régua', () => {
    expect(reguaFicaVazia(new Date('2026-09-01T13:00:00Z'), new Date('2026-09-15T13:00:00Z'))).toBe(false);
  });

  it('compromisso no passado fica vazio', () => {
    expect(reguaFicaVazia(new Date('2026-09-20T13:00:00Z'), QUINTA_10)).toBe(true);
  });

  it('data inválida fica vazia', () => {
    expect(reguaFicaVazia(new Date(), new Date('nada'))).toBe(true);
  });

  // O aviso antigo ("menos de 2 dias corridos") errava este caso para um lado…
  it('segunda 10h vista na sexta 21h fica VAZIA, mesmo estando a 2,5 dias', () => {
    const sexta21 = new Date('2026-09-12T00:00:00Z'); // sexta 21h BRT
    const segunda10 = new Date('2026-09-14T13:00:00Z');
    expect(reguaFicaVazia(sexta21, segunda10)).toBe(true);
  });

  // …e este para o outro.
  it('quarta 10h vista na terça 9h TEM confirmação, mesmo estando a 25h', () => {
    const terca9 = new Date('2026-09-08T12:00:00Z'); // terça 9h BRT
    const quarta10 = new Date('2026-09-09T13:00:00Z');
    expect(reguaFicaVazia(terca9, quarta10)).toBe(false);
  });
});

describe('sugestaoDeReuniao', () => {
  // Varre uma semana inteira de 5 em 5 horas: a sugestão precisa cair em dia
  // útil, no futuro, e com espaço para a régua — nunca disparar o próprio aviso.
  it('sempre sugere dia útil, no futuro, com régua', () => {
    const base = new Date(2026, 8, 7, 0, 0); // segunda-feira, horário local
    for (let h = 0; h < 7 * 24; h += 5) {
      const agora = new Date(base.getTime() + h * 3600_000);
      const s = sugestaoDeReuniao(agora);
      expect([0, 6]).not.toContain(s.getDay());
      expect(s.getTime()).toBeGreaterThan(agora.getTime());
      expect(reguaFicaVazia(agora, s)).toBe(false);
    }
  });

  it('sugere às 10h em ponto', () => {
    const s = sugestaoDeReuniao(new Date(2026, 8, 8, 15, 0));
    expect(s.getHours()).toBe(10);
    expect(s.getMinutes()).toBe(0);
  });
});
