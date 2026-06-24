import { describe, it, expect } from 'vitest';
import { computeStreak, getLocalDateString } from './streakUtils';

describe('Cálculo de Streaks (Timezone-Aware)', () => {
  const TZ_BR = 'America/Sao_Paulo'; // Fuso de Brasília (GMT-3)

  it('deve formatar data local corretamente no fuso de Brasília', () => {
    // 29 de Maio de 2026 às 22:00:00 Horário de Brasília (GMT-3)
    // Isso equivale a 30 de Maio de 2026 às 01:00:00 UTC
    const timestampUTC = new Date('2026-05-30T01:00:00Z').getTime();
    
    // Verificamos que no fuso de Brasília ainda é dia 29
    expect(getLocalDateString(timestampUTC, TZ_BR)).toBe('2026-05-29');
  });

  it('deve iniciar o streak em 1 se for a primeira atividade de todas', () => {
    const now = new Date('2026-05-29T15:00:00Z').getTime();
    const result = computeStreak(0, null, now, TZ_BR);
    
    expect(result.newStreak).toBe(1);
    expect(result.incremented).toBe(true);
  });

  it('não deve incrementar o streak no mesmo dia local', () => {
    const lastActivity = new Date('2026-05-29T10:00:00-03:00').getTime();
    const currentActivity = new Date('2026-05-29T18:00:00-03:00').getTime();
    
    const result = computeStreak(3, lastActivity, currentActivity, TZ_BR);
    
    expect(result.newStreak).toBe(3);
    expect(result.incremented).toBe(false);
  });

  it('deve incrementar o streak em exatamente 1 dia local consecutivo', () => {
    const lastActivity = new Date('2026-05-28T14:00:00-03:00').getTime();
    const currentActivity = new Date('2026-05-29T11:00:00-03:00').getTime();
    
    const result = computeStreak(5, lastActivity, currentActivity, TZ_BR);
    
    expect(result.newStreak).toBe(6);
    expect(result.incremented).toBe(true);
  });

  it('deve lidar corretamente com a transição de dia UTC para dia local de Brasília', () => {
    // Vendedor conclui atividade no dia 28 às 23:00 Brasília (02:00 do dia 29 em UTC)
    const lastActivity = new Date('2026-05-29T02:00:00Z').getTime(); // 28/05/2026 23:00 GMT-3
    
    // Vendedor conclui outra no dia 29 às 22:30 Brasília (01:30 do dia 30 em UTC)
    const currentActivity = new Date('2026-05-30T01:30:00Z').getTime(); // 29/05/2026 22:30 GMT-3
    
    const result = computeStreak(2, lastActivity, currentActivity, TZ_BR);
    
    // Devem ser dias consecutivos (28 e 29 de maio) no fuso de Brasília
    expect(result.newStreak).toBe(3);
    expect(result.incremented).toBe(true);
  });

  it('deve resetar o streak para 1 se houver um hiato de 2 ou mais dias', () => {
    const lastActivity = new Date('2026-05-20T10:00:00-03:00').getTime();
    const currentActivity = new Date('2026-05-29T10:00:00-03:00').getTime();
    
    const result = computeStreak(8, lastActivity, currentActivity, TZ_BR);
    
    expect(result.newStreak).toBe(1);
    expect(result.incremented).toBe(true);
  });

  it('deve manter o streak caso seja concluída uma tarefa com data retroativa/fora de ordem', () => {
    const lastActivity = new Date('2026-05-29T10:00:00-03:00').getTime();
    const retroactiveActivity = new Date('2026-05-28T10:00:00-03:00').getTime();
    
    const result = computeStreak(4, lastActivity, retroactiveActivity, TZ_BR);
    
    expect(result.newStreak).toBe(4);
    expect(result.incremented).toBe(false);
  });
});
