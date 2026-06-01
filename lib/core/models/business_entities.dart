import 'enums.dart';

class BusinessProduct {
  const BusinessProduct({
    required this.id,
    required this.name,
    required this.category,
    required this.description,
    required this.type,
    required this.status,
    required this.priceMode,
    required this.retailPrice,
    required this.stock,
    this.wholesalePrice,
    this.imageUrl,
    this.imageUrls = const [],
    this.weightGrams = 0,
    this.printMinutes = 0,
    this.isKeychain = false,
    this.purchaseCost = 0,
    this.estimatedProfit = 0,
  });

  final String id;
  final String name;
  final String category;
  final String description;
  final ProductType type;
  final ProductStatus status;
  final PriceMode priceMode;
  final int retailPrice;
  final int? wholesalePrice;
  final int stock;
  final String? imageUrl;
  final List<String> imageUrls;
  final double weightGrams;
  final double printMinutes;
  final bool isKeychain;
  final double purchaseCost;
  final double estimatedProfit;

  bool get isResale => type == ProductType.resale;
  bool get isPrinted3d => type == ProductType.printed3d;
  bool get isActive => status == ProductStatus.active;
  bool get hasStock => stock > 0;
  bool get manualPricing => priceMode == PriceMode.manual;
}

class BusinessClient {
  const BusinessClient({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.phone,
    this.email,
    this.address,
    this.city,
    this.province,
    this.postalCode,
    this.document,
    this.notes,
    this.trustedClient = false,
    this.totalDebt = 0,
    this.totalPurchased = 0,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String? phone;
  final String? email;
  final String? address;
  final String? city;
  final String? province;
  final String? postalCode;
  final String? document;
  final String? notes;
  final bool trustedClient;
  final int totalDebt;
  final int totalPurchased;

  String get fullName => '$firstName $lastName'.trim();
}

class BusinessOrderItem {
  const BusinessOrderItem({
    required this.productId,
    required this.productName,
    required this.productType,
    required this.quantity,
    required this.unitPrice,
    required this.costSnapshot,
    this.imageUrl,
    this.priceMode = PriceMode.automatic,
  });

  final String productId;
  final String productName;
  final ProductType productType;
  final int quantity;
  final int unitPrice;
  final Map<String, Object?> costSnapshot;
  final String? imageUrl;
  final PriceMode priceMode;

  int get subtotal => quantity * unitPrice;
}

class BusinessOrder {
  const BusinessOrder({
    required this.id,
    required this.number,
    required this.customerId,
    required this.customerName,
    required this.items,
    required this.createdAt,
    required this.orderStatus,
    required this.paymentStatus,
    required this.total,
    required this.paid,
    required this.exchangeRate,
    required this.exchangeRateUpdatedAt,
    this.notes,
  });

  final String id;
  final String number;
  final String customerId;
  final String customerName;
  final List<BusinessOrderItem> items;
  final DateTime createdAt;
  final OrderStatus orderStatus;
  final PaymentStatus paymentStatus;
  final int total;
  final int paid;
  final double exchangeRate;
  final DateTime exchangeRateUpdatedAt;
  final String? notes;

  int get pending => total - paid;
}

class BusinessCashSession {
  const BusinessCashSession({
    required this.id,
    required this.status,
    required this.openedAt,
    required this.openedBy,
    required this.initialCash,
    this.closedAt,
    this.closedBy,
    this.declaredCash,
    this.difference,
  });

  final String id;
  final CashSessionStatus status;
  final DateTime openedAt;
  final String openedBy;
  final int initialCash;
  final DateTime? closedAt;
  final String? closedBy;
  final int? declaredCash;
  final int? difference;
}
