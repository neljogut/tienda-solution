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
          'Rentabilidad real por impresión 3D, reventa y balance general según período.',
      actions: [
        FilledButton.icon(
          onPressed: null,
          icon: const Icon(Icons.picture_as_pdf_outlined),
          label: const Text('Generar PDF'),
        ),
      ],
      children: const [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilterChip(label: Text('Día'), onSelected: null),
            FilterChip(label: Text('Semana'), onSelected: null),
            FilterChip(label: Text('Mes'), onSelected: null, selected: true),
            FilterChip(label: Text('Año'), onSelected: null),
            FilterChip(label: Text('Todo'), onSelected: null),
            FilterChip(label: Text('Rango'), onSelected: null),
          ],
        ),
        ResponsiveGrid(
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
              color: Color(0xFF34D399),
            ),
            InfoCard(
              title: 'Pendiente',
              value: r'$ 0',
              icon: Icons.pending_actions_rounded,
              color: Color(0xFFF59E0B),
            ),
            InfoCard(
              title: 'Ganancia real',
              value: r'$ 0',
              icon: Icons.trending_up_rounded,
              color: Color(0xFF60A5FA),
            ),
          ],
        ),
        HubSectionCard(
          title: 'Balance impresión 3D',
          icon: Icons.view_in_ar_rounded,
          child: _BalanceEmptyLine(),
        ),
        HubSectionCard(
          title: 'Balance reventa',
          icon: Icons.sell_rounded,
          child: _BalanceEmptyLine(),
        ),
        HubSectionCard(
          title: 'Reporte',
          icon: Icons.analytics_outlined,
          child: SizedBox(
            height: 260,
            child: EmptyState(
              icon: Icons.analytics_outlined,
              title: 'Balance preparado para datos reales',
              message:
                  'Los reportes usarán los snapshots congelados de pedidos para no recalcular ventas históricas.',
            ),
          ),
        ),
      ],
    );
  }
}

class _BalanceEmptyLine extends StatelessWidget {
  const _BalanceEmptyLine();

  @override
  Widget build(BuildContext context) {
    return const Text(
      'Se completará automáticamente con ingresos, costos, pendientes y ganancia real.',
    );
  }
}
