import 'dart:async';

import '../models/domain_models.dart';

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
