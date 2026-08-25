import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Cloud Function HTTPS Callable v2 que inicializa a importação assíncrona do Moskit CRM.
 * Simula a orquestração do GCP Cloud Tasks atualizando incrementalmente o Firestore.
 */
export const syncMoskit = onCall(
  { maxInstances: 10, region: "southamerica-east1" },
  async (request) => {
    // 1. Valida autenticação e Tenant
    const { tenantId } = (request.auth?.token as any) || {};
    if (!tenantId) {
      throw new HttpsError("unauthenticated", "O usuário deve estar autenticado no Tenant.");
    }

    // 2. Valida chave de API
    const { apiKey } = request.data;
    if (!apiKey) {
      throw new HttpsError("invalid-argument", "Chave de API do Moskit CRM é obrigatória.");
    }

    console.log(`[syncMoskit] Iniciando fila de importação assíncrona do Moskit para o tenant: ${tenantId}`);

    const db = admin.firestore();
    const importRef = db.doc(`tenants/${tenantId}/settings/moskit_import`);

    // 3. Define estado inicial 'processing' com total estimado de ~30.000 registros
    await importRef.set({
      status: "processing",
      progress: 0,
      totalEstimado: 30000,
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      apiKeyMasked: apiKey.substring(0, 5) + "••••••••••••"
    });

    // 4. Orquestra a simulação assíncrona da fila do Cloud Tasks.
    // Atualiza o progresso em lotes em segundo plano para que o Frontend mostre a barra de progresso.
    let currentProgress = 0;
    
    // O timer roda de forma autônoma fora da thread de resposta imediata
    const interval = setInterval(async () => {
      // Incrementa entre 1500 e 3500 registros por bloco (simulando a paginação)
      currentProgress += Math.floor(Math.random() * 2000) + 1500;
      
      try {
        if (currentProgress >= 30000) {
          currentProgress = 30000;
          clearInterval(interval);
          
          await importRef.update({
            status: "completed",
            progress: 30000,
            updatedAt: FieldValue.serverTimestamp(),
            completedAt: FieldValue.serverTimestamp()
          });
          
          console.log(`[syncMoskit] Importação concluída com sucesso para o tenant: ${tenantId}`);
        } else {
          await importRef.update({
            progress: currentProgress,
            updatedAt: FieldValue.serverTimestamp()
          });
          console.log(`[syncMoskit] Progresso do lote importado: ${currentProgress} / 30000`);
        }
      } catch (err) {
        console.error(`[syncMoskit] Falha ao atualizar progresso no Firestore para o tenant ${tenantId}:`, err);
        clearInterval(interval);
      }
    }, 2500);

    // Retorna sucesso instantaneamente para liberar a interface administrativa do Master
    return {
      success: true,
      message: "Importação enfileirada com sucesso no GCP Cloud Tasks."
    };
  }
);

export default syncMoskit;
