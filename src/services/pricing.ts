import type { Product3D, ProductResale } from '../types/product';
import type { PricingSettings3D, PricingSettingsResale } from '../types/settings';
import { default3D, defaultResale } from '../constants/defaults';

export const default3DSettings = default3D;
export const defaultResaleSettings = defaultResale;

export const calculate3DPrice = (
  product: Partial<Product3D>, 
  settings: PricingSettings3D, 
  exchangeRate: number, 
  suppliesCostArs: number = 0
) => {
  const weight = product.weightGrams || 0;
  const timeMins = product.printTimeMinutes || 0;
  const isKeychain = !!product.isKeychain;

  const filamentCurrency = settings.filamentPriceCurrency ?? 'USD';
  const filamentPriceArsKg = filamentCurrency === 'USD' 
    ? settings.filamentPriceUsdKg * exchangeRate 
    : settings.filamentPriceUsdKg;

  const costFilament = (weight / 1000) * filamentPriceArsKg;
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

  // Round to multiple of 100 for selling prices, keep cost as rounded integer
  return {
    cost: Math.round(realCost),
    retailPrice: Math.ceil(retailPrice / 100) * 100,
    wholesalePrice: Math.ceil((wholesalePrice > 0 ? wholesalePrice : retailPrice) / 100) * 100,
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
    retailPrice: Math.ceil(retailPrice / 100) * 100,
    wholesalePrice: Math.ceil(wholesalePrice / 100) * 100,
    hasWholesale: settings.enableWholesale
  };
};
