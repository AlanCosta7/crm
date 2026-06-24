/**
 * calendarUtils.test.ts — Testes dos utilitários de Google Calendar
 *
 * Cobre: configuração de eventos, formatação de título/descrição,
 * duração por tipo, validação de tokens e montagem do evento completo.
 */

import { describe, it, expect } from 'vitest';
import {
  getCalendarEventConfig,
  buildEventSummary,
  buildEventDescription,
  toGoogleCalendarDateTime,
  getEventEndTime,
  isTokenExpired,
  isCalendarConnected,
  buildGoogleCalendarEvent,
  buildOAuthStartUrl,
} from './calendarUtils';
import type { ActivityType } from '../types/crm';

// ── getCalendarEventConfig ────────────────────────────────────────────────────
describe('getCalendarEventConfig', () => {
  it('email tem reminder de 30 min', () => {
    expect(getCalendarEventConfig('email').reminderMinutes).toBe(30);
  });
  it('call tem reminder de 10 min', () => {
    expect(getCalendarEventConfig('call').reminderMinutes).toBe(10);
  });
  it('visit tem reminder de 120 min (2h)', () => {
    expect(getCalendarEventConfig('visit').reminderMinutes).toBe(120);
  });
  it('meeting tem reminder de 60 min', () => {
    expect(getCalendarEventConfig('meeting').reminderMinutes).toBe(60);
  });
  it('win tem reminder de 0 min (sem lembrete)', () => {
    expect(getCalendarEventConfig('win').reminderMinutes).toBe(0);
  });
  it('tipo desconhecido retorna fallback seguro', () => {
    const cfg = getCalendarEventConfig('nota_inexistente' as ActivityType);
    expect(cfg.reminderMinutes).toBeGreaterThanOrEqual(0);
    expect(cfg.colorId).toBeDefined();
  });
  it('todos os tipos têm colorId e summary', () => {
    const types: ActivityType[] = ['email', 'linkedin', 'whatsapp', 'call', 'meeting', 'visit', 'proposal', 'note', 'win'];
    for (const t of types) {
      const cfg = getCalendarEventConfig(t);
      expect(cfg.colorId).toBeTruthy();
      expect(cfg.summary).toBeTruthy();
    }
  });
});

// ── buildEventSummary ─────────────────────────────────────────────────────────
describe('buildEventSummary', () => {
  it('inclui prefixo WizMart por padrão', () => {
    const title = buildEventSummary('meeting', 'João', 'Empresa ABC');
    expect(title).toContain('[WizMart]');
  });
  it('inclui prefixo Smart Café quando productId = smart_cafe', () => {
    const title = buildEventSummary('visit', 'Ana', 'Café SC', 'smart_cafe');
    expect(title).toContain('[Smart Café]');
  });
  it('inclui nome do contato', () => {
    const title = buildEventSummary('call', 'Carlos Mendes', 'Empresa');
    expect(title).toContain('Carlos Mendes');
  });
  it('inclui empresa entre parênteses', () => {
    const title = buildEventSummary('email', 'João', 'WizDist SP');
    expect(title).toContain('(WizDist SP)');
  });
  it('empresa vazia não quebra o título', () => {
    const title = buildEventSummary('call', 'Ana', '');
    expect(title).toBeTruthy();
    expect(title).not.toContain('()');
  });
  it('contato vazio usa "Contato" como fallback', () => {
    const title = buildEventSummary('email', '', 'Empresa');
    expect(title).toContain('Contato');
  });
});

// ── buildEventDescription ─────────────────────────────────────────────────────
describe('buildEventDescription', () => {
  it('inclui link para o CRM quando dealId presente', () => {
    const desc = buildEventDescription('act-001', 'deal-001', undefined, 'https://crm.wm.com.br');
    expect(desc).toContain('https://crm.wm.com.br');
  });
  it('inclui outcome quando presente', () => {
    const desc = buildEventDescription('act-001', 'deal-001', 'Cliente interessado', 'https://crm.wm.com.br');
    expect(desc).toContain('Cliente interessado');
  });
  it('inclui ID da atividade', () => {
    const desc = buildEventDescription('act-xpto', undefined, undefined, 'https://crm.wm.com.br');
    expect(desc).toContain('act-xpto');
  });
  it('sem dealId não inclui link de negócio', () => {
    const desc = buildEventDescription('act-001', undefined, undefined, 'https://crm.wm.com.br');
    expect(desc).not.toContain('Negócio:');
  });
});

// ── toGoogleCalendarDateTime ──────────────────────────────────────────────────
describe('toGoogleCalendarDateTime', () => {
  it('retorna dateTime em ISO 8601', () => {
    const date = new Date('2026-06-05T14:00:00Z');
    const result = toGoogleCalendarDateTime(date);
    expect(result.dateTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it('retorna timeZone correto', () => {
    const result = toGoogleCalendarDateTime(new Date(), 'America/Sao_Paulo');
    expect(result.timeZone).toBe('America/Sao_Paulo');
  });
  it('retorna objeto com dateTime e timeZone', () => {
    const result = toGoogleCalendarDateTime(new Date());
    expect(result).toHaveProperty('dateTime');
    expect(result).toHaveProperty('timeZone');
  });
});

// ── getEventEndTime ───────────────────────────────────────────────────────────
describe('getEventEndTime', () => {
  const start = new Date('2026-06-05T14:00:00Z');

  it('email dura 30 min', () => {
    const end = getEventEndTime(start, 'email');
    const diff = (end.getTime() - start.getTime()) / 60000;
    expect(diff).toBe(30);
  });
  it('visit dura 120 min', () => {
    const end = getEventEndTime(start, 'visit');
    const diff = (end.getTime() - start.getTime()) / 60000;
    expect(diff).toBe(120);
  });
  it('call dura 30 min', () => {
    const end = getEventEndTime(start, 'call');
    const diff = (end.getTime() - start.getTime()) / 60000;
    expect(diff).toBe(30);
  });
  it('não muta a data de início', () => {
    const original = start.getTime();
    getEventEndTime(start, 'meeting');
    expect(start.getTime()).toBe(original);
  });
});

// ── isTokenExpired ────────────────────────────────────────────────────────────
describe('isTokenExpired', () => {
  it('token no passado está expirado', () => {
    const past = new Date(Date.now() - 3600000); // 1h atrás
    expect(isTokenExpired(past)).toBe(true);
  });
  it('token em 10 min está expirado (dentro do buffer de 5min)', () => {
    const soon = new Date(Date.now() + 2 * 60 * 1000); // +2 min
    expect(isTokenExpired(soon, 5 * 60 * 1000)).toBe(true);
  });
  it('token em 1h não está expirado', () => {
    const future = new Date(Date.now() + 3600000);
    expect(isTokenExpired(future)).toBe(false);
  });
  it('token exatamente no buffer está expirado', () => {
    const atBuffer = new Date(Date.now() + 5 * 60 * 1000 - 1);
    expect(isTokenExpired(atBuffer, 5 * 60 * 1000)).toBe(true);
  });
});

// ── isCalendarConnected ───────────────────────────────────────────────────────
describe('isCalendarConnected', () => {
  it('null → não conectado', () => {
    expect(isCalendarConnected(null)).toBe(false);
  });
  it('isConnected: false → não conectado', () => {
    expect(isCalendarConnected({
      userId: 'u1', accessToken: 'x', refreshToken: 'y',
      expiresAt: new Date(), calendarId: 'primary',
      calendarEmail: 'a@b.com', isConnected: false,
      connectedAt: new Date(),
    })).toBe(false);
  });
  it('sem refreshToken → não conectado', () => {
    expect(isCalendarConnected({
      userId: 'u1', accessToken: 'x', refreshToken: '',
      expiresAt: new Date(), calendarId: 'primary',
      calendarEmail: 'a@b.com', isConnected: true,
      connectedAt: new Date(),
    })).toBe(false);
  });
  it('token válido → conectado', () => {
    expect(isCalendarConnected({
      userId: 'u1', accessToken: 'tok', refreshToken: 'ref',
      expiresAt: new Date(Date.now() + 3600000), calendarId: 'primary',
      calendarEmail: 'joao@empresa.com', isConnected: true,
      connectedAt: new Date(),
    })).toBe(true);
  });
});

// ── buildGoogleCalendarEvent ──────────────────────────────────────────────────
describe('buildGoogleCalendarEvent', () => {
  const scheduled = new Date('2026-06-10T14:00:00Z');
  const activity  = { type: 'meeting' as ActivityType, id: 'act-001', dealId: 'deal-001' };

  it('monta evento com summary correto', () => {
    const evt = buildGoogleCalendarEvent(activity, 'Carlos', 'WizDist', scheduled, 'https://crm.wm');
    expect(evt.summary).toContain('Carlos');
    expect(evt.summary).toContain('WizDist');
  });
  it('start e end são diferentes (duration > 0)', () => {
    const evt = buildGoogleCalendarEvent(activity, 'Ana', 'Empresa', scheduled, 'https://crm.wm');
    expect(evt.start.dateTime).not.toBe(evt.end.dateTime);
  });
  it('reminders configurados para meeting (60 min)', () => {
    const evt = buildGoogleCalendarEvent(activity, 'João', 'Corp', scheduled, 'https://crm.wm');
    const reminder = evt.reminders.overrides[0];
    expect(reminder).toBeDefined();
    expect(reminder.minutes).toBe(60);
  });
  it('win não tem reminder (0 min)', () => {
    const winAct = { type: 'win' as ActivityType, id: 'act-002' };
    const evt = buildGoogleCalendarEvent(winAct, 'X', 'Y', scheduled, 'https://crm.wm');
    expect(evt.reminders.overrides).toHaveLength(0);
  });
  it('tem colorId definido', () => {
    const evt = buildGoogleCalendarEvent(activity, 'A', 'B', scheduled, 'https://crm.wm');
    expect(evt.colorId).toBeTruthy();
  });
});

// ── buildOAuthStartUrl ────────────────────────────────────────────────────────
describe('buildOAuthStartUrl', () => {
  it('inclui userId na URL', () => {
    const url = buildOAuthStartUrl('https://us-central1-proj.cloudfunctions.net', 'uid-123');
    expect(url).toContain('uid-123');
  });
  it('aponta para calendarOAuthStart', () => {
    const url = buildOAuthStartUrl('https://funcs.net', 'uid');
    expect(url).toContain('calendarOAuthStart');
  });
  it('encoda userId com caracteres especiais', () => {
    const url = buildOAuthStartUrl('https://funcs.net', 'user+email@domain.com');
    expect(url).not.toContain('@'); // deve estar encodado
  });
});
