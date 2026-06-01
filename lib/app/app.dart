import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme/app_theme.dart';
import '../features/balance/balance_screen.dart';
import '../features/cash/cash_screen.dart';
import '../features/catalog/catalog_screen.dart';
import '../features/clients/accounts_screen.dart';
import '../features/clients/clients_screen.dart';
import '../features/dashboard/dashboard_screen.dart';
import '../features/inventory/inventory_movements_screen.dart';
import '../features/inventory/inventory_screen.dart';
import '../features/orders/orders_screen.dart';
import '../features/settings/business_settings_screen.dart';
import '../features/settings/pricing_settings_screen.dart';
import '../features/staff/staff_screen.dart';
import 'app_shell.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/catalog',
    routes: [
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(
            path: '/catalog',
            builder: (context, state) => const CatalogScreen(),
          ),
          GoRoute(
            path: '/dashboard',
            builder: (context, state) => const DashboardScreen(),
          ),
          GoRoute(
            path: '/orders',
            builder: (context, state) => const OrdersScreen(),
          ),
          GoRoute(
            path: '/my-orders',
            builder: (context, state) => const OrdersScreen(clientMode: true),
          ),
          GoRoute(
            path: '/clients',
            builder: (context, state) => const ClientsScreen(),
          ),
          GoRoute(
            path: '/accounts',
            builder: (context, state) => const AccountsScreen(),
          ),
          GoRoute(
            path: '/my-account',
            builder: (context, state) => const AccountsScreen(clientMode: true),
          ),
          GoRoute(
            path: '/my-payments',
            builder: (context, state) =>
                const AccountsScreen(clientMode: true, paymentsOnly: true),
          ),
          GoRoute(
            path: '/inventory',
            builder: (context, state) => const InventoryScreen(),
          ),
          GoRoute(
            path: '/inventory-movements',
            builder: (context, state) => const InventoryMovementsScreen(),
          ),
          GoRoute(
            path: '/cash',
            builder: (context, state) => const CashScreen(),
          ),
          GoRoute(
            path: '/balance',
            builder: (context, state) => const BalanceScreen(),
          ),
          GoRoute(
            path: '/pricing',
            builder: (context, state) => const PricingSettingsScreen(),
          ),
          GoRoute(
            path: '/business',
            builder: (context, state) => const BusinessSettingsScreen(),
          ),
          GoRoute(
            path: '/staff',
            builder: (context, state) => const StaffScreen(),
          ),
          GoRoute(
            path: '/profile',
            builder: (context, state) =>
                const BusinessSettingsScreen(clientProfile: true),
          ),
        ],
      ),
    ],
  );
});

class DualgiApp extends ConsumerWidget {
  const DualgiApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'Dualgi 3D',
      theme: AppTheme.light(),
      debugShowCheckedModeBanner: false,
      routerConfig: router,
    );
  }
}
