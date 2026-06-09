import type { PaymentMethod } from './order';

export type PaymentIntentType = 'catalog' | 'balance';
export type PaymentIntentMethod = 'mercadopago' | 'transfer' | 'none';
export type PaymentIntentStatus = 'pending' | 'approved' | 'rejected' | 'declared';

export interface PaymentIntent {
  id: string;
  type: PaymentIntentType;
  customerId: string;
  orderId?: string;
  amount: number;
  method: PaymentIntentMethod;
  status: PaymentIntentStatus;
  mpPreferenceId?: string;
  mpPaymentId?: string;
  createdAt: string;
  createdBy: string;
}

export interface OnlinePayment {
  id: string;
  paymentIntentId: string;
  customerId: string;
  orderId?: string;
  amount: number;
  method: PaymentMethod;
  mpPaymentId?: string;
  type: PaymentIntentType;
  createdAt: string;
  note?: string;
}
