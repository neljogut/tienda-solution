import 'package:flutter/material.dart';

import '../../core/widgets/empty_state.dart';
import '../../core/widgets/module_page.dart';

class ClientsScreen extends StatelessWidget {
  const ClientsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ModulePage(
      title: 'Clientes',
      subtitle:
          'Ficha de clientes, datos de envio, historial, deuda y marca de cliente de confianza.',
      actions: [
        FilledButton.icon(
          onPressed: null,
          icon: const Icon(Icons.person_add_alt),
          label: const Text('Agregar cliente'),
        ),
      ],
      children: const [
        SizedBox(
          height: 380,
          child: EmptyState(
            icon: Icons.people_alt_outlined,
            title: 'No hay clientes cargados',
            message:
                'Los usuarios registrados ingresaran como clientes y el panel tambien permite cargar clientes manuales.',
          ),
        ),
      ],
    );
  }
}
