import 'package:flutter/material.dart';

import '../../core/widgets/empty_state.dart';
import '../../core/widgets/module_page.dart';
import '../../core/widgets/responsive_grid.dart';

class ClientsScreen extends StatelessWidget {
  const ClientsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ModulePage(
      title: 'Clientes',
      subtitle:
          'Ficha de clientes, datos de envío, historial, deuda y marca de cliente de confianza.',
      actions: [
        FilledButton.icon(
          onPressed: null,
          icon: const Icon(Icons.person_add_alt_rounded),
          label: const Text('Agregar cliente'),
        ),
      ],
      children: const [
        ResponsiveGrid(
          minTileWidth: 230,
          children: [
            InfoCard(
              title: 'Clientes activos',
              value: '0',
              icon: Icons.people_alt_rounded,
            ),
            InfoCard(
              title: 'Con deuda',
              value: '0',
              icon: Icons.account_balance_wallet_rounded,
              color: Color(0xFFF59E0B),
            ),
            InfoCard(
              title: 'De confianza',
              value: '0',
              icon: Icons.verified_user_rounded,
              color: Color(0xFF34D399),
            ),
          ],
        ),
        HubSectionCard(
          title: 'Listado de clientes',
          icon: Icons.people_alt_rounded,
          child: SizedBox(
            height: 300,
            child: EmptyState(
              icon: Icons.people_alt_outlined,
              title: 'No hay clientes cargados',
              message:
                  'Los usuarios registrados ingresarán como clientes y el panel también permite cargar clientes manuales.',
            ),
          ),
        ),
      ],
    );
  }
}
