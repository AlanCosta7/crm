/**
 * rolePermissions.ts — fonte única das permissões dos perfis (RBAC dinâmico).
 *
 * Antes, os padrões viviam duplicados em `usePermissions` e em `SettingsPage`,
 * e a coleção `roles` nem tinha security rule (nada gravava). Agora:
 *
 *  - Sem documento em `tenants/{tid}/roles/{roleId}` → vale o padrão do código.
 *  - Com documento → vale a lista salva, MAIS as permissões liberadas por
 *    "rollouts" mais novos que a versão em que o perfil foi salvo
 *    (`permissionsRev`). Sem isso, salvar o perfil "BDR" uma vez congelaria a
 *    lista: toda permissão criada depois nunca chegaria nele. Salvar pela tela
 *    grava a versão atual — dali em diante o que o admin desmarcar é respeitado.
 *
 * Ao criar uma permissão nova que deva vir ligada por padrão para algum perfil:
 * some-a em DEFAULT_ROLE_PERMISSIONS, incremente PERMISSIONS_REV e registre o
 * rollout. A rule `roleGrantsManageDeals` (firestore.rules) espelha esta lógica
 * para `manage_deal_cards` — mantenha as duas em sincronia.
 */

/** Versão atual do conjunto de permissões. Gravada em `permissionsRev` ao salvar um perfil. */
export const PERMISSIONS_REV = 1;

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  master: [
    'view_dashboard', 'view_pipeline', 'view_contacts', 'view_companies', 'view_cadence',
    'view_activities', 'view_handoffs', 'view_tasks', 'view_leaderboard', 'view_carteira',
    'view_loja', 'view_kpi_reports', 'view_admin_settings', 'view_management_dashboard',
    'manage_deal_cards',
  ],
  manager: [
    'view_dashboard', 'view_pipeline', 'view_contacts', 'view_companies', 'view_activities',
    'view_tasks', 'view_leaderboard', 'view_carteira', 'view_loja', 'view_kpi_reports',
    'view_management_dashboard',
    // Fase 6.1 do PLANO_DESENHO_CRM.md: manager já pode encerrar a sessão de um
    // usuário nas rules/CF (`assertCanEndSession`) — sem esta permissão a ação
    // existia no backend mas não tinha como ser acionada, porque a tela de
    // Configurações inteira ficava invisível.
    'view_admin_settings',
    'manage_deal_cards',
  ],
  sdr: [
    'view_dashboard', 'view_pipeline', 'view_contacts', 'view_cadence', 'view_activities',
    'view_leaderboard', 'view_carteira', 'view_loja', 'view_sdr_dashboard',
  ],
  rep: [
    'view_dashboard', 'view_pipeline', 'view_contacts', 'view_handoffs', 'view_leaderboard',
    'view_carteira', 'view_loja', 'view_rep_dashboard',
  ],
  bdr: [
    'view_dashboard', 'view_pipeline', 'view_contacts', 'view_leaderboard', 'view_carteira',
    'view_loja', 'view_bdr_dashboard', 'manage_deal_cards',
  ],
  viewer: [
    'view_dashboard', 'view_pipeline', 'view_contacts', 'view_companies', 'view_kpi_reports',
    'view_viewer_dashboard',
  ],
  // Design e Financeiro sempre caíram no padrão do visualizador (papel sem
  // entrada aqui = viewer). Ganham entrada PRÓPRIA, com a mesma lista, só para
  // existirem como perfil na tela de Configurações — antes o admin precisava
  // criar o Perfil "Design" na mão antes de conseguir convidar alguém
  // (PLANO_DESENHO_CRM_2.md, A6). O acesso à fila do Design e à fila do
  // financeiro continua sendo por papel (rotas e sidebar), não por permissão.
  design: [
    'view_dashboard', 'view_pipeline', 'view_contacts', 'view_companies', 'view_kpi_reports',
    'view_viewer_dashboard',
  ],
  financeiro: [
    'view_dashboard', 'view_pipeline', 'view_contacts', 'view_companies', 'view_kpi_reports',
    'view_viewer_dashboard',
  ],
};

/** Permissões que chegam a perfis já salvos com uma `permissionsRev` anterior. */
const ROLLOUTS: { rev: number; grants: Record<string, string[]> }[] = [
  { rev: 1, grants: { manager: ['manage_deal_cards'], bdr: ['manage_deal_cards'] } },
];

/** Padrão do código para um perfil (desconhecido → visualizador, como sempre foi). */
export function defaultPermissions(roleId: string): string[] {
  return DEFAULT_ROLE_PERMISSIONS[roleId] ?? DEFAULT_ROLE_PERMISSIONS.viewer;
}

export interface RolePermissionsDoc {
  permissions?: string[];
  permissionsRev?: number;
}

/** Permissões em vigor para o perfil: padrão do código, ou o documento salvo + rollouts novos. */
export function effectivePermissions(roleId: string, doc?: RolePermissionsDoc | null): string[] {
  if (!doc) return defaultPermissions(roleId);
  const saved = Array.isArray(doc.permissions) ? doc.permissions : [];
  const savedRev = doc.permissionsRev ?? 0;
  const granted = ROLLOUTS
    .filter(r => r.rev > savedRev)
    .flatMap(r => r.grants[roleId] ?? []);
  return [...new Set([...saved, ...granted])];
}
