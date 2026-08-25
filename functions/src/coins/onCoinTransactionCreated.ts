/**
 * onCoinTransactionCreated.ts — Trigger que sincroniza o ledger de moedas
 *
 * Trigger: onCreate /tenants/{tenantId}/coin_ledger/{txId}
 *
 * Ações:
 *  1. Recalcula o coinBalance do usuário (ou aplica incremento atômico)
 *  2. Atualiza `users/{uid}.coinBalance`
 *  3. Atualiza RTDB `/tenants/{tid}/leaderboard/{uid}.coinBalance`
 *     para refresh imediato no leaderboard e TV Display
 *
 * Idempotência: usa FieldValue.increment para operações atômicas.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const onCoinTransactionCreated = onDocumentCreated(
  { document: "tenants/{tenantId}/coin_ledger/{txId}", region: "southamerica-east1" },
  async (event) => {
    const txData = event.data?.data();
    if (!txData) return;

    const { tenantId } = event.params;
    const { userId, amount } = txData as { userId: string; amount: number };
    const productId = txData.productId || "wizmart";

    if (!userId || typeof amount !== "number") {
      console.log("[onCoinTransactionCreated] userId ou amount inválido.");
      return;
    }

    const db   = admin.firestore();
    const rtdb = admin.database();

    console.log(`[onCoinTransactionCreated] userId=${userId}, amount=${amount > 0 ? "+" : ""}${amount}`);

    try {
      // 1. Atualiza coinBalance via increment atômico (evita race conditions)
      const userRef = db.doc(`tenants/${tenantId}/users/${userId}`);
      await userRef.update({
        coinBalance: FieldValue.increment(amount),
        updatedAt:   FieldValue.serverTimestamp(),
      });

      // 2. Lê o novo saldo para sincronizar no RTDB
      const userSnap = await userRef.get();
      const newBalance: number = userSnap.data()?.coinBalance ?? 0;

      // 3. Atualiza o RTDB leaderboard com o novo saldo de moedas
      const userData = userSnap.data();
      await rtdb.ref(`tenants/${tenantId}/leaderboard/${userId}`).update({
        coinBalance: newBalance,
        name:        userData?.name     || "Usuário",
        initials:    userData?.initials || "U",
        color:       userData?.color    || "#6B7280",
        productIds:  userData?.productIds || ["wizmart"],
      });
      await rtdb.ref(`tenants/${tenantId}/leaderboard_by_product/${productId}/${userId}`).update({
        coinBalance: newBalance,
        name:        userData?.name     || "Usuário",
        initials:    userData?.initials || "U",
        color:       userData?.color    || "#6B7280",
        productIds:  userData?.productIds || ["wizmart"],
      });

      console.log(
        `[onCoinTransactionCreated] ${userId}: coinBalance atualizado para ${newBalance}`,
      );
    } catch (err) {
      console.error("[onCoinTransactionCreated] Erro:", err);
    }
  }
);
