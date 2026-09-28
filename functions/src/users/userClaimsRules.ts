/**
 * userClaimsRules.ts — decisões puras da sincronização de claims
 *
 * Extraído de `syncUserClaims.ts` no mesmo espírito de `impersonationRules.ts`:
 * o trigger cuida de I/O (Auth, Firestore, logs) e este módulo responde às três
 * perguntas de decisão, testáveis sem emulador:
 *
 *   1. Quais claims o documento está pedindo?            → desiredClaims
 *   2. O token já está fiel ao documento?                → claimsMatch
 *   3. Esta mudança derruba o último master do tenant?   → derrubaUltimoMaster
 */

/** Papéis aceitos — espelha VALID_ROLES do inviteUser. */
export const VALID_ROLES = ["master", "manager", "bdr", "sdr", "rep", "design", "viewer", "financeiro"] as const;

export interface DesiredClaims {
  tenantId: string;
  role: string;
  productIds: string[];
}

/**
 * Claims que o documento pede.
 *
 * Papel ausente ou inválido cai em `viewer` — nunca em `master`. Um documento
 * corrompido ou incompleto não pode virar administrador (mesmo raciocínio do
 * fallback de `useAuth.ts`).
 */
export function desiredClaims(
  tenantId: string,
  data: { role?: unknown; productIds?: unknown },
): DesiredClaims {
  const role = typeof data.role === "string" && (VALID_ROLES as readonly string[]).includes(data.role)
    ? data.role
    : "viewer";
  const productIds = Array.isArray(data.productIds)
    ? data.productIds.filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];
  return {
    tenantId,
    role,
    productIds: productIds.length > 0 ? productIds : ["wizmart"],
  };
}

/** Compara duas listas de strings ignorando a ordem. */
export function sameStringArray(a: unknown, b: string[]): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

/**
 * O token já reflete o documento?
 *
 * É o short-circuit que impede a função de revogar a sessão do usuário a cada
 * moeda ganha: `users/{uid}` é escrito constantemente por caminhos que não têm
 * nada a ver com permissão.
 */
export function claimsMatch(current: Record<string, unknown> | undefined, desired: DesiredClaims): boolean {
  if (!current) return false;
  return current.tenantId === desired.tenantId
    && current.role === desired.role
    && sameStringArray(current.productIds, desired.productIds);
}

export interface EstadoMaster {
  /** Papel e situação ANTES da escrita (null quando o documento acabou de nascer). */
  antes: { role?: unknown; isActive?: unknown } | null;
  /** Papel pedido pelo documento DEPOIS da escrita. */
  papelDepois: string;
  /** O documento pede bloqueio de acesso? */
  bloqueadoDepois: boolean;
  /** Masters ativos do tenant sem contar o usuário sob análise. */
  outrosMastersAtivos: number;
}

/**
 * Esta mudança deixa o tenant sem nenhum master ativo?
 *
 * Rebaixar ou bloquear o único master deixaria a base sem ninguém capaz de
 * administrar — nem de desfazer a própria mudança pela interface.
 */
export function derrubaUltimoMaster(estado: EstadoMaster): boolean {
  const eraMasterAtivo = estado.antes?.role === "master" && estado.antes?.isActive !== false;
  if (!eraMasterAtivo) return false;

  const continuaMasterAtivo = estado.papelDepois === "master" && !estado.bloqueadoDepois;
  if (continuaMasterAtivo) return false;

  return estado.outrosMastersAtivos === 0;
}
