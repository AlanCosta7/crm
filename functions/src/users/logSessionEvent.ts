/**
 * logSessionEvent.ts — Callable: registra login/logout na auditoria de sessão
 *
 * Fase 6.1 do PLANO_DESENHO_CRM.md (slide 12): "Gerenciador de Login e Logoff
 * do CRM". Chamado pelo client em dois pontos:
 *  - `LoginPage.tsx`, logo após `signInWithEmailAndPassword` ter sucesso
 *    (login manual ou quick-login) — não em `onAuthStateChanged`, que também
 *    dispara ao RESTAURAR uma sessão existente (reload da página), o que
 *    inflaria o log com "logins" que não aconteceram de verdade.
 *  - `Sidebar.tsx`, no botão "Sair", ANTES de `auth.signOut()`.
 *
 * O IP só pode ser capturado aqui: o navegador não sabe o próprio IP público.
 * Por isso a auditoria de sessão não pode ser um `addDoc` direto do client —
 * precisa passar por uma function que enxerga o request cru.
 *
 * `event: 'login'` também atualiza `users/{uid}.last`/`lastLoginAt` — a coluna
 * "Último Acesso" da tabela de usuários passa a vir daqui, não mais do texto
 * estático "Nunca acessou" gravado no convite.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { clientIpFromHeaders, summarizeUserAgent } from "./sessionUtils";

const REGION = "southamerica-east1";
const VALID_EVENTS = ["login", "logout"] as const;

export const logSessionEvent = onCall({ region: REGION }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const claims = request.auth?.token as { tenantId?: string; role?: string; name?: string };
  const tenantId = claims.tenantId;
  if (!tenantId) throw new HttpsError("failed-precondition", "Chamador sem tenantId no token.");

  const { event } = (request.data || {}) as { event?: string };
  if (!VALID_EVENTS.includes(event as (typeof VALID_EVENTS)[number])) {
    throw new HttpsError("invalid-argument", `event precisa ser 'login' ou 'logout' (recebido: ${event}).`);
  }

  const db = admin.firestore();
  const userSnap = await db.doc(`tenants/${tenantId}/users/${callerUid}`).get();
  const userData = userSnap.data();
  const userName = userData?.name || claims.name || "Usuário";

  const headers = (request.rawRequest?.headers || {}) as Record<string, unknown>;
  const ip = clientIpFromHeaders(headers, request.rawRequest?.ip);
  const userAgentHeader = headers["user-agent"];
  const userAgent = summarizeUserAgent(typeof userAgentHeader === "string" ? userAgentHeader : undefined);

  const now = FieldValue.serverTimestamp();
  await db.collection(`tenants/${tenantId}/user_sessions`).add({
    uid: callerUid,
    userName,
    userRole: claims.role || userData?.role || "viewer",
    event,
    at: now,
    ip,
    userAgent,
  });

  if (event === "login") {
    // best-effort: a auditoria já foi gravada acima mesmo se isto falhar
    try {
      await db.doc(`tenants/${tenantId}/users/${callerUid}`).update({
        lastLoginAt: now,
        last: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });
    } catch (err) {
      console.warn(`[logSessionEvent] Não foi possível atualizar 'last' de ${callerUid}:`, err);
    }
  }

  return { ok: true };
});
