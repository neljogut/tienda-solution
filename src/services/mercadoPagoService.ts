import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

// Initialize functions in the correct region
const functions = getFunctions(app, 'southamerica-east1');

export interface PaymentIntentPayload {
  type: 'catalog' | 'balance';
  customerId: string;
  amount: number;
  method: 'mercadopago' | 'transfer' | 'none';
  orderId?: string | null;
}

export interface PaymentIntentResult {
  paymentIntentId: string;
}

export interface MPPreferencePayload {
  paymentIntentId: string;
  title: string;
}

export interface MPPreferenceResult {
  initPoint: string;
  preferenceId: string;
  paymentIntentId: string;
}

export interface MPCredentialsPayload {
  accessToken: string;
  publicKey: string;
  enabled: boolean;
}

/**
 * Crea un payment intent en Firestore (vía Cloud Functions)
 */
export async function createMPPaymentIntent(payload: PaymentIntentPayload): Promise<PaymentIntentResult> {
  const fn = httpsCallable<PaymentIntentPayload, PaymentIntentResult>(functions, 'createPaymentIntent');
  const res = await fn(payload);
  return res.data;
}

/**
 * Crea una preferencia de pago en Mercado Pago vinculada al intent
 */
export async function createMPPreference(payload: MPPreferencePayload): Promise<MPPreferenceResult> {
  const fn = httpsCallable<MPPreferencePayload, MPPreferenceResult>(functions, 'createMercadoPagoPreference');
  const res = await fn(payload);
  return res.data;
}

/**
 * Guarda las credenciales de Mercado Pago de forma privada
 */
export async function saveMPCredentials(payload: MPCredentialsPayload): Promise<{ ok: boolean }> {
  const fn = httpsCallable<MPCredentialsPayload, { ok: boolean }>(functions, 'saveMercadoPagoCredentials');
  const res = await fn(payload);
  return res.data;
}

/**
 * Prueba la conexión entre Firebase y la API de Mercado Pago
 */
export async function testMPConnection(): Promise<{ ok: boolean; message: string }> {
  const fn = httpsCallable<void, { ok: boolean; message: string }>(functions, 'testMercadoPagoConnection');
  const res = await fn();
  return res.data;
}
