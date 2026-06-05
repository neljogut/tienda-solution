import type { PricingSettings3D, PricingSettingsResale, DepositSettings } from '../types/settings';

export const default3D: PricingSettings3D = {
  "filamentPriceUsdKg": 9.68,
  "kwhPriceArs": 150,
  "printerWatts": 120,
  "printerLifespanHours": 4320,
  "estimatedSparesCostArs": 150000,
  "errorMarginPercent": 8,
  "multiplierRetailNormal": 3,
  "multiplierRetailKeychain": 4,
  "wholesaleDiscountPercentNormal": 15,
  "wholesaleDiscountPercentKeychain": 10,
  "wholesaleThresholdGramsNormal": 1000,
  "wholesaleThresholdGramsKeychain": 600
};

export const defaultResale: PricingSettingsResale = {
  "profitMarginPercent": 30,
  "enableWholesale": true,
  "wholesaleDiscountPercent": 10,
  "wholesaleMinimumOrderArs": 200000
};

export const defaultDeposit: DepositSettings = {
  "requiredDepositPercent": 30,
  "trustedClientBypassDeposit": true,
  "note": "Los clientes de confianza pueden omitir la seña."
};
