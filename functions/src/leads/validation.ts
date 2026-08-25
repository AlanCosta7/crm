/**
 * validation.ts — Validação e normalização do payload de lead (Zod).
 *
 * Regras:
 *  - name obrigatório (2–120 chars)
 *  - email OU telefone BR válido obrigatório
 *  - custom: máx. 10 campos, chave ≤ 40 chars, valor ≤ 500 chars
 *  - payload total ≤ 16KB (verificado antes do parse, em captureLead)
 */

import { z } from "zod";
import type { LeadData, LeadTracking } from "./types";

export const MAX_BODY_BYTES = 16 * 1024;
export const MAX_CUSTOM_FIELDS = 10;

// ── Normalizadores ────────────────────────────────────────────────────────────

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  // validação simples e suficiente p/ dedupe (Zod valida o formato de verdade)
  return email.includes("@") ? email : null;
}

/**
 * Normaliza telefone brasileiro para somente dígitos, sem DDI 55 e sem 0 de
 * operadora. Retorna null se não parecer um telefone BR (10–11 dígitos:
 * DDD + fixo 8 dígitos ou celular 9 dígitos).
 */
export function normalizePhoneBR(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let digits = raw.replace(/\D/g, "");
  // remove DDI 55 (com ou sem 0 internacional antes)
  if (digits.startsWith("0055")) digits = digits.slice(4);
  else if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  // remove 0 de operadora/prefixo nacional
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length < 10 || digits.length > 11) return null;
  return digits;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const shortText = (max: number) => z.string().trim().max(max);

const customSchema = z
  .record(z.string().max(40), z.string().max(500))
  .refine((rec) => Object.keys(rec).length <= MAX_CUSTOM_FIELDS, {
    message: `custom aceita no máximo ${MAX_CUSTOM_FIELDS} campos`,
  });

const trackingSchema = z.object({
  utmSource: shortText(500).optional(),
  utmMedium: shortText(500).optional(),
  utmCampaign: shortText(500).optional(),
  utmTerm: shortText(500).optional(),
  utmContent: shortText(500).optional(),
  pageUrl: shortText(500).optional(),
  referrer: shortText(500).optional(),
});

export const leadPayloadSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.email().trim().toLowerCase().max(160).optional(),
    phone: shortText(30).optional(),
    company: shortText(160).optional(),
    message: shortText(2000).optional(),
    custom: customSchema.optional(),
    tracking: trackingSchema.optional(),
    // campos de controle anti-bot (injetados pelo snippet wizforms.js)
    _hp: z.string().max(500).optional(),
    _ts: z.number().int().nonnegative().optional(),
    _turnstile: z.string().max(4096).optional(),
  })
  .refine((d) => !!normalizeEmail(d.email) || !!normalizePhoneBR(d.phone), {
    message: "email válido ou telefone BR válido é obrigatório",
  });

export type LeadPayload = z.infer<typeof leadPayloadSchema>;

export type ParseResult =
  | { ok: true; data: LeadPayload }
  | { ok: false; issues: string[] };

export function parseLeadPayload(body: unknown): ParseResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, issues: ["body deve ser um objeto JSON"] };
  }
  const result = leadPayloadSchema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues.map((i) =>
      i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
    );
    return { ok: false, issues };
  }
  return { ok: true, data: result.data };
}

/** Extrai os dados persistíveis do payload validado (sem campos de controle). */
export function toLeadData(payload: LeadPayload): LeadData {
  const data: LeadData = { name: payload.name };
  if (payload.email) data.email = payload.email;
  const phone = normalizePhoneBR(payload.phone);
  if (phone) data.phone = phone;
  if (payload.company) data.company = payload.company;
  if (payload.message) data.message = payload.message;
  if (payload.custom && Object.keys(payload.custom).length > 0) {
    data.custom = payload.custom;
  }
  return data;
}

export function toTracking(payload: LeadPayload): LeadTracking | undefined {
  const t = payload.tracking;
  if (!t) return undefined;
  const entries = Object.entries(t).filter(([, v]) => typeof v === "string" && v.length > 0);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as LeadTracking;
}
