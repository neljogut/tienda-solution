import 'package:flutter/material.dart';

import '../../core/widgets/empty_state.dart';
import '../../core/widgets/module_page.dart';

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
          icon: const Icon(Icons.lock_open),
          label: const Text('Abrir caja'),
        ),
        OutlinedButton.icon(
          onPressed: null,
          icon: const Icon(Icons.lock_outline),
          label: const Text('Cerrar caja'),
        ),
      ],
      children: const [
        SizedBox(
          height: 380,
          child: EmptyState(
            icon: Icons.point_of_sale_outlined,
            title: 'No hay caja abierta',
            message:
                'Al abrir caja se registrara monto inicial, usuario, hora y movimientos por metodo de pago.',
          ),
        ),
      ],
    );
  }
}
