import type { PricingSettings3D, PricingSettingsResale, ExchangeRateData } from '../types/settings';
import type { Product, Product3D, ProductResale, PriceTier, FilamentLine, SupplyLine } from '../types/product';
import { getFilamentPriceUsdKg } from '../types/inventory';
import { doc, getDoc, getDocs, collection, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { default3D, defaultResale } from '../constants/defaults';

type InventoryItem = {
  type?: string;
  priceUsdKg?: number;
  unitCostArs?: number;
};

/** USD/kg del filamento: personalizado si existe, si no el de Parámetros de precios. */
function filamentPricePerGramArs(
  filamentId: string | undefined,
  settings: PricingSettings3D,
  exchangeRate: ExchangeRateData,
  inventoryMap?: Map<string, InventoryItem>
): number {
  const item = filamentId ? inventoryMap?.get(filamentId) : undefined;
  const usdKg = getFilamentPriceUsdKg(
    { priceUsdKg: item?.priceUsdKg },
    settings.filamentPriceUsdKg
  );
  return (usdKg * exchangeRate.currentUsdToArs) / 1000;
}

function suppliesCostArs(
  supplyIds: SupplyLine[] | undefined,
  inventoryMap?: Map<string, InventoryItem>
): number {
  if (!supplyIds?.length) return 0;
  return supplyIds.reduce((sum, line) => {
    const item = inventoryMap?.get(line.supplyId);
    const unit = item?.unitCostArs ?? 0;
    return sum + unit * (line.quantity || 1);
  }, 0);
}

function filamentCostArs(
  product: Pick<Product3D, 'weightGrams' | 'filamentLines' | 'filamentIds'>,
  settings: PricingSettings3D,
  exchangeRate: ExchangeRateData,
  inventoryMap?: Map<string, InventoryItem>
): number {
  const lines: FilamentLine[] = product.filamentLines?.length
    ? product.filamentLines
    : (product.filamentIds ?? []).map((id) => ({
        supplyId: id,
        grams: product.weightGrams / Math.max(1, product.filamentIds.length),
      }));

  if (lines.length > 0) {
    return lines.reduce(
      (sum, line) => sum + line.grams * filamentPricePerGramArs(line.supplyId, settings, exchangeRate, inventoryMap),
      0
    );
  }

  return product.weightGrams * filamentPricePerGramArs(undefined, settings, exchangeRate, inventoryMap);
}

export function roundPriceUp10(value: number): number {
  if (isNaN(value) || !isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / 10) * 10;
}

// Calculate cost for a 3D printed product (filamento, insumos, energía, mantenimiento)
export function calculate3DCost(
  product: Pick<Product3D, 'weightGrams' | 'printTimeMinutes' | 'filamentLines' | 'filamentIds' | 'supplyIds'>,
  settings: PricingSettings3D,
  exchangeRate: ExchangeRateData,
  inventoryMap?: Map<string, InventoryItem>
): number {
  const filamentCost = filamentCostArs(product, settings, exchangeRate, inventoryMap);
  const suppliesCost = suppliesCostArs(product.supplyIds, inventoryMap);

  const printerWattsToKw = settings.printerWatts / 1000;
  const printTimeHours = product.printTimeMinutes / 60;
  const electricityCost = printerWattsToKw * printTimeHours * settings.kwhPriceArs;

  const maintenanceCostPerHour = settings.estimatedSparesCostArs / settings.printerLifespanHours;
  const maintenanceCost = maintenanceCostPerHour * printTimeHours;

  const subtotal = filamentCost + electricityCost + maintenanceCost;
  const errorMargin = subtotal * (settings.errorMarginPercent / 100);

  return Math.ceil(subtotal + errorMargin + suppliesCost);
}

// Calculate retail price for a 3D product
export function calculate3DRetailPrice(
  product: Pick<Product3D, 'weightGrams' | 'printTimeMinutes' | 'category' | 'isKeychain' | 'filamentLines' | 'filamentIds' | 'supplyIds'>,
  settings: PricingSettings3D,
  exchangeRate: ExchangeRateData,
  inventoryMap?: Map<string, InventoryItem>
): number {
  const filamentCost = filamentCostArs(product, settings, exchangeRate, inventoryMap);
  const suppliesCost = suppliesCostArs(product.supplyIds, inventoryMap);

  const printerWattsToKw = settings.printerWatts / 1000;
  const printTimeHours = product.printTimeMinutes / 60;
  const electricityCost = printerWattsToKw * printTimeHours * settings.kwhPriceArs;

  const maintenanceCostPerHour = settings.estimatedSparesCostArs / settings.printerLifespanHours;
  const maintenanceCost = maintenanceCostPerHour * printTimeHours;

  const subtotal = filamentCost + electricityCost + maintenanceCost;
  const errorMargin = subtotal * (settings.errorMarginPercent / 100);

  const isKeychain = product.category === 'Llaveros';
  const multiplier = isKeychain ? settings.multiplierRetailKeychain : settings.multiplierRetailNormal;
  const rawRetail = (subtotal + errorMargin) * multiplier + suppliesCost;
  return roundPriceUp10(rawRetail);
}

// Calculate wholesale price for a 3D product
export function calculate3DWholesalePrice(
  product: Pick<Product3D, 'weightGrams' | 'printTimeMinutes' | 'category' | 'isKeychain' | 'filamentLines' | 'filamentIds' | 'supplyIds'>,
  settings: PricingSettings3D,
  exchangeRate: ExchangeRateData,
  inventoryMap?: Map<string, InventoryItem>
): number {
  const retailPrice = calculate3DRetailPrice(product, settings, exchangeRate, inventoryMap);
  const isKeychain = product.category === 'Llaveros';
  const discountPercent = isKeychain
    ? settings.wholesaleDiscountPercentKeychain
    : settings.wholesaleDiscountPercentNormal;
  const rawWholesale = retailPrice * (1 - discountPercent / 100);
  return roundPriceUp10(rawWholesale);
}

// Calculate resale product prices
export function calculateResaleRetailPrice(
  purchaseCost: number,
  settings: PricingSettingsResale
): number {
  const rawRetail = purchaseCost * (1 + settings.profitMarginPercent / 100);
  return roundPriceUp10(rawRetail);
}

export function calculateResaleWholesalePrice(
  purchaseCost: number,
  settings: PricingSettingsResale
): number {
  if (!settings.enableWholesale) return 0;
  const retailPrice = calculateResaleRetailPrice(purchaseCost, settings);
  const rawWholesale = retailPrice * (1 - settings.wholesaleDiscountPercent / 100);
  return roundPriceUp10(rawWholesale);
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

/** Precio minorista en ARS para catálogo: manual del producto o calculado al vuelo. */
export function resolveProductRetailPrice(
  product: Product,
  settings3d: PricingSettings3D,
  settingsResale: PricingSettingsResale,
  exchangeRate: ExchangeRateData,
  inventoryMap?: Map<string, InventoryItem>
): number {
  if (product.useManualPrice) {
    return product.manualRetailPrice ?? 0;
  }
  if (product.type === '3d') {
    return calculate3DRetailPrice(product, settings3d, exchangeRate, inventoryMap);
  }
  return calculateResaleRetailPrice(product.purchaseCost ?? 0, settingsResale);
}

/** Costo en ARS (admin / margen). Respeta precios de filamento personalizados. */
export function resolveProductCost(
  product: Product,
  settings3d: PricingSettings3D,
  _settingsResale: PricingSettingsResale,
  exchangeRate: ExchangeRateData,
  inventoryMap?: Map<string, InventoryItem>
): number {
  if (product.type === '3d') {
    return calculate3DCost(product, settings3d, exchangeRate, inventoryMap);
  }
  return product.purchaseCost ?? 0;
}

// Recalculate all products in Firestore when pricing settings or exchange rate change
export async function recalculateAllProductsInFirestore(): Promise<number> {
  try {
    const [snap3D, snapResale, snapRate] = await Promise.all([
      getDoc(doc(db, 'settings', 'pricing3d')),
      getDoc(doc(db, 'settings', 'pricingResale')),
      getDoc(doc(db, 'settings', 'exchangeRate'))
    ]);

    const settings3d = snap3D.exists() ? ({ ...default3D, ...snap3D.data() } as PricingSettings3D) : default3D;
    const settingsResale = snapResale.exists() ? ({ ...defaultResale, ...snapResale.data() } as PricingSettingsResale) : defaultResale;
    const exchangeRate = snapRate.exists() ? (snapRate.data() as ExchangeRateData) : { currentUsdToArs: 1000, lastUpdate: '', provider: 'Fallback' };

    const [querySnapshot, invSnap] = await Promise.all([
      getDocs(collection(db, 'products')),
      getDocs(collection(db, 'inventory')),
    ]);
    const inventoryMap = new Map<string, InventoryItem>();
    invSnap.forEach((d) => inventoryMap.set(d.id, d.data() as InventoryItem));

    const batch = writeBatch(db);
    let count = 0;

    querySnapshot.forEach((document) => {
      const product = document.data();
      let cost = product.calculatedCost || 0;
      let retail = product.calculatedRetailPrice || 0;
      let wholesale = product.calculatedWholesalePrice || 0;

      if (product.type === '3d') {
        const prod3d = product as Product3D;
        cost = calculate3DCost(prod3d, settings3d, exchangeRate, inventoryMap);
        retail = calculate3DRetailPrice(prod3d, settings3d, exchangeRate, inventoryMap);
        if (prod3d.useManualPrice && prod3d.manualRetailPrice) {
          const discountPercent = (prod3d.category === 'Llaveros')
            ? settings3d.wholesaleDiscountPercentKeychain
            : settings3d.wholesaleDiscountPercentNormal;
          wholesale = roundPriceUp10(prod3d.manualRetailPrice * (1 - discountPercent / 100));
        } else {
          wholesale = calculate3DWholesalePrice(prod3d, settings3d, exchangeRate, inventoryMap);
        }
      } else if (product.type === 'resale') {
        const prodResale = product as ProductResale;
        const purchaseCost = prodResale.purchaseCost || 0;
        cost = purchaseCost;
        retail = calculateResaleRetailPrice(purchaseCost, settingsResale);
        if (prodResale.useManualPrice && prodResale.manualRetailPrice) {
          wholesale = roundPriceUp10(prodResale.manualRetailPrice * (1 - (settingsResale.wholesaleDiscountPercent || 0) / 100));
        } else {
          wholesale = calculateResaleWholesalePrice(purchaseCost, settingsResale);
        }
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
