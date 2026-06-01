import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/domain_models.dart';
import '../models/enums.dart';
import 'firebase_collections.dart';

abstract class CatalogRepository {
  Stream<List<ProductSummary>> watchPublicProducts();
}

abstract class OrdersRepository {
  Stream<List<OrderSummary>> watchOrdersForCurrentScope();
}

abstract class CustomersRepository {
  Stream<List<CustomerSummary>> watchCustomersWithDebt();
}

abstract class DashboardRepository {
  Stream<DashboardMetrics?> watchDashboardMetrics();
}

abstract class InventoryRepository {
  Stream<List<InventoryItemSummary>> watchLowStockItems();
}

class EmptyCatalogRepository implements CatalogRepository {
  const EmptyCatalogRepository();

  @override
  Stream<List<ProductSummary>> watchPublicProducts() => Stream.value(const []);
}

class EmptyOrdersRepository implements OrdersRepository {
  const EmptyOrdersRepository();

  @override
  Stream<List<OrderSummary>> watchOrdersForCurrentScope() =>
      Stream.value(const []);
}

class EmptyCustomersRepository implements CustomersRepository {
  const EmptyCustomersRepository();

  @override
  Stream<List<CustomerSummary>> watchCustomersWithDebt() =>
      Stream.value(const []);
}

class EmptyDashboardRepository implements DashboardRepository {
  const EmptyDashboardRepository();

  @override
  Stream<DashboardMetrics?> watchDashboardMetrics() => Stream.value(null);
}

class EmptyInventoryRepository implements InventoryRepository {
  const EmptyInventoryRepository();

  @override
  Stream<List<InventoryItemSummary>> watchLowStockItems() =>
      Stream.value(const []);
}

class FirestoreCatalogRepository implements CatalogRepository {
  const FirestoreCatalogRepository(this.firestore);

  final FirebaseFirestore firestore;

  @override
  Stream<List<ProductSummary>> watchPublicProducts() {
    return firestore
        .collection(FirebaseCollections.products)
        .where('status', isEqualTo: ProductStatus.active.name)
        .snapshots()
        .map((snapshot) {
          final products = snapshot.docs
              .map(_productFromDoc)
              .whereType<ProductSummary>()
              .toList();
          products.sort(
            (a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()),
          );
          return products;
        });
  }

  ProductSummary? _productFromDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data();
    return ProductSummary(
      id: doc.id,
      name: _string(data['name']),
      category: _string(data['category']),
      type:
          _enumByName(ProductType.values, data['type']) ??
          ProductType.printed3d,
      status:
          _enumByName(ProductStatus.values, data['status']) ??
          ProductStatus.active,
      retailPrice: _int(data['retailPrice']),
      wholesalePrice: _nullableInt(data['wholesalePrice']),
      stock: _int(data['stock']),
      priceMode:
          _enumByName(PriceMode.values, data['priceMode']) ??
          PriceMode.automatic,
      imageUrl: _nullableString(data['imageUrl']),
      estimatedProfit: _nullableDouble(data['estimatedProfit']),
    );
  }
}

class FirestoreOrdersRepository implements OrdersRepository {
  const FirestoreOrdersRepository(this.firestore);

  final FirebaseFirestore firestore;

  @override
  Stream<List<OrderSummary>> watchOrdersForCurrentScope() {
    return firestore
        .collection(FirebaseCollections.orders)
        .orderBy('createdAt', descending: true)
        .limit(100)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs
              .map(_orderFromDoc)
              .whereType<OrderSummary>()
              .toList();
        });
  }

  OrderSummary? _orderFromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    final createdAt = data['createdAt'];
    return OrderSummary(
      id: doc.id,
      number: _string(data['number'], fallback: _shortId(doc.id)),
      customerName: _string(data['customerName'], fallback: 'Sin cliente'),
      createdAt: createdAt is Timestamp ? createdAt.toDate() : DateTime.now(),
      total: _int(data['total']),
      paid: _int(data['paid']),
      paymentStatus:
          _enumByName(PaymentStatus.values, data['paymentStatus']) ??
          PaymentStatus.unpaid,
      orderStatus:
          _enumByName(OrderStatus.values, data['orderStatus']) ??
          OrderStatus.pending,
    );
  }
}

class FirestoreCustomersRepository implements CustomersRepository {
  const FirestoreCustomersRepository(this.firestore);

  final FirebaseFirestore firestore;

  @override
  Stream<List<CustomerSummary>> watchCustomersWithDebt() {
    return firestore
        .collection(FirebaseCollections.customers)
        .where('totalDebt', isGreaterThan: 0)
        .orderBy('totalDebt', descending: true)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs
              .map(_customerFromDoc)
              .whereType<CustomerSummary>()
              .toList();
        });
  }

  CustomerSummary? _customerFromDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data();
    final oldest = data['oldestPendingOrderAt'];
    final computedName =
        '${_string(data['firstName'])} ${_string(data['lastName'])}'.trim();
    return CustomerSummary(
      id: doc.id,
      fullName: _string(data['fullName'], fallback: computedName),
      phone: _nullableString(data['phone']),
      email: _nullableString(data['email']),
      totalDebt: _int(data['totalDebt']),
      pendingOrders: _int(data['pendingOrders']),
      trustedClient: data['trustedClient'] == true,
      oldestPendingOrderAt: oldest is Timestamp ? oldest.toDate() : null,
    );
  }
}

class FirestoreDashboardRepository implements DashboardRepository {
  const FirestoreDashboardRepository(this.firestore);

  final FirebaseFirestore firestore;

  @override
  Stream<DashboardMetrics?> watchDashboardMetrics() {
    return firestore
        .collection(FirebaseCollections.businessSettings)
        .doc('dashboard_metrics')
        .snapshots()
        .map((doc) {
          if (!doc.exists) return null;
          final data = doc.data();
          if (data == null) return null;
          final exchangeUpdated = data['exchangeRateUpdatedAt'];
          return DashboardMetrics(
            salesToday: _int(data['salesToday']),
            salesMonth: _int(data['salesMonth']),
            pendingCollection: _int(data['pendingCollection']),
            pendingOrders: _int(data['pendingOrders']),
            inProgressOrders: _int(data['inProgressOrders']),
            finishedOrders: _int(data['finishedOrders']),
            deliveredOrders: _int(data['deliveredOrders']),
            cashOpen: data['cashOpen'] == true,
            exchangeRate: _nullableDouble(data['exchangeRate']),
            exchangeRateUpdatedAt: exchangeUpdated is Timestamp
                ? exchangeUpdated.toDate()
                : null,
          );
        });
  }
}

class FirestoreInventoryRepository implements InventoryRepository {
  const FirestoreInventoryRepository(this.firestore);

  final FirebaseFirestore firestore;

  @override
  Stream<List<InventoryItemSummary>> watchLowStockItems() {
    return firestore
        .collection(FirebaseCollections.supplies)
        .where('lowStock', isEqualTo: true)
        .limit(50)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs
              .map(_inventoryFromDoc)
              .whereType<InventoryItemSummary>()
              .toList();
        });
  }

  InventoryItemSummary? _inventoryFromDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data();
    return InventoryItemSummary(
      id: doc.id,
      name: _string(data['name']),
      kind: _string(data['kind'], fallback: 'Insumo'),
      currentStock: _double(data['currentStock']),
      minimumStock: _double(data['minimumStock']),
      imageUrl: _nullableString(data['imageUrl']),
      hexColor: _nullableString(data['hexColor']),
    );
  }
}

T? _enumByName<T extends Enum>(List<T> values, Object? raw) {
  final name = raw?.toString();
  if (name == null) return null;
  for (final value in values) {
    if (value.name == name) return value;
  }
  return null;
}

String _shortId(String value) =>
    value.length <= 8 ? value : value.substring(0, 8);

String _string(Object? raw, {String fallback = ''}) {
  final value = raw?.toString().trim();
  if (value == null || value.isEmpty) return fallback;
  return value;
}

String? _nullableString(Object? raw) {
  final value = raw?.toString().trim();
  if (value == null || value.isEmpty) return null;
  return value;
}

int _int(Object? raw) {
  if (raw is int) return raw;
  if (raw is num) return raw.round();
  return int.tryParse(raw?.toString() ?? '') ?? 0;
}

int? _nullableInt(Object? raw) {
  if (raw == null) return null;
  if (raw is int) return raw;
  if (raw is num) return raw.round();
  return int.tryParse(raw.toString());
}

double _double(Object? raw) {
  if (raw is num) return raw.toDouble();
  return double.tryParse(raw?.toString() ?? '') ?? 0;
}

double? _nullableDouble(Object? raw) {
  if (raw == null) return null;
  if (raw is num) return raw.toDouble();
  return double.tryParse(raw.toString());
}
