import 'package:flutter/material.dart';

import '../../core/widgets/module_page.dart';

class BusinessSettingsScreen extends StatelessWidget {
  const BusinessSettingsScreen({super.key, this.clientProfile = false});

  final bool clientProfile;

  @override
  Widget build(BuildContext context) {
    final fields = clientProfile
        ? const [
            'Nombre',
            'Apellido',
            'Telefono',
            'Email',
            'Direccion',
            'Ciudad',
            'Provincia',
            'Codigo postal',
          ]
        : const [
            'Nombre del negocio',
            'Logo',
            'Nombre del dueno',
            'Telefono',
            'Email',
            'Direccion',
            'Ciudad',
            'Provincia',
            'CUIT o documento',
            'Redes sociales',
            'Descripcion corta',
            'Texto de comprobantes',
          ];

    return ModulePage(
      title: clientProfile ? 'Mi perfil' : 'Configuracion del negocio',
      subtitle: clientProfile
          ? 'Datos personales y de envio del cliente.'
          : 'Datos visibles en panel, catalogo, comprobantes, PDFs y perfil publico.',
      actions: [
        FilledButton.icon(
          onPressed: null,
          icon: const Icon(Icons.save_outlined),
          label: const Text('Guardar'),
        ),
      ],
      children: [
        Card(
          color: Colors.white,
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (final field in fields)
                  SizedBox(
                    width: 300,
                    child: TextField(
                      enabled: false,
                      decoration: InputDecoration(labelText: field),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
