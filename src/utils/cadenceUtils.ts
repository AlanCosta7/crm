/**
 * cadenceUtils.ts (frontend) — Re-exporta os utilitários do motor de cadência
 * para uso nos componentes React (CadenciaPage, useCadencia, etc.)
 *
 * Fonte de verdade: functions/src/cadence/cadenceUtils.ts
 * Esta cópia existe para que o frontend não importe código de Cloud Functions.
 *
 * Testes em: src/utils/cadenceUtils.test.ts
 */

export type ActivityType = 'email' | 'linkedin' | 'whatsapp' | 'call';

export interface CadenceActivity {
  type: ActivityType;
  status: 'pending' | 'completed' | 'overdue' | 'skipped';
  activityId?: string;
}

export interface CadenceCard {
  dealId: string;
  contactName: string;
  companyName: string;
  productId?: string;
  isNew: boolean;
  activities: Record<ActivityType, CadenceActivity>;
}

export interface DailyQueue {
  id?: string;
  sdrId: string;
  date: string;
  cardsDistributed: number;
  previousCompletionRate: number;
  activitiesRequired: number;
  activitiesCompleted: number;
  completionRate: number;
  cards: CadenceCard[];
  generatedAt?: any;
}

/** Calcula novos cards. null = primeiro dia → 3. */
export function calcNewCards(rate: number | null): number {
  if (rate === null) return 3;
  return Math.min(3, Math.max(0, Math.floor(3 * rate)));
}

/** Taxa de conclusão (0–1). Zero requeridas = 1 (não penaliza). */
export function calcCompletionRate(completed: number, required: number): number {
  if (required <= 0) return 1;
  return Math.min(1, completed / required);
}

/** Retorna a data atual em BRT (GMT-3) como "YYYY-MM-DD". */
export function getTodayBRT(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export const SDR_ACTIVITY_TYPES: ActivityType[] = ['email', 'linkedin', 'whatsapp', 'call'];

export const ACTIVITY_TYPE_CONFIG: Record<ActivityType, { icon: string; label: string; color: string; bg: string }> = {
  email:    { icon: 'Mail',          label: 'Email',    color: '#1A6B1A', bg: '#E5F0E5' },
  linkedin: { icon: 'Linkedin',      label: 'LinkedIn', color: '#0077B5', bg: '#E8F4FD' },
  whatsapp: { icon: 'MessageCircle', label: 'WhatsApp', color: '#25D366', bg: '#DCFCE7' },
  call:     { icon: 'Phone',         label: 'Ligação',  color: '#F59E0B', bg: '#FEF3C7' },
};
