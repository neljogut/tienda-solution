import { addDoc, collection, doc, runTransaction, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { PaymentDeclarationStatus } from '../types/payment';
import { notifyStaffPaymentDeclared } from './notificationService';

const ALREADY_NOTIFIED = 'ALREADY_NOTIFIED';

export async function declareBalancePayment(params: {
  customerId: string;
  customerName: string;
  amount: number;
  method: 'transfer' | 'mercadopago';
  createdBy: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'payment_declarations'), {
    type: 'balance',
    customerId: params.customerId,
    customerName: params.customerName,
    amount: params.amount,
    method: params.method,
    status: 'declared',
    staffNotified: false,
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy,
  });
  return ref.id;
}

export async function declareOrderTransferPayment(params: {
  orderId: string;
  orderNumber: number;
  customerId: string;
  customerName: string;
  amount: number;
  createdBy: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'payment_declarations'), {
    type: 'order_transfer',
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    customerId: params.customerId,
    customerName: params.customerName,
    amount: params.amount,
    method: 'transfer',
    status: 'declared',
    staffNotified: false,
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy,
  });
  return ref.id;
}

/** Notifica al staff una sola vez (cliente o CF compiten por staffNotified). */
export async function notifyStaffPaymentDeclarationOnce(params: {
  declarationId: string;
  customerId: string;
  customerName: string;
  amount: number;
  method: string;
  orderId?: string;
  orderNumber?: number;
}): Promise<void> {
  const ref = doc(db, 'payment_declarations', params.declarationId);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists() || snap.data()?.staffNotified === true) {
        throw new Error(ALREADY_NOTIFIED);
      }
      transaction.update(ref, { staffNotified: true });
    });
  } catch (err) {
    if (err instanceof Error && err.message === ALREADY_NOTIFIED) return;
    throw err;
  }

  await notifyStaffPaymentDeclared({
    declarationId: params.declarationId,
    customerId: params.customerId,
    customerName: params.customerName,
    amount: params.amount,
    method: params.method,
    orderId: params.orderId,
    orderNumber: params.orderNumber,
  });
}

export async function updatePaymentDeclarationStatus(
  declarationId: string,
  status: PaymentDeclarationStatus
): Promise<void> {
  await updateDoc(doc(db, 'payment_declarations', declarationId), { status });
}
