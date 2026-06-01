class PendingOrderDebt {
  const PendingOrderDebt({
    required this.orderId,
    required this.createdAt,
    required this.pendingAmount,
  });

  final String orderId;
  final DateTime createdAt;
  final int pendingAmount;
}

class PaymentAllocation {
  const PaymentAllocation({required this.orderId, required this.amount});

  final String orderId;
  final int amount;
}

class AccountsEngine {
  const AccountsEngine();

  List<PaymentAllocation> allocatePaymentOldestFirst({
    required int paymentAmount,
    required List<PendingOrderDebt> debts,
  }) {
    if (paymentAmount <= 0) return const [];
    final sortedDebts = [...debts]
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    var remaining = paymentAmount;
    final allocations = <PaymentAllocation>[];

    for (final debt in sortedDebts) {
      if (remaining <= 0) break;
      if (debt.pendingAmount <= 0) continue;

      final applied = remaining >= debt.pendingAmount
          ? debt.pendingAmount
          : remaining;
      allocations.add(
        PaymentAllocation(orderId: debt.orderId, amount: applied),
      );
      remaining -= applied;
    }

    return allocations;
  }
}
