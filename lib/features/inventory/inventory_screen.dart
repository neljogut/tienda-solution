import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/providers.dart';
import '../../core/widgets/empty_state.dart';
import '../../core/widgets/module_page.dart';
import '../../core/widgets/responsive_grid.dart';

class InventoryScreen extends ConsumerWidget {
  const InventoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lowStockStream = ref
        .watch(inventoryRepositoryProvider)
        .watchLowStockItems();
    return StreamBuilder(
      stream: lowStockStream,
      builder: (context, snapshot) {
        final lowStock = snapshot.data ?? const [];
        return ModulePage(
          title: 'Inventario',
          subtitle:
              'Filamentos, insumos, productos impresos y reventa con stock, imágenes y alertas.',
          actions: [
            FilledButton.icon(
              onPressed: null,
              icon: const Icon(Icons.add_box_outlined),
              label: const Text('Agregar item'),
            ),
          ],
          children: [
            const ResponsiveGrid(
              minTileWidth: 220,
              children: [
                InfoCard(
                  title: 'Filamentos',
                  value: '0',
                  icon: Icons.view_in_ar_rounded,
                ),
                InfoCard(
                  title: 'Insumos',
                  value: '0',
                  icon: Icons.science_rounded,
                  color: Color(0xFF60A5FA),
                ),
                InfoCard(
                  title: 'Reventa',
                  value: '0',
                  icon: Icons.sell_rounded,
                  color: Color(0xFFC084FC),
                ),
                InfoCard(
                  title: 'Stock bajo',
                  value: '0',
                  icon: Icons.warning_amber_rounded,
                  color: Color(0xFFF59E0B),
                ),
              ],
            ),
            HubSectionCard(
              title: 'Alertas de stock',
              icon: Icons.warning_amber_rounded,
              child: lowStock.isEmpty
                  ? const SizedBox(
                      height: 280,
                      child: EmptyState(
                        icon: Icons.inventory_2_outlined,
                        title: 'Inventario listo para cargar stock real',
                        message:
                            'Cada entrada, salida, consumo o ajuste creará movimientos de inventario auditables.',
                      ),
                    )
                  : Column(
                      children: [
                        for (final item in lowStock)
                          ListTile(
                            leading: const Icon(Icons.inventory_2_outlined),
                            title: Text(item.name),
                            subtitle: Text(item.kind),
                            trailing: Text(
                              '${item.currentStock} / mín. ${item.minimumStock}',
                            ),
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
