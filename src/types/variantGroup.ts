import type { PriceTier } from './product';

export interface VariantGroup {
  id: string;
  name: string;
  priceTiers: PriceTier[];
  createdAt?: string;
  updatedAt?: string;
}
