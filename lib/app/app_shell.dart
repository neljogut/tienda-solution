import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/data/providers.dart';
import '../core/models/enums.dart';
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

        final useRail = constraints.maxWidth >= 920;
        if (useRail) {
          return Scaffold(
            body: Row(
              children: [
                NavigationRail(
                  extended: constraints.maxWidth >= 1180,
                  selectedIndex: selectedIndex < 0 ? 0 : selectedIndex,
                  onDestinationSelected: (index) =>
                      context.go(destinations[index].path),
                  leading: const Padding(
                    padding: EdgeInsets.only(top: 18, bottom: 12),
                    child: _BrandMark(),
                  ),
                  destinations: [
                    for (final item in destinations)
                      NavigationRailDestination(
                        icon: Icon(item.icon),
                        label: Text(item.label),
                      ),
                  ],
                ),
                const VerticalDivider(width: 1),
                Expanded(child: child),
              ],
            ),
          );
        }

        return Scaffold(
          appBar: AppBar(
            title: const _BrandMark(compact: true),
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Center(child: Text(user.role.label)),
              ),
            ],
          ),
          drawer: NavigationDrawer(
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
          ),
          body: child,
        );
      },
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
