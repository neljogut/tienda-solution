import type { OrderStatus, PaymentStatus } from './order';

export type NotificationType =
  | 'new_order'
  | 'order_status'
  | 'order_payment'
  | 'order_updated';

export interface AppNotification {
  id: string;
  recipientUid: string;
  type: NotificationType;
  title: string;
  body: string;
  orderId: string;
  orderNumber: number;
  read: boolean;
  createdAt: string;
  linkPath: string;
  metadata?: {
    customerName?: string;
    orderStatus?: OrderStatus;
    paymentStatus?: PaymentStatus;
    totalAmount?: number;
    paidAmount?: number;
    pendingAmount?: number;
    itemsSummary?: string;
    previousOrderStatus?: OrderStatus;
    previousPaymentStatus?: PaymentStatus;
  };
}
