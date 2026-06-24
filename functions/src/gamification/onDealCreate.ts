import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Cloud Function que ouve a criação de negócios no Firestore
 * e inicializa suas tarefas gamificadas, concede pontos e atualiza a empresa associada.
 */
export const onDealCreate = onDocumentCreated(
  "tenants/{tenantId}/deals/{dealId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log("Sem dados associados ao evento.");
      return;
    }
    const dealData = snapshot.data();
    const { tenantId, dealId } = event.params;
    const productId = dealData.productId || "wizmart";
    
    console.log(`[onDealCreate] Novo negócio criado: ${dealId} no tenant ${tenantId}`);

    const db = admin.firestore();

    // 1. Inicializar tarefas gamificadas no negócio se não existirem
    if (!dealData.tasks || typeof dealData.tasks !== "object") {
      await snapshot.ref.update({
        tasks: {
          e: false, // Email
          w: false, // WhatsApp
          m: false, // Meeting (Reunião)
        },
      });
      console.log(`[onDealCreate] Tarefas gamificadas inicializadas com sucesso para o negócio ${dealId}`);
    }

    // 2. Pontuação de criação (+5 pontos para o criador do negócio)
    const ownerId = dealData.owner;
    if (ownerId) {
      const userRef = db.doc(`tenants/${tenantId}/users/${ownerId}`);
      const gamifRef = db.doc(`tenants/${tenantId}/gamification/${ownerId}`);

      try {
        await db.runTransaction(async (transaction) => {
          const userSnap = await transaction.get(userRef);
          if (userSnap.exists) {
            const userData = userSnap.data() || {};
            const currentPoints = userData.points || 0;
            const newPoints = currentPoints + 5;
            
            // Incrementa na coleção de usuários
            transaction.update(userRef, {
              points: newPoints,
              updatedAt: FieldValue.serverTimestamp(),
            });

            // Atualiza/Cria o registro de gamificação
            transaction.set(gamifRef, {
              points: newPoints,
              lastActivity: FieldValue.serverTimestamp(),
            }, { merge: true });

            console.log(`[onDealCreate] +5 pontos concedidos ao usuário ${ownerId} por criar o negócio.`);
          } else {
            console.log(`[onDealCreate] Usuário ${ownerId} não foi encontrado no tenant ${tenantId}`);
          }
        });
      } catch (err) {
        console.error(`[onDealCreate] Erro ao atualizar pontuação do usuário ${ownerId}:`, err);
      }
    }

    // 3. Incrementar totalValue e dealCount na empresa correspondente
    const companyName = dealData.company;
    const dealValue = dealData.value || 0;
    if (companyName) {
      try {
        const companiesRef = db.collection(`tenants/${tenantId}/companies`);
        const companyQuery = await companiesRef.where("name", "==", companyName).limit(1).get();

        if (!companyQuery.empty) {
          const companyDoc = companyQuery.docs[0];
          const companyData = companyDoc.data();
          await companyDoc.ref.update({
            dealCount: (companyData.dealCount || 0) + 1,
            totalValue: (companyData.totalValue || 0) + dealValue,
            productIds: Array.from(new Set([...(companyData.productIds || ["wizmart"]), productId])),
          });
          console.log(`[onDealCreate] Empresa '${companyName}' atualizada com novo negócio.`);
        } else {
          // Cria a empresa se ela não existe no tenant
          await companiesRef.add({
            name: companyName,
            dealCount: 1,
            totalValue: dealValue,
            productIds: [productId],
            segment: "Varejo", // Segmento padrão/estimado
            createdAt: FieldValue.serverTimestamp(),
          });
          console.log(`[onDealCreate] Empresa '${companyName}' criada e associada ao negócio.`);
        }
      } catch (err) {
        console.error(`[onDealCreate] Erro ao sincronizar dados da empresa '${companyName}':`, err);
      }
    }

    // 4. Registrar atividade do tipo nota indicando a criação
    try {
      const activityRef = db.collection(`tenants/${tenantId}/activity`);
      await activityRef.add({
        type: "note",
        productId,
        userId: ownerId || "system",
        text: `Criou o negócio "${dealData.name}" no valor de R$ ${dealValue.toLocaleString("pt-BR")}`,
        dealId: dealId,
        createdAt: FieldValue.serverTimestamp(),
      });
      console.log("[onDealCreate] Atividade de criação registrada com sucesso.");
    } catch (err) {
      console.error("[onDealCreate] Erro ao registrar atividade de criação:", err);
    }
  }
);
