export type InventoryItemType = 'filament' | 'supply';

export interface Filament {
  id: string;
  type: 'filament';
  brand: string;
  material: string; // e.g., PLA, PETG, ABS
  color: string;
  hexColor: string;
  mainImage?: string;
  initialWeightGrams: number;
  availableWeightGrams: number;
  /** 0 o ausente = usar precio global de Parámetros de precios */
  priceUsdKg?: number;
  priceCurrency?: 'USD' | 'ARS';
  provider: string;
  purchaseDate: string;
  minStockGrams: number;
  isActive: boolean;
}

export interface Supply {
  id: string;
  type: 'supply';
  name: string;
  category: string;
  mainImage?: string;
  unitOfMeasure: string;
  currentStock: number;
  minStock: number;
  unitCostArs: number;
  provider: string;
  observations: string;
}

export type InventoryMovementType =
  | 'in'
  | 'out_sale'
  | 'adjustment'
  | 'return'
  | 'correction'
  | 'consumption'
  | 'sale';

export interface InventoryMovementLine {
  itemId: string;
  itemType: InventoryItemType | 'product';
  lineType: InventoryMovementType;
  modifiedQuantity: number;
  previousQuantity: number;
  finalQuantity: number;
}

/** Movimiento simple (un ítem) o agrupado (venta/devolución con varias líneas) */
export interface InventoryMovement {
  id: string;
  date: string;
  movementType: InventoryMovementType;
  reason: string;
  userId: string;
  orderId?: string;
  /** Presente cuando el movimiento agrupa varias líneas (ej. una venta completa) */
  lines?: InventoryMovementLine[];
  /** Campos de ítem único (cuando no hay `lines`) */
  itemId?: string;
  itemType?: InventoryItemType | 'product';
  previousQuantity?: number;
  modifiedQuantity?: number;
  finalQuantity?: number;
}

export function isGroupedMovement(m: InventoryMovement): boolean {
  return Array.isArray(m.lines) && m.lines.length > 0;
}

export function hasCustomFilamentPrice(filament: Pick<Filament, 'priceUsdKg'>): boolean {
  return (filament.priceUsdKg ?? 0) > 0;
}

export function getFilamentPriceUsdKg(
  filament: Pick<Filament, 'priceUsdKg'>,
  defaultUsdKg: number
): number {
  return hasCustomFilamentPrice(filament) ? filament.priceUsdKg! : defaultUsdKg;
}

export function getFilamentPriceAndCurrency(
  filament: Pick<Filament, 'priceUsdKg' | 'priceCurrency'>,
  defaultPrice: number,
  defaultCurrency: 'USD' | 'ARS' = 'USD'
): { price: number; currency: 'USD' | 'ARS' } {
  const hasCustom = hasCustomFilamentPrice(filament);
  return {
    price: hasCustom ? filament.priceUsdKg! : defaultPrice,
    currency: hasCustom ? (filament.priceCurrency ?? 'USD') : defaultCurrency,
  };
}
