import type { PriceTier } from './product';

export interface Category {
  id: string;
  name: string;
  parentId: string | null; // null = root category
  order: number;
  createdAt: string;
  priceTiers?: PriceTier[];
}

