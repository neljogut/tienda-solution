import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/data/providers.dart';
import '../core/models/enums.dart';
import '../core/theme/business_hub_palette.dart';
import '../core/theme/business_hub_theme.dart';
import '../core/widgets/business_hub_background.dart';
import 'navigation.dart';

class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final destinations = destinationsFor(user);
    final selectedIndex = destinations.indexWhere(
      (item) => GoRouterState.of(context).uri.path == item.path,
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        if (user.role == UserRole.guest || user.role == UserRole.client) {
          return _PublicShell(
            destinations: destinations,
            selectedIndex: selectedIndex,
            child: child,
          );
        }

        return _BusinessShell(
          destinations: destinations,
          selectedIndex: selectedIndex,
          roleLabel: user.role.label,
          child: child,
        );
      },
    );
  }
}

class _BusinessShell extends StatelessWidget {
  const _BusinessShell({
    required this.destinations,
    required this.selectedIndex,
    required this.roleLabel,
    required this.child,
  });

  final List<AppDestination> destinations;
  final int selectedIndex;
  final String roleLabel;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    const palette = dualgiHubPalette;
    return Theme(
      data: businessHubTheme(context, palette),
      child: Stack(
        fit: StackFit.expand,
        children: [
          const BusinessHubBackground(palette: palette),
          LayoutBuilder(
            builder: (context, constraints) {
              final useRail = constraints.maxWidth >= businessHubRailBreakpoint;
              if (!useRail) {
                return Scaffold(
                  backgroundColor: Colors.transparent,
                  appBar: AppBar(
                    title: const _HubBrandMark(expanded: true),
                    actions: [
                      Padding(
                        padding: const EdgeInsets.only(right: 12),
                        child: Center(child: _RolePill(label: roleLabel)),
                      ),
                    ],
                  ),
                  drawer: _BusinessDrawer(
                    destinations: destinations,
                    selectedIndex: selectedIndex,
                  ),
                  body: child,
                );
              }

              return Scaffold(
                backgroundColor: Colors.transparent,
                body: Row(
                  children: [
                    _BusinessSideRail(
                      destinations: destinations,
                      selectedIndex: selectedIndex,
                    ),
                    Expanded(child: child),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _BusinessSideRail extends StatelessWidget {
  const _BusinessSideRail({
    required this.destinations,
    required this.selectedIndex,
  });

  final List<AppDestination> destinations;
  final int selectedIndex;

  @override
  Widget build(BuildContext context) {
    const palette = dualgiHubPalette;
    return Material(
      color: palette.surfaceRail.withValues(alpha: 0.94),
      elevation: 10,
      child: Container(
        width: 282,
        decoration: BoxDecoration(
          border: Border(
            right: BorderSide(color: palette.border.withValues(alpha: 0.8)),
          ),
        ),
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 12, 16, 16),
                child: _HubBrandMark(expanded: true),
              ),
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(10, 4, 10, 14),
                  itemBuilder: (context, index) {
                    final item = destinations[index];
                    final selected = index == selectedIndex;
                    return _BusinessNavTile(
                      item: item,
                      selected: selected,
                      onTap: () => context.go(item.path),
                    );
                  },
                  separatorBuilder: (context, index) =>
                      const SizedBox(height: 4),
                  itemCount: destinations.length,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BusinessDrawer extends StatelessWidget {
  const _BusinessDrawer({
    required this.destinations,
    required this.selectedIndex,
  });

  final List<AppDestination> destinations;
  final int selectedIndex;

  @override
  Widget build(BuildContext context) {
    const palette = dualgiHubPalette;
    return Drawer(
      backgroundColor: palette.surfaceRail,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(18, 18, 18, 12),
              child: _HubBrandMark(expanded: true),
            ),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.all(10),
                itemBuilder: (context, index) {
                  final item = destinations[index];
                  return _BusinessNavTile(
                    item: item,
                    selected: index == selectedIndex,
                    onTap: () {
                      Navigator.of(context).pop();
                      context.go(item.path);
                    },
                  );
                },
                separatorBuilder: (context, index) => const SizedBox(height: 4),
                itemCount: destinations.length,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BusinessNavTile extends StatelessWidget {
  const _BusinessNavTile({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final AppDestination item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const palette = dualgiHubPalette;
    return Material(
      color: selected ? palette.accentSoft : Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? palette.accent.withValues(alpha: 0.44)
                  : Colors.transparent,
            ),
          ),
          child: Row(
            children: [
              Icon(
                item.icon,
                color: selected ? palette.accent : palette.textMuted,
                size: 21,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  item.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: selected ? palette.text : palette.textMuted,
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                    fontSize: 13.5,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HubBrandMark extends StatelessWidget {
  const _HubBrandMark({required this.expanded});

  final bool expanded;

  @override
  Widget build(BuildContext context) {
    const palette = dualgiHubPalette;
    final mark = Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: palette.accentSoft,
        border: Border.all(color: palette.accent.withValues(alpha: 0.85)),
      ),
      child: Icon(Icons.view_in_ar_rounded, color: palette.accent),
    );

    if (!expanded) return mark;

    return Row(
      children: [
        mark,
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Dualgi 3D',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: palette.text,
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Gestión de negocio',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: palette.textMuted,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _RolePill extends StatelessWidget {
  const _RolePill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    const palette = dualgiHubPalette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: palette.accentSoft,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: palette.accent.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: palette.text,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _PublicShell extends StatelessWidget {
  const _PublicShell({
    required this.destinations,
    required this.selectedIndex,
    required this.child,
  });

  final List<AppDestination> destinations;
  final int selectedIndex;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 760;
        return Scaffold(
          backgroundColor: Theme.of(context).colorScheme.surface,
          appBar: AppBar(
            toolbarHeight: 72,
            backgroundColor: Colors.white,
            surfaceTintColor: Colors.white,
            elevation: 0,
            titleSpacing: compact ? 16 : 28,
            title: const _BrandMark(compact: true),
            actions: compact
                ? [
                    Builder(
                      builder: (context) => IconButton(
                        tooltip: 'Abrir menu',
                        onPressed: () => Scaffold.of(context).openEndDrawer(),
                        icon: const Icon(Icons.menu),
                      ),
                    ),
                    const SizedBox(width: 8),
                  ]
                : [
                    for (var index = 0; index < destinations.length; index++)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: TextButton.icon(
                          onPressed: () => context.go(destinations[index].path),
                          icon: Icon(destinations[index].icon, size: 18),
                          label: Text(destinations[index].label),
                          style: TextButton.styleFrom(
                            foregroundColor: selectedIndex == index
                                ? Theme.of(context).colorScheme.primary
                                : Theme.of(context).colorScheme.onSurface,
                          ),
                        ),
                      ),
                    const SizedBox(width: 14),
                  ],
          ),
          endDrawer: compact
              ? NavigationDrawer(
                  selectedIndex: selectedIndex < 0 ? 0 : selectedIndex,
                  onDestinationSelected: (index) {
                    Navigator.of(context).pop();
                    context.go(destinations[index].path);
                  },
                  children: [
                    const Padding(
                      padding: EdgeInsets.fromLTRB(24, 24, 24, 12),
                      child: _BrandMark(compact: true),
                    ),
                    for (final item in destinations)
                      NavigationDrawerDestination(
                        icon: Icon(item.icon),
                        label: Text(item.label),
                      ),
                  ],
                )
              : null,
          body: child,
        );
      },
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark({this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: theme.colorScheme.primary,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
            Icons.view_in_ar_outlined,
            color: theme.colorScheme.onPrimary,
          ),
        ),
        if (compact) const SizedBox(width: 10),
        if (compact)
          Text(
            'Dualgi 3D',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: 0,
            ),
          ),
      ],
    );
  }
}
