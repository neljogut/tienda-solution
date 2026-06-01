import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/permissions.dart';
import 'app_repositories.dart';

final currentUserProvider = Provider<AppUser>((ref) => guestUser);

final catalogRepositoryProvider = Provider<CatalogRepository>((ref) {
  return const EmptyCatalogRepository();
});

final ordersRepositoryProvider = Provider<OrdersRepository>((ref) {
  return const EmptyOrdersRepository();
});

final customersRepositoryProvider = Provider<CustomersRepository>((ref) {
  return const EmptyCustomersRepository();
});

final dashboardRepositoryProvider = Provider<DashboardRepository>((ref) {
  return const EmptyDashboardRepository();
});

final inventoryRepositoryProvider = Provider<InventoryRepository>((ref) {
  return const EmptyInventoryRepository();
});
