import { describe, expect, it } from 'vitest';
import {
  allowedProductIds,
  canAccessProduct,
  canUseAllScope,
  ensureAllowedScope,
  matchesProductId,
  matchesProductIds,
  normalizeProductScope,
  productIdsForNewEntity,
} from './productScope';
import type { ProductId } from '../types/crm';

describe('productScope', () => {
  const multiUser = { role: 'manager' as const, productIds: ['wizmart', 'smart_cafe'] as ProductId[] };
  const wizUser = { role: 'sdr' as const, productIds: ['wizmart'] as ProductId[] };

  it('normaliza valores inválidos para all', () => {
    expect(normalizeProductScope('smart_cafe')).toBe('smart_cafe');
    expect(normalizeProductScope('all')).toBe('all');
    expect(normalizeProductScope('x')).toBe('all');
  });

  it('limita all a gestores multi-produto', () => {
    expect(canUseAllScope(multiUser)).toBe(true);
    expect(canUseAllScope(wizUser)).toBe(false);
    expect(ensureAllowedScope('all', wizUser)).toBe('wizmart');
  });

  it('valida acesso a produtos permitidos no usuário', () => {
    expect(allowedProductIds(wizUser)).toEqual(['wizmart']);
    expect(canAccessProduct(wizUser, 'wizmart')).toBe(true);
    expect(canAccessProduct(wizUser, 'smart_cafe')).toBe(false);
  });

  it('filtra documentos por productId e respeita itens globais', () => {
    expect(matchesProductId('wizmart', 'wizmart')).toBe(true);
    expect(matchesProductId('wizmart', 'smart_cafe')).toBe(false);
    expect(matchesProductId('wizmart', 'all')).toBe(true);
    expect(matchesProductId('all', 'smart_cafe')).toBe(true);
  });

  it('filtra entidades multi-produto por productIds', () => {
    expect(matchesProductIds('wizmart', ['wizmart', 'smart_cafe'])).toBe(true);
    expect(matchesProductIds('smart_cafe', ['wizmart'])).toBe(false);
    expect(matchesProductIds('all', ['wizmart'])).toBe(true);
  });

  it('define productIds de novos contatos/empresas pelo escopo atual', () => {
    expect(productIdsForNewEntity('smart_cafe', multiUser)).toEqual(['smart_cafe']);
    expect(productIdsForNewEntity('all', multiUser)).toEqual(['wizmart', 'smart_cafe']);
  });
});
