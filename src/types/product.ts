export type ProductType = '3d' | 'resale';

export interface PriceTier {
  minQty: number;
  maxQty: number;
  unitPrice: number; // ARS price per unit at this tier
}

export interface BaseProduct {
  id: string;
  name: string;
  categoryId: string; // reference to Category
  category: string; // denormalized category name for display
  type: ProductType;
  description: string;
  mainImage: string;
  gallery: string[];
  isActive: boolean;
  stock: number;

  // Pricing
  useManualPrice: boolean;
  manualRetailPrice: number;

  // Calculated fields
  calculatedRetailPrice: number;
  calculatedWholesalePrice: number;
  calculatedCost: number;

  // Price tiers (optional)
  priceTiers?: PriceTier[];

  createdAt?: string;
  updatedAt?: string;
}

export interface Product3D extends BaseProduct {
  type: '3d';
  weightGrams: number;
  printTimeMinutes: number;
  isKeychain: boolean;
  filamentIds: string[];
  supplyIds: { supplyId: string; quantity: number }[];
}

export interface ProductResale extends BaseProduct {
  type: 'resale';
  purchaseCost: number;
}

export type Product = Product3D | ProductResale;
