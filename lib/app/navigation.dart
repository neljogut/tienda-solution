import 'package:flutter/material.dart';

import '../core/auth/permissions.dart';
import '../core/models/enums.dart';

class AppDestination {
  const AppDestination({
    required this.label,
    required this.path,
    required this.icon,
    this.permission,
    this.ownerOnly = false,
    this.clientOnly = false,
  });

  final String label;
  final String path;
  final IconData icon;
  final Permission? permission;
  final bool ownerOnly;
  final bool clientOnly;

  bool visibleFor(AppUser user) {
    if (path == '/catalog') return true;
    if (ownerOnly) return user.role == UserRole.owner;
    if (clientOnly) return user.role == UserRole.client;
    if (permission == null) return user.isAdmin;
    return user.has(permission!);
  }
}

const ownerDestinations = [
  AppDestination(
    label: 'Dashboard',
    path: '/dashboard',
    icon: Icons.dashboard_outlined,
    permission: Permission.viewDashboard,
  ),
  AppDestination(
    label: 'Catalogo',
    path: '/catalog',
    icon: Icons.storefront_outlined,
    permission: Permission.viewCatalog,
  ),
  AppDestination(
    label: 'Pedidos',
    path: '/orders',
    icon: Icons.receipt_long_outlined,
    permission: Permission.viewOrders,
  ),
  AppDestination(
    label: 'Clientes',
    path: '/clients',
    icon: Icons.people_alt_outlined,
    permission: Permission.viewClients,
  ),
  AppDestination(
    label: 'Cuenta corriente',
    path: '/accounts',
    icon: Icons.account_balance_wallet_outlined,
    permission: Permission.registerPayments,
  ),
  AppDestination(
    label: 'Inventario',
    path: '/inventory',
    icon: Icons.inventory_2_outlined,
    permission: Permission.viewInventory,
  ),
  AppDestination(
    label: 'Movimientos',
    path: '/inventory-movements',
    icon: Icons.swap_horiz_outlined,
    permission: Permission.viewInventoryMovements,
  ),
  AppDestination(
    label: 'Caja',
    path: '/cash',
    icon: Icons.point_of_sale_outlined,
    permission: Permission.viewCurrentCash,
  ),
  AppDestination(
    label: 'Balance',
    path: '/balance',
    icon: Icons.analytics_outlined,
    permission: Permission.viewBalance,
  ),
  AppDestination(
    label: 'Precios',
    path: '/pricing',
    icon: Icons.tune_outlined,
    permission: Permission.viewPricingSettings,
  ),
  AppDestination(
    label: 'Negocio',
    path: '/business',
    icon: Icons.apartment_outlined,
    ownerOnly: true,
  ),
  AppDestination(
    label: 'Empleados',
    path: '/staff',
    icon: Icons.admin_panel_settings_outlined,
    ownerOnly: true,
  ),
];

const clientDestinations = [
  AppDestination(
    label: 'Catalogo',
    path: '/catalog',
    icon: Icons.storefront_outlined,
  ),
  AppDestination(
    label: 'Mis pedidos',
    path: '/my-orders',
    icon: Icons.receipt_long_outlined,
    clientOnly: true,
  ),
  AppDestination(
    label: 'Mi cuenta',
    path: '/my-account',
    icon: Icons.account_balance_wallet_outlined,
    clientOnly: true,
  ),
  AppDestination(
    label: 'Mis pagos',
    path: '/my-payments',
    icon: Icons.payments_outlined,
    clientOnly: true,
  ),
  AppDestination(
    label: 'Mi perfil',
    path: '/profile',
    icon: Icons.person_outline,
    clientOnly: true,
  ),
];

List<AppDestination> destinationsFor(AppUser user) {
  if (user.role == UserRole.client) {
    return clientDestinations.where((item) => item.visibleFor(user)).toList();
  }
  return ownerDestinations.where((item) => item.visibleFor(user)).toList();
}
