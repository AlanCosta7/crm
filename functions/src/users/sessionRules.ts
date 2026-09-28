/**
 * sessionRules.ts — regras puras da auditoria de sessão (Fase 6.1 do
 * PLANO_DESENHO_CRM.md, slide 12: "Gerenciador de Login e Logoff do CRM").
 *
 * Mesmo espírito de `impersonationRules.ts`: a Cloud Function
 * (`endUserSession.ts`) cuida de I/O, este módulo responde só a pergunta de
 * autorização — testável sem emulador.
 */

export interface CallerClaims {
  uid: string;
  role?: string;
  tenantId?: string;
}

export interface TargetUser {
  id: string;
  tenantId: string;
}

export type EndSessionVerdict =
  | { ok: true }
  | { ok: false; code: 'not-authorized' | 'self' | 'cross-tenant' | 'not-found'; message: string };

/**
 * Quem pode forçar o encerramento da sessão de outro usuário: master ou
 * manager do MESMO tenant. Diferente do bloqueio de acesso (Fase 0, que exige
 * master) — "Encerrar Sessão" não desativa a conta, só derruba a sessão atual
 * (ex.: notebook esquecido logado na loja do cliente); o gestor também precisa
 * poder agir nisso no dia a dia sem depender do master.
 *
 * Encerrar a PRÓPRIA sessão por este caminho não faz sentido (a pessoa já tem
 * o botão "Sair") — bloqueado para não confundir com logout normal.
 */
export function assertCanEndSession(caller: CallerClaims, target: TargetUser | null): EndSessionVerdict {
  if (caller.role !== 'master' && caller.role !== 'manager') {
    return { ok: false, code: 'not-authorized', message: 'Apenas Master ou Gestor podem encerrar a sessão de outro usuário.' };
  }
  if (!target) {
    return { ok: false, code: 'not-found', message: 'Usuário não encontrado.' };
  }
  if (target.id === caller.uid) {
    return { ok: false, code: 'self', message: 'Use o botão "Sair" para encerrar a própria sessão.' };
  }
  if (target.tenantId !== caller.tenantId) {
    return { ok: false, code: 'cross-tenant', message: 'Usuário pertence a outro tenant.' };
  }
  return { ok: true };
}
