export interface PricingSettings3D {
  filamentPriceUsdKg: number;
  kwhPriceArs: number;
  printerWatts: number;
  printerLifespanHours: number;
  estimatedSparesCostArs: number;
  errorMarginPercent: number;
  multiplierRetailNormal: number;
  multiplierRetailKeychain: number;
  wholesaleDiscountPercentNormal: number;
  wholesaleDiscountPercentKeychain: number;
  wholesaleThresholdGramsNormal: number;
  wholesaleThresholdGramsKeychain: number;
  employeeCommissionPercent?: number;
}

export interface PricingSettingsResale {
  profitMarginPercent: number;
  enableWholesale: boolean;
  wholesaleDiscountPercent: number;
  wholesaleMinimumOrderArs: number;
}

export interface ExchangeRateData {
  currentUsdToArs: number;
  lastUpdate: string;
  provider: string;
}

export interface DepositSettings {
  requiredDepositPercent: number; // e.g. 30 means 30%
  trustedClientBypassDeposit: boolean; // trusted clients can pay any amount or $0
  note?: string;
}

export interface BusinessSettings {
  name: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  province: string;
  cuit: string;
  socialMedia: string;
  description: string;
  logoUrl?: string;
  instagram?: string;
  tiktok?: string;
  whatsapp?: string;
}

export interface BankTransferSettings {
  alias: string;
  cbu: string;
  holderName: string;
  bankName?: string;
  note?: string;
}

export interface MercadoPagoSettings {
  enabled: boolean;
  publicKey: string;
  webhookConfigured?: boolean;
  lastWebhookAt?: string;
  commissionPercent?: number;
}

export interface PaymentSettings {
  bankTransfer: BankTransferSettings;
  mercadopago: MercadoPagoSettings;
}
