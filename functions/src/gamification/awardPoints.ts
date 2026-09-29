/**
 * awardPoints.ts — concede pontos do Ranking Geral de Pontos a um usuário
 * (PLANO_DESENHO_CRM_2.md — pontuação configurável).
 *
 * Usado hoje só por `onDealStageChanged.ts` (pointsOnEnter por etapa, irmão
 * de coinsOnEnter). `onTaskComplete.ts` e `onDealWon.ts` já tinham sua própria
 * transação antes desta mudança e não foram tocados, pra não arriscar
 * regressão num caminho já testado — só a leitura do VALOR do ponto mudou
 * (via `effectiveActionPoints`), não o mecanismo de gravação.
 */
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function awardPoints(
  db: admin.firestore.Firestore,
  rtdb: admin.database.Database,
  tenantId: string,
  userId: string,
  pts: number,
): Promise<void> {
  if (pts <= 0) return;

  const userRef = db.doc(`tenants/${tenantId}/users/${userId}`);
  const gamifRef = db.doc(`tenants/${tenantId}/gamification/${userId}`);
  let newPoints = 0;

  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) return;
    const userData = userSnap.data() || {};
    newPoints = (userData.points || 0) + pts;

    transaction.update(userRef, { points: newPoints, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(gamifRef, { points: newPoints, lastActivity: FieldValue.serverTimestamp() }, { merge: true });
  });

  if (newPoints === 0) return; // usuário não existia — nada pra sincronizar no RTDB

  const userSnap = await userRef.get();
  const userData = userSnap.data() || {};
  const productId = userData.productIds?.[0] || "wizmart";
  const increments = {
    pts: newPoints,
    streak: userData.streak || 1,
    name: userData.name || "Vendedor",
    initials: userData.initials || "V",
    color: userData.color || "#6B7280",
    productIds: userData.productIds || ["wizmart"],
  };
  await rtdb.ref(`tenants/${tenantId}/leaderboard/${userId}`).update(increments);
  await rtdb.ref(`tenants/${tenantId}/leaderboard_by_product/${productId}/${userId}`).update(increments);
}
