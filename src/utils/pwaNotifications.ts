import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * PWA Notifications Utility
 * Gerencia a permissão e o disparo de notificações nativas do navegador.
 * Auxilia SDRs e Representantes a lembrarem de suas tarefas pendentes para o dia.
 */
export const pwaNotifications = {
  /**
   * Verifica se o navegador suporta notificações.
   */
  isSupported(): boolean {
    return 'Notification' in window;
  },

  /**
   * Solicita permissão para exibir notificações.
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      return 'denied';
    }
    
    // Se a permissão for padrão ('default'), solicita ao usuário
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      console.log(`[pwaNotifications] Permissão de notificação definida: ${permission}`);
      return permission;
    }
    
    return Notification.permission;
  },

  /**
   * Dispara uma notificação nativa do navegador se a permissão for concedida.
   */
  send(title: string, options?: NotificationOptions) {
    if (!this.isSupported() || Notification.permission !== 'granted') {
      return;
    }

    try {
      const defaultOptions: NotificationOptions = {
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        silent: false,
        ...options,
      };
      
      const notification = new Notification(title, defaultOptions);
      
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (err) {
      console.error('[pwaNotifications] Falha ao enviar notificação:', err);
    }
  },

  /**
   * Busca atividades pendentes do dia atual para o usuário e dispara um lembrete visual.
   */
  async notifyDailyTasks(tenantId: string, userId: string) {
    if (!this.isSupported() || Notification.permission !== 'granted') return;

    try {
      // Data de hoje sem horas (início do dia local)
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      // Consulta atividades pendentes agendadas para hoje sob o tenant do usuário
      const activitiesRef = collection(db, 'tenants', tenantId, 'activities');
      const q = query(
        activitiesRef,
        where('userId', '==', userId),
        where('status', '==', 'pending')
      );

      const querySnap = await getDocs(q);
      const todayTasks = querySnap.docs.filter(docSnap => {
        const data = docSnap.data();
        if (!data.scheduledAt) return false;
        
        // Converte Firestore Timestamp ou Date para comparação
        const scheduledTime = data.scheduledAt.toDate ? data.scheduledAt.toDate() : new Date(data.scheduledAt);
        return scheduledTime >= startOfDay && scheduledTime <= endOfDay;
      });

      const count = todayTasks.length;

      if (count > 0) {
        this.send('WizMart CRM 🎯', {
          body: `Olá! Você tem ${count} atividade(s) pendente(s) para hoje. Acesse sua cadência diária para concluir e coletar suas moedas!`,
          tag: 'daily-nudge',
        });
      } else {
        // Envia uma notificação de encorajamento se o dia estiver limpo
        this.send('WizMart CRM 🚀', {
          body: 'Excelente! Você não tem tarefas pendentes para hoje. Que tal buscar novos prospects na fila do BDR?',
          tag: 'daily-nudge',
        });
      }
    } catch (err) {
      console.error('[pwaNotifications] Erro ao buscar atividades pendentes para notificar:', err);
    }
  }
};

export default pwaNotifications;
