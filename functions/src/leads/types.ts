/**
 * types.ts — Tipos do serviço de captação de leads (WizMart Forms).
 * Espelho server-side dos tipos em src/types/crm.ts (frontend).
 */

export type LeadStatus = "new" | "converted" | "duplicate" | "discarded";

export interface LeadSourceDoc {
  name: string;
  apiKeyHash: string;
  apiKeyPrefix: string;
  allowedOrigins: string[];
  funnelId: string;
  productId: string;
  defaultOwner?: string;
  turnstileEnabled: boolean;
  isActive: boolean;
  stats?: {
    received: number;
    blocked: number;
    lastLeadAt?: unknown;
  };
}

export interface LeadTracking {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  pageUrl?: string;
  referrer?: string;
}

export interface LeadData {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  message?: string;
  custom?: Record<string, string>;
}

export interface FunnelStageDoc {
  id: string;
  name: string;
  order: number;
  isLost?: boolean;
}

export interface FunnelDoc {
  name: string;
  type: string;
  productId: string;
  stages: FunnelStageDoc[];
  isActive: boolean;
}
