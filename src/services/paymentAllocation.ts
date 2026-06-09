import type { Order, PaymentStatus } from '../types/order';

export interface OrderPaymentUpdate {
  orderId: string;
  paidAmount: number;
  pendingAmount: number;
  paymentStatus: PaymentStatus;
  appliedAmount: number;
  observationsInternal?: string;
}

export interface PaymentAllocationResult {
  orderUpdates: OrderPaymentUpdate[];
  totalApplied: number;
  remainingPayment: number;
}

/** Distribuye un monto entre pedidos impagos, del más antiguo al más reciente (FIFO). */
export function allocatePaymentFifo(
  orders: Order[],
  paymentAmount: number,
  observationPrefix = '[Pago Online]'
): PaymentAllocationResult {
  const sorted = [...orders]
    .filter((o) => o.paymentStatus === 'unpaid' || o.paymentStatus === 'partial')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let remainingPayment = paymentAmount;
  const orderUpdates: OrderPaymentUpdate[] = [];

  for (const order of sorted) {
    if (remainingPayment <= 0) break;

    const currentPending = order.pendingAmount || 0;
    const currentPaid = order.paidAmount || 0;
    if (currentPending <= 0) continue;

    let appliedAmount = 0;
    if (remainingPayment >= currentPending) {
      appliedAmount = currentPending;
      remainingPayment -= currentPending;
    } else {
      appliedAmount = remainingPayment;
      remainingPayment = 0;
    }

    const newPaid = currentPaid + appliedAmount;
    const newPending = Math.max(0, currentPending - appliedAmount);
    const newPaymentStatus: PaymentStatus = newPending === 0 ? 'paid' : 'partial';

    orderUpdates.push({
      orderId: order.id,
      paidAmount: newPaid,
      pendingAmount: newPending,
      paymentStatus: newPaymentStatus,
      appliedAmount,
      observationsInternal:
        (order.observationsInternal || '') +
        `\n${observationPrefix} $${appliedAmount.toLocaleString('es-AR')} abonado.`,
    });
  }

  return {
    orderUpdates,
    totalApplied: paymentAmount - remainingPayment,
    remainingPayment,
  };
}

/** Aplica un pago a un único pedido (checkout catálogo). */
export function allocatePaymentToOrder(
  order: Order,
  paymentAmount: number,
  observationPrefix = '[Pago Online]'
): OrderPaymentUpdate | null {
  if (paymentAmount <= 0) return null;

  const currentPending = order.pendingAmount || 0;
  const currentPaid = order.paidAmount || 0;
  const appliedAmount = Math.min(paymentAmount, currentPending);
  if (appliedAmount <= 0) return null;

  const newPaid = currentPaid + appliedAmount;
  const newPending = Math.max(0, currentPending - appliedAmount);
  const newPaymentStatus: PaymentStatus = newPending === 0 ? 'paid' : 'partial';

  return {
    orderId: order.id,
    paidAmount: newPaid,
    pendingAmount: newPending,
    paymentStatus: newPaymentStatus,
    appliedAmount,
    observationsInternal:
      (order.observationsInternal || '') +
      `\n${observationPrefix} $${appliedAmount.toLocaleString('es-AR')} abonado.`,
  };
}
