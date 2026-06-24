/**
 * pwaNotifications.test.ts — Testes do utilitário de Notificações PWA
 *
 * Cobre: detecção de suporte a notificações, solicitação de permissão,
 * envio de notificações nativas (com comportamento de clique), e busca
 * e filtragem de atividades pendentes do dia atual no Firestore.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { collection, query, getDocs } from 'firebase/firestore';
import { pwaNotifications } from './pwaNotifications';

// ── Mock de Firestore ────────────────────────────────────────────────────────
vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    getDocs: vi.fn(),
  };
});

vi.mock('../config/firebase', () => {
  return {
    db: {},
  };
});

// ── Mock da classe Notification ──────────────────────────────────────────────
class MockNotification {
  static permission: NotificationPermission = 'default';
  static requestPermission = vi.fn().mockResolvedValue('granted');
  
  title: string;
  options?: NotificationOptions;
  onclick: (() => void) | null = null;
  close = vi.fn();

  constructor(title: string, options?: NotificationOptions) {
    this.title = title;
    this.options = options;
    MockNotification.instances.push(this);
  }

  static instances: MockNotification[] = [];
  static reset() {
    this.permission = 'default';
    this.requestPermission.mockClear();
    this.requestPermission.mockResolvedValue('granted');
    this.instances = [];
  }
}

describe('pwaNotifications', () => {
  const originalNotification = (globalThis as any).Notification;

  beforeEach(() => {
    MockNotification.reset();
    (globalThis as any).Notification = MockNotification as any;
    if (typeof window !== 'undefined') {
      (window as any).Notification = MockNotification as any;
    }
  });

  afterEach(() => {
    (globalThis as any).Notification = originalNotification;
    if (typeof window !== 'undefined') {
      (window as any).Notification = originalNotification;
    }
    vi.clearAllMocks();
  });

  // ── isSupported ────────────────────────────────────────────────────────────
  describe('isSupported', () => {
    it('deve retornar true se Notification estiver presente no window', () => {
      expect(pwaNotifications.isSupported()).toBe(true);
    });

    it('deve retornar false se Notification não estiver no window', () => {
      // Remove temporariamente a API global
      delete (globalThis as any).Notification;
      if (typeof window !== 'undefined') {
        delete (window as any).Notification;
      }
      expect(pwaNotifications.isSupported()).toBe(false);
    });
  });

  // ── requestPermission ──────────────────────────────────────────────────────
  describe('requestPermission', () => {
    it('deve retornar "denied" se não for suportado', async () => {
      delete (globalThis as any).Notification;
      if (typeof window !== 'undefined') {
        delete (window as any).Notification;
      }
      const permission = await pwaNotifications.requestPermission();
      expect(permission).toBe('denied');
    });

    it('deve retornar a permissão atual se já estiver definida como "granted"', async () => {
      MockNotification.permission = 'granted';
      const permission = await pwaNotifications.requestPermission();
      expect(permission).toBe('granted');
      expect(MockNotification.requestPermission).not.toHaveBeenCalled();
    });

    it('deve retornar a permissão atual se já estiver definida como "denied"', async () => {
      MockNotification.permission = 'denied';
      const permission = await pwaNotifications.requestPermission();
      expect(permission).toBe('denied');
      expect(MockNotification.requestPermission).not.toHaveBeenCalled();
    });

    it('deve solicitar permissão se a atual for "default" e retornar o resultado', async () => {
      MockNotification.permission = 'default';
      MockNotification.requestPermission.mockResolvedValueOnce('granted');
      
      const permission = await pwaNotifications.requestPermission();
      expect(permission).toBe('granted');
      expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1);
    });
  });

  // ── send ───────────────────────────────────────────────────────────────────
  describe('send', () => {
    it('não deve disparar notificação se não for suportado', () => {
      delete (globalThis as any).Notification;
      if (typeof window !== 'undefined') {
        delete (window as any).Notification;
      }
      pwaNotifications.send('Teste');
      expect(MockNotification.instances).toHaveLength(0);
    });

    it('não deve disparar notificação se a permissão não for "granted"', () => {
      MockNotification.permission = 'default';
      pwaNotifications.send('Teste');
      expect(MockNotification.instances).toHaveLength(0);
    });

    it('deve disparar notificação com opções padrão quando a permissão for "granted"', () => {
      MockNotification.permission = 'granted';
      pwaNotifications.send('Teste de Título');
      
      expect(MockNotification.instances).toHaveLength(1);
      const instance = MockNotification.instances[0];
      expect(instance.title).toBe('Teste de Título');
      expect(instance.options).toEqual({
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        silent: false,
      });
    });

    it('deve mesclar e sobrescrever opções se fornecidas', () => {
      MockNotification.permission = 'granted';
      pwaNotifications.send('Teste de Título', {
        body: 'Corpo personalizado',
        silent: true,
        tag: 'tag-teste',
      });
      
      expect(MockNotification.instances).toHaveLength(1);
      const instance = MockNotification.instances[0];
      expect(instance.options).toEqual({
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        silent: true,
        body: 'Corpo personalizado',
        tag: 'tag-teste',
      });
    });

    it('deve focar na janela e fechar a notificação ao clicar', () => {
      MockNotification.permission = 'granted';
      
      // Mock do window.focus
      const originalFocus = typeof window !== 'undefined' ? window.focus : () => {};
      const focusMock = vi.fn();
      if (typeof window !== 'undefined') {
        window.focus = focusMock;
      }

      pwaNotifications.send('Teste Clique');
      const instance = MockNotification.instances[0];
      
      expect(instance.onclick).toBeTypeOf('function');
      instance.onclick!();

      expect(focusMock).toHaveBeenCalledTimes(1);
      expect(instance.close).toHaveBeenCalledTimes(1);

      // Restaura o focus
      if (typeof window !== 'undefined') {
        window.focus = originalFocus;
      }
    });

    it('deve capturar e logar erros se o construtor do Notification falhar', () => {
      MockNotification.permission = 'granted';
      
      // Mock para fazer a construção lançar um erro
      const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
      (globalThis as any).Notification = class {
        static permission = 'granted';
        constructor() {
          throw new Error('Falha no construtor do Notification');
        }
      } as any;

      expect(() => pwaNotifications.send('Teste Erro')).not.toThrow();
      expect(spyError).toHaveBeenCalledWith(
        '[pwaNotifications] Falha ao enviar notificação:',
        expect.any(Error)
      );
      
      spyError.mockRestore();
    });
  });

  // ── notifyDailyTasks ───────────────────────────────────────────────────────
  describe('notifyDailyTasks', () => {
    const tenantId = 'tenant-123';
    const userId = 'user-abc';

    beforeEach(() => {
      MockNotification.permission = 'granted';
    });

    it('não deve fazer nada se não for suportado ou permissão não for "granted"', async () => {
      MockNotification.permission = 'denied';
      await pwaNotifications.notifyDailyTasks(tenantId, userId);
      expect(getDocs).not.toHaveBeenCalled();
    });

    it('deve disparar notificação com o número correto de tarefas se houver tarefas hoje', async () => {
      // Cria datas no fuso atual para coincidir com hoje
      const now = new Date();
      const todayAt10 = new Date(now);
      todayAt10.setHours(10, 0, 0, 0);

      const mockDocs = [
        {
          data: () => ({
            userId,
            status: 'pending',
            scheduledAt: todayAt10, // usando objeto Date diretamente
          }),
        },
        {
          data: () => ({
            userId,
            status: 'pending',
            scheduledAt: {
              toDate: () => new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0), // usando Firestore Timestamp toDate()
            },
          }),
        },
        {
          data: () => ({
            userId,
            status: 'pending',
            scheduledAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), // depois de amanhã (não deve contar)
          }),
        },
        {
          data: () => ({
            userId,
            status: 'pending',
            scheduledAt: null, // sem data (não deve contar)
          }),
        }
      ];

      (getDocs as any).mockResolvedValueOnce({
        docs: mockDocs,
      });

      await pwaNotifications.notifyDailyTasks(tenantId, userId);

      expect(collection).toHaveBeenCalledWith(expect.anything(), 'tenants', tenantId, 'activities');
      expect(query).toHaveBeenCalled();
      expect(getDocs).toHaveBeenCalled();

      expect(MockNotification.instances).toHaveLength(1);
      const notif = MockNotification.instances[0];
      expect(notif.title).toBe('WizMart CRM 🎯');
      expect(notif.options?.body).toContain('Você tem 2 atividade(s) pendente(s) para hoje');
    });

    it('deve disparar notificação motivacional se não houver tarefas para hoje', async () => {
      (getDocs as any).mockResolvedValueOnce({
        docs: [],
      });

      await pwaNotifications.notifyDailyTasks(tenantId, userId);

      expect(MockNotification.instances).toHaveLength(1);
      const notif = MockNotification.instances[0];
      expect(notif.title).toBe('WizMart CRM 🚀');
      expect(notif.options?.body).toContain('Você não tem tarefas pendentes para hoje');
    });

    it('deve silenciar e capturar erros caso o Firestore lance uma exceção', async () => {
      const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
      (getDocs as any).mockRejectedValueOnce(new Error('Falha na conexão com banco'));

      await expect(pwaNotifications.notifyDailyTasks(tenantId, userId)).resolves.not.toThrow();
      expect(spyError).toHaveBeenCalledWith(
        '[pwaNotifications] Erro ao buscar atividades pendentes para notificar:',
        expect.any(Error)
      );
      expect(MockNotification.instances).toHaveLength(0);

      spyError.mockRestore();
    });
  });
});
