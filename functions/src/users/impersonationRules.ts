/**
 * Regras de quem pode ser impersonado por quem — puras, testáveis sem
 * emulador. A verificação em si (`impersonateUser.ts`) só aplica o veredito.
 */

export interface CallerClaims {
  uid: string;
  role?: string;
  tenantId?: string;
}

export interface TargetUser {
  id: string;
  tenantId: string;
  role?: string;
  isActive?: boolean;
}

export type ImpersonationVerdict =
  | { ok: true }
  | { ok: false; code: 'not-master' | 'self' | 'cross-tenant' | 'inactive' | 'not-found'; message: string };

/**
 * Decide se `caller` pode assumir a sessão de `target`.
 *
 * Impersonação aninhada é bloqueada de graça por esta mesma checagem: quem
 * está impersonando um SDR tem `role: 'sdr'` no JWT real (a claim persistida
 * na conta não muda — só o token de sessão troca), então uma segunda chamada
 * falha aqui em "not-master" sem precisar de código extra.
 */
export function assertCanImpersonate(caller: CallerClaims, target: TargetUser | null): ImpersonationVerdict {
  if (caller.role !== 'master') {
    return { ok: false, code: 'not-master', message: 'Apenas o Admin Master pode visualizar como outro usuário.' };
  }
  if (!target) {
    return { ok: false, code: 'not-found', message: 'Usuário não encontrado.' };
  }
  if (target.id === caller.uid) {
    return { ok: false, code: 'self', message: 'Você já está na sua própria sessão.' };
  }
  if (target.tenantId !== caller.tenantId) {
    return { ok: false, code: 'cross-tenant', message: 'Usuário pertence a outro tenant.' };
  }
  if (target.isActive === false) {
    return { ok: false, code: 'inactive', message: 'Este usuário está desativado.' };
  }
  return { ok: true };
}

/**
 * Quem pode encerrar a impersonação de `targetUid`: o master que a começou
 * (ou qualquer master, para não travar se `active_impersonations` sobreviver
 * ao fechamento da aba original — ver `impersonation.ts` no client) OU a
 * própria pessoa impersonada, terminando a própria sessão de teste.
 */
export function assertCanEndImpersonation(
  callerUid: string,
  callerRole: string | undefined,
  targetUid: string
): ImpersonationVerdict {
  if (callerUid === targetUid || callerRole === 'master') {
    return { ok: true };
  }
  return {
    ok: false,
    code: 'not-master',
    message: 'Sem permissão para encerrar esta visualização.',
  };
}
