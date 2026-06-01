import '../models/enums.dart';
import '../models/pricing_models.dart';

class PricingEngine {
  const PricingEngine();

  PricingBreakdown calculatePrintedProduct({
    required PrintedProductPricingInput product,
    required PrintingPricingSettings settings,
  }) {
    final filamentCost =
        (product.weightGrams / 1000) *
        settings.filamentUsdPerKg *
        settings.exchangeRate;
    final printHours = product.printMinutes / 60;
    final electricityCost =
        (settings.printerWatts / 1000) * printHours * settings.kwhPrice;
    final double maintenanceCost = settings.machineLifeHours <= 0
        ? 0.0
        : (settings.replacementPartsCost / settings.machineLifeHours) *
              printHours;
    final suppliesCost = product.supplies.fold<double>(
      0,
      (total, supply) => total + supply.total,
    );
    final baseCost =
        filamentCost + electricityCost + maintenanceCost + suppliesCost;
    final errorMargin = baseCost * settings.errorMarginPercent / 100;
    final realCost = baseCost + errorMargin;
    final multiplier = product.isKeychain
        ? settings.keychainRetailMultiplier
        : settings.retailMultiplier;
    final automaticRetailPrice = realCost * multiplier;
    final retailPrice = _roundCurrency(
      product.priceMode == PriceMode.manual
          ? product.manualRetailPrice ?? automaticRetailPrice
          : automaticRetailPrice,
    );
    final wholesaleThreshold = product.isKeychain
        ? settings.keychainWholesaleGramThreshold
        : settings.wholesaleGramThreshold;
    final discount = product.isKeychain
        ? settings.keychainWholesaleDiscountPercent
        : settings.wholesaleDiscountPercent;
    final wholesalePrice = product.weightGrams >= wholesaleThreshold
        ? _roundCurrency(retailPrice * (1 - discount / 100))
        : null;

    return PricingBreakdown(
      priceMode: product.priceMode,
      retailPrice: retailPrice,
      wholesalePrice: wholesalePrice,
      filamentCost: filamentCost,
      electricityCost: electricityCost,
      maintenanceCost: maintenanceCost,
      suppliesCost: suppliesCost,
      errorMargin: errorMargin,
      costTotal: realCost,
      estimatedProfit: retailPrice - realCost,
    );
  }

  PricingBreakdown calculateResaleProduct({
    required ResaleProductPricingInput product,
    required ResalePricingSettings settings,
    double orderAmount = 0,
  }) {
    final automaticRetailPrice =
        product.purchaseCost * (1 + settings.profitPercent / 100);
    final retailPrice = _roundCurrency(
      product.priceMode == PriceMode.manual
          ? product.manualRetailPrice ?? automaticRetailPrice
          : automaticRetailPrice,
    );
    final wholesaleApplies =
        settings.wholesaleEnabled &&
        settings.wholesaleMinimumOrderAmount > 0 &&
        orderAmount >= settings.wholesaleMinimumOrderAmount;
    final wholesalePrice = wholesaleApplies
        ? _roundCurrency(
            retailPrice * (1 - settings.wholesaleDiscountPercent / 100),
          )
        : null;

    return PricingBreakdown(
      priceMode: product.priceMode,
      retailPrice: retailPrice,
      wholesalePrice: wholesalePrice,
      purchaseCost: product.purchaseCost,
      costTotal: product.purchaseCost,
      estimatedProfit: retailPrice - product.purchaseCost,
    );
  }

  static PaymentStatus paymentStatusFor({
    required num total,
    required num paid,
  }) {
    if (paid <= 0) return PaymentStatus.unpaid;
    if (paid >= total) return PaymentStatus.paid;
    return PaymentStatus.depositPaid;
  }

  static int minimumDeposit({
    required int orderTotal,
    required bool trustedClient,
  }) {
    if (trustedClient) return 0;
    return _roundCurrency(orderTotal * 0.5);
  }

  static int _roundCurrency(num value) => value.round();
}
