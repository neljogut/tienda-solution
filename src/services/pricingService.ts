import type { PricingSettings3D, PricingSettingsResale, ExchangeRateData } from '../types/settings';
import type { Product3D, PriceTier } from '../types/product';

// Calculate cost for a 3D printed product
export function calculate3DCost(
  product: Pick<Product3D, 'weightGrams' | 'printTimeMinutes'>,
  settings: PricingSettings3D,
  exchangeRate: ExchangeRateData
): number {
  const filamentCostPerGram = (settings.filamentPriceUsdKg * exchangeRate.currentUsdToArs) / 1000;
  const filamentCost = product.weightGrams * filamentCostPerGram;

  const printerWattsToKw = settings.printerWatts / 1000;
  const printTimeHours = product.printTimeMinutes / 60;
  const electricityCost = printerWattsToKw * printTimeHours * settings.kwhPriceArs;

  const maintenanceCostPerHour = settings.estimatedSparesCostArs / settings.printerLifespanHours;
  const maintenanceCost = maintenanceCostPerHour * printTimeHours;

  const subtotal = filamentCost + electricityCost + maintenanceCost;
  const errorMargin = subtotal * (settings.errorMarginPercent / 100);

  return Math.ceil(subtotal + errorMargin);
}

// Calculate retail price for a 3D product
export function calculate3DRetailPrice(
  product: Pick<Product3D, 'weightGrams' | 'printTimeMinutes' | 'isKeychain'>,
  settings: PricingSettings3D,
  exchangeRate: ExchangeRateData
): number {
  const cost = calculate3DCost(product, settings, exchangeRate);
  const multiplier = product.isKeychain ? settings.multiplierRetailKeychain : settings.multiplierRetailNormal;
  return Math.ceil(cost * multiplier);
}

// Calculate wholesale price for a 3D product
export function calculate3DWholesalePrice(
  product: Pick<Product3D, 'weightGrams' | 'printTimeMinutes' | 'isKeychain'>,
  settings: PricingSettings3D,
  exchangeRate: ExchangeRateData
): number {
  const retailPrice = calculate3DRetailPrice(product, settings, exchangeRate);
  const discountPercent = product.isKeychain
    ? settings.wholesaleDiscountPercentKeychain
    : settings.wholesaleDiscountPercentNormal;
  return Math.ceil(retailPrice * (1 - discountPercent / 100));
}

// Calculate resale product prices
export function calculateResaleRetailPrice(
  purchaseCost: number,
  settings: PricingSettingsResale
): number {
  return Math.ceil(purchaseCost * (1 + settings.profitMarginPercent / 100));
}

export function calculateResaleWholesalePrice(
  purchaseCost: number,
  settings: PricingSettingsResale
): number {
  if (!settings.enableWholesale) return 0;
  const retailPrice = calculateResaleRetailPrice(purchaseCost, settings);
  return Math.ceil(retailPrice * (1 - settings.wholesaleDiscountPercent / 100));
}

// Get the effective price for a quantity considering tiers
export function getTierPrice(
  quantity: number,
  basePrice: number,
  tiers?: PriceTier[]
): number {
  if (!tiers || tiers.length === 0) return basePrice;

  // Find matching tier
  const matchingTier = tiers.find(t => quantity >= t.minQty && quantity <= t.maxQty);
  if (matchingTier) return matchingTier.unitPrice;

  // If quantity exceeds all tiers, use the last tier
  const sortedTiers = [...tiers].sort((a, b) => b.maxQty - a.maxQty);
  if (quantity > sortedTiers[0]?.maxQty) return sortedTiers[0].unitPrice;

  return basePrice;
}

// Validate that a tier price doesn't generate a loss
export function validateTierPrice(tierPrice: number, cost: number): boolean {
  return tierPrice > cost;
}
