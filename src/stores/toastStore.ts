import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'points' | 'coins' | 'achievement';

export interface Toast {
  id: string;
  message: string;
  sub?: string;
  type: ToastType;
  pointsAmount?: number;
  coinsAmount?: number;
  achievementIcon?: string;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    const duration = toast.duration ?? (toast.type === 'achievement' ? 6000 : 4000);

    const newToast: Toast = {
      id,
      ...toast,
      duration,
    };

    set((state) => ({ toasts: [...state.toasts, newToast] }));

    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

export default useToastStore;
