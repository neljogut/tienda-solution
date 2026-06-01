import 'package:flutter/material.dart';

import '../../core/widgets/module_page.dart';

class PricingSettingsScreen extends StatelessWidget {
  const PricingSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ModulePage(
      title: 'Configuracion de precios',
      subtitle:
          'Parametros automaticos para impresion 3D, reventa, mayoristas y cotizacion del dolar.',
      actions: [
        FilledButton.icon(
          onPressed: null,
          icon: const Icon(Icons.save_outlined),
          label: const Text('Guardar'),
        ),
      ],
      children: const [
        _SettingsSection(
          title: 'Impresion 3D',
          fields: [
            'Precio filamento por KG en USD',
            'Precio KWh',
            'Consumo impresora en watts',
            'Vida util de maquina en horas',
            'Costo estimado en repuestos',
            'Margen de error %',
            'Multiplicador minorista no llavero',
            'Multiplicador minorista llavero',
            'Descuento mayorista no llavero',
            'Descuento mayorista llavero',
            'Umbral mayorista no llavero',
            'Umbral mayorista llavero',
          ],
        ),
        _SettingsSection(
          title: 'Reventa',
          fields: [
            'Ganancia sobre costo de compra %',
            'Activar mayorista',
            'Descuento mayorista %',
            'Pedido minimo para mayorista',
          ],
        ),
        _SettingsSection(
          title: 'Cotizacion',
          fields: [
            'Cotizacion actual del dolar',
            'Fecha de ultima actualizacion',
            'Proveedor',
            'Carga manual de emergencia',
          ],
        ),
      ],
    );
  }
}

class _SettingsSection extends StatelessWidget {
  const _SettingsSection({required this.title, required this.fields});

  final String title;
  final List<String> fields;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 14),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (final field in fields)
                  SizedBox(
                    width: 280,
                    child: TextField(
                      enabled: false,
                      decoration: InputDecoration(labelText: field),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
