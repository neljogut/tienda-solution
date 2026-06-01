import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/providers.dart';
import '../../core/widgets/empty_state.dart';
import '../../core/widgets/module_page.dart';

class AccountsScreen extends ConsumerWidget {
  const AccountsScreen({
    super.key,
    this.clientMode = false,
    this.paymentsOnly = false,
  });

  final bool clientMode;
  final bool paymentsOnly;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final customersStream = ref
        .watch(customersRepositoryProvider)
        .watchCustomersWithDebt();
    return StreamBuilder(
      stream: customersStream,
      builder: (context, snapshot) {
        final customers = snapshot.data ?? const [];
        return ModulePage(
          title: paymentsOnly
              ? 'Mis pagos'
              : clientMode
              ? 'Mi cuenta corriente'
              : 'Cuenta corriente',
          subtitle: clientMode
              ? 'Deudas, saldos pendientes e historial de pagos propios.'
              : 'Clientes con deuda activa y aplicacion automatica de pagos desde el pedido mas antiguo.',
          actions: [
            if (!clientMode)
              FilledButton.icon(
                onPressed: null,
                icon: const Icon(Icons.payments_outlined),
                label: const Text('Registrar pago'),
              ),
          ],
          children: [
            if (customers.isEmpty)
              SizedBox(
                height: 380,
                child: EmptyState(
                  icon: Icons.account_balance_wallet_outlined,
                  title: paymentsOnly
                      ? 'No hay pagos registrados'
                      : 'No hay deuda activa',
                  message: clientMode
                      ? 'Los pedidos con saldo pendiente y pagos confirmados apareceran aca.'
                      : 'Cuando un pedido quede con saldo, se listara automaticamente en cuenta corriente.',
                ),
              ),
          ],
        );
      },
    );
  }
}
