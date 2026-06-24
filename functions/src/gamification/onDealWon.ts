import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Cloud Function que reage a alteração de negócios e identifica quando foi GANHO.
 * Estágios de ganho: 'inaugurado' (WizMart) e 'instalacao_realizada' (Smart Café).
 * Concede +100 pts de bônus comercial, registra atividade de vitória e atualiza KPIs no RTDB.
 */
const WON_STAGES = ['inaugurado', 'instalacao_realizada'];

export const onDealWon = onDocumentUpdated(
  "tenants/{tenantId}/deals/{dealId}",
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) return;

    const { tenantId, dealId } = event.params;

    if (!WON_STAGES.includes(beforeData.stage) && WON_STAGES.includes(afterData.stage)) {
      const ownerId = afterData.owner;
      if (!ownerId) return;
      const productId = afterData.productId || "wizmart";

      console.log(`[onDealWon] Negócio ${dealId} foi GANHO! Concedendo +100 pts para o owner ${ownerId}`);

      const db = admin.firestore();
      const rtdb = admin.database();

      const userRef = db.doc(`tenants/${tenantId}/users/${ownerId}`);
      const gamifRef = db.doc(`tenants/${tenantId}/gamification/${ownerId}`);
      
      let newPoints = 0;
      let streakCount = 1;

      // 1. Transação para conceder +100 pts de bônus no Firestore
      try {
        await db.runTransaction(async (transaction) => {
          const userSnap = await transaction.get(userRef);
          if (userSnap.exists) {
            const userData = userSnap.data() || {};
            const currentPoints = userData.points || 0;
            newPoints = currentPoints + 100;
            streakCount = userData.streak || 1;

            transaction.update(userRef, {
              points: newPoints,
              updatedAt: FieldValue.serverTimestamp(),
            });

            transaction.set(gamifRef, {
              points: newPoints,
              lastActivity: FieldValue.serverTimestamp(),
            }, { merge: true });
          }
        });
      } catch (err) {
        console.error(`[onDealWon] Falha na transação de pontos para o usuário ${ownerId}:`, err);
        return;
      }

      // 2. Registrar vitória no feed global de atividades da filial
      try {
        const activityRef = db.collection(`tenants/${tenantId}/activity`);
        await activityRef.add({
          type: "win",
          productId,
          userId: ownerId,
          text: `ganhou o negócio "${afterData.name}"`,
          val: `R$ ${afterData.value.toLocaleString("pt-BR")}`,
          dealId: dealId,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.error("[onDealWon] Erro ao registrar feed de atividade:", err);
      }

      // 3. Sincronizar dados do Leaderboard no RTDB
      try {
        const lbUserRef = rtdb.ref(`tenants/${tenantId}/leaderboard/${ownerId}`);
        const productLbUserRef = rtdb.ref(`tenants/${tenantId}/leaderboard_by_product/${productId}/${ownerId}`);
        const updates = {
          pts: newPoints,
          streak: streakCount,
        };
        await lbUserRef.update(updates);
        await productLbUserRef.update(updates);
      } catch (err) {
        console.error("[onDealWon] Falha ao atualizar Leaderboard do RTDB:", err);
      }

      // 4. Incrementar KPIs de faturamento e negócios do mês no RTDB (live_kpis)
      try {
        const liveKpisRef = rtdb.ref(`tenants/${tenantId}/live_kpis`);
        const productLiveKpisRef = rtdb.ref(`tenants/${tenantId}/live_kpis_by_product/${productId}`);
        const kpiUpdates = {
          monthRevenue: admin.database.ServerValue.increment(afterData.value),
          todayRevenue: admin.database.ServerValue.increment(afterData.value),
          todayDeals: admin.database.ServerValue.increment(1),
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        };
        await liveKpisRef.update(kpiUpdates);
        await productLiveKpisRef.update(kpiUpdates);
        console.log(`[onDealWon] live_kpis atualizados no RTDB para o tenant ${tenantId}`);
      } catch (err) {
        console.error("[onDealWon] Erro ao atualizar live_kpis no RTDB:", err);
      }
    }
  }
);
