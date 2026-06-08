export type Role = 'owner' | 'employee' | 'client' | 'guest';

export interface UserPermissions {
  viewOrders?: boolean;
  createOrders?: boolean;
  editOrders?: boolean;
  changeOrderState?: boolean;
  registerPayments?: boolean;
  viewClients?: boolean;
  createClients?: boolean;
  editClients?: boolean;
  viewCatalog?: boolean;
  createProducts?: boolean;
  editProducts?: boolean;
  uploadImages?: boolean;
  editImages?: boolean;
  deleteImages?: boolean;
  viewInventory?: boolean;
  modifyInventory?: boolean;
  viewInventoryMovements?: boolean;
  openCash?: boolean;
  closeCash?: boolean;
  viewCash?: boolean;
  viewCashHistory?: boolean;
  viewBalance?: boolean;
  viewProfits?: boolean;
  viewPriceSettings?: boolean;
  viewInternalPDFs?: boolean;
  downloadInternalPDFs?: boolean;
  downloadBalancePDFs?: boolean;
  viewManualPrices?: boolean;
}

export interface UserData {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  permissions?: UserPermissions;
  customerId?: string;
  forcePasswordChange?: boolean;
}
