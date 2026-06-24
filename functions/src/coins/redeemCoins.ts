/**
 * redeemCoins.ts — Callable para resgate de prêmios da Loja
 *
 * redeemCoins({ prizeId, tenantId, deliveryInfo }):
 *  1. Valida que o prêmio existe e está ativo
 *  2. Verifica saldo suficiente do usuário
 *  3. Verifica estoque disponível
 *  4. Em transação:
 *     a. Cria CoinRedemption (status: 'requested')
 *     b. Cria CoinTransaction negativa no coin_ledger
 *     c. Decrementa estoque do prêmio (se não for ilimitado)
 *  5. onCoinTransactionCreated cuida de atualizar coinBalance do usuário
 *
 * Regra do ciclo (REQUISITOS-V2.md §8):
 *  Moedas não expiram — o cycle da redemption é o ciclo atual,
 *  mas o saldo inclui moedas de ciclos anteriores.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

function getCurrentCycle(): string {
  const d = new Date();
  const quarter = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${quarter}-${d.getFullYear()}`;
}

export const redeemCoins = onCall(async (request) => {
  const { prizeId, tenantId, deliveryInfo } = request.data as {
    prizeId:      string;
    tenantId:     string;
    deliveryInfo?: string;
  };
  const uid = request.auth?.uid;

  if (!uid)      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  if (!prizeId)  throw new HttpsError("invalid-argument", "prizeId é obrigatório.");
  if (!tenantId) throw new HttpsError("invalid-argument", "tenantId é obrigatório.");

  const db = admin.firestore();

  // 1. Busca o prêmio
  const prizeSnap = await db.doc(`tenants/${tenantId}/prizes/${prizeId}`).get();
  if (!prizeSnap.exists) {
    throw new HttpsError("not-found", `Prêmio ${prizeId} não encontrado.`);
  }
  const prize = prizeSnap.data()!;
  const productId = prize.productId === "all" ? (userSnapProductFallback(request.auth?.token.productIds) || "wizmart") : (prize.productId || "wizmart");

  if (!prize.isActive) {
    throw new HttpsError("failed-precondition", "Prêmio não está disponível.");
  }

  // Verifica data de disponibilidade
  if (prize.availableTo) {
    const availableTo: Date = prize.availableTo.toDate
      ? prize.availableTo.toDate()
      : new Date(prize.availableTo);
    if (new Date() > availableTo) {
      throw new HttpsError("failed-precondition", "Prêmio fora do período de disponibilidade.");
    }
  }

  // 2. Busca saldo atual do usuário
  const userSnap = await db.doc(`tenants/${tenantId}/users/${uid}`).get();
  if (!userSnap.exists) {
    throw new HttpsError("not-found", `Usuário ${uid} não encontrado.`);
  }
  const user = userSnap.data()!;
  const coinBalance: number = user.coinBalance ?? 0;
  const coinCost:    number = prize.coinCost;

  if (coinBalance < coinCost) {
    throw new HttpsError(
      "failed-precondition",
      `Saldo insuficiente. Você tem ${coinBalance} moeda(s) e precisa de ${coinCost}.`,
    );
  }

  // 3. Verifica estoque
  const stock: number = prize.stock;
  if (stock === 0) {
    throw new HttpsError("failed-precondition", "Prêmio esgotado.");
  }

  // 4. Transação atômica
  const cycle = getCurrentCycle();
  const batch = db.batch();

  // Cria CoinRedemption
  const redemptionRef = db.collection(`tenants/${tenantId}/coin_redemptions`).doc();
  batch.set(redemptionRef, {
    userId:       uid,
    productId,
    userName:     user.name || "Usuário",
    prizeId,
    prizeName:    prize.name,
    coinAmount:   coinCost,
    cycle,
    deliveryInfo: deliveryInfo?.trim() || null,
    status:       "requested",
    adminNotes:   null,
    createdAt:    FieldValue.serverTimestamp(),
    updatedAt:    FieldValue.serverTimestamp(),
  });

  // Cria CoinTransaction negativa no ledger
  const txRef = db.collection(`tenants/${tenantId}/coin_ledger`).doc();
  batch.set(txRef, {
    userId:        uid,
    productId,
    amount:        -coinCost,
    type:          "redemption",
    prizeId,
    redemptionId:  redemptionRef.id,
    note:          `Resgate: ${prize.name}`,
    cycle,
    createdAt:     FieldValue.serverTimestamp(),
    createdBy:     uid,
  });

  // Decrementa estoque (apenas se não for ilimitado)
  if (stock > 0) {
    batch.update(prizeSnap.ref, {
      stock: FieldValue.increment(-1),
    });
  }

  await batch.commit();

  console.log(
    `[redeemCoins] Usuário ${uid} resgatou "${prize.name}" (${coinCost} moedas). Redemption: ${redemptionRef.id}`,
  );

  return {
    success:      true,
    redemptionId: redemptionRef.id,
    prizeName:    prize.name,
    coinCost,
    remainingBalance: coinBalance - coinCost,
  };
});

function userSnapProductFallback(productIds: unknown): string | null {
  return Array.isArray(productIds) && typeof productIds[0] === "string" ? productIds[0] : null;
}
