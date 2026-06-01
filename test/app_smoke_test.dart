import 'package:dualgi3d/app/app.dart';
import 'package:dualgi3d/core/auth/permissions.dart';
import 'package:dualgi3d/core/data/providers.dart';
import 'package:dualgi3d/core/models/enums.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  testWidgets('inicia en catalogo publico sin datos de muestra', (
    tester,
  ) async {
    await tester.pumpWidget(const ProviderScope(child: DualgiApp()));
    await tester.pumpAndSettle();

    expect(find.text('Catálogo Dualgi 3D'), findsOneWidget);
    expect(find.text('Buscar por nombre o categoría'), findsOneWidget);
  });

  testWidgets('owner entra al hub de gestion de negocio', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWithValue(
            const AppUser(uid: 'owner-test', role: UserRole.owner),
          ),
        ],
        child: const DualgiApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Panel de control'), findsOneWidget);
    expect(find.text('Gestión de negocio'), findsWidgets);
  });
}
