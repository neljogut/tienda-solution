export type ClientType = 'normal' | 'wholesale' | 'trusted';

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  cuit?: string;
  observations?: string;
  createdAt: string;
  clientType: ClientType;
  // Link to auth user if registered
  userId?: string;
  // Computed / denormalized
  totalPurchased?: number;
  totalOwed?: number;
}
