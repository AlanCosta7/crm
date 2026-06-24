import { create } from 'zustand';
import type { UserRole, ProductId } from '../types/crm';

export interface UserState {
  uid: string;
  name: string;
  email: string;
  initials: string;
  color: string;
  role: UserRole;
  tenantId: string;
  coinBalance?: number;
  points?: number;
  streak?: number;
  productIds?: ProductId[];
  calendarConnected?: boolean;
}

interface AuthState {
  user: UserState | null;
  loading: boolean;
  setUser: (user: UserState | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
}));
