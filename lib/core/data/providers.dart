import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';

import '../auth/permissions.dart';
import 'app_repositories.dart';

final currentUserProvider = Provider<AppUser>((ref) => guestUser);

final catalogRepositoryProvider = Provider<CatalogRepository>((ref) {
  if (Firebase.apps.isNotEmpty) {
    return FirestoreCatalogRepository(FirebaseFirestore.instance);
  }
  return const EmptyCatalogRepository();
});

final ordersRepositoryProvider = Provider<OrdersRepository>((ref) {
  if (Firebase.apps.isNotEmpty) {
    return FirestoreOrdersRepository(FirebaseFirestore.instance);
  }
  return const EmptyOrdersRepository();
});

final customersRepositoryProvider = Provider<CustomersRepository>((ref) {
  if (Firebase.apps.isNotEmpty) {
    return FirestoreCustomersRepository(FirebaseFirestore.instance);
  }
  return const EmptyCustomersRepository();
});

final dashboardRepositoryProvider = Provider<DashboardRepository>((ref) {
  if (Firebase.apps.isNotEmpty) {
    return FirestoreDashboardRepository(FirebaseFirestore.instance);
  }
  return const EmptyDashboardRepository();
});

final inventoryRepositoryProvider = Provider<InventoryRepository>((ref) {
  if (Firebase.apps.isNotEmpty) {
    return FirestoreInventoryRepository(FirebaseFirestore.instance);
  }
  return const EmptyInventoryRepository();
});
