"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.allocatePaymentFifo = allocatePaymentFifo;
exports.allocatePaymentToOrder = allocatePaymentToOrder;
function allocatePaymentFifo(orders, paymentAmount, observationPrefix = "[Pago Online]") {
    const sorted = orders
        .filter((o) => o.paymentStatus === "unpaid" || o.paymentStatus === "partial")
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let remainingPayment = paymentAmount;
    const orderUpdates = [];
    for (const order of sorted) {
        if (remainingPayment <= 0)
            break;
        const currentPending = order.pendingAmount || 0;
        const currentPaid = order.paidAmount || 0;
        if (currentPending <= 0)
            continue;
        let appliedAmount = 0;
        if (remainingPayment >= currentPending) {
            appliedAmount = currentPending;
            remainingPayment -= currentPending;
        }
        else {
            appliedAmount = remainingPayment;
            remainingPayment = 0;
        }
        const newPaid = currentPaid + appliedAmount;
        const newPending = Math.max(0, currentPending - appliedAmount);
        const newPaymentStatus = newPending === 0 ? "paid" : "partial";
        orderUpdates.push({
            orderId: order.id,
            paidAmount: newPaid,
            pendingAmount: newPending,
            paymentStatus: newPaymentStatus,
            appliedAmount,
            observationsInternal: (order.observationsInternal || "") +
                `\n${observationPrefix} $${appliedAmount.toLocaleString("es-AR")} abonado.`,
        });
    }
    return { orderUpdates, totalApplied: paymentAmount - remainingPayment };
}
function allocatePaymentToOrder(order, paymentAmount, observationPrefix = "[Pago Online]") {
    if (paymentAmount <= 0)
        return null;
    const currentPending = order.pendingAmount || 0;
    const currentPaid = order.paidAmount || 0;
    const appliedAmount = Math.min(paymentAmount, currentPending);
    if (appliedAmount <= 0)
        return null;
    const newPaid = currentPaid + appliedAmount;
    const newPending = Math.max(0, currentPending - appliedAmount);
    const newPaymentStatus = newPending === 0 ? "paid" : "partial";
    return {
        orderId: order.id,
        paidAmount: newPaid,
        pendingAmount: newPending,
        paymentStatus: newPaymentStatus,
        appliedAmount,
        observationsInternal: (order.observationsInternal || "") +
            `\n${observationPrefix} $${appliedAmount.toLocaleString("es-AR")} abonado.`,
    };
}
//# sourceMappingURL=paymentAllocation.js.map