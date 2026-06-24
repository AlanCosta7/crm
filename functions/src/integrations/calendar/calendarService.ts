/**
 * calendarService.ts — Serviço de integração com Google Calendar API
 *
 * Responsabilidades:
 *  - Gerenciar tokens OAuth2 (refresh automático quando expirado)
 *  - Criar, atualizar e deletar eventos no Google Calendar do usuário
 *  - Mapear atividades CRM → Google Calendar Event
 *
 * Dependência: googleapis npm package.
 * Tokens armazenados em: /tenants/{tenantId}/calendar_tokens/{userId}
 */

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";

// ── Configuração OAuth ────────────────────────────────────────────────────────

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  // Fase 2 — envio de email pela conta Gmail do próprio usuário
  "https://www.googleapis.com/auth/gmail.send",
];

const CRM_BASE_URL = process.env.CRM_BASE_URL || "https://crm.wizmart.com.br";
const TIME_ZONE    = "America/Sao_Paulo";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface CalendarEventInput {
  activityId: string;
  activityType: string;
  contactName: string;
  companyName: string;
  productId?: string;
  scheduledAt: Date;
  dealId?: string;
  outcome?: string;
  notes?: string;
}

// ── OAuth2 Client ─────────────────────────────────────────────────────────────

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${process.env.FUNCTIONS_URL}/calendarOAuthCallback`,
  );
}

/**
 * Retorna a URL de autorização OAuth2 para redirecionar o usuário.
 */
export function getOAuthAuthUrl(userId: string): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    state: userId, // passado pelo callback para identificar o usuário
    prompt: "consent", // força o refresh_token sempre
  });
}

/**
 * Troca um Authorization Code por tokens de acesso e refresh.
 * Salva os tokens em Firestore.
 */
export async function exchangeCodeForTokens(
  db: admin.firestore.Firestore,
  tenantId: string,
  userId: string,
  code: string,
): Promise<string> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token || !tokens.access_token) {
    throw new Error("Tokens inválidos retornados pelo Google.");
  }

  oauth2Client.setCredentials(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  // Busca informações do calendário principal do usuário
  const calendarInfo = await calendar.calendarList.get({ calendarId: "primary" });
  const calendarEmail = calendarInfo.data.id || "";

  // Salva tokens no Firestore (em produção: criptografar com KMS)
  await db.doc(`tenants/${tenantId}/calendar_tokens/${userId}`).set({
    userId,
    accessToken:   tokens.access_token,
    refreshToken:  tokens.refresh_token,
    expiresAt:     tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000),
    calendarId:    "primary",
    calendarEmail,
    isConnected:   true,
    connectedAt:   FieldValue.serverTimestamp(),
    lastSyncAt:    FieldValue.serverTimestamp(),
  });

  // Atualiza flag no perfil do usuário
  await db.doc(`tenants/${tenantId}/users/${userId}`).update({
    calendarConnected: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log(`[calendarService] Tokens salvos para usuário ${userId} — ${calendarEmail}`);
  return calendarEmail;
}

// ── Autenticação com tokens existentes ────────────────────────────────────────

/**
 * Carrega e valida os tokens do Firestore. Faz refresh automático se expirado.
 * @returns oauth2Client configurado com credentials válidas
 */
export async function getAuthenticatedClient(
  db: admin.firestore.Firestore,
  tenantId: string,
  userId: string,
) {
  const tokenDoc = await db.doc(`tenants/${tenantId}/calendar_tokens/${userId}`).get();

  if (!tokenDoc.exists) {
    throw new Error(`Usuário ${userId} não tem Google Calendar conectado.`);
  }

  const tokenData = tokenDoc.data()!;
  if (!tokenData.isConnected || !tokenData.refreshToken) {
    throw new Error(`Tokens inválidos ou conexão revogada para usuário ${userId}.`);
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token:  tokenData.accessToken,
    refresh_token: tokenData.refreshToken,
    expiry_date:   tokenData.expiresAt?.toMillis?.() || Date.now(),
  });

  // Refresh automático quando próximo do vencimento (5 min de buffer)
  const expiresAt = tokenData.expiresAt?.toDate?.() || new Date(tokenData.expiresAt);
  if (Date.now() >= expiresAt.getTime() - 5 * 60 * 1000) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);

    // Persiste novo access_token
    await tokenDoc.ref.update({
      accessToken: credentials.access_token,
      expiresAt: credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : new Date(Date.now() + 3600 * 1000),
      lastSyncAt: FieldValue.serverTimestamp(),
    });
  }

  return oauth2Client;
}

// ── CRUD de Eventos ───────────────────────────────────────────────────────────

/**
 * Cria um evento no Google Calendar do usuário.
 * @returns ID do evento criado no Google Calendar
 */
export async function createCalendarEvent(
  db: admin.firestore.Firestore,
  tenantId: string,
  userId: string,
  input: CalendarEventInput,
): Promise<string | null> {
  try {
    const auth    = await getAuthenticatedClient(db, tenantId, userId);
    const calendar = google.calendar({ version: "v3", auth });

    const eventConfig = getEventConfig(input.activityType);
    const prefix      = input.productId === "smart_cafe" ? "[Smart Café]" : "[WizMart]";
    const endTime     = new Date(input.scheduledAt.getTime() + getDurationMs(input.activityType));

    const event = {
      summary:     `${prefix} ${eventConfig.icon} ${input.activityType} — ${input.contactName} (${input.companyName})`,
      description: buildDescription(input, CRM_BASE_URL),
      start:       { dateTime: input.scheduledAt.toISOString(), timeZone: TIME_ZONE },
      end:         { dateTime: endTime.toISOString(),           timeZone: TIME_ZONE },
      colorId:     eventConfig.colorId,
      reminders:   {
        useDefault: false,
        overrides: eventConfig.reminderMinutes > 0
          ? [{ method: "popup", minutes: eventConfig.reminderMinutes }]
          : [],
      },
    };

    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    const calendarEventId = response.data.id || null;
    console.log(`[calendarService] Evento criado: ${calendarEventId} para atividade ${input.activityId}`);
    return calendarEventId;
  } catch (err: any) {
    console.error(`[calendarService] Erro ao criar evento para ${userId}:`, err.message);
    return null;
  }
}

/**
 * Atualiza um evento existente no Google Calendar.
 */
export async function updateCalendarEvent(
  db: admin.firestore.Firestore,
  tenantId: string,
  userId: string,
  calendarEventId: string,
  input: Partial<CalendarEventInput>,
): Promise<boolean> {
  try {
    const auth     = await getAuthenticatedClient(db, tenantId, userId);
    const calendar = google.calendar({ version: "v3", auth });

    const patch: Record<string, any> = {};
    if (input.scheduledAt) {
      const endTime = new Date(input.scheduledAt.getTime() + getDurationMs(input.activityType || "email"));
      patch.start = { dateTime: input.scheduledAt.toISOString(), timeZone: TIME_ZONE };
      patch.end   = { dateTime: endTime.toISOString(),           timeZone: TIME_ZONE };
    }
    if (input.outcome) {
      patch.description = buildDescription(input as CalendarEventInput, CRM_BASE_URL);
    }

    await calendar.events.patch({
      calendarId: "primary",
      eventId:    calendarEventId,
      requestBody: patch,
    });

    console.log(`[calendarService] Evento ${calendarEventId} atualizado.`);
    return true;
  } catch (err: any) {
    console.error(`[calendarService] Erro ao atualizar evento ${calendarEventId}:`, err.message);
    return false;
  }
}

/**
 * Remove um evento do Google Calendar.
 */
export async function deleteCalendarEvent(
  db: admin.firestore.Firestore,
  tenantId: string,
  userId: string,
  calendarEventId: string,
): Promise<boolean> {
  try {
    const auth     = await getAuthenticatedClient(db, tenantId, userId);
    const calendar = google.calendar({ version: "v3", auth });

    await calendar.events.delete({ calendarId: "primary", eventId: calendarEventId });
    console.log(`[calendarService] Evento ${calendarEventId} removido.`);
    return true;
  } catch (err: any) {
    console.error(`[calendarService] Erro ao deletar evento ${calendarEventId}:`, err.message);
    return false;
  }
}

// ── Helpers internos ──────────────────────────────────────────────────────────

function getEventConfig(type: string): { icon: string; colorId: string; reminderMinutes: number } {
  const configs: Record<string, { icon: string; colorId: string; reminderMinutes: number }> = {
    email:    { icon: "📧", colorId: "2",  reminderMinutes: 30  },
    linkedin: { icon: "💼", colorId: "9",  reminderMinutes: 30  },
    whatsapp: { icon: "💬", colorId: "10", reminderMinutes: 15  },
    call:     { icon: "📞", colorId: "5",  reminderMinutes: 10  },
    meeting:  { icon: "🤝", colorId: "1",  reminderMinutes: 60  },
    visit:    { icon: "🗺️", colorId: "11", reminderMinutes: 120 },
    proposal: { icon: "📋", colorId: "3",  reminderMinutes: 60  },
  };
  return configs[type] ?? { icon: "📌", colorId: "1", reminderMinutes: 30 };
}

function getDurationMs(type: string): number {
  const durations: Record<string, number> = {
    email: 30, linkedin: 15, whatsapp: 15, call: 30,
    meeting: 60, visit: 120, proposal: 90,
  };
  return (durations[type] ?? 30) * 60 * 1000;
}

function buildDescription(input: Partial<CalendarEventInput>, baseUrl: string): string {
  const lines = ["📌 Atividade registrada no WizMart CRM"];
  if (input.dealId) lines.push(`🔗 Negócio: ${baseUrl}/pipeline`);
  if (input.outcome) lines.push(`📝 Resultado: ${input.outcome}`);
  if (input.notes)   lines.push(`🗒️ Notas: ${input.notes}`);
  lines.push("", `ID: ${input.activityId || "—"}`);
  return lines.join("\n");
}
