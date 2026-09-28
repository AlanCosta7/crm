/**
 * timeBlocks.ts — Blocos de horário da cadência (cópia do motor)
 *
 * Fase 2 do PLANO_DESENHO_CRM.md (slides 5, 6, 7 e 9 do deck "Desenho CRM").
 *
 * O cliente pediz que a página de Atividades deixe de ser um histórico e passe
 * a ser a FILA DO DIA, agrupada por hora: "10h: E-mail (aparecer aqui todos os
 * clientes em que ele precisa enviar e-mail naquele dia)", "11h: LinkedIn",
 * "12h: Pausa", e assim por diante. Até aqui não existia conceito de hora em
 * nenhum lugar do código — toda activity vencia às 23:59.
 *
 * Decisão 5 (Alan, 10/09/2026): os blocos são um **padrão da empresa, definido
 * pelo admin** na tela de cadência. Não há configuração por SDR — um único
 * documento de settings, sem override individual.
 *
 * ⚠️ DUPLICAÇÃO CONSCIENTE: este arquivo tem uma cópia idêntica em
 * `src/utils/timeBlocks.ts`, porque `src/` e `functions/` são pacotes separados
 * sem caminho de import entre eles. É o mesmo arranjo que `cadenceUtils.ts` já
 * usa. Ao mudar um, mude o outro — os dois têm a mesma bateria de testes
 * justamente para acusar divergência.
 */

/**
 * Canais que um bloco pode conter.
 *
 * Os quatro primeiros são os canais de cadência do SDR (`SDR_ACTIVITY_TYPES`).
 * `meeting` e `visit` entram por causa do bloco das 16h do slide 6 — "Follow Up
 * de Agenda (Reunião e Visita)" —, que não é canal de prospecção e sim
 * confirmação de compromisso.
 *
 * `agenda` é o tipo das tarefas da régua de agenda (Fase 3): follow-up e
 * confirmação de um compromisso já marcado. Tem tipo PRÓPRIO, e não `meeting`,
 * porque todo indicador de "Reuniões Agendadas" conta atividades `meeting` —
 * uma reunião com sete follow-ups viraria oito reuniões no dashboard e na TV.
 */
export type BlockActivityType = 'email' | 'linkedin' | 'whatsapp' | 'call' | 'meeting' | 'visit' | 'agenda';

export const BLOCK_ACTIVITY_TYPES: BlockActivityType[] = [
  'call', 'linkedin', 'whatsapp', 'email', 'meeting', 'visit', 'agenda',
];

export const BLOCK_TYPE_LABELS: Record<BlockActivityType, string> = {
  call: 'Ligação',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  meeting: 'Reunião',
  visit: 'Visita',
  agenda: 'Follow-up de agenda',
};

export interface TimeBlockDef {
  /** Slug estável — é o que fica gravado na activity (`blockId`). */
  id: string;
  label: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  /** Canais que caem neste bloco. Vazio em bloco de pausa. */
  types: BlockActivityType[];
  /** Pausa não recebe atividade — só aparece na régua para o SDR se organizar. */
  isBreak: boolean;
}

/**
 * Padrão do slide 6, literal. Serve como semente da tela de configuração e
 * como fallback quando o admin ainda não configurou nada (ou configurou algo
 * inválido) — o motor nunca pode ficar sem blocos.
 */
export const DEFAULT_TIME_BLOCKS: TimeBlockDef[] = [
  { id: 'email',      label: 'E-mail',            startHour: 10, startMinute: 0, endHour: 11, endMinute: 0, types: ['email'],               isBreak: false },
  { id: 'linkedin',   label: 'LinkedIn',          startHour: 11, startMinute: 0, endHour: 12, endMinute: 0, types: ['linkedin'],            isBreak: false },
  { id: 'pausa',      label: 'Pausa',             startHour: 12, startMinute: 0, endHour: 13, endMinute: 0, types: [],                      isBreak: true  },
  { id: 'ligacao',    label: 'Ligação',           startHour: 13, startMinute: 0, endHour: 15, endMinute: 0, types: ['call'],                isBreak: false },
  { id: 'whatsapp',   label: 'WhatsApp',          startHour: 15, startMinute: 0, endHour: 16, endMinute: 0, types: ['whatsapp'],            isBreak: false },
  { id: 'follow_up',  label: 'Follow Up de Agenda', startHour: 16, startMinute: 0, endHour: 18, endMinute: 0, types: ['agenda', 'meeting', 'visit'], isBreak: false },
];

/** Id do balde das atividades que não casaram com bloco nenhum. */
export const UNSCHEDULED_BLOCK_ID = '__sem_horario__';

const MAX_BLOCKS = 12;
const MAX_LABEL_LEN = 40;

function validHour(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
}

function validMinute(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 59 ? n : null;
}

/** Minutos desde a meia-noite — usado para ordenar e comparar blocos. */
export function blockStartMinutes(b: TimeBlockDef): number {
  return b.startHour * 60 + b.startMinute;
}

export function blockEndMinutes(b: TimeBlockDef): number {
  return b.endHour * 60 + b.endMinute;
}

/**
 * Normaliza `settings/cadence.sdr.timeBlocks`.
 *
 * Qualquer coisa inválida derruba a configuração inteira para o padrão, em vez
 * de aproveitar o que deu — mesma política de `normalizeSteps`: meia régua é
 * pior que a régua padrão, porque o SDR não tem como saber o que se perdeu.
 */
export function normalizeTimeBlocks(raw: unknown): TimeBlockDef[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BLOCKS) return DEFAULT_TIME_BLOCKS;

  const validTypes = new Set<string>(BLOCK_ACTIVITY_TYPES);
  const seenIds = new Set<string>();
  const blocks: TimeBlockDef[] = [];

  for (const item of raw as Record<string, unknown>[]) {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!id || id === UNSCHEDULED_BLOCK_ID || seenIds.has(id)) return DEFAULT_TIME_BLOCKS;

    const startHour = validHour(item?.startHour);
    const startMinute = validMinute(item?.startMinute ?? 0);
    const endHour = validHour(item?.endHour);
    const endMinute = validMinute(item?.endMinute ?? 0);
    if (startHour === null || startMinute === null || endHour === null || endMinute === null) return DEFAULT_TIME_BLOCKS;

    // Fim depois do início. Bloco que "vira o dia" não é suportado de propósito:
    // a cadência é diária, e um bloco cruzando a meia-noite tornaria ambígua a
    // data da atividade.
    if (endHour * 60 + endMinute <= startHour * 60 + startMinute) return DEFAULT_TIME_BLOCKS;

    const isBreak = item?.isBreak === true;
    const rawTypes: unknown[] = Array.isArray(item?.types) ? item.types : [];
    const types = Array.from(new Set(rawTypes))
      .filter((t): t is BlockActivityType => typeof t === 'string' && validTypes.has(t));

    // Bloco de trabalho sem canal nenhum nunca receberia atividade — seria um
    // buraco silencioso na régua.
    if (!isBreak && types.length === 0) return DEFAULT_TIME_BLOCKS;

    const label = typeof item?.label === 'string' && item.label.trim()
      ? item.label.trim().slice(0, MAX_LABEL_LEN)
      : types.map(t => BLOCK_TYPE_LABELS[t]).join(' + ') || 'Pausa';

    seenIds.add(id);
    blocks.push({ id, label, startHour, startMinute, endHour, endMinute, types: isBreak ? [] : types, isBreak });
  }

  const ordenados = blocks.sort((a, b) => blockStartMinutes(a) - blockStartMinutes(b));

  // Um canal em dois blocos deixaria indefinido onde a atividade cai.
  const canaisVistos = new Set<string>();
  for (const b of ordenados) {
    for (const t of b.types) {
      if (canaisVistos.has(t)) return DEFAULT_TIME_BLOCKS;
      canaisVistos.add(t);
    }
  }

  return ordenados;
}

/** O bloco que atende este canal, ou undefined se nenhum atende. */
export function blockForType(blocks: TimeBlockDef[], type: string): TimeBlockDef | undefined {
  return blocks.find(b => !b.isBreak && b.types.includes(type as BlockActivityType));
}

/**
 * Instante (UTC) correspondente ao início do bloco num dia BRT.
 *
 * `dateBRT` no formato "YYYY-MM-DD", como devolvido por `getTodayBRT`. O Brasil
 * não tem horário de verão desde 2019, então o offset fixo de -3 vale o ano
 * todo — mesma premissa que o resto do motor de cadência já adota.
 */
export function blockStartAt(block: TimeBlockDef, dateBRT: string): Date {
  const [y, m, d] = dateBRT.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, block.startHour + 3, block.startMinute));
}

/** "10h" quando começa em hora cheia; "10h30" caso contrário. */
function formatHour(hour: number, minute: number): string {
  return minute === 0 ? `${hour}h` : `${hour}h${String(minute).padStart(2, '0')}`;
}

/** "15h" para blocos de 1h; "13h–15h" para blocos maiores (formato do slide 6). */
export function formatBlockRange(block: TimeBlockDef): string {
  const inicio = formatHour(block.startHour, block.startMinute);
  const duracao = blockEndMinutes(block) - blockStartMinutes(block);
  if (duracao <= 60) return inicio;
  return `${inicio}–${formatHour(block.endHour, block.endMinute)}`;
}

export interface BlockSection<T> {
  block: TimeBlockDef;
  items: T[];
}

/**
 * Agrupa atividades nos blocos, na ordem do dia.
 *
 * Comportamento deliberado:
 *  - Bloco de pausa aparece na lista (o SDR precisa ver o intervalo), sempre vazio.
 *  - Bloco de trabalho sem atividade aparece também: "nada para fazer às 11h" é
 *    informação, e esconder o bloco faria a régua parecer diferente a cada dia.
 *  - Atividade sem bloco cai num balde final "Sem horário", nunca é descartada —
 *    perder atividade da fila do SDR é pior que mostrar uma fora de hora.
 */
export function groupActivitiesByBlock<T>(
  items: T[],
  blocks: TimeBlockDef[],
  typeOf: (item: T) => string,
): BlockSection<T>[] {
  const porBloco = new Map<string, T[]>();
  for (const b of blocks) porBloco.set(b.id, []);
  const semHorario: T[] = [];

  for (const item of items) {
    const b = blockForType(blocks, typeOf(item));
    if (b) porBloco.get(b.id)!.push(item);
    else semHorario.push(item);
  }

  const secoes: BlockSection<T>[] = blocks.map(b => ({ block: b, items: porBloco.get(b.id)! }));

  if (semHorario.length > 0) {
    secoes.push({
      block: {
        id: UNSCHEDULED_BLOCK_ID, label: 'Sem horário definido',
        startHour: 23, startMinute: 59, endHour: 23, endMinute: 59,
        types: [], isBreak: false,
      },
      items: semHorario,
    });
  }

  return secoes;
}

/** O bloco que está acontecendo agora (hora BRT), se houver. */
export function currentBlock(blocks: TimeBlockDef[], now: Date = new Date()): TimeBlockDef | undefined {
  const brt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const minutos = brt.getHours() * 60 + brt.getMinutes();
  return blocks.find(b => minutos >= blockStartMinutes(b) && minutos < blockEndMinutes(b));
}
