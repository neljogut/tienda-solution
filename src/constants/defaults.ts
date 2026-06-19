import type { PricingSettings3D, PricingSettingsResale, DepositSettings, PaymentSettings, BusinessSettings, PrintQueueSettings } from '../types/settings';

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
  "wholesaleThresholdGramsKeychain": 600,
  "employeeCommissionPercent": 10
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

export const defaultPaymentSettings: PaymentSettings = {
  bankTransfer: {
    alias: '',
    cbu: '',
    holderName: '',
    bankName: '',
    note: 'Enviá el comprobante por WhatsApp para registrar el pago.',
  },
  mercadopago: {
    enabled: false,
    publicKey: '',
    webhookConfigured: false,
  },
};

export const getDefaultBusinessSettings = (): BusinessSettings => {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (projectId === 'solution-3d') {
    return {
      name: 'Solution 3D',
      ownerName: 'Solution 3D',
      phone: '',
      email: 'contacto@solution3d.com',
      address: '',
      city: 'Venado Tuerto',
      province: 'Santa Fe',
      cuit: '',
      socialMedia: '@solution3d',
      description: 'Impresión 3D y Modelado Digital',
      imgbbApiKey: '',
      showEstimatedDeliveryDateToClient: true
    };
  }
  return {
    name: 'Dualgi 3D',
    ownerName: 'Maxi',
    phone: '+54 9 11 1234-5678',
    email: 'contacto@dualgi3d.com',
    address: 'Calle Falsa 123',
    city: 'Buenos Aires',
    province: 'CABA',
    cuit: '20-12345678-9',
    socialMedia: '@dualgi3d',
    description: 'Materializando tus ideas en 3D',
    imgbbApiKey: '',
    showEstimatedDeliveryDateToClient: true
  };
};

export const defaultPrintQueue: PrintQueueSettings = {
  printerCount: 1,
  workHoursPerDay: 8,
};
