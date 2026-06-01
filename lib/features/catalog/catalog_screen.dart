import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/data/providers.dart';
import '../../core/models/enums.dart';
import '../../core/widgets/empty_state.dart';
import '../../core/widgets/module_page.dart';
import '../../core/widgets/responsive_grid.dart';
import '../../core/widgets/status_chip.dart';

class CatalogScreen extends ConsumerWidget {
  const CatalogScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productsStream = ref
        .watch(catalogRepositoryProvider)
        .watchPublicProducts();
    final currency = NumberFormat.currency(
      locale: 'es_AR',
      symbol: r'$ ',
      decimalDigits: 0,
    );

    return StreamBuilder(
      stream: productsStream,
      builder: (context, snapshot) {
        final products = snapshot.data ?? const [];
        return ModulePage(
          title: 'Catalogo',
          subtitle:
              'Productos impresos en 3D y productos de reventa publicados para vender.',
          actions: [
            SizedBox(
              width: 260,
              child: TextField(
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  hintText: 'Buscar producto',
                ),
                onChanged: (_) {},
              ),
            ),
            FilledButton.icon(
              onPressed: null,
              icon: const Icon(Icons.add),
              label: const Text('Agregar producto'),
            ),
          ],
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: const [
                FilterChip(
                  label: Text('Todos'),
                  onSelected: null,
                  selected: true,
                ),
                FilterChip(label: Text('Impresion 3D'), onSelected: null),
                FilterChip(label: Text('Reventa'), onSelected: null),
                FilterChip(label: Text('Activos'), onSelected: null),
                FilterChip(label: Text('Precio manual'), onSelected: null),
              ],
            ),
            if (products.isEmpty)
              const SizedBox(
                height: 420,
                child: EmptyState(
                  icon: Icons.storefront_outlined,
                  title: 'Todavia no hay productos publicados',
                  message:
                      'Cuando vincules Firebase y cargues productos reales, van a aparecer aca con imagen, stock, precio y acciones de compra.',
                ),
              )
            else
              ResponsiveGrid(
                children: [
                  for (final product in products)
                    Card(
                      color: Colors.white,
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Container(
                                width: double.infinity,
                                decoration: BoxDecoration(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                clipBehavior: Clip.antiAlias,
                                child: product.imageUrl == null
                                    ? const Icon(Icons.image_outlined, size: 52)
                                    : Image.network(
                                        product.imageUrl!,
                                        fit: BoxFit.cover,
                                      ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              product.name,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              currency.format(product.retailPrice),
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                StatusChip(
                                  label: product.type.label,
                                  color: product.type == ProductType.printed3d
                                      ? Colors.teal
                                      : Colors.indigo,
                                ),
                                const Spacer(),
                                Text('Stock ${product.stock}'),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
          ],
        );
      },
    );
  }
}
