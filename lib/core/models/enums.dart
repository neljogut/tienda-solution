enum UserRole { guest, owner, employee, client }

enum ProductType { printed3d, resale }

enum ProductStatus { active, inactive }

enum PriceMode { automatic, manual }

enum OrderStatus { pending, inProgress, finished, delivered, canceled }

enum PaymentStatus { unpaid, depositPaid, paid }

enum PaymentMethod { cash, transfer, mercadoPago, card, other }

enum InventoryMovementType {
  stockIn,
  saleOut,
  manualAdjustment,
  returnIn,
  correction,
  filamentConsumption,
  supplyConsumption,
  info,
}

enum CashSessionStatus { open, closed }

extension UserRoleLabel on UserRole {
  String get label => switch (this) {
    UserRole.guest => 'Invitado',
    UserRole.owner => 'Owner',
    UserRole.employee => 'Empleado',
    UserRole.client => 'Cliente',
  };
}

extension ProductTypeLabel on ProductType {
  String get label => switch (this) {
    ProductType.printed3d => 'Impresion 3D',
    ProductType.resale => 'Reventa',
  };
}

extension OrderStatusLabel on OrderStatus {
  String get label => switch (this) {
    OrderStatus.pending => 'Pendiente',
    OrderStatus.inProgress => 'En proceso',
    OrderStatus.finished => 'Terminado',
    OrderStatus.delivered => 'Entregado',
    OrderStatus.canceled => 'Cancelado',
  };
}

extension PaymentStatusLabel on PaymentStatus {
  String get label => switch (this) {
    PaymentStatus.unpaid => 'Sin abonar',
    PaymentStatus.depositPaid => 'Senado',
    PaymentStatus.paid => 'Pagado',
  };
}

extension PaymentMethodLabel on PaymentMethod {
  String get label => switch (this) {
    PaymentMethod.cash => 'Efectivo',
    PaymentMethod.transfer => 'Transferencia',
    PaymentMethod.mercadoPago => 'Mercado Pago',
    PaymentMethod.card => 'Tarjeta',
    PaymentMethod.other => 'Otro',
  };
}
