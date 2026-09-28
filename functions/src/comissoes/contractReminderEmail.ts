/**
 * contractReminderEmail.ts — lembrete diário do dia 09 para o financeiro
 *
 * Fase 5.4 do PLANO_DESENHO_CRM.md (slide 11): "Por exemplo, contrato
 * anexado, todo dia 09 um alerta é disparado para a caixa de e-mail do
 * financeiro entrar no CRM e validar ou não."
 *
 * Encaixe deliberado com `commissionEvaluationQueue` (dia 10, 9h BRT): o
 * alerta do dia 09 é literalmente a véspera da fila de avaliação de comissão.
 * Comodato pago tarde é comissão atrasada no ciclo seguinte.
 *
 * Não calcula nada — só avisa. A definição de "pendente" é a MESMA de
 * `contractStatus.ts` (cópia idêntica em `src/features/deals/contractStatus.ts`,
 * usada pela fila `/financeiro/contratos`): comodato, com contrato anexado,
 * sem `contractPaidAt`. Se as duas definições divergissem, o e-mail avisaria
 * de algo que a tela não mostra, ou o contrário.
 *
 * Sem pendências, ou sem ninguém com o papel `financeiro` ativo no tenant,
 * não envia nada — silêncio é a resposta certa quando não há o que fazer.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { isPendingValidation } from "./contractStatus";
import { sendContractReminderEmail, type ContractReminderItem } from "../users/mailer";
import { listActiveTenantIds } from "../shared/tenants";

const REGION = "southamerica-east1";
const SMTP_SECRETS = ["SMTP_EMAIL", "SMTP_PASSWORD"];
const APP_URL = "https://wizmart-crm.web.app";

interface DealDoc {
  id: string;
  company?: string;
  name?: string;
  mainProduct?: string;
  contract?: { url?: string } | null;
  contractPaidAt?: unknown;
}

interface UserDoc {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  isActive?: boolean;
}

// Exportadas para o teste de emulador (`scripts/test-emulator/test-contract-reminder-emulator.mjs`)
// verificar a busca de verdade contra o Firestore, sem precisar de SMTP.
export async function pendenciasDoTenant(db: admin.firestore.Firestore, tenantId: string): Promise<ContractReminderItem[]> {
  const snap = await db
    .collection(`tenants/${tenantId}/deals`)
    .where("mainProduct", "==", "smartcafe_comodato")
    .get();

  const deals: DealDoc[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return deals
    .filter(isPendingValidation)
    .map(d => ({
      dealId: d.id,
      company: d.company || "Empresa sem nome",
      dealName: d.name || "Negócio",
      contractUrl: d.contract!.url!,
    }));
}

export async function financeirosAtivos(db: admin.firestore.Firestore, tenantId: string): Promise<UserDoc[]> {
  const snap = await db
    .collection(`tenants/${tenantId}/users`)
    .where("role", "==", "financeiro")
    .get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as UserDoc)
    .filter(u => u.isActive !== false && !!u.email);
}

async function processarTenant(db: admin.firestore.Firestore, tenantId: string): Promise<void> {
  const pendencias = await pendenciasDoTenant(db, tenantId);
  if (pendencias.length === 0) {
    console.log(`[contractReminderEmail] ${tenantId}: nenhuma pendência — nada a enviar.`);
    return;
  }

  const financeiros = await financeirosAtivos(db, tenantId);
  if (financeiros.length === 0) {
    console.warn(
      `[contractReminderEmail] ${tenantId}: ${pendencias.length} contrato(s) pendente(s), ` +
      "mas nenhum usuário ativo com o papel 'financeiro' — ninguém para avisar.",
    );
    return;
  }

  for (const fin of financeiros) {
    try {
      const messageId = await sendContractReminderEmail({
        to: fin.email!,
        name: fin.name || "Financeiro",
        items: pendencias,
        appUrl: APP_URL,
      });
      console.log(`[contractReminderEmail] ${tenantId}: enviado para ${fin.email} (${messageId}), ${pendencias.length} pendência(s).`);
    } catch (err) {
      // Um financeiro com e-mail inválido não pode impedir o aviso aos demais.
      console.error(`[contractReminderEmail] ${tenantId}: falha ao enviar para ${fin.email}:`, err);
    }
  }
}

export const contractReminderEmail = onSchedule(
  {
    schedule: "0 9 9 * *", // dia 09, 9h BRT — véspera da avaliação de comissão do dia 10
    timeZone: "America/Sao_Paulo",
    retryCount: 3,
    timeoutSeconds: 300,
    region: REGION,
    secrets: SMTP_SECRETS,
  },
  async () => {
    const db = admin.firestore();
    // Ver functions/src/shared/tenants.ts — não existe documento em
    // tenants/{tenantId}, só subcoleções.
    const tenantIds = await listActiveTenantIds(db);
    for (const tenantId of tenantIds) {
      try {
        await processarTenant(db, tenantId);
      } catch (err) {
        console.error(`[contractReminderEmail] Falha no tenant ${tenantId}:`, err);
      }
    }
  },
);
