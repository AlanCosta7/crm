/**
 * calendarUtils.ts — Utilitários puros para integração com Google Calendar
 *
 * Todas as funções são puras (sem I/O) e totalmente testáveis.
 * Testes em: src/utils/calendarUtils.test.ts
 *
 * A integração segue o ADR-009: OAuth2 Authorization Code Flow
 * gerenciado por Cloud Functions HTTP.
 */

import type { Activity, ActivityType } from '../types/crm';

// ── Configuração de eventos por tipo de atividade ─────────────────────────────

export interface CalendarEventConfig {
  summary: string;       // Título do evento no Google Calendar
  colorId: string;       // ID de cor do Google Calendar (1–11)
  reminderMinutes: number;
}

/**
 * Retorna a configuração do evento do Calendar baseado no tipo de atividade.
 * colorId: https://developers.google.com/calendar/api/v3/reference/colors/get
 */
export function getCalendarEventConfig(type: ActivityType): CalendarEventConfig {
  const configs: Partial<Record<ActivityType, CalendarEventConfig>> = {
    email:    { summary: '📧 E-mail',    colorId: '2',  reminderMinutes: 30  },
    linkedin: { summary: '💼 LinkedIn',  colorId: '9',  reminderMinutes: 30  },
    whatsapp: { summary: '💬 WhatsApp',  colorId: '10', reminderMinutes: 15  },
    call:     { summary: '📞 Ligação',   colorId: '5',  reminderMinutes: 10  },
    meeting:  { summary: '🤝 Reunião',   colorId: '1',  reminderMinutes: 60  },
    visit:    { summary: '🗺️ Visita',    colorId: '11', reminderMinutes: 120 },
    proposal: { summary: '📋 Proposta',  colorId: '3',  reminderMinutes: 60  },
    note:     { summary: '📝 Nota',      colorId: '8',  reminderMinutes: 30  },
    win:      { summary: '🏆 Ganho',     colorId: '2',  reminderMinutes: 0   },
  };
  return configs[type] ?? { summary: '📌 Atividade', colorId: '1', reminderMinutes: 30 };
}

// ── Formatação de eventos ─────────────────────────────────────────────────────

/**
 * Gera o título do evento no Google Calendar.
 * Formato: "[WizMart] {Tipo} — {Contato} ({Empresa})"
 */
export function buildEventSummary(
  type: ActivityType,
  contactName: string,
  companyName: string,
  productId?: string,
): string {
  const prefix = productId === 'smart_cafe' ? '[Smart Café]' : '[WizMart]';
  const cfg    = getCalendarEventConfig(type);
  const base   = cfg.summary;
  const contact = contactName || 'Contato';
  const company = companyName ? ` (${companyName})` : '';
  return `${prefix} ${base} — ${contact}${company}`;
}

/**
 * Gera a descrição do evento no Google Calendar com link para o CRM.
 */
export function buildEventDescription(
  activityId: string,
  dealId: string | undefined,
  outcome: string | undefined,
  crmBaseUrl: string,
): string {
  const lines: string[] = [
    '📌 Atividade registrada no WizMart CRM',
  ];
  if (dealId) {
    lines.push(`🔗 Negócio: ${crmBaseUrl}/pipeline`);
  }
  if (outcome) {
    lines.push(`📝 Resultado: ${outcome}`);
  }
  lines.push('');
  lines.push(`ID da atividade: ${activityId}`);
  return lines.join('\n');
}

/**
 * Converte uma data JS para o formato do Google Calendar API (RFC 3339).
 * Exemplo: "2026-06-05T14:30:00-03:00"
 */
export function toGoogleCalendarDateTime(date: Date, timeZone = 'America/Sao_Paulo'): {
  dateTime: string;
  timeZone: string;
} {
  return {
    dateTime: date.toISOString(),
    timeZone,
  };
}

/**
 * Calcula a data/hora de fim de um evento (duração padrão por tipo).
 */
export function getEventEndTime(start: Date, type: ActivityType): Date {
  const durationMinutes: Partial<Record<ActivityType, number>> = {
    email:    30,
    linkedin: 15,
    whatsapp: 15,
    call:     30,
    meeting:  60,
    visit:    120,
    proposal: 90,
    note:     15,
    win:      30,
  };
  const duration = durationMinutes[type] ?? 30;
  const end = new Date(start.getTime());
  end.setMinutes(end.getMinutes() + duration);
  return end;
}

// ── Validação de tokens ───────────────────────────────────────────────────────

/**
 * Verifica se um token de acesso do Google Calendar está expirado.
 * Considera expirado se faltar menos de 5 minutos.
 */
export function isTokenExpired(expiresAt: Date, buffer = 5 * 60 * 1000): boolean {
  return Date.now() >= expiresAt.getTime() - buffer;
}

/**
 * Verifica se o usuário tem Calendar conectado baseado nos dados do Firestore.
 */
export function isCalendarConnected(tokenData: CalendarTokenData | null): boolean {
  if (!tokenData) return false;
  if (!tokenData.isConnected) return false;
  if (!tokenData.refreshToken) return false;
  return true;
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface CalendarTokenData {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  calendarId: string;
  calendarEmail: string;
  isConnected: boolean;
  connectedAt: Date;
  lastSyncAt?: Date;
}

export interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end:   { dateTime: string; timeZone: string };
  reminders: {
    useDefault: boolean;
    overrides: { method: string; minutes: number }[];
  };
  colorId?: string;
}

/**
 * Monta o objeto de evento para a Google Calendar API.
 */
export function buildGoogleCalendarEvent(
  activity: Partial<Activity> & { type: ActivityType; productId?: string },
  contactName: string,
  companyName: string,
  scheduledAt: Date,
  crmBaseUrl: string,
): GoogleCalendarEvent {
  const cfg     = getCalendarEventConfig(activity.type);
  const summary = buildEventSummary(activity.type, contactName, companyName, activity.productId as string);
  const endTime = getEventEndTime(scheduledAt, activity.type);

  return {
    summary,
    description: buildEventDescription(
      activity.id || '',
      activity.dealId,
      activity.outcome,
      crmBaseUrl,
    ),
    start: toGoogleCalendarDateTime(scheduledAt),
    end:   toGoogleCalendarDateTime(endTime),
    reminders: {
      useDefault: false,
      overrides: cfg.reminderMinutes > 0
        ? [{ method: 'popup', minutes: cfg.reminderMinutes }]
        : [],
    },
    colorId: cfg.colorId,
  };
}

// ── URL do OAuth ──────────────────────────────────────────────────────────────

/**
 * Gera a URL para iniciar o fluxo OAuth2 do Google Calendar.
 * Aponta para a Cloud Function calendarOAuthStart.
 */
export function buildOAuthStartUrl(functionsBaseUrl: string, userId: string): string {
  return `${functionsBaseUrl}/calendarOAuthStart?userId=${encodeURIComponent(userId)}`;
}
