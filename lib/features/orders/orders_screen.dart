import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/data/providers.dart';
import '../../core/models/enums.dart';
import '../../core/widgets/empty_state.dart';
import '../../core/widgets/module_page.dart';

class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key, this.clientMode = false});

  final bool clientMode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordersStream = ref
        .watch(ordersRepositoryProvider)
        .watchOrdersForCurrentScope();
    final currency = NumberFormat.currency(
      locale: 'es_AR',
      symbol: r'$ ',
      decimalDigits: 0,
    );

    return StreamBuilder(
      stream: ordersStream,
      builder: (context, snapshot) {
        final orders = snapshot.data ?? const [];
        return ModulePage(
          title: clientMode ? 'Mis pedidos' : 'Pedidos',
          subtitle: clientMode
              ? 'Estado, pagos y comprobantes de tus pedidos.'
              : 'Pedidos con precio congelado, pagos, estados, PDFs e impacto en inventario.',
          actions: [
            if (!clientMode)
              FilledButton.icon(
                onPressed: null,
                icon: const Icon(Icons.add),
                label: const Text('Crear pedido para cliente'),
              ),
          ],
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: const [
                FilterChip(
                  label: Text('Todos'),
                  onSelected: null,
                  selected: true,
                ),
                FilterChip(label: Text('Pendiente'), onSelected: null),
                FilterChip(label: Text('En proceso'), onSelected: null),
                FilterChip(label: Text('Senado'), onSelected: null),
                FilterChip(label: Text('Pagado'), onSelected: null),
              ],
            ),
            if (orders.isEmpty)
              SizedBox(
                height: 380,
                child: EmptyState(
                  icon: Icons.receipt_long_outlined,
                  title: clientMode
                      ? 'Todavia no tenes pedidos'
                      : 'Todavia no hay pedidos',
                  message: clientMode
                      ? 'Cuando hagas una compra desde el catalogo, el pedido aparecera aca.'
                      : 'Owner o empleados autorizados pueden crear pedidos para clientes y registrar pagos iniciales.',
                ),
              )
            else
              Card(
                color: Colors.white,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columns: const [
                      DataColumn(label: Text('Pedido')),
                      DataColumn(label: Text('Cliente')),
                      DataColumn(label: Text('Fecha')),
                      DataColumn(label: Text('Total')),
                      DataColumn(label: Text('Abonado')),
                      DataColumn(label: Text('Saldo')),
                      DataColumn(label: Text('Estado')),
                    ],
                    rows: [
                      for (final order in orders)
                        DataRow(
                          cells: [
                            DataCell(Text(order.number)),
                            DataCell(Text(order.customerName)),
                            DataCell(
                              Text(
                                DateFormat(
                                  'dd/MM/yyyy',
                                ).format(order.createdAt),
                              ),
                            ),
                            DataCell(Text(currency.format(order.total))),
                            DataCell(Text(currency.format(order.paid))),
                            DataCell(Text(currency.format(order.pending))),
                            DataCell(Text(order.paymentStatus.label)),
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
