/**
 * backfill-auth-invites.mjs — Provisiona Auth para usuários já convidados no app
 *
 * Corrige os usuários criados apenas no Firestore (sem conta no Authentication),
 * antes da Cloud Function inviteUser existir. Para cada doc sem conta Auth:
 *   1. Cria a conta no Firebase Auth com senha temporária
 *   2. Define custom claims { tenantId, role, productIds }
 *   3. Recria o doc keyed by uid (copia campos) e remove o doc de ID aleatório
 *   4. Envia o e-mail branded com a senha temporária (nodemailer)
 *
 * Requer: functions buildado (functions/lib) + ADC (gcloud auth application-default login)
 * Env: SMTP_EMAIL, SMTP_PASSWORD (para o envio), GCLOUD_PROJECT, TENANT_ID
 *
 * Uso:
 *   SMTP_EMAIL=noreply@codifyx.com.br SMTP_PASSWORD='...' \
 *   GCLOUD_PROJECT=wizmart-crm TENANT_ID=wizmart node scripts/backfill-auth-invites.mjs
 */

import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const { sendInviteEmail } = require('../functions/lib/users/mailer.js');

const projectId = process.env.GCLOUD_PROJECT || 'wizmart-crm';
const tenantId  = process.env.TENANT_ID || 'wizmart';
const LOGIN_URL = 'https://wizmart-crm.web.app';

delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

const app  = admin.initializeApp({ projectId });
const db   = app.firestore();
const auth = app.auth();
const TS   = admin.firestore.FieldValue.serverTimestamp;

function makeTempPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  const b = randomBytes(8);
  let s = ''; for (let i = 0; i < 8; i++) s += chars[b[i] % chars.length];
  return `Wiz${s}`;
}

async function main() {
  const snap = await db.collection(`tenants/${tenantId}/users`).get();
  const results = [];

  for (const d of snap.docs) {
    const u = d.data();
    const email = (u.email || '').trim().toLowerCase();
    if (!email) continue;

    // Já tem conta Auth? pula.
    let existing = null;
    try { existing = await auth.getUserByEmail(email); } catch {}
    if (existing && d.id === existing.uid) continue; // já provisionado corretamente

    const tempPassword = makeTempPassword();
    let uid;
    if (existing) {
      uid = existing.uid;
      await auth.updateUser(uid, { password: tempPassword, displayName: u.name, disabled: false });
    } else {
      const rec = await auth.createUser({
        email, password: tempPassword, displayName: u.name || email,
        emailVerified: false, disabled: false,
      });
      uid = rec.uid;
    }

    await auth.setCustomUserClaims(uid, {
      tenantId,
      role: u.role,
      productIds: u.productIds || ['wizmart'],
    });

    // Recria o doc keyed by uid
    const { id: _omit, ...rest } = { id: undefined, ...u };
    await db.doc(`tenants/${tenantId}/users/${uid}`).set({
      ...rest,
      uid,
      last: 'Nunca acessou',
      createdAt: u.createdAt || TS(),
    }, { merge: true });

    // Remove o doc antigo de ID aleatório
    if (d.id !== uid) await db.doc(`tenants/${tenantId}/users/${d.id}`).delete();

    // Envia e-mail
    let emailSent = false, emailErr = '';
    try {
      await sendInviteEmail({ to: email, name: u.name || email, role: u.role, tempPassword, loginUrl: LOGIN_URL });
      emailSent = true;
    } catch (e) { emailErr = e.message; }

    results.push({ email, uid, role: u.role, tempPassword, emailSent, emailErr });
    console.log(`✓ ${email} → uid=${uid} role=${u.role} emailSent=${emailSent}${emailErr ? ' ('+emailErr+')' : ''}`);
  }

  console.log('\n=== Resumo (senhas temporárias — guarde caso o e-mail falhe) ===');
  for (const r of results) {
    console.log(`  ${r.email.padEnd(38)} ${r.tempPassword}   ${r.emailSent ? '📧 enviado' : '⚠️ e-mail falhou'}`);
  }
  if (results.length === 0) console.log('  (nada a fazer — todos já provisionados)');
}

main().then(() => process.exit(0)).catch(e => { console.error('Erro:', e); process.exit(1); });
