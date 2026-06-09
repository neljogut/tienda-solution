import type { ProductType } from './product';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type OrderStatus = 'pending' | 'processing' | 'finished' | 'delivered' | 'cancelled';
export type PaymentMethod = 'cash' | 'transfer' | 'mercadopago' | 'card' | 'other';

export interface OrderItem {
  productId: string;
  name: string;
  type: ProductType;
  quantity: number;
  
  // Frozen snapshot prices
  unitPrice: number; 
  appliedWholesale: boolean;
  
  // Frozen snapshot costs (Internal use)
  unitCost: number;
  unitProfit: number;
  
  imageUrl?: string;
  isManualPrice: boolean;
}

export interface Order {
  id: string;
  orderNumber: number; // sequential
  customerId: string; // references user doc or manual client
  customerName: string;
  date: string;
  
  items: OrderItem[];
  
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  paymentMethod?: PaymentMethod;
  mpPreferenceId?: string;
  mpPaymentId?: string;
  
  observationsPublic: string;
  observationsInternal: string;
  
  deliveryDate?: string;
  
  // Frozen Exchange Rate
  exchangeRateUsdUsed: number;
  exchangeRateDate: string;
  
  // Global totals (Internal use)
  totalCost: number;
  totalProfit: number;
}
