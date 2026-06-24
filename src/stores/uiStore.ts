import { create } from 'zustand';
import type { ProductScope } from '../types/crm';
import { normalizeProductScope } from '../utils/productScope';

const PRODUCT_KEY = 'wm_product';
const SIDEBAR_KEY = 'sidebar_collapsed';

interface UIState {
  sidebarCollapsed: boolean;
  productId: ProductScope;
  productScope: ProductScope;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setProductId: (id: ProductScope) => void;
  setProductScope: (id: ProductScope) => void;
}

const initialProductScope = normalizeProductScope(localStorage.getItem(PRODUCT_KEY));

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: localStorage.getItem(SIDEBAR_KEY) === 'true',
  productId: initialProductScope,
  productScope: initialProductScope,

  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return { sidebarCollapsed: next };
    }),

  setSidebarCollapsed: (collapsed) => {
    localStorage.setItem(SIDEBAR_KEY, String(collapsed));
    set({ sidebarCollapsed: collapsed });
  },

  setProductId: (id) => {
    localStorage.setItem(PRODUCT_KEY, id);
    set({ productId: id, productScope: id });
  },

  setProductScope: (id) => {
    localStorage.setItem(PRODUCT_KEY, id);
    set({ productId: id, productScope: id });
  },
}));

export default useUIStore;
