/**
 * inviteUser.ts — Callable: convida um novo usuário criando o acesso completo
 *
 * inviteUser({ tenantId, name, email, role, productIds, commissionTier? }):
 *  1. Autoriza o chamador (deve ser master ou manager do mesmo tenant)
 *  2. Cria (ou atualiza) a conta no Firebase Authentication com senha temporária
 *  3. Define as custom claims { tenantId, role, productIds }
 *  4. Grava o perfil em tenants/{tenantId}/users/{uid} (doc keyed by uid)
 *  5. Envia e-mail branded com a senha temporária (nodemailer / SMTP)
 *
 * Retorna { uid }.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { randomBytes } from "crypto";
import { sendInviteEmail } from "./mailer";

const REGION = "southamerica-east1";
const SMTP_SECRETS = ["SMTP_EMAIL", "SMTP_PASSWORD"];
const LOGIN_URL = "https://wizmart-crm.web.app";

const COLORS = ["#1A6B1A", "#8DB600", "#7C3AED", "#B45309", "#B91C1C", "#0E7490", "#4B5563"];
const VALID_ROLES = ["master", "manager", "bdr", "sdr", "rep", "design", "viewer"];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.trim().substring(0, 2).toUpperCase();
}

/** Senha temporária amigável, ex.: "Wiz7k2p9m". */
function makeTempPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[bytes[i] % chars.length];
  return `Wiz${s}`;
}

export const inviteUser = onCall({ region: REGION, secrets: SMTP_SECRETS }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const { tenantId, name, email, role, productIds, commissionTier } = (request.data || {}) as {
    tenantId: string;
    name: string;
    email: string;
    role: string;
    productIds: string[];
    commissionTier?: string;
  };

  // Validação
  if (!tenantId) throw new HttpsError("invalid-argument", "tenantId é obrigatório.");
  if (!name?.trim()) throw new HttpsError("invalid-argument", "Nome é obrigatório.");
  if (!email?.trim()) throw new HttpsError("invalid-argument", "E-mail é obrigatório.");
  if (!VALID_ROLES.includes(role)) throw new HttpsError("invalid-argument", `Perfil inválido: ${role}.`);
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new HttpsError("invalid-argument", "Selecione ao menos um produto.");
  }

  // Autorização — chamador deve ser master/manager do mesmo tenant (via custom claims)
  const claims = request.auth?.token as { tenantId?: string; role?: string };
  if (claims.tenantId !== tenantId) {
    throw new HttpsError("permission-denied", "Tenant do chamador não confere.");
  }
  if (claims.role !== "master" && claims.role !== "manager") {
    throw new HttpsError("permission-denied", "Apenas Master ou Gestor podem convidar usuários.");
  }

  const db = admin.firestore();
  const auth = admin.auth();
  const emailLc = email.trim().toLowerCase();
  const displayName = name.trim();
  const tempPassword = makeTempPassword();

  // 1. Cria ou atualiza a conta no Auth
  let userRecord: admin.auth.UserRecord;
  try {
    userRecord = await auth.getUserByEmail(emailLc);
    await auth.updateUser(userRecord.uid, { password: tempPassword, displayName, disabled: false });
  } catch (e: any) {
    if (e.code !== "auth/user-not-found") {
      throw new HttpsError("internal", `Falha ao verificar usuário: ${e.message}`);
    }
    userRecord = await auth.createUser({
      email: emailLc, password: tempPassword, displayName, emailVerified: false, disabled: false,
    });
  }
  const uid = userRecord.uid;

  // 2. Custom claims
  await auth.setCustomUserClaims(uid, { tenantId, role, productIds });

  // 3. Perfil no Firestore (keyed by uid)
  await db.doc(`tenants/${tenantId}/users/${uid}`).set({
    uid,
    name: displayName,
    email: emailLc,
    role,
    productIds,
    commissionTier: role === "sdr" ? (commissionTier || "pleno") : null,
    initials: getInitials(displayName),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    points: 0,
    coinBalance: 0,
    streak: 0,
    level: 1,
    calendarConnected: false,
    isActive: true,
    last: "Nunca acessou",
    invitedBy: callerUid,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // 4. E-mail com a senha temporária
  let emailSent = false;
  try {
    await sendInviteEmail({ to: emailLc, name: displayName, role, tempPassword, loginUrl: LOGIN_URL });
    emailSent = true;
  } catch (e: any) {
    console.error(`[inviteUser] Falha ao enviar e-mail para ${emailLc}:`, e.message);
    // Não falha a operação — o acesso já foi criado; o e-mail pode ser reenviado.
  }

  console.log(`[inviteUser] Convite criado: ${emailLc} (uid=${uid}, role=${role}), emailSent=${emailSent}`);
  return { uid, emailSent };
});
