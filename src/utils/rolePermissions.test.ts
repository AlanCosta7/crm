import { describe, it, expect } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS_REV, defaultPermissions, effectivePermissions } from './rolePermissions';

describe('defaultPermissions', () => {
  it('BDR, Gestor e Master vêm com manage_deal_cards; SDR e Rep não', () => {
    for (const role of ['bdr', 'manager', 'master']) expect(defaultPermissions(role)).toContain('manage_deal_cards');
    for (const role of ['sdr', 'rep', 'viewer']) expect(defaultPermissions(role)).not.toContain('manage_deal_cards');
  });
  it('perfil desconhecido cai no visualizador', () => {
    expect(defaultPermissions('supervisor')).toEqual(defaultPermissions('viewer'));
  });
});

describe('effectivePermissions', () => {
  it('sem documento: padrão do código', () => {
    expect(effectivePermissions('bdr', null)).toEqual(defaultPermissions('bdr'));
  });

  it('documento salvo NA versão atual: vale exatamente o que o admin marcou', () => {
    const doc = { permissions: ['view_dashboard', 'view_pipeline'], permissionsRev: PERMISSIONS_REV };
    expect(effectivePermissions('bdr', doc)).toEqual(['view_dashboard', 'view_pipeline']);
  });

  it('desmarcar manage_deal_cards no BDR é respeitado', () => {
    const doc = { permissions: ['view_dashboard'], permissionsRev: PERMISSIONS_REV };
    expect(effectivePermissions('bdr', doc)).not.toContain('manage_deal_cards');
  });

  it('documento de versão anterior recebe a permissão nova do rollout (BDR e Gestor)', () => {
    const doc = { permissions: ['view_dashboard'] };
    expect(effectivePermissions('bdr', doc)).toEqual(['view_dashboard', 'manage_deal_cards']);
    expect(effectivePermissions('manager', doc)).toContain('manage_deal_cards');
  });

  it('o rollout não vaza para perfis que não estão nele', () => {
    expect(effectivePermissions('sdr', { permissions: ['view_dashboard'] })).toEqual(['view_dashboard']);
    expect(effectivePermissions('supervisor', { permissions: ['view_dashboard'] })).toEqual(['view_dashboard']);
  });

  it('documento sem lista de permissões não quebra', () => {
    expect(effectivePermissions('sdr', {})).toEqual([]);
  });

  // PLANO_DESENHO_CRM_2.md, A6: Design e Financeiro existem como perfil próprio.
  it('design e financeiro têm perfil padrão próprio — com o mesmo acesso que já tinham (visualizador)', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.design).toBeDefined();
    expect(DEFAULT_ROLE_PERMISSIONS.financeiro).toBeDefined();
    expect(defaultPermissions('design')).toEqual(defaultPermissions('viewer'));
    expect(defaultPermissions('financeiro')).toEqual(defaultPermissions('viewer'));
  });

  it('design e financeiro NÃO ganham gestão de cards nem configurações', () => {
    for (const role of ['design', 'financeiro']) {
      expect(defaultPermissions(role)).not.toContain('manage_deal_cards');
      expect(defaultPermissions(role)).not.toContain('view_admin_settings');
    }
  });
});
