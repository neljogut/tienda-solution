export interface QuoteItem {
  id: string; // can be product id or random string for manual items
  isManual: boolean;
  name: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface Quote {
  id: string;
  customerName: string;
  items: QuoteItem[];
  total: number;
  createdAt: string; // ISO date
  validUntil: string; // ISO date (+7 days)
}
