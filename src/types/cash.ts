export type PaymentMethod = 'cash' | 'transfer' | 'mercadopago' | 'card' | 'other';
export type CashMovementType = 'sale_income' | 'account_payment' | 'deposit' | 'manual_income' | 'manual_expense' | 'adjustment';

export interface CashMovement {
  id: string;
  sessionId: string;
  date: string;
  type: CashMovementType;
  amount: number;
  paymentMethod: PaymentMethod;
  orderId?: string;
  customerId?: string;
  userId: string;
  userName: string;
  observation: string;
}

export interface CashSession {
  id: string;
  openedAt: string;
  openedBy: string; // userId
  openedByName: string;
  initialAmount: number;
  
  status: 'open' | 'closed';
  
  closedAt?: string;
  closedBy?: string;
  closedByName?: string;
  
  totalIncome: number;
  totalExpense: number;
  expectedAmount: number;
  declaredAmount?: number;
  difference?: number;
  
  breakdown?: {
    cash: number;
    transfer: number;
    mercadopago: number;
    card: number;
    other: number;
  };
  
  observations?: string;
}
