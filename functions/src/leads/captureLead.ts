/**
 * captureLead.ts — Endpoint público de captação de leads (WizMart Forms).
 *
 * POST /api/leads  (rewrite do Hosting → esta function)
 * Headers: Content-Type: application/json · X-WizMart-Key: wzk_...
 *
 * Camadas (ordem de execução — ver PLANO_CAPTACAO_LEADS.md §3):
 *   1. método POST + tamanho do body (≤16KB)
 *   2. API key (hash SHA-256 → lead_sources via collectionGroup) + isActive
 *   3. Origin allowlist da fonte (403 explícito: erro de config depurável)
 *   4. Rate limit por IP (5/min) e por fonte (60/h) — transação em rate_limits
 *   5. Validação Zod do payload
 *   6. Honeypot + time-trap → SUCESSO FALSO (bot não aprende)
 *   7. Turnstile (se a fonte exigir; fail-closed)
 *   8. Dedupe 24h (email/telefone) → activity no deal existente
 *   9. Persistência: lead + deal no 1º estágio do funil da fonte
 *
 * Códigos: 201 ok · 400 invalid_request · 401 invalid_key ·
 *          403 origin_not_allowed · 405 · 413 · 429 too_many_requests
 */

import { onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Response } from "express";
import { randomBytes } from "node:crypto";

import { hashApiKey, isValidKeyFormat } from "./apiKey";
import {
  checkHoneypot,
  checkTimeTrap,
  extractOrigin,
  isOriginAllowed,
  isTimeTrapBlocked,
  verifyTurnstile,
} from "./antibot";
import {
  MAX_BODY_BYTES,
  parseLeadPayload,
  toLeadData,
  toTracking,
  type LeadPayload,
} from "./validation";
import {
  applyRateLimit,
  IP_LIMIT,
  rateLimitDocId,
  SOURCE_LIMIT,
  type RateLimitDoc,
} from "./rateLimit";
import { dedupeKeyFor, DEDUPE_WINDOW_MS } from "./dedupe";
import type { FunnelDoc, LeadSourceDoc } from "./types";

const REGION = "southamerica-east1";
const API_KEY_HEADER = "x-wizmart-key";

// ── Helpers HTTP ──────────────────────────────────────────────────────────────

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  return (first?.split(",")[0]?.trim() || req.ip || "unknown").slice(0, 64);
}

/** Ecoa a origin no CORS apenas quando permitida pela fonte. */
function setCors(res: Response, origin: string | null): void {
  if (origin) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
}

/** Sucesso falso p/ bots: indistinguível de um 201 real. */
function fakeSuccess(res: Response): void {
  res.status(201).json({ ok: true, leadId: randomBytes(10).toString("hex") });
}

// ── Endpoint ──────────────────────────────────────────────────────────────────

export const captureLead = onRequest(
  {
    region: REGION,
    maxInstances: 2,
    timeoutSeconds: 15,
    memory: "256MiB",
    // CORS manual: o echo da origin depende da fonte identificada pela chave
    cors: false,
    // secret só é lido quando a fonte tem turnstileEnabled=true; precisa
    // existir no Secret Manager ANTES do deploy (firebase functions:secrets:set)
    secrets: ["TURNSTILE_SECRET"],
  },
  async (req, res) => {
    // Preflight: permissivo (a imposição real acontece no POST)
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", req.headers.origin ?? "*");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, X-WizMart-Key");
      res.set("Access-Control-Max-Age", "3600");
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }

    const contentLength = Number(req.headers["content-length"] ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      res.status(413).json({ error: "payload_too_large" });
      return;
    }

    const db = admin.firestore();
    const now = Date.now();
    const origin = extractOrigin(
      req.headers.origin as string | undefined,
      req.headers.referer as string | undefined
    );

    // ── 2. API key → fonte ────────────────────────────────────────────────────
    const apiKey = req.headers[API_KEY_HEADER];
    if (!isValidKeyFormat(apiKey)) {
      res.status(401).json({ error: "invalid_key" });
      return;
    }

    const sourceQuery = await db
      .collectionGroup("lead_sources")
      .where("apiKeyHash", "==", hashApiKey(apiKey))
      .limit(1)
      .get();

    if (sourceQuery.empty) {
      res.status(401).json({ error: "invalid_key" });
      return;
    }

    const sourceSnap = sourceQuery.docs[0];
    const source = sourceSnap.data() as LeadSourceDoc;
    const sourceId = sourceSnap.id;
    const tenantId = sourceSnap.ref.parent.parent?.id;

    if (!tenantId || !source.isActive) {
      // fonte desativada = kill-switch: resposta idêntica a chave inválida
      res.status(401).json({ error: "invalid_key" });
      return;
    }

    const blockedBy = (reason: string): Promise<unknown> => {
      console.warn(`[captureLead] bloqueado (${reason}) source=${sourceId} ip=${clientIp(req)}`);
      return sourceSnap.ref
        .update({ "stats.blocked": FieldValue.increment(1) })
        .catch((err) => console.error("[captureLead] stats.blocked falhou:", err));
    };

    // ── 3. Origin allowlist ───────────────────────────────────────────────────
    if (!isOriginAllowed(origin, source.allowedOrigins ?? [])) {
      await blockedBy("origin");
      res.status(403).json({ error: "origin_not_allowed" });
      return;
    }
    setCors(res, origin);

    // ── 4. Rate limit (IP + fonte, na mesma transação) ────────────────────────
    const ip = clientIp(req);
    const ipRef = db.collection("rate_limits").doc(rateLimitDocId("ip", ip));
    const sourceRef = db.collection("rate_limits").doc(rateLimitDocId("source", sourceId));

    const rateAllowed = await db.runTransaction(async (tx) => {
      const [ipSnap, srcSnap] = await Promise.all([tx.get(ipRef), tx.get(sourceRef)]);
      const ipResult = applyRateLimit(
        (ipSnap.data() as RateLimitDoc | undefined) ?? null,
        IP_LIMIT.limit,
        IP_LIMIT.windowMs,
        now
      );
      const srcResult = applyRateLimit(
        (srcSnap.data() as RateLimitDoc | undefined) ?? null,
        SOURCE_LIMIT.limit,
        SOURCE_LIMIT.windowMs,
        now
      );
      tx.set(ipRef, ipResult.nextDoc);
      tx.set(sourceRef, srcResult.nextDoc);
      return ipResult.allowed && srcResult.allowed;
    });

    if (!rateAllowed) {
      await blockedBy("rate_limit");
      res.status(429).json({ error: "too_many_requests" });
      return;
    }

    // ── 5. Validação ──────────────────────────────────────────────────────────
    const parsed = parseLeadPayload(req.body);
    if (!parsed.ok) {
      await blockedBy("validation");
      res.status(400).json({ error: "invalid_request", details: parsed.issues });
      return;
    }
    const payload = parsed.data;

    // ── 6. Honeypot + time-trap → sucesso falso ───────────────────────────────
    if (checkHoneypot(payload._hp) === "bot" || isTimeTrapBlocked(checkTimeTrap(payload._ts, now))) {
      await blockedBy("antibot");
      fakeSuccess(res);
      return;
    }

    // ── 7. Turnstile (opcional por fonte, fail-closed) ────────────────────────
    if (source.turnstileEnabled) {
      const secret = process.env.TURNSTILE_SECRET ?? "";
      if (!secret) {
        console.error("[captureLead] TURNSTILE_SECRET não configurado mas a fonte exige Turnstile");
      }
      const human = await verifyTurnstile(payload._turnstile, secret, ip);
      if (!human) {
        await blockedBy("turnstile");
        res.status(400).json({ error: "turnstile_failed" });
        return;
      }
    }

    // ── 8. Dedupe 24h ─────────────────────────────────────────────────────────
    const tenantPath = `tenants/${tenantId}`;
    const leadsCol = db.collection(`${tenantPath}/leads`);
    const dedupeKey = dedupeKeyFor(sourceId, payload.email, payload.phone);

    let existingDealId: string | undefined;
    if (dedupeKey) {
      const dupQuery = await leadsCol
        .where("dedupeKey", "==", dedupeKey)
        .where("createdAt", ">=", Timestamp.fromMillis(now - DEDUPE_WINDOW_MS))
        .limit(1)
        .get();
      const dup = dupQuery.docs[0]?.data();
      if (dup?.dealId) existingDealId = dup.dealId as string;
    }

    // ── 9. Persistência ───────────────────────────────────────────────────────
    const leadRef = leadsCol.doc();
    const nowTs = Timestamp.fromMillis(now);
    const baseLead = {
      sourceId,
      data: toLeadData(payload),
      ...(toTracking(payload) ? { tracking: toTracking(payload) } : {}),
      meta: {
        ip,
        userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300),
        origin: origin ?? "",
      },
      ...(dedupeKey ? { dedupeKey } : {}),
      createdAt: nowTs,
    };

    try {
      if (existingDealId) {
        // duplicado: registra o lead + activity no deal existente (sem deal novo)
        const batch = db.batch();
        batch.set(leadRef, { ...baseLead, status: "duplicate", dealId: existingDealId });
        batch.set(db.collection(`${tenantPath}/activities`).doc(), {
          dealId: existingDealId,
          userId: "system",
          type: "note",
          status: "completed",
          completedAt: nowTs,
          coinsAwarded: 0,
          who: "WizMart Forms",
          text: `Novo contato do lead via "${source.name}" (${payload.email ?? payload.phone ?? ""})`,
          createdAt: nowTs,
        });
        await batch.commit();
      } else {
        const deal = await buildDealFromLead(db, tenantPath, source, sourceId, leadRef.id, payload);
        const batch = db.batch();
        const dealRef = db.collection(`${tenantPath}/deals`).doc();
        batch.set(dealRef, deal);
        batch.set(leadRef, { ...baseLead, status: "converted", dealId: dealRef.id });
        await batch.commit();
      }

      await sourceSnap.ref
        .update({
          "stats.received": FieldValue.increment(1),
          "stats.lastLeadAt": nowTs,
        })
        .catch((err) => console.error("[captureLead] stats.received falhou:", err));

      console.log(
        `[captureLead] lead ${leadRef.id} ${existingDealId ? "duplicate" : "converted"} source=${sourceId} tenant=${tenantId}`
      );
      res.status(201).json({ ok: true, leadId: leadRef.id });
    } catch (err) {
      console.error("[captureLead] erro ao persistir:", err);
      res.status(500).json({ error: "internal" });
    }
  }
);

/** Monta o Deal no 1º estágio do funil da fonte (mesmo shape do PipelinePage). */
async function buildDealFromLead(
  db: admin.firestore.Firestore,
  tenantPath: string,
  source: LeadSourceDoc,
  sourceId: string,
  leadId: string,
  payload: LeadPayload
): Promise<Record<string, unknown>> {
  const funnelSnap = await db.doc(`${tenantPath}/funnels/${source.funnelId}`).get();
  const funnel = funnelSnap.data() as FunnelDoc | undefined;
  if (!funnel) {
    throw new Error(`Funil ${source.funnelId} da fonte ${sourceId} não encontrado`);
  }
  const firstStage = [...(funnel.stages ?? [])]
    .filter((s) => !s.isLost)
    .sort((a, b) => a.order - b.order)[0];
  if (!firstStage) {
    throw new Error(`Funil ${source.funnelId} não tem estágios`);
  }

  const tracking = toTracking(payload);
  const utm = tracking
    ? Object.fromEntries(
        Object.entries(tracking).filter(([k]) => k.startsWith("utm"))
      )
    : undefined;

  const nowTs = Timestamp.now();
  return {
    name: payload.name,
    company: payload.company ?? payload.name,
    value: 0,
    stage: firstStage.id,
    funnelId: source.funnelId,
    funnelType: funnel.type,
    productId: source.productId,
    owner: source.defaultOwner ?? "",
    due: "—",
    status: "open",
    tasks: { e: false, w: false, m: false },
    leadOrigin: {
      leadId,
      sourceId,
      sourceName: source.name,
      ...(utm && Object.keys(utm).length > 0 ? { utm } : {}),
      ...(tracking?.pageUrl ? { pageUrl: tracking.pageUrl } : {}),
    },
    createdAt: nowTs,
    updatedAt: nowTs,
  };
}
