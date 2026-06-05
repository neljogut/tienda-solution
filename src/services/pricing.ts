import type { PricingSettings3D, PricingSettingsResale } from '../types/settings';
import type { Product3D, ProductResale } from '../types/product';

// Mock default settings for now, later fetched from Firestore
export const default3DSettings: PricingSettings3D = {
  filamentPriceUsdKg: 20,
  kwhPriceArs: 150,
  printerWatts: 300,
  printerLifespanHours: 5000,
  estimatedSparesCostArs: 50000,
  errorMarginPercent: 10,
  multiplierRetailNormal: 3.5,
  multiplierRetailKeychain: 4.5,
  wholesaleDiscountPercentNormal: 25,
  wholesaleDiscountPercentKeychain: 30,
  wholesaleThresholdGramsNormal: 500,
  wholesaleThresholdGramsKeychain: 200,
};

export const defaultResaleSettings: PricingSettingsResale = {
  profitMarginPercent: 40,
  enableWholesale: true,
  wholesaleDiscountPercent: 15,
  wholesaleMinimumOrderArs: 20000,
};

export const calculate3DPrice = (
  product: Partial<Product3D>, 
  settings: PricingSettings3D, 
  exchangeRate: number, 
  suppliesCostArs: number = 0
) => {
  const weight = product.weightGrams || 0;
  const timeMins = product.printTimeMinutes || 0;
  const isKeychain = !!product.isKeychain;

  const costFilament = (weight / 1000) * settings.filamentPriceUsdKg * exchangeRate;
  const costElectricity = (timeMins / 60) * (settings.printerWatts / 1000) * settings.kwhPriceArs;
  const costMaintenance = (timeMins / 60) * (settings.estimatedSparesCostArs / settings.printerLifespanHours);
  
  const baseCost = costFilament + costElectricity + costMaintenance + suppliesCostArs;
  const realCost = baseCost * (1 + settings.errorMarginPercent / 100);

  let retailPrice = 0;
  let wholesalePrice = 0;

  if (isKeychain) {
    retailPrice = realCost * settings.multiplierRetailKeychain;
    if (weight >= settings.wholesaleThresholdGramsKeychain) {
      wholesalePrice = retailPrice * (1 - settings.wholesaleDiscountPercentKeychain / 100);
    }
  } else {
    retailPrice = realCost * settings.multiplierRetailNormal;
    if (weight >= settings.wholesaleThresholdGramsNormal) {
      wholesalePrice = retailPrice * (1 - settings.wholesaleDiscountPercentNormal / 100);
    }
  }

  // Round to integer
  return {
    cost: Math.round(realCost),
    retailPrice: Math.round(retailPrice),
    wholesalePrice: Math.round(wholesalePrice > 0 ? wholesalePrice : retailPrice),
    hasWholesale: wholesalePrice > 0
  };
};

export const calculateResalePrice = (
  product: Partial<ProductResale>, 
  settings: PricingSettingsResale
) => {
  const cost = product.purchaseCost || 0;
  const retailPrice = cost * (1 + settings.profitMarginPercent / 100);
  
  let wholesalePrice = retailPrice;
  if (settings.enableWholesale) {
    wholesalePrice = retailPrice * (1 - settings.wholesaleDiscountPercent / 100);
  }

  return {
    cost: Math.round(cost),
    retailPrice: Math.round(retailPrice),
    wholesalePrice: Math.round(wholesalePrice),
    hasWholesale: settings.enableWholesale
  };
};
