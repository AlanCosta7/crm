/**
 * calendarOAuthStart.ts — HTTP endpoint para iniciar o fluxo OAuth2 do Google Calendar
 *
 * GET /calendarOAuthStart?userId={uid}&tenantId={tid}
 *
 * Fluxo:
 *  1. Valida que o userId existe e pertence a um tenant ativo
 *  2. Gera a URL de autorização do Google OAuth2
 *  3. Redireciona o usuário para o Google consent screen
 *
 * Após autorização, o Google redireciona para /calendarOAuthCallback?code=...&state=...
 */

import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getOAuthAuthUrl } from "./calendarService";

export const calendarOAuthStart = onRequest(
  {
    region: "southamerica-east1",
    secrets: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"],
  },
  async (req, res) => {
    // Aceita userId=uid:tenantId (formato combinado do cliente) ou userId + tenantId separados
    const rawUserId = req.query.userId as string | undefined;
    let userId: string | undefined;
    let tenantId: string | undefined;

    if (rawUserId?.includes(":")) {
      [userId, tenantId] = rawUserId.split(":");
    } else {
      userId   = rawUserId;
      tenantId = req.query.tenantId as string | undefined;
    }

    if (!userId || !tenantId) {
      res.status(400).json({ error: "userId e tenantId são obrigatórios." });
      return;
    }

    const db = admin.firestore();

    const userSnap = await db.doc(`tenants/${tenantId}/users/${userId}`).get();
    if (!userSnap.exists) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    // state = "userId:tenantId" para o callback identificar o usuário
    const state   = `${userId}:${tenantId}`;
    const authUrl = getOAuthAuthUrl(state);

    console.log(`[calendarOAuthStart] Iniciando OAuth para userId=${userId}, tenantId=${tenantId}`);
    res.redirect(authUrl);
  }
);
