import 'enums.dart';

class PrintingPricingSettings {
  const PrintingPricingSettings({
    required this.filamentUsdPerKg,
    required this.exchangeRate,
    required this.kwhPrice,
    required this.printerWatts,
    required this.machineLifeHours,
    required this.replacementPartsCost,
    required this.errorMarginPercent,
    required this.retailMultiplier,
    required this.keychainRetailMultiplier,
    required this.wholesaleDiscountPercent,
    required this.keychainWholesaleDiscountPercent,
    required this.wholesaleGramThreshold,
    required this.keychainWholesaleGramThreshold,
  });

  final double filamentUsdPerKg;
  final double exchangeRate;
  final double kwhPrice;
  final double printerWatts;
  final double machineLifeHours;
  final double replacementPartsCost;
  final double errorMarginPercent;
  final double retailMultiplier;
  final double keychainRetailMultiplier;
  final double wholesaleDiscountPercent;
  final double keychainWholesaleDiscountPercent;
  final double wholesaleGramThreshold;
  final double keychainWholesaleGramThreshold;
}

class ResalePricingSettings {
  const ResalePricingSettings({
    required this.profitPercent,
    required this.wholesaleEnabled,
    required this.wholesaleDiscountPercent,
    required this.wholesaleMinimumOrderAmount,
  });

  final double profitPercent;
  final bool wholesaleEnabled;
  final double wholesaleDiscountPercent;
  final double wholesaleMinimumOrderAmount;
}

class ProductSupplyCost {
  const ProductSupplyCost({
    required this.supplyId,
    required this.name,
    required this.quantity,
    required this.unitCost,
  });

  final String supplyId;
  final String name;
  final double quantity;
  final double unitCost;

  double get total => quantity * unitCost;
}

class PrintedProductPricingInput {
  const PrintedProductPricingInput({
    required this.weightGrams,
    required this.printMinutes,
    required this.isKeychain,
    required this.supplies,
    required this.priceMode,
    this.manualRetailPrice,
  });

  final double weightGrams;
  final double printMinutes;
  final bool isKeychain;
  final List<ProductSupplyCost> supplies;
  final PriceMode priceMode;
  final double? manualRetailPrice;
}

class ResaleProductPricingInput {
  const ResaleProductPricingInput({
    required this.purchaseCost,
    required this.priceMode,
    this.manualRetailPrice,
  });

  final double purchaseCost;
  final PriceMode priceMode;
  final double? manualRetailPrice;
}

class PricingBreakdown {
  const PricingBreakdown({
    required this.priceMode,
    required this.retailPrice,
    required this.costTotal,
    required this.estimatedProfit,
    this.wholesalePrice,
    this.filamentCost = 0,
    this.electricityCost = 0,
    this.maintenanceCost = 0,
    this.suppliesCost = 0,
    this.purchaseCost = 0,
    this.errorMargin = 0,
  });

  final PriceMode priceMode;
  final int retailPrice;
  final int? wholesalePrice;
  final double filamentCost;
  final double electricityCost;
  final double maintenanceCost;
  final double suppliesCost;
  final double purchaseCost;
  final double errorMargin;
  final double costTotal;
  final double estimatedProfit;

  Map<String, Object?> toSnapshot() => {
    'priceMode': priceMode.name,
    'retailPrice': retailPrice,
    'wholesalePrice': wholesalePrice,
    'filamentCost': filamentCost,
    'electricityCost': electricityCost,
    'maintenanceCost': maintenanceCost,
    'suppliesCost': suppliesCost,
    'purchaseCost': purchaseCost,
    'errorMargin': errorMargin,
    'costTotal': costTotal,
    'estimatedProfit': estimatedProfit,
  };
}
