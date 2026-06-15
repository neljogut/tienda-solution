import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, getFunctionsRegion } from '../firebase';

const functions = getFunctions(app, getFunctionsRegion());

export interface FinalizeSharedOrderPayload {
  orderId: string;
  paymentMethod: 'later' | 'transfer' | 'mercadopago';
}

export interface FinalizeSharedOrderResult {
  orderNumber: number;
  totalAmount: number;
}

export async function finalizeSharedOrder(payload: FinalizeSharedOrderPayload): Promise<FinalizeSharedOrderResult> {
  const fn = httpsCallable<FinalizeSharedOrderPayload, FinalizeSharedOrderResult>(functions, 'finalizeSharedOrder');
  const res = await fn(payload);
  return res.data;
}
