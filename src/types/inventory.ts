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
  priceUsdKg: number;
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

export type InventoryMovementType = 'in' | 'out_sale' | 'adjustment' | 'return' | 'correction' | 'consumption';

export interface InventoryMovement {
  id: string;
  date: string;
  movementType: InventoryMovementType;
  itemId: string;
  itemType: InventoryItemType | 'product'; // Includes 3D and Resale products
  previousQuantity: number;
  modifiedQuantity: number;
  finalQuantity: number;
  reason: string;
  userId: string;
  orderId?: string;
}
