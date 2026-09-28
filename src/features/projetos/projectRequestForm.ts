/**
 * projectRequestForm.ts — campos e validação do formulário de solicitação de
 * projeto, conforme o Word "CRM Comercial - Aba Solicitação de Projeto"
 * (PLANO_DESENHO_CRM_2.md, A2).
 *
 * Word: cada quantidade é "múltipla escolha de 01 a 10 und". Rótulos exatos do
 * cliente — "Luminária WizMart", "Letreiro WizMart" e "Freezer Horizontal —
 * Picolé". Tipo de PDV: Nanomarket, Micromarket, Loja, Container.
 */
import type { PDVType } from '../../types/crm';

export const MAX_QTY = 10;

export const PDV_OPTIONS: { id: PDVType; label: string; icon: string }[] = [
  { id: 'nanomarket',  label: 'Nanomarket',  icon: 'Store'     },
  { id: 'micromarket', label: 'Micromarket', icon: 'Building'  },
  { id: 'store',       label: 'Loja',        icon: 'Building2' },
  { id: 'container',   label: 'Container',   icon: 'Box'       },
];

export const EQUIPMENT_FIELDS = [
  { key: 'gondola',           label: 'Quantidade de Gôndola',                  icon: 'Layers'       },
  { key: 'fridge',            label: 'Quantidade de Geladeira',                icon: 'Refrigerator' },
  { key: 'freezerVertical',   label: 'Quantidade de Freezer Vertical',         icon: 'Square'       },
  { key: 'freezerHorizontal', label: 'Quantidade de Freezer Horizontal — Picolé', icon: 'Minus'     },
  { key: 'luminary',          label: 'Luminária WizMart',                      icon: 'Lightbulb'    },
  { key: 'sign',              label: 'Letreiro WizMart',                       icon: 'Tag'          },
] as const;

export type EquipKey = typeof EQUIPMENT_FIELDS[number]['key'];
export type Quantities = Record<EquipKey, number>;

export const EMPTY_QUANTITIES: Quantities = {
  gondola: 0, fridge: 0, freezerVertical: 0, freezerHorizontal: 0, luminary: 0, sign: 0,
};

/** Mantém a quantidade entre 0 (não usa) e o teto de 10 do Word; lixo vira 0. */
export function clampQty(value: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_QTY, Math.max(0, n));
}

export function hasAnyEquipment(q: Quantities): boolean {
  return Object.values(q).some((v) => v > 0);
}
