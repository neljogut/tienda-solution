import 'package:dualgi3d/app/app.dart';
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
}
