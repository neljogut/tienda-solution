import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { PaymentDeclarationStatus } from '../types/payment';

export async function declareBalancePayment(params: {
  customerId: string;
  customerName: string;
  amount: number;
  method: 'transfer' | 'mercadopago';
  createdBy: string;
}): Promise<void> {
  await addDoc(collection(db, 'payment_declarations'), {
    type: 'balance',
    customerId: params.customerId,
    customerName: params.customerName,
    amount: params.amount,
    method: params.method,
    status: 'declared',
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy,
  });
}

export async function declareOrderTransferPayment(params: {
  orderId: string;
  orderNumber: number;
  customerId: string;
  customerName: string;
  amount: number;
  createdBy: string;
}): Promise<void> {
  await addDoc(collection(db, 'payment_declarations'), {
    type: 'order_transfer',
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    customerId: params.customerId,
    customerName: params.customerName,
    amount: params.amount,
    method: 'transfer',
    status: 'declared',
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy,
  });
}

export async function updatePaymentDeclarationStatus(
  declarationId: string,
  status: PaymentDeclarationStatus
): Promise<void> {
  await updateDoc(doc(db, 'payment_declarations', declarationId), { status });
}
