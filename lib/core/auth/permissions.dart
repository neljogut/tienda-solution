import '../models/enums.dart';

enum Permission {
  viewDashboard,
  viewOrders,
  createOrders,
  editOrders,
  changeOrderStatus,
  registerPayments,
  viewClients,
  createClients,
  editClients,
  viewCatalog,
  createProducts,
  editProducts,
  uploadImages,
  editImages,
  deleteImages,
  viewInventory,
  modifyInventory,
  viewInventoryMovements,
  openCash,
  closeCash,
  viewCurrentCash,
  viewCashHistory,
  viewBalance,
  viewProfits,
  viewPricingSettings,
  viewInternalPdfs,
  downloadInternalPdfs,
  downloadBalancePdfs,
  viewManualPriceBadges,
  manageBusinessSettings,
  manageEmployees,
}

class AppUser {
  const AppUser({
    required this.uid,
    required this.role,
    this.displayName,
    this.permissions = const {},
    this.customerId,
    this.trustedClient = false,
  });

  final String uid;
  final UserRole role;
  final String? displayName;
  final Set<Permission> permissions;
  final String? customerId;
  final bool trustedClient;

  bool has(Permission permission) {
    if (role == UserRole.owner) return true;
    if (role == UserRole.employee) return permissions.contains(permission);
    return switch (permission) {
      Permission.viewCatalog => true,
      _ => false,
    };
  }

  bool get isAdmin => role == UserRole.owner || role == UserRole.employee;
}

const guestUser = AppUser(
  uid: 'guest',
  role: UserRole.guest,
  displayName: 'Invitado',
);

class PermissionGuard {
  const PermissionGuard();

  bool canCreateOrderForCustomer(AppUser user, String customerId) {
    if (user.role == UserRole.client) return user.customerId == customerId;
    return user.has(Permission.createOrders);
  }

  bool canViewOrder(AppUser user, String customerId) {
    if (user.role == UserRole.client) return user.customerId == customerId;
    return user.has(Permission.viewOrders);
  }

  bool canSeeFinancials(AppUser user) {
    return user.role == UserRole.owner || user.has(Permission.viewProfits);
  }
}
