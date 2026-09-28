/**
 * endUserSession.ts — Callable: força o encerramento da sessão de um usuário
 *
 * Fase 6.1 do PLANO_DESENHO_CRM.md (slide 12). Diferente do bloqueio de acesso
 * (Fase 0, `isActive: false`, permanente e só master): isto é um "derruba
 * agora", sem desativar a conta — o usuário pode logar de novo no instante
 * seguinte. Caso de uso do próprio cliente: notebook esquecido logado na loja,
 * sem precisar bloquear o vendedor pra isso.
 *
 * Reaproveita o MESMO mecanismo da Fase 0 (`revokeRefreshTokens`) — a
 * diferença toda está em NÃO tocar `isActive`/claims, só a sessão corrente.
 *
 * `revokeRefreshTokens` sozinho NÃO derruba uma sessão já aberta: ele só
 * invalida a troca de refresh token por um novo ID token, e o ID token que o
 * navegador já tem em cache continua válido (até ~1h) sem precisar de
 * refresh nenhum. Por isso também gravamos `forceLogoutAt` no documento do
 * usuário-alvo — `useAuth.ts` já assina esse documento ao vivo (para toasts
 * de moeda/ponto) e usa esse campo para forçar `signOut()` no navegador do
 * alvo assim que o Firestore empurra a atualização, sem esperar reload nem a
 * expiração do token.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { assertCanEndSession } from "./sessionRules";

const REGION = "southamerica-east1";

export const endUserSession = onCall({ region: REGION }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const claims = request.auth?.token as { tenantId?: string; role?: string };
  const tenantId = claims.tenantId;
  if (!tenantId) throw new HttpsError("failed-precondition", "Chamador sem tenantId no token.");

  const { targetUid } = (request.data || {}) as { targetUid?: string };
  if (!targetUid?.trim()) throw new HttpsError("invalid-argument", "targetUid é obrigatório.");

  const db = admin.firestore();
  const targetSnap = await db.doc(`tenants/${tenantId}/users/${targetUid}`).get();
  const targetData = targetSnap.data();

  const veredito = assertCanEndSession(
    { uid: callerUid, role: claims.role, tenantId },
    targetSnap.exists ? { id: targetUid, tenantId } : null,
  );
  if (!veredito.ok) {
    throw new HttpsError("permission-denied", veredito.message);
  }

  await admin.auth().revokeRefreshTokens(targetUid);
  await db.doc(`tenants/${tenantId}/users/${targetUid}`).update({
    forceLogoutAt: FieldValue.serverTimestamp(),
  });

  const callerSnap = await db.doc(`tenants/${tenantId}/users/${callerUid}`).get();
  await db.collection(`tenants/${tenantId}/user_sessions`).add({
    uid: targetUid,
    userName: targetData?.name || "Usuário",
    userRole: targetData?.role || "viewer",
    event: "revoked",
    at: FieldValue.serverTimestamp(),
    endedBy: callerUid,
    endedByName: callerSnap.data()?.name || "Admin",
  });

  console.log(`[endUserSession] ${callerUid} encerrou a sessão de ${targetUid} (${tenantId}).`);
  return { ok: true };
});
