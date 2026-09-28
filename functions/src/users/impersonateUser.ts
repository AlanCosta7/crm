/**
 * impersonateUser.ts — Callable: Admin Master assume a sessão de outro
 * usuário do tenant para testar o sistema com as permissões reais daquele
 * perfil, sem precisar da senha dele.
 *
 * Por que não é só uma troca de estado no client: as Security Rules do
 * Firestore/Storage e os guards de rota leem `role`/`tenantId`/`productIds`
 * do JWT do Firebase Auth (`request.auth.token.*`) — não de nada que o app
 * guarda em memória. Um "perfil de mentira" no front mudaria o que os botões
 * mostram, mas toda leitura/escrita continuaria rodando com os privilégios
 * reais do Master, o que é exatamente o oposto do que "testar o perfil real"
 * precisa provar. Por isso a troca é uma troca de sessão de verdade: assina
 * um custom token para o uid alvo, e o client faz `signInWithCustomToken`.
 *
 * "Quem está impersonando quem" NÃO viaja como claim extra no custom token:
 * claims passadas ao segundo argumento de `createCustomToken` só aparecem no
 * ID token daquele exchange específico — o primeiro refresh (e o app força um
 * logo no primeiro `onAuthStateChanged`, ver useAuth.ts) já as descarta. A
 * fonte de verdade é um doc em `tenants/{tid}/active_impersonations/{targetUid}`,
 * que sobrevive a qualquer refresh de token.
 *
 * impersonateUser({ targetUid }):
 *  1. Confirma que o chamador é master (via custom claim do PRÓPRIO token —
 *     nunca confia em nada que o client mande sobre si mesmo)
 *  2. Confirma que o alvo existe, está ativo e é do mesmo tenant
 *  3. Emite um custom token do ALVO e um custom token de VOLTA para o próprio
 *     master — pedido agora, porque depois de trocar de sessão o chamador não
 *     terá mais claim de master para pedir esse token de novo
 *  4. Grava `active_impersonations/{targetUid}` (fonte de verdade da UI) e um
 *     registro em `impersonation_log` (auditoria, histórico permanente)
 *
 * Retorna { impersonationToken, returnToken, target }.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { assertCanImpersonate } from "./impersonationRules";

const REGION = "southamerica-east1";

export const impersonateUser = onCall({ region: REGION }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const claims = request.auth?.token as { tenantId?: string; role?: string; name?: string };
  const { targetUid } = (request.data || {}) as { targetUid?: string };

  if (!targetUid?.trim()) throw new HttpsError("invalid-argument", "targetUid é obrigatório.");

  const db = admin.firestore();
  const tenantId = claims.tenantId;
  if (!tenantId) throw new HttpsError("failed-precondition", "Chamador sem tenantId no token.");

  const targetSnap = await db.doc(`tenants/${tenantId}/users/${targetUid}`).get();
  const targetData = targetSnap.data();

  const veredito = assertCanImpersonate(
    { uid: callerUid, role: claims.role, tenantId },
    targetSnap.exists
      ? { id: targetUid, tenantId, role: targetData?.role, isActive: targetData?.isActive }
      : null
  );

  if (!veredito.ok) {
    const httpsCode = veredito.code === "not-master" ? "permission-denied" : "failed-precondition";
    throw new HttpsError(httpsCode, veredito.message);
  }

  const auth = admin.auth();
  const actorName = claims.name || "Admin Master";

  const [impersonationToken, returnToken] = await Promise.all([
    auth.createCustomToken(targetUid),
    // Token de retorno para o PRÓPRIO chamador — pedido agora, enquanto ele
    // ainda tem claim de master, porque depois de trocar de sessão ele não
    // teria mais autorização para chamar esta function de novo.
    auth.createCustomToken(callerUid),
  ]);

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  batch.set(db.doc(`tenants/${tenantId}/active_impersonations/${targetUid}`), {
    actorUid: callerUid,
    actorName,
    targetName: targetData?.name ?? targetUid,
    targetRole: targetData?.role ?? "",
    startedAt: now,
  });

  batch.set(db.collection(`tenants/${tenantId}/impersonation_log`).doc(), {
    actorUid: callerUid,
    actorName,
    targetUid,
    targetName: targetData?.name ?? targetUid,
    targetRole: targetData?.role ?? "desconhecido",
    startedAt: now,
  });

  await batch.commit();

  console.log(`[impersonateUser] ${callerUid} → ${targetUid} (${targetData?.role})`);

  return {
    impersonationToken,
    returnToken,
    target: { uid: targetUid, name: targetData?.name ?? targetUid, role: targetData?.role ?? "" },
  };
});
