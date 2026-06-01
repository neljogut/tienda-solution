import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/data/providers.dart';
import '../../core/widgets/empty_state.dart';
import '../../core/widgets/module_page.dart';
import '../../core/widgets/responsive_grid.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final metricsStream = ref
        .watch(dashboardRepositoryProvider)
        .watchDashboardMetrics();
    final currency = NumberFormat.currency(
      locale: 'es_AR',
      symbol: r'$ ',
      decimalDigits: 0,
    );

    return StreamBuilder(
      stream: metricsStream,
      builder: (context, snapshot) {
        final metrics = snapshot.data;
        return ModulePage(
          title: 'Panel de control',
          subtitle: 'Indicadores y accesos rápidos del negocio.',
          actions: [
            FilledButton.icon(
              onPressed: null,
              icon: const Icon(Icons.add_shopping_cart_rounded),
              label: const Text('Crear pedido'),
            ),
            OutlinedButton.icon(
              onPressed: null,
              icon: const Icon(Icons.point_of_sale_rounded),
              label: const Text('Caja'),
            ),
          ],
          children: [
            HubSectionCard(
              title: 'Métricas principales',
              icon: Icons.speed_rounded,
              child: metrics == null
                  ? const _DashboardNoData()
                  : ResponsiveGrid(
                      minTileWidth: 230,
                      children: [
                        InfoCard(
                          title: 'Ventas del día',
                          value: currency.format(metrics.salesToday),
                          icon: Icons.today_rounded,
                        ),
                        InfoCard(
                          title: 'Ventas del mes',
                          value: currency.format(metrics.salesMonth),
                          icon: Icons.calendar_month_rounded,
                          color: const Color(0xFF60A5FA),
                        ),
                        InfoCard(
                          title: 'Pendiente de cobro',
                          value: currency.format(metrics.pendingCollection),
                          icon: Icons.pending_actions_rounded,
                          color: const Color(0xFFF59E0B),
                        ),
                        InfoCard(
                          title: 'Caja actual',
                          value: metrics.cashOpen ? 'Abierta' : 'Cerrada',
                          icon: Icons.point_of_sale_rounded,
                          color: metrics.cashOpen
                              ? const Color(0xFF34D399)
                              : const Color(0xFFFB7185),
                        ),
                      ],
                    ),
            ),
            HubSectionCard(
              title: 'Estado de pedidos',
              icon: Icons.receipt_long_rounded,
              child: metrics == null
                  ? const _InlineEmpty(
                      text:
                          'Los estados aparecerán cuando Firestore tenga pedidos reales.',
                    )
                  : ResponsiveGrid(
                      minTileWidth: 210,
                      children: [
                        InfoCard(
                          title: 'Pendientes',
                          value: '${metrics.pendingOrders}',
                          icon: Icons.hourglass_top_rounded,
                          color: const Color(0xFFF59E0B),
                        ),
                        InfoCard(
                          title: 'En proceso',
                          value: '${metrics.inProgressOrders}',
                          icon: Icons.settings_suggest_rounded,
                          color: const Color(0xFF60A5FA),
                        ),
                        InfoCard(
                          title: 'Terminados',
                          value: '${metrics.finishedOrders}',
                          icon: Icons.checklist_rounded,
                          color: const Color(0xFF34D399),
                        ),
                        InfoCard(
                          title: 'Entregados',
                          value: '${metrics.deliveredOrders}',
                          icon: Icons.local_shipping_rounded,
                          color: const Color(0xFFC084FC),
                        ),
                      ],
                    ),
            ),
            const HubSectionCard(
              title: 'Pendientes de acción',
              icon: Icons.warning_amber_rounded,
              child: _InlineEmpty(
                text:
                    'Acá se listarán pedidos vencidos, clientes con mayor deuda e inventario bajo.',
              ),
            ),
            HubSectionCard(
              title: 'Accesos rápidos',
              icon: Icons.flash_on_rounded,
              child: Wrap(
                spacing: 12,
                runSpacing: 12,
                children: const [
                  _QuickAction(
                    icon: Icons.add_circle_outline_rounded,
                    label: 'Nuevo producto',
                  ),
                  _QuickAction(
                    icon: Icons.person_add_alt_rounded,
                    label: 'Nuevo cliente',
                  ),
                  _QuickAction(
                    icon: Icons.shopping_cart_checkout_rounded,
                    label: 'Crear pedido',
                  ),
                  _QuickAction(
                    icon: Icons.payments_outlined,
                    label: 'Registrar pago',
                  ),
                  _QuickAction(
                    icon: Icons.tune_rounded,
                    label: 'Parámetros de precios',
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _DashboardNoData extends StatelessWidget {
  const _DashboardNoData();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      height: 300,
      child: EmptyState(
        icon: Icons.dashboard_customize_outlined,
        title: 'Panel listo para datos reales',
        message:
            'Al conectar Firestore se mostrarán ventas, deudas, pedidos, caja, inventario bajo y cotización del dólar.',
      ),
    );
  }
}

class _InlineEmpty extends StatelessWidget {
  const _InlineEmpty({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.primary.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.45),
        ),
      ),
      child: Text(
        text,
        style: theme.textTheme.bodyMedium?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: null,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
    );
  }
}
