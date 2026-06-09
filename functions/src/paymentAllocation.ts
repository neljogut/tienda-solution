type PaymentStatus = "unpaid" | "partial" | "paid";

export interface OrderLike {
  id: string;
  date: string;
  paidAmount?: number;
  pendingAmount?: number;
  paymentStatus: PaymentStatus;
  observationsInternal?: string;
}

export interface OrderPaymentUpdate {
  orderId: string;
  paidAmount: number;
  pendingAmount: number;
  paymentStatus: PaymentStatus;
  appliedAmount: number;
  observationsInternal?: string;
}

export function allocatePaymentFifo(
  orders: OrderLike[],
  paymentAmount: number,
  observationPrefix = "[Pago Online]"
): {orderUpdates: OrderPaymentUpdate[]; totalApplied: number} {
  const sorted = orders
    .filter((o) => o.paymentStatus === "unpaid" || o.paymentStatus === "partial")
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
    const newPaymentStatus: PaymentStatus = newPending === 0 ? "paid" : "partial";

    orderUpdates.push({
      orderId: order.id,
      paidAmount: newPaid,
      pendingAmount: newPending,
      paymentStatus: newPaymentStatus,
      appliedAmount,
      observationsInternal:
        (order.observationsInternal || "") +
        `\n${observationPrefix} $${appliedAmount.toLocaleString("es-AR")} abonado.`,
    });
  }

  return {orderUpdates, totalApplied: paymentAmount - remainingPayment};
}

export function allocatePaymentToOrder(
  order: OrderLike,
  paymentAmount: number,
  observationPrefix = "[Pago Online]"
): OrderPaymentUpdate | null {
  if (paymentAmount <= 0) return null;

  const currentPending = order.pendingAmount || 0;
  const currentPaid = order.paidAmount || 0;
  const appliedAmount = Math.min(paymentAmount, currentPending);
  if (appliedAmount <= 0) return null;

  const newPaid = currentPaid + appliedAmount;
  const newPending = Math.max(0, currentPending - appliedAmount);
  const newPaymentStatus: PaymentStatus = newPending === 0 ? "paid" : "partial";

  return {
    orderId: order.id,
    paidAmount: newPaid,
    pendingAmount: newPending,
    paymentStatus: newPaymentStatus,
    appliedAmount,
    observationsInternal:
      (order.observationsInternal || "") +
      `\n${observationPrefix} $${appliedAmount.toLocaleString("es-AR")} abonado.`,
  };
}
