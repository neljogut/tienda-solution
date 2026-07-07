export type ProductType = string;

export interface PriceTier {
  minQty: number;
  maxQty: number;
  unitPrice: number; // ARS price per unit at this tier
}

export interface Product {
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
  profitMarginPercent?: number;

  // Calculated fields
  calculatedRetailPrice: number;
  calculatedWholesalePrice: number;
  calculatedCost: number;

  // Price tiers (optional)
  priceTiers?: PriceTier[];

  variantGroup?: string;

  createdAt?: string;
  updatedAt?: string;

  // Resale specific
  purchaseCost: number;

  // Inventory / Barcode scanning
  barcode?: string;
}

