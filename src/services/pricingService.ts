import type { PricingSettingsResale } from '../types/settings';
import type { Product, PriceTier } from '../types/product';
import type { Category } from '../types/category';
import { doc, getDoc, getDocs, collection, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { defaultResale } from '../constants/defaults';
import type { VariantGroup } from '../types/variantGroup';

export function roundPriceUp100(value: number): number {
  if (isNaN(value) || !isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / 100) * 100;
}

// Calculate resale product prices
export function calculateResaleRetailPrice(
  purchaseCost: number,
  settings: PricingSettingsResale | null | undefined,
  productMargin?: number
): number {
  const margin = typeof productMargin === 'number' ? productMargin : (settings?.profitMarginPercent ?? 30);
  const rawRetail = purchaseCost * (1 + margin / 100);
  return roundPriceUp100(rawRetail);
}

export function calculateResaleWholesalePrice(
  purchaseCost: number,
  settings: PricingSettingsResale | null | undefined,
  productMargin?: number
): number {
  const margin = typeof productMargin === 'number' ? productMargin : (settings?.profitMarginPercent ?? 30);
  const retailPrice = calculateResaleRetailPrice(purchaseCost, settings, margin);
  // Default wholesale fallback is 20% discount (retail * 0.8)
  const rawWholesale = retailPrice * 0.8;
  return roundPriceUp100(rawWholesale);
}

// Get the effective price for a quantity considering tiers
export function getTierPrice(
  quantity: number,
  basePrice: number,
  tiers?: PriceTier[],
  isWholesale?: boolean
): number {
  if (!tiers || tiers.length === 0) return basePrice;

  if (isWholesale) {
    // Return the maximum discount (lowest unit price) among all tiers
    return Math.min(...tiers.map(t => t.unitPrice));
  }

  // Find matching tier
  const matchingTier = tiers.find(t => quantity >= t.minQty && quantity <= t.maxQty);
  if (matchingTier) return matchingTier.unitPrice;

  // If quantity exceeds all tiers, use the last tier
  const sortedTiers = [...tiers].sort((a, b) => b.maxQty - a.maxQty);
  if (quantity > sortedTiers[0]?.maxQty) return sortedTiers[0].unitPrice;

  return basePrice;
}

/** Resolves the price tiers for a product, walking up the category hierarchy if needed. */
export function resolveInheritedPriceTiers(
  priceTiers: PriceTier[] | undefined,
  _categoryId: string | undefined,
  _categories: Category[],
  variantGroup?: string,
  variantGroups?: VariantGroup[]
): PriceTier[] | undefined {
  // 1. Check if it belongs to a variant group and that group has tiers
  if (variantGroup && variantGroup.trim() && variantGroups && variantGroups.length > 0) {
    const group = variantGroups.find(
      g => g.id === variantGroup || g.name.toLowerCase() === variantGroup.trim().toLowerCase()
    );
    if (group && group.priceTiers && group.priceTiers.length > 0) {
      return group.priceTiers;
    }
  }

  // 2. Check if product has custom tiers
  if (priceTiers && priceTiers.length > 0) {
    return priceTiers;
  }

  return undefined;
}

/**
 * Finds the deepest category in the hierarchy (own or ancestor) that has priceTiers defined.
 * This category acts as the "scope" for quantity aggregation across products. If the product itself has priceTiers, returns its own categoryId.
 * Returns null if no tier scope is found.
 * If variantGroup is specified, returns a group-specific scope instead of category scope.
 */
export function deepestTierScopeCategoryId(
  priceTiers: PriceTier[] | undefined,
  categoryId: string | undefined,
  _categories: Category[],
  variantGroup?: string
): string | null {
  if (variantGroup && variantGroup.trim()) {
    return `group::${variantGroup.trim().toLowerCase()}`;
  }

  if (!categoryId) return null;

  // If the product has its own tiers, its category is the scope
  if (priceTiers && priceTiers.length > 0) {
    return categoryId;
  }

  return null;
}

/**
 * Aggregates quantities by tier scope (categoryId that owns the priceTiers, or variantGroup).
 * Only items that have tiers (direct or inherited) are counted.
 * Used to determine the effective quantity for tier pricing across multiple products
 * in the same category or variant group.
 */
export function aggregatedQtyByScope(
  items: Array<{ priceTiers?: PriceTier[]; categoryId?: string; variantGroup?: string; quantity: number | '' }>,
  categories: Category[],
  variantGroups?: VariantGroup[]
): Map<string, number> {
  const scopeMap = new Map<string, number>();

  for (const item of items) {
    const qty = item.quantity === '' ? 0 : Number(item.quantity);
    if (qty < 1) continue;

    const resolvedTiers = resolveInheritedPriceTiers(
      item.priceTiers,
      item.categoryId,
      categories,
      item.variantGroup,
      variantGroups
    );
    if (!resolvedTiers || resolvedTiers.length === 0) continue; // no tiers → skip

    const scopeId = deepestTierScopeCategoryId(item.priceTiers, item.categoryId, categories, item.variantGroup);
    if (!scopeId) continue;

    scopeMap.set(scopeId, (scopeMap.get(scopeId) ?? 0) + qty);
  }

  return scopeMap;
}

// Validate that a tier price doesn't generate a loss
export function validateTierPrice(tierPrice: number, cost: number): boolean {
  return tierPrice > cost;
}

/** Precio minorista en ARS para catálogo: manual del producto o calculado al vuelo. */
export function resolveProductRetailPrice(
  product: Product,
  _settings3d: any,
  settingsResale: PricingSettingsResale,
  _exchangeRate: any,
  _inventoryMap?: any
): number {
  if (product.useManualPrice) {
    return product.manualRetailPrice ?? 0;
  }
  return calculateResaleRetailPrice(product.purchaseCost ?? 0, settingsResale, product.profitMarginPercent);
}

/** Costo en ARS (admin / margen). */
export function resolveProductCost(
  product: Product,
  _settings3d: any,
  _settingsResale: any,
  _exchangeRate: any,
  _inventoryMap?: any
): number {
  return product.purchaseCost ?? 0;
}

// Recalculate all products in Firestore when pricing settings change
export async function recalculateAllProductsInFirestore(): Promise<number> {
  try {
    const snapResale = await getDoc(doc(db, 'settings', 'pricingResale'));
    const settingsResale = snapResale.exists() ? ({ ...defaultResale, ...snapResale.data() } as PricingSettingsResale) : defaultResale;

    const querySnapshot = await getDocs(collection(db, 'products'));

    const batch = writeBatch(db);
    let count = 0;

    querySnapshot.forEach((document) => {
      const product = document.data() as Product;
      const purchaseCost = product.purchaseCost || 0;
      const cost = purchaseCost;
      const retail = product.useManualPrice && product.manualRetailPrice 
        ? product.manualRetailPrice 
        : calculateResaleRetailPrice(purchaseCost, settingsResale, product.profitMarginPercent);
      
      let wholesale = 0;
      if (product.useManualPrice && product.manualRetailPrice) {
        wholesale = roundPriceUp100(product.manualRetailPrice * 0.8);
      } else {
        wholesale = calculateResaleWholesalePrice(purchaseCost, settingsResale, product.profitMarginPercent);
      }

      // Only update if there is an actual difference to save writes
      if (
        cost !== product.calculatedCost ||
        retail !== product.calculatedRetailPrice ||
        wholesale !== product.calculatedWholesalePrice
      ) {
        batch.update(doc(db, 'products', document.id), {
          calculatedCost: cost,
          calculatedRetailPrice: retail,
          calculatedWholesalePrice: wholesale,
        });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
    }
    console.log(`Recalculated ${count} products automatically.`);
    return count;
  } catch (error) {
    console.error('Error in recalculateAllProductsInFirestore:', error);
    return 0;
  }
}

export function calculate3DCostBreakdown(..._args: any[]) {
  return {
    total: 0,
    filament: 0,
    electricity: 0,
    maintenance: 0,
    supplies: 0,
    errorMargin: 0,
  };
}
