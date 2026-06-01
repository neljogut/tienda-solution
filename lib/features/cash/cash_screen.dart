import 'package:flutter/material.dart';

import '../../core/widgets/empty_state.dart';
import '../../core/widgets/module_page.dart';
import '../../core/widgets/responsive_grid.dart';

class CashScreen extends StatelessWidget {
  const CashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ModulePage(
      title: 'Caja',
      subtitle:
          'Apertura, movimientos por pagos, ingresos/egresos manuales, cierre e historial.',
      actions: [
        FilledButton.icon(
          onPressed: null,
          icon: const Icon(Icons.lock_open_rounded),
          label: const Text('Abrir caja'),
        ),
        OutlinedButton.icon(
          onPressed: null,
          icon: const Icon(Icons.lock_outline_rounded),
          label: const Text('Cerrar caja'),
        ),
      ],
      children: const [
        ResponsiveGrid(
          minTileWidth: 220,
          children: [
            InfoCard(
              title: 'Estado',
              value: 'Cerrada',
              icon: Icons.point_of_sale_rounded,
              color: Color(0xFFFB7185),
            ),
            InfoCard(
              title: 'Ingresos turno',
              value: r'$ 0',
              icon: Icons.south_west_rounded,
              color: Color(0xFF34D399),
            ),
            InfoCard(
              title: 'Egresos turno',
              value: r'$ 0',
              icon: Icons.north_east_rounded,
              color: Color(0xFFF59E0B),
            ),
            InfoCard(
              title: 'Diferencia',
              value: r'$ 0',
              icon: Icons.rule_rounded,
            ),
          ],
        ),
        HubSectionCard(
          title: 'Turno actual',
          icon: Icons.point_of_sale_rounded,
          child: SizedBox(
            height: 280,
            child: EmptyState(
              icon: Icons.point_of_sale_outlined,
              title: 'No hay caja abierta',
              message:
                  'Al abrir caja se registrará monto inicial, usuario, hora y movimientos por método de pago.',
            ),
          ),
        ),
        HubSectionCard(
          title: 'Métodos de pago',
          icon: Icons.payments_outlined,
          child: Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              Chip(label: Text('Efectivo')),
              Chip(label: Text('Transferencia')),
              Chip(label: Text('Mercado Pago')),
              Chip(label: Text('Tarjeta')),
              Chip(label: Text('Otro')),
            ],
          ),
        ),
      ],
    );
  }
}
