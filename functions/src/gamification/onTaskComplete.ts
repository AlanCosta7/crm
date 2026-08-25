import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { ServerValue } from "firebase-admin/database";

/**
 * Cloud Function que ouve a conclusão de tarefas no Firestore (+15, +20 ou +30 pts)
 * e atualiza pontuações, registra atividades no feed e atualiza o RTDB Leaderboard.
 */
export const onTaskComplete = onDocumentUpdated(
  { document: "tenants/{tenantId}/deals/{dealId}", region: "southamerica-east1" },
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) return;

    const { tenantId, dealId } = event.params;
    const beforeTasks = beforeData.tasks || {};
    const afterTasks = afterData.tasks || {};

    const ownerId = afterData.owner;
    if (!ownerId) return;
    const productId = afterData.productId || "wizmart";

    // Valores de pontos configurados (Fase 1 / 4)
    const pointsMap: Record<string, number> = {
      e: 15, // Email
      w: 20, // WhatsApp
      m: 30, // Reunião (Meeting)
    };

    const taskLabels: Record<string, string> = {
      e: "Enviar email",
      w: "Mensagem WhatsApp",
      m: "Agendar reunião",
    };

    const db = admin.firestore();
    const rtdb = admin.database();

    // Compara as tarefas e identifica qual foi concluída (passou de false para true)
    for (const key of ['e', 'w', 'm']) {
      if (!beforeTasks[key] && afterTasks[key]) {
        const pts = pointsMap[key];
        const label = taskLabels[key];

        console.log(`[onTaskComplete] Usuário ${ownerId} concluiu a tarefa '${key}' (+${pts} pts) no negócio ${dealId}`);

        const userRef = db.doc(`tenants/${tenantId}/users/${ownerId}`);
        const gamifRef = db.doc(`tenants/${tenantId}/gamification/${ownerId}`);
        
        let newPoints = 0;
        let streakCount = 1;

        // Atualização via transação atômica do Firestore
        try {
          await db.runTransaction(async (transaction) => {
            const userSnap = await transaction.get(userRef);
            if (userSnap.exists) {
              const userData = userSnap.data() || {};
              const currentPoints = userData.points || 0;
              newPoints = currentPoints + pts;
              streakCount = userData.streak || 1;

              transaction.update(userRef, {
                points: newPoints,
                updatedAt: FieldValue.serverTimestamp(),
              });

              // Incrementa contadores na coleção de estatísticas de gamificação
              transaction.set(gamifRef, {
                points: newPoints,
                lastActivity: FieldValue.serverTimestamp(),
                [`taskCounts.${key}`]: FieldValue.increment(1),
              }, { merge: true });
            }
          });
        } catch (err) {
          console.error(`[onTaskComplete] Falha ao processar transação de pontos para o usuário ${ownerId}:`, err);
          continue;
        }

        // Registrar no feed global de atividades da filial
        try {
          const activityRef = db.collection(`tenants/${tenantId}/activity`);
          await activityRef.add({
            type: key === 'e' ? 'email' : key === 'w' ? 'whatsapp' : 'meeting',
            productId,
            userId: ownerId,
            text: `concluiu a tarefa "${label}" no negócio "${afterData.name}"`,
            dealId: dealId,
            createdAt: FieldValue.serverTimestamp(),
          });
        } catch (err) {
          console.error("[onTaskComplete] Falha ao registrar atividade no feed:", err);
        }

        // Sincronizar em tempo real (<100ms) no Firebase Realtime Database
        try {
          const lbUserRef = rtdb.ref(`tenants/${tenantId}/leaderboard/${ownerId}`);
          const productLbUserRef = rtdb.ref(`tenants/${tenantId}/leaderboard_by_product/${productId}/${ownerId}`);
          const userSnap = await userRef.get();
          
          if (userSnap.exists) {
            const userData = userSnap.data() || {};
            
            // Incrementa o respectivo contador no RTDB
            const increments: Record<string, any> = {
              pts: newPoints,
              streak: streakCount,
              name: userData.name || "Vendedor",
              initials: userData.initials || "V",
              color: userData.color || "#6B7280",
              productIds: userData.productIds || ["wizmart"],
            };

            if (key === 'e') increments['emails'] = ServerValue.increment(1);
            if (key === 'w') increments['whats'] = ServerValue.increment(1);
            if (key === 'm') increments['meetings'] = ServerValue.increment(1);

            await lbUserRef.update(increments);
            await productLbUserRef.update(increments);
            console.log(`[onTaskComplete] Leaderboard RTDB atualizado com sucesso para o usuário ${ownerId}`);
          }
        } catch (err) {
          console.error("[onTaskComplete] Erro ao sincronizar pontuação no RTDB Leaderboard:", err);
        }
      }
    }
  }
);
