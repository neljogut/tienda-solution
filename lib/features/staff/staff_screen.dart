import 'package:flutter/material.dart';

import '../../core/widgets/empty_state.dart';
import '../../core/widgets/module_page.dart';

class StaffScreen extends StatelessWidget {
  const StaffScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ModulePage(
      title: 'Empleados y permisos',
      subtitle: 'Alta, desactivacion y permisos por modulo para empleados.',
      actions: [
        FilledButton.icon(
          onPressed: null,
          icon: const Icon(Icons.person_add_alt),
          label: const Text('Crear empleado'),
        ),
      ],
      children: const [
        SizedBox(
          height: 380,
          child: EmptyState(
            icon: Icons.admin_panel_settings_outlined,
            title: 'Sin empleados cargados',
            message:
                'El owner podra habilitar permisos granulares para pedidos, caja, inventario, balance y PDFs internos.',
          ),
        ),
      ],
    );
  }
}
