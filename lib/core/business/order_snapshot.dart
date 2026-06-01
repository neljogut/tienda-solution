import '../models/enums.dart';
import '../models/pricing_models.dart';

class OrderItemSnapshot {
  const OrderItemSnapshot({
    required this.productId,
    required this.productName,
    required this.productType,
    required this.quantity,
    required this.unitPrice,
    required this.appliedPriceTier,
    required this.exchangeRate,
    required this.exchangeRateUpdatedAt,
    required this.pricing,
    this.imageUrl,
  });

  final String productId;
  final String productName;
  final ProductType productType;
  final int quantity;
  final int unitPrice;
  final String appliedPriceTier;
  final double exchangeRate;
  final DateTime exchangeRateUpdatedAt;
  final PricingBreakdown pricing;
  final String? imageUrl;

  int get subtotal => unitPrice * quantity;

  Map<String, Object?> toMap() => {
    'productId': productId,
    'productName': productName,
    'productType': productType.name,
    'quantity': quantity,
    'unitPrice': unitPrice,
    'appliedPriceTier': appliedPriceTier,
    'exchangeRate': exchangeRate,
    'exchangeRateUpdatedAt': exchangeRateUpdatedAt.toIso8601String(),
    'pricing': pricing.toSnapshot(),
    'imageUrl': imageUrl,
    'subtotal': subtotal,
  };
}
