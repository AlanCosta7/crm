import type { ProductId, ProductScope } from '../types/crm';
import type { UserState } from '../stores/authStore';

export const PRODUCT_IDS: ProductId[] = ['wizmart', 'smart_cafe'];

export function isProductId(value: unknown): value is ProductId {
  return value === 'wizmart' || value === 'smart_cafe';
}

export function normalizeProductScope(value: unknown): ProductScope {
  return value === 'all' || isProductId(value) ? value : 'all';
}

export function allowedProductIds(user?: Pick<UserState, 'productIds'> | null): ProductId[] {
  const ids = user?.productIds?.filter(isProductId) ?? [];
  return ids.length > 0 ? ids : ['wizmart'];
}

export function canAccessProduct(user: Pick<UserState, 'productIds'> | null | undefined, productId?: ProductId | null): boolean {
  if (!productId) return true;
  return allowedProductIds(user).includes(productId);
}

export function canUseAllScope(user?: Pick<UserState, 'productIds' | 'role'> | null): boolean {
  return (user?.role === 'master' || user?.role === 'manager') && allowedProductIds(user).length > 1;
}

export function ensureAllowedScope(scope: ProductScope | undefined, user?: Pick<UserState, 'productIds' | 'role'> | null): ProductScope {
  const normalizedScope = normalizeProductScope(scope);
  const allowed = allowedProductIds(user);
  if (normalizedScope === 'all') return canUseAllScope(user) ? 'all' : allowed[0];
  return allowed.includes(normalizedScope) ? normalizedScope : allowed[0];
}

export function matchesProductId(scope: ProductScope | undefined, productId?: ProductScope | null): boolean {
  const normalizedScope = normalizeProductScope(scope);
  return normalizedScope === 'all' || productId === 'all' || productId === normalizedScope;
}

export function matchesProductIds(scope: ProductScope | undefined, productIds?: ProductId[] | null): boolean {
  const normalizedScope = normalizeProductScope(scope);
  if (normalizedScope === 'all') return true;
  return Array.isArray(productIds) && productIds.includes(normalizedScope);
}

export function productIdsForNewEntity(scope: ProductScope | undefined, user?: Pick<UserState, 'productIds'> | null): ProductId[] {
  const normalizedScope = normalizeProductScope(scope);
  if (normalizedScope !== 'all') return [normalizedScope];
  return allowedProductIds(user);
}
