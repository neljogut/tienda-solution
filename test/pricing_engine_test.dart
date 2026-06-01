import 'package:dualgi3d/core/business/accounts_engine.dart';
import 'package:dualgi3d/core/business/pricing_engine.dart';
import 'package:dualgi3d/core/models/enums.dart';
import 'package:dualgi3d/core/models/pricing_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const pricing = PricingEngine();

  test('calcula precio automatico de impresion 3D no llavero', () {
    final result = pricing.calculatePrintedProduct(
      product: const PrintedProductPricingInput(
        weightGrams: 100,
        printMinutes: 120,
        isKeychain: false,
        supplies: [
          ProductSupplyCost(
            supplyId: 'magnet',
            name: 'Iman',
            quantity: 2,
            unitCost: 50,
          ),
        ],
        priceMode: PriceMode.automatic,
      ),
      settings: const PrintingPricingSettings(
        filamentUsdPerKg: 20,
        exchangeRate: 1000,
        kwhPrice: 100,
        printerWatts: 100,
        machineLifeHours: 1000,
        replacementPartsCost: 100000,
        errorMarginPercent: 10,
        retailMultiplier: 2,
        keychainRetailMultiplier: 3,
        wholesaleDiscountPercent: 20,
        keychainWholesaleDiscountPercent: 10,
        wholesaleGramThreshold: 80,
        keychainWholesaleGramThreshold: 20,
      ),
    );

    expect(result.filamentCost, 2000);
    expect(result.electricityCost, 20);
    expect(result.maintenanceCost, 200);
    expect(result.suppliesCost, 100);
    expect(result.costTotal, 2552);
    expect(result.retailPrice, 5104);
    expect(result.wholesalePrice, 4083);
  });

  test('precio manual conserva costos y recalcula mayorista desde manual', () {
    final result = pricing.calculatePrintedProduct(
      product: const PrintedProductPricingInput(
        weightGrams: 25,
        printMinutes: 30,
        isKeychain: true,
        supplies: [],
        priceMode: PriceMode.manual,
        manualRetailPrice: 2500,
      ),
      settings: const PrintingPricingSettings(
        filamentUsdPerKg: 10,
        exchangeRate: 1000,
        kwhPrice: 100,
        printerWatts: 100,
        machineLifeHours: 1000,
        replacementPartsCost: 100000,
        errorMarginPercent: 0,
        retailMultiplier: 2,
        keychainRetailMultiplier: 4,
        wholesaleDiscountPercent: 20,
        keychainWholesaleDiscountPercent: 10,
        wholesaleGramThreshold: 80,
        keychainWholesaleGramThreshold: 20,
      ),
    );

    expect(result.priceMode, PriceMode.manual);
    expect(result.retailPrice, 2500);
    expect(result.wholesalePrice, 2250);
    expect(result.costTotal, greaterThan(0));
    expect(result.estimatedProfit, 2195);
  });

  test('calcula reventa con mayorista segun minimo', () {
    final result = pricing.calculateResaleProduct(
      product: const ResaleProductPricingInput(
        purchaseCost: 1000,
        priceMode: PriceMode.automatic,
      ),
      settings: const ResalePricingSettings(
        profitPercent: 60,
        wholesaleEnabled: true,
        wholesaleDiscountPercent: 15,
        wholesaleMinimumOrderAmount: 1500,
      ),
      orderAmount: 2000,
    );

    expect(result.retailPrice, 1600);
    expect(result.wholesalePrice, 1360);
    expect(result.estimatedProfit, 600);
  });

  test('estado de pago y sena minima respetan cliente de confianza', () {
    expect(
      PricingEngine.paymentStatusFor(total: 10000, paid: 0),
      PaymentStatus.unpaid,
    );
    expect(
      PricingEngine.paymentStatusFor(total: 10000, paid: 3000),
      PaymentStatus.depositPaid,
    );
    expect(
      PricingEngine.paymentStatusFor(total: 10000, paid: 10000),
      PaymentStatus.paid,
    );
    expect(
      PricingEngine.minimumDeposit(orderTotal: 10000, trustedClient: false),
      5000,
    );
    expect(
      PricingEngine.minimumDeposit(orderTotal: 10000, trustedClient: true),
      0,
    );
  });

  test('cuenta corriente aplica pago desde deuda mas antigua', () {
    const engine = AccountsEngine();
    final allocations = engine.allocatePaymentOldestFirst(
      paymentAmount: 15000,
      debts: [
        PendingOrderDebt(
          orderId: '3',
          createdAt: DateTime(2026, 1, 3),
          pendingAmount: 12000,
        ),
        PendingOrderDebt(
          orderId: '1',
          createdAt: DateTime(2026, 1),
          pendingAmount: 8000,
        ),
        PendingOrderDebt(
          orderId: '2',
          createdAt: DateTime(2026, 1, 2),
          pendingAmount: 10000,
        ),
      ],
    );

    expect(allocations.map((item) => item.orderId), ['1', '2']);
    expect(allocations.map((item) => item.amount), [8000, 7000]);
  });
}
