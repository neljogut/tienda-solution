import 'enums.dart';

class MediaAsset {
  const MediaAsset({
    required this.url,
    required this.path,
    required this.contentType,
    this.isPrimary = false,
  });

  final String url;
  final String path;
  final String contentType;
  final bool isPrimary;
}

class ProductSummary {
  const ProductSummary({
    required this.id,
    required this.name,
    required this.category,
    required this.type,
    required this.status,
    required this.retailPrice,
    required this.stock,
    required this.priceMode,
    this.imageUrl,
    this.wholesalePrice,
    this.estimatedProfit,
  });

  final String id;
  final String name;
  final String category;
  final ProductType type;
  final ProductStatus status;
  final int retailPrice;
  final int? wholesalePrice;
  final int stock;
  final PriceMode priceMode;
  final String? imageUrl;
  final double? estimatedProfit;
}

class CustomerSummary {
  const CustomerSummary({
    required this.id,
    required this.fullName,
    required this.totalDebt,
    required this.pendingOrders,
    required this.trustedClient,
    this.phone,
    this.email,
    this.oldestPendingOrderAt,
  });

  final String id;
  final String fullName;
  final String? phone;
  final String? email;
  final int totalDebt;
  final int pendingOrders;
  final bool trustedClient;
  final DateTime? oldestPendingOrderAt;
}

class OrderSummary {
  const OrderSummary({
    required this.id,
    required this.number,
    required this.customerName,
    required this.createdAt,
    required this.total,
    required this.paid,
    required this.paymentStatus,
    required this.orderStatus,
  });

  final String id;
  final String number;
  final String customerName;
  final DateTime createdAt;
  final int total;
  final int paid;
  final PaymentStatus paymentStatus;
  final OrderStatus orderStatus;

  int get pending => total - paid;
}

class DashboardMetrics {
  const DashboardMetrics({
    required this.salesToday,
    required this.salesMonth,
    required this.pendingCollection,
    required this.pendingOrders,
    required this.inProgressOrders,
    required this.finishedOrders,
    required this.deliveredOrders,
    required this.cashOpen,
    this.exchangeRate,
    this.exchangeRateUpdatedAt,
  });

  final int salesToday;
  final int salesMonth;
  final int pendingCollection;
  final int pendingOrders;
  final int inProgressOrders;
  final int finishedOrders;
  final int deliveredOrders;
  final bool cashOpen;
  final double? exchangeRate;
  final DateTime? exchangeRateUpdatedAt;
}

class InventoryItemSummary {
  const InventoryItemSummary({
    required this.id,
    required this.name,
    required this.kind,
    required this.currentStock,
    required this.minimumStock,
    this.imageUrl,
    this.hexColor,
  });

  final String id;
  final String name;
  final String kind;
  final double currentStock;
  final double minimumStock;
  final String? imageUrl;
  final String? hexColor;

  bool get isLowStock => currentStock <= minimumStock;
}
