/**
 * calendarOAuthCallback.ts — HTTP endpoint para receber o código OAuth2
 *
 * GET /calendarOAuthCallback?code={code}&state={userId:tenantId}
 *
 * Fluxo:
 *  1. Extrai userId e tenantId do `state`
 *  2. Troca o `code` por tokens (access + refresh)
 *  3. Salva os tokens criptografados no Firestore
 *  4. Redireciona para Settings > Integrações com status de sucesso
 */

import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { exchangeCodeForTokens } from "./calendarService";

const CRM_BASE_URL = process.env.CRM_BASE_URL || "https://crm-codifyx.web.app";

export const calendarOAuthCallback = onRequest(
  {
    region: "southamerica-east1",
    secrets: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"],
  },
  async (req, res) => {
  const code  = req.query.code  as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  // Usuário negou o acesso
  if (error === "access_denied") {
    console.log("[calendarOAuthCallback] Usuário negou o acesso ao Google Calendar.");
    res.redirect(`${CRM_BASE_URL}/settings?calendar=denied`);
    return;
  }

  if (!code || !state) {
    res.status(400).json({ error: "code e state são obrigatórios." });
    return;
  }

  // state = "userId:tenantId"
  const [userId, tenantId] = state.split(":");
  if (!userId || !tenantId) {
    res.status(400).json({ error: "State inválido." });
    return;
  }

  const db = admin.firestore();

  try {
    const calendarEmail = await exchangeCodeForTokens(db, tenantId, userId, code);
    console.log(`[calendarOAuthCallback] Conectado com sucesso: ${calendarEmail}`);
    res.redirect(`${CRM_BASE_URL}/settings?calendar=connected&email=${encodeURIComponent(calendarEmail)}`);
  } catch (err: any) {
    console.error("[calendarOAuthCallback] Erro ao trocar tokens:", err.message);
    res.redirect(`${CRM_BASE_URL}/settings?calendar=error`);
  }
  }
);
