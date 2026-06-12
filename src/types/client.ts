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
  dni?: string;
  cuit?: string;
  observations?: string;
  createdAt: string;

  // New flexible classification (independent booleans)
  isWholesale: boolean;
  isTrusted: boolean;
  isLocal: boolean;

  // Legacy field – kept for migration from old data
  clientType?: ClientType;

  // Link to auth user if registered
  userId?: string;
  // Computed / denormalized
  totalPurchased?: number;
  totalOwed?: number;
  employeeId?: string;
  employeeName?: string;
}

/**
 * Migrate a client object read from Firestore.
 * If the new boolean fields don't exist, infer them from the legacy `clientType`.
 */
export function migrateClient(raw: Record<string, unknown>): Partial<Client> {
  const hasNewFields = typeof raw.isWholesale === 'boolean';
  const migrated = (hasNewFields ? raw as Partial<Client> : {
    ...raw,
    isWholesale: raw.clientType === 'wholesale',
    isTrusted: raw.clientType === 'trusted',
  }) as Partial<Client>;

  if (migrated.isLocal === undefined) {
    migrated.isLocal = false;
  }
  return migrated;
}

/**
 * Returns a human-readable label for the client classification.
 */
export function getClientLabel(client: Pick<Client, 'isWholesale' | 'isTrusted' | 'isLocal'>): string {
  let label = 'Minorista';
  if (client.isWholesale && client.isTrusted) label = 'Mayorista de Confianza';
  else if (client.isWholesale) label = 'Mayorista';
  else if (client.isTrusted) label = 'Minorista de Confianza';

  if (client.isLocal) {
    label += ' (Local/Comercio)';
  }
  return label;
}
