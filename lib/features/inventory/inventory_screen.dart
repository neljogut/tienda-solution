import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/providers.dart';
import '../../core/widgets/empty_state.dart';
import '../../core/widgets/module_page.dart';

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
        return ModulePage(
          title: 'Inventario',
          subtitle:
              'Filamentos, insumos, productos impresos y reventa con stock, imagenes y alertas.',
          actions: [
            FilledButton.icon(
              onPressed: null,
              icon: const Icon(Icons.add),
              label: const Text('Agregar item'),
            ),
          ],
          children: const [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilterChip(label: Text('Filamentos'), onSelected: null),
                FilterChip(label: Text('Insumos'), onSelected: null),
                FilterChip(label: Text('Productos 3D'), onSelected: null),
                FilterChip(label: Text('Reventa'), onSelected: null),
                FilterChip(label: Text('Stock bajo'), onSelected: null),
              ],
            ),
            SizedBox(
              height: 380,
              child: EmptyState(
                icon: Icons.inventory_2_outlined,
                title: 'Inventario listo para cargar stock real',
                message:
                    'Cada entrada, salida, consumo o ajuste creara movimientos de inventario auditables.',
              ),
            ),
          ],
        );
      },
    );
  }
}
