// Legacy type kept for backward-compat migration from old Firestore docs
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

  // New flexible classification (independent booleans)
  isWholesale: boolean;
  isTrusted: boolean;

  // Legacy field – kept for migration from old data
  clientType?: ClientType;

  // Link to auth user if registered
  userId?: string;
  // Computed / denormalized
  totalPurchased?: number;
  totalOwed?: number;
}

/**
 * Migrate a client object read from Firestore.
 * If the new boolean fields don't exist, infer them from the legacy `clientType`.
 */
export function migrateClient(raw: Record<string, unknown>): Partial<Client> {
  const hasNewFields = typeof raw.isWholesale === 'boolean';
  if (hasNewFields) return raw as Partial<Client>;

  const legacy = (raw.clientType as ClientType) || 'normal';
  return {
    ...raw,
    isWholesale: legacy === 'wholesale',
    isTrusted: legacy === 'trusted',
  } as Partial<Client>;
}

/**
 * Returns a human-readable label for the client classification.
 */
export function getClientLabel(client: Pick<Client, 'isWholesale' | 'isTrusted'>): string {
  if (client.isWholesale && client.isTrusted) return 'Mayorista de Confianza';
  if (client.isWholesale) return 'Mayorista';
  if (client.isTrusted) return 'Minorista de Confianza';
  return 'Minorista';
}
