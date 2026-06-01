class FirebaseCollections {
  const FirebaseCollections._();

  static const users = 'users';
  static const customers = 'customers';
  static const employees = 'employees';
  static const products = 'products';
  static const filaments = 'filaments';
  static const supplies = 'supplies';
  static const orders = 'orders';
  static const payments = 'payments';
  static const cashSessions = 'cash_sessions';
  static const cashMovements = 'cash_movements';
  static const inventoryMovements = 'inventory_movements';
  static const businessSettings = 'business_settings';
  static const pricingSettings = 'pricing_settings';
  static const exchangeRates = 'exchange_rates';
  static const pdfDocuments = 'pdf_documents';
}

class FirebaseSetup {
  const FirebaseSetup._();

  static const requiredCliCommand = 'flutterfire configure';

  static const note = '''
Firebase todavia no esta vinculado en este workspace.
Ejecutar flutterfire configure con el proyecto real y revisar las reglas antes de publicar.
''';
}
