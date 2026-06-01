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
          title: 'Dashboard',
          subtitle:
              'Resumen operativo y financiero del negocio en tiempo real.',
          actions: [
            FilledButton.icon(
              onPressed: null,
              icon: const Icon(Icons.add_shopping_cart),
              label: const Text('Crear pedido'),
            ),
            OutlinedButton.icon(
              onPressed: null,
              icon: const Icon(Icons.point_of_sale),
              label: const Text('Abrir/cerrar caja'),
            ),
          ],
          children: [
            if (metrics == null)
              const SizedBox(
                height: 360,
                child: EmptyState(
                  icon: Icons.dashboard_outlined,
                  title: 'Dashboard listo para datos reales',
                  message:
                      'Al conectar Firestore se mostraran ventas, deudas, pedidos, inventario bajo, caja y cotizacion del dolar.',
                ),
              )
            else
              ResponsiveGrid(
                minTileWidth: 220,
                children: [
                  InfoCard(
                    title: 'Ventas del dia',
                    value: currency.format(metrics.salesToday),
                    icon: Icons.today,
                  ),
                  InfoCard(
                    title: 'Ventas del mes',
                    value: currency.format(metrics.salesMonth),
                    icon: Icons.calendar_month,
                  ),
                  InfoCard(
                    title: 'Pendiente de cobro',
                    value: currency.format(metrics.pendingCollection),
                    icon: Icons.pending_actions,
                    color: Colors.orange,
                  ),
                  InfoCard(
                    title: 'Pedidos pendientes',
                    value: '${metrics.pendingOrders}',
                    icon: Icons.hourglass_top,
                  ),
                  InfoCard(
                    title: 'En proceso',
                    value: '${metrics.inProgressOrders}',
                    icon: Icons.precision_manufacturing,
                  ),
                  InfoCard(
                    title: 'Terminados',
                    value: '${metrics.finishedOrders}',
                    icon: Icons.task_alt,
                    color: Colors.green,
                  ),
                  InfoCard(
                    title: 'Entregados',
                    value: '${metrics.deliveredOrders}',
                    icon: Icons.local_shipping,
                  ),
                  InfoCard(
                    title: 'Caja actual',
                    value: metrics.cashOpen ? 'Abierta' : 'Cerrada',
                    icon: Icons.point_of_sale,
                    color: metrics.cashOpen ? Colors.green : Colors.red,
                  ),
                ],
              ),
            Card(
              color: Colors.white,
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Accesos rapidos',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: const [
                        ActionChip(
                          label: Text('Crear pedido'),
                          avatar: Icon(Icons.add_shopping_cart),
                          onPressed: null,
                        ),
                        ActionChip(
                          label: Text('Agregar producto'),
                          avatar: Icon(Icons.add_box_outlined),
                          onPressed: null,
                        ),
                        ActionChip(
                          label: Text('Agregar cliente'),
                          avatar: Icon(Icons.person_add_alt),
                          onPressed: null,
                        ),
                        ActionChip(
                          label: Text('Registrar pago'),
                          avatar: Icon(Icons.payments_outlined),
                          onPressed: null,
                        ),
                        ActionChip(
                          label: Text('Ver balance'),
                          avatar: Icon(Icons.analytics_outlined),
                          onPressed: null,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
