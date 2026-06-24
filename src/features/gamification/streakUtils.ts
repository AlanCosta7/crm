export const getLocalDateString = (timestamp: number, timeZone: string = 'America/Sao_Paulo'): string => {
  const date = new Date(timestamp);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
};

/**
 * Computa a nova sequência (streak) diária baseada no fuso horário local.
 * 
 * Regras:
 * 1. Se for a primeira atividade de sempre, inicia o streak em 1.
 * 2. Se for no mesmo dia local da última atividade, mantém o streak atual (sem incrementar).
 * 3. Se for no dia local seguinte (diferença de exatamente 1 dia), incrementa o streak em 1.
 * 4. Se for após o dia local seguinte (diferença maior que 1 dia), quebra a sequência e reseta para 1.
 * 5. Se for uma atividade com data retroativa (diferença menor que 0), ignora e mantém o streak atual.
 */
export const computeStreak = (
  currentStreak: number,
  lastActivityTimestamp: number | null,
  currentTaskTimestamp: number,
  timeZone: string = 'America/Sao_Paulo'
): { newStreak: number; incremented: boolean } => {
  if (!lastActivityTimestamp) {
    return { newStreak: 1, incremented: true };
  }

  const currentDayString = getLocalDateString(currentTaskTimestamp, timeZone);
  const lastDayString = getLocalDateString(lastActivityTimestamp, timeZone);

  if (currentDayString === lastDayString) {
    return { newStreak: currentStreak || 1, incremented: false };
  }

  // Usamos T00:00:00 para forçar a interpretação local e evitar clock offsets
  const currentLocalDate = new Date(currentDayString + 'T00:00:00');
  const lastLocalDate = new Date(lastDayString + 'T00:00:00');
  
  const diffTime = currentLocalDate.getTime() - lastLocalDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    return { newStreak: (currentStreak || 0) + 1, incremented: true };
  } else if (diffDays > 1) {
    return { newStreak: 1, incremented: true };
  } else {
    return { newStreak: currentStreak || 1, incremented: false };
  }
};
