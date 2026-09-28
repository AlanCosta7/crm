/**
 * "Visualizar como" — orquestração no client.
 *
 * A parte de decisão (quem pode virar quem) mora na Cloud Function
 * `impersonateUser`/`endImpersonation`; aqui só ficam a troca de sessão via
 * `signInWithCustomToken` e a persistência local do "bilhete de volta".
 *
 * O bilhete (`returnToken` + `targetUid` + nome do admin) vai em
 * `sessionStorage`, não `localStorage`: some sozinho ao fechar a aba. Isso é
 * proposital — esta é uma sessão de teste temporária, não uma identidade
 * alternativa persistente. Se a aba fechar no meio, `stopImpersonation` ainda
 * funciona (cai no caminho de fallback: desloga e pede login de novo como
 * Master), só perde o atalho rápido de voltar direto.
 */
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth, functions } from '../../config/firebase';

const STORAGE_KEY = 'wm_impersonation_return';

export interface ImpersonationTicket {
  returnToken: string;
  targetUid: string;
  adminName: string;
  /** epoch ms — usado só para decidir se vale tentar antes de perguntar ao Firebase */
  issuedAt: number;
}

/** Custom tokens do Firebase valem por ~1h; damos uma margem de segurança. */
const RETURN_TOKEN_TTL_MS = 55 * 60 * 1000;

export function readTicket(): ImpersonationTicket | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ImpersonationTicket>;
    if (!parsed.returnToken || !parsed.targetUid || typeof parsed.issuedAt !== 'number') return null;
    return parsed as ImpersonationTicket;
  } catch {
    return null; // sessionStorage bloqueado ou conteúdo corrompido
  }
}

function writeTicket(ticket: ImpersonationTicket) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ticket));
  } catch {
    // Sem storage, "Voltar" cai direto no fallback de logout — funciona,
    // só sem o atalho rápido.
  }
}

function clearTicket() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // nada a fazer
  }
}

/** O bilhete guardado ainda está dentro da janela de validade do token do Firebase. */
export function isTicketFresh(ticket: ImpersonationTicket, now: number): boolean {
  return now - ticket.issuedAt < RETURN_TOKEN_TTL_MS;
}

interface ImpersonateResponse {
  impersonationToken: string;
  returnToken: string;
  target: { uid: string; name: string; role: string };
}

/** Master assume a sessão de `targetUid`. Lança em caso de erro (mensagem já amigável, vinda da function). */
export async function startImpersonation(targetUid: string, adminName: string): Promise<void> {
  const call = httpsCallable<{ targetUid: string }, ImpersonateResponse>(functions, 'impersonateUser');
  const { data } = await call({ targetUid });

  // Guarda o bilhete de volta ANTES de trocar de sessão — depois da troca,
  // não há mais claim de master para justificar pedir isso de novo.
  writeTicket({
    returnToken: data.returnToken,
    targetUid: data.target.uid,
    adminName,
    issuedAt: Date.now(),
  });

  await signInWithCustomToken(auth, data.impersonationToken);
}

export type StopImpersonationResult = 'returned' | 'signed-out';

/**
 * Encerra a impersonação atual.
 *
 * Caminho feliz: usa o bilhete guardado para voltar direto à sessão do
 * Master. Sem bilhete válido (aba reaberta, token expirado, storage vazio):
 * ainda assim limpa o marcador da sessão de teste (o próprio impersonado tem
 * permissão para isso) e desloga — a pessoa precisa logar de novo como
 * Master, mas o banner não fica preso na conta do usuário real depois.
 */
export async function stopImpersonation(currentUid: string): Promise<StopImpersonationResult> {
  const ticket = readTicket();
  const endCall = httpsCallable<{ targetUid: string }, { ok: true }>(functions, 'endImpersonation');

  if (ticket && ticket.targetUid === currentUid && isTicketFresh(ticket, Date.now())) {
    try {
      await signInWithCustomToken(auth, ticket.returnToken);
      // Agora autenticado como Master de novo — chama com a claim de master.
      await endCall({ targetUid: ticket.targetUid });
      clearTicket();
      return 'returned';
    } catch (err) {
      console.warn('[impersonation] falha ao voltar via bilhete, caindo para logout:', err);
      // segue para o fallback abaixo
    }
  }

  // Fallback: encerra a marca (permitido para o próprio impersonado) e desloga.
  try {
    await endCall({ targetUid: currentUid });
  } catch (err) {
    console.warn('[impersonation] falha ao limpar active_impersonations no fallback:', err);
  }
  clearTicket();
  await signOut(auth);
  return 'signed-out';
}
