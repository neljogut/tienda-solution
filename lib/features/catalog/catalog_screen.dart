import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/data/providers.dart';
import '../../core/models/enums.dart';
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

        return CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: _CatalogHeader(productCount: products.length),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 10, 24, 0),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1180),
                    child: const _CatalogToolbar(),
                  ),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 18, 24, 36),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1180),
                    child: products.isEmpty
                        ? const _EmptyCatalogPanel()
                        : ResponsiveGrid(
                            minTileWidth: 250,
                            children: [
                              for (final product in products)
                                _ProductCard(
                                  product: product,
                                  currency: currency,
                                ),
                            ],
                          ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _CatalogHeader extends StatelessWidget {
  const _CatalogHeader({required this.productCount});

  final int productCount;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      color: Colors.white,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1180),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 30, 24, 26),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final compact = constraints.maxWidth < 760;
                return Flex(
                  direction: compact ? Axis.vertical : Axis.horizontal,
                  crossAxisAlignment: compact
                      ? CrossAxisAlignment.start
                      : CrossAxisAlignment.center,
                  children: [
                    Expanded(
                      flex: compact ? 0 : 3,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Catálogo Dualgi 3D',
                            style: theme.textTheme.headlineMedium?.copyWith(
                              fontWeight: FontWeight.w900,
                              height: 1.04,
                              letterSpacing: 0,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            'Impresiones 3D y productos seleccionados, con precios actualizados y disponibilidad real.',
                            style: theme.textTheme.bodyLarge?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                              height: 1.35,
                            ),
                          ),
                          const SizedBox(height: 18),
                          Wrap(
                            spacing: 10,
                            runSpacing: 10,
                            children: const [
                              _TrustPill(
                                icon: Icons.attach_money,
                                label: 'Precios en ARS',
                              ),
                              _TrustPill(
                                icon: Icons.inventory_2_outlined,
                                label: 'Stock conectado',
                              ),
                              _TrustPill(
                                icon: Icons.receipt_long_outlined,
                                label: 'Pedidos online y local',
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    SizedBox(width: compact ? 0 : 24, height: compact ? 22 : 0),
                    Expanded(
                      flex: compact ? 0 : 2,
                      child: _CatalogSummary(productCount: productCount),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _CatalogSummary extends StatelessWidget {
  const _CatalogSummary({required this.productCount});

  final int productCount;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F6F5),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFD8E6E3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.storefront_outlined, color: theme.colorScheme.primary),
              const SizedBox(width: 10),
              Text(
                'Estado del catálogo',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              _SummaryNumber(value: '$productCount', label: 'Productos'),
              const SizedBox(width: 18),
              const _SummaryNumber(value: '0', label: 'Filtros activos'),
            ],
          ),
          const SizedBox(height: 18),
          Text(
            productCount == 0
                ? 'Listo para publicar productos reales desde el panel.'
                : 'Catálogo publicado y disponible para clientes.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryNumber extends StatelessWidget {
  const _SummaryNumber({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFFE1E7E6)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w900,
              ),
            ),
            Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TrustPill extends StatelessWidget {
  const _TrustPill({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: theme.colorScheme.primary),
          const SizedBox(width: 7),
          Text(
            label,
            style: theme.textTheme.labelLarge?.copyWith(
              color: theme.colorScheme.primary,
            ),
          ),
        ],
      ),
    );
  }
}

class _CatalogToolbar extends StatelessWidget {
  const _CatalogToolbar();

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Wrap(
          spacing: 10,
          runSpacing: 10,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SizedBox(
              width: 320,
              child: TextField(
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  hintText: 'Buscar por nombre o categoría',
                ),
                onChanged: (_) {},
              ),
            ),
            const _FilterButton(label: 'Todos', selected: true),
            const _FilterButton(label: 'Impresión 3D'),
            const _FilterButton(label: 'Reventa'),
            const _FilterButton(label: 'Disponibles'),
          ],
        ),
      ),
    );
  }
}

class _FilterButton extends StatelessWidget {
  const _FilterButton({required this.label, this.selected = false});

  final String label;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) {},
      backgroundColor: Colors.white,
      selectedColor: theme.colorScheme.primary.withValues(alpha: 0.12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(
          color: selected
              ? theme.colorScheme.primary.withValues(alpha: 0.4)
              : const Color(0xFFDDE5E3),
        ),
      ),
    );
  }
}

class _EmptyCatalogPanel extends StatelessWidget {
  const _EmptyCatalogPanel();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFDDE5E3)),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 780;
          return Flex(
            direction: compact ? Axis.vertical : Axis.horizontal,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                flex: compact ? 0 : 5,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(
                        Icons.add_business_outlined,
                        color: theme.colorScheme.onPrimary,
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'El catálogo se está preparando',
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Todavía no hay productos publicados. Cuando el panel tenga productos reales, esta misma vista mostrará fotos, precios, stock y acciones de pedido.',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(width: compact ? 0 : 24, height: compact ? 24 : 0),
              Expanded(flex: compact ? 0 : 4, child: const _PreviewGrid()),
            ],
          );
        },
      ),
    );
  }
}

class _PreviewGrid extends StatelessWidget {
  const _PreviewGrid();

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 0.95,
      children: const [
        _PreviewTile(icon: Icons.view_in_ar_outlined),
        _PreviewTile(icon: Icons.palette_outlined),
        _PreviewTile(icon: Icons.inventory_2_outlined),
        _PreviewTile(icon: Icons.local_offer_outlined),
      ],
    );
  }
}

class _PreviewTile extends StatelessWidget {
  const _PreviewTile({required this.icon});

  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF6F8F7),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFE3E9E8)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Center(
              child: Icon(
                icon,
                size: 38,
                color: theme.colorScheme.primary.withValues(alpha: 0.72),
              ),
            ),
          ),
          Container(
            height: 9,
            width: double.infinity,
            decoration: BoxDecoration(
              color: const Color(0xFFDDE5E3),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          const SizedBox(height: 8),
          Container(
            height: 9,
            width: 72,
            decoration: BoxDecoration(
              color: const Color(0xFFE9A364).withValues(alpha: 0.65),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({required this.product, required this.currency});

  final dynamic product;
  final NumberFormat currency;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
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
                  color: const Color(0xFFF1F6F5),
                  borderRadius: BorderRadius.circular(8),
                ),
                clipBehavior: Clip.antiAlias,
                child: product.imageUrl == null
                    ? Icon(
                        Icons.image_outlined,
                        size: 52,
                        color: theme.colorScheme.primary,
                      )
                    : Image.network(product.imageUrl!, fit: BoxFit.cover),
              ),
            ),
            const SizedBox(height: 12),
            Text(product.name, style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              currency.format(product.retailPrice),
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w900,
              ),
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
    );
  }
}
