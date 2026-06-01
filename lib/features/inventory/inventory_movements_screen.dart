import 'package:flutter/material.dart';

import '../../core/widgets/empty_state.dart';
import '../../core/widgets/module_page.dart';

class InventoryMovementsScreen extends StatelessWidget {
  const InventoryMovementsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ModulePage(
      title: 'Movimientos de inventario',
      subtitle:
          'Entradas, salidas por venta, ajustes, devoluciones, correcciones y consumos.',
      children: const [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilterChip(label: Text('Fecha'), onSelected: null),
            FilterChip(label: Text('Entradas'), onSelected: null),
            FilterChip(label: Text('Salidas'), onSelected: null),
            FilterChip(label: Text('Ajustes'), onSelected: null),
            FilterChip(label: Text('Consumos'), onSelected: null),
          ],
        ),
        SizedBox(
          height: 380,
          child: EmptyState(
            icon: Icons.swap_horiz_outlined,
            title: 'Sin movimientos registrados',
            message:
                'Los movimientos se generaran automaticamente cuando haya stock real, ventas y ajustes autorizados.',
          ),
        ),
      ],
    );
  }
}
