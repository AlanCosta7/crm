/**
 * endImpersonation.ts — Callable: encerra uma sessão de "Visualizar como",
 * apagando o marcador em `active_impersonations/{targetUid}`.
 *
 * Não precisa da claim de master do chamador para funcionar — o próprio
 * usuário impersonado pode encerrar a própria sessão de teste (é o caminho
 * usado quando a aba original do Master fechou e o `returnToken` guardado no
 * client se perdeu; nesse caso o client desloga e manda a pessoa logar de
 * novo como Master, mas antes limpa o doc para o banner não ficar preso na
 * conta do usuário real).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertCanEndImpersonation } from "./impersonationRules";

const REGION = "southamerica-east1";

export const endImpersonation = onCall({ region: REGION }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const claims = request.auth?.token as { tenantId?: string; role?: string };
  const tenantId = claims.tenantId;
  if (!tenantId) throw new HttpsError("failed-precondition", "Chamador sem tenantId no token.");

  const { targetUid } = (request.data || {}) as { targetUid?: string };
  if (!targetUid?.trim()) throw new HttpsError("invalid-argument", "targetUid é obrigatório.");

  const veredito = assertCanEndImpersonation(callerUid, claims.role, targetUid);
  if (!veredito.ok) {
    throw new HttpsError("permission-denied", veredito.message);
  }

  await admin.firestore().doc(`tenants/${tenantId}/active_impersonations/${targetUid}`).delete();

  console.log(`[endImpersonation] ${callerUid} encerrou a visualização de ${targetUid}`);
  return { ok: true };
});
