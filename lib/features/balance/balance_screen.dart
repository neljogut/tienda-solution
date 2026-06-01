import 'package:flutter/material.dart';

import '../../core/widgets/empty_state.dart';
import '../../core/widgets/module_page.dart';
import '../../core/widgets/responsive_grid.dart';

class BalanceScreen extends StatelessWidget {
  const BalanceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ModulePage(
      title: 'Balance financiero',
      subtitle:
          'Rentabilidad real por impresion 3D, reventa y balance general segun periodo.',
      actions: [
        FilledButton.icon(
          onPressed: null,
          icon: const Icon(Icons.picture_as_pdf_outlined),
          label: const Text('Generar PDF'),
        ),
      ],
      children: [
        const Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilterChip(label: Text('Dia'), onSelected: null),
            FilterChip(label: Text('Semana'), onSelected: null),
            FilterChip(label: Text('Mes'), onSelected: null, selected: true),
            FilterChip(label: Text('Ano'), onSelected: null),
            FilterChip(label: Text('Todo'), onSelected: null),
            FilterChip(label: Text('Rango'), onSelected: null),
          ],
        ),
        const ResponsiveGrid(
          minTileWidth: 240,
          children: [
            InfoCard(
              title: 'Total vendido',
              value: r'$ 0',
              icon: Icons.sell_outlined,
            ),
            InfoCard(
              title: 'Total cobrado',
              value: r'$ 0',
              icon: Icons.payments_outlined,
            ),
            InfoCard(
              title: 'Pendiente',
              value: r'$ 0',
              icon: Icons.pending_actions,
              color: Colors.orange,
            ),
            InfoCard(
              title: 'Ganancia real',
              value: r'$ 0',
              icon: Icons.trending_up,
              color: Colors.green,
            ),
          ],
        ),
        const SizedBox(
          height: 320,
          child: EmptyState(
            icon: Icons.analytics_outlined,
            title: 'Balance preparado para datos reales',
            message:
                'Los reportes usaran los snapshots congelados de pedidos para no recalcular ventas historicas.',
          ),
        ),
      ],
    );
  }
}
