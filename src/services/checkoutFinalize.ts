import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Order } from '../types/order';
import type { BusinessSettings } from '../types/settings';
import { buildWhatsAppUrl } from '../utils/whatsapp';

// PDF a Storage: activar Firebase Storage en la consola del proyecto y volver a enlazar uploadOrderPdf

interface WhatsAppOpenOptions {
  preOpenedWindow?: Window | null;
}

export type CheckoutPaymentMethod = 'mercadopago' | 'transfer' | 'none';

interface FinalizeParams {
  order: Order;
  amountPaid: number;
  method: CheckoutPaymentMethod;
  paymentIntentId?: string;
}

function buildCheckoutMessage(
  order: Order,
  business: BusinessSettings,
  amountPaid: number,
  method: CheckoutPaymentMethod,
  pdfUrl: string | null
): string {
  const orderNum = String(order.orderNumber).padStart(5, '0');
  const lines = [
    `Hola ${business.name}! Soy ${order.customerName}.`,
    ``,
    `*Pedido #${orderNum}*`,
    `Total: $${order.totalAmount.toLocaleString('es-AR')}`,
    `Abonado ahora: $${amountPaid.toLocaleString('es-AR')}`,
    `Pendiente: $${(order.pendingAmount ?? order.totalAmount - amountPaid).toLocaleString('es-AR')}`,
    `Método: ${method === 'mercadopago' ? 'Mercado Pago' : method === 'transfer' ? 'Transferencia bancaria' : 'A coordinar'}`,
  ];

  if (method === 'transfer') {
    lines.push(
      ``,
      `*Realicé una transferencia.* Por favor registrá el pago en mis movimientos.`,
      `Enviá el *comprobante de transferencia* en este chat para que el pago quede registrado correctamente.`
    );
  }

  if (pdfUrl) {
    lines.push(``, `Comprobante del pedido (PDF): ${pdfUrl}`);
  } else if (method !== 'none') {
    lines.push(``, `Referencia del pedido: #${orderNum}`);
  }

  lines.push(``, `Gracias!`);
  return lines.join('\n');
}

function openWhatsAppMessage(
  phone: string,
  message: string,
  options?: WhatsAppOpenOptions
): boolean {
  const url = buildWhatsAppUrl(phone, message);
  if (!url) return false;

  const preOpened = options?.preOpenedWindow;
  if (preOpened && !preOpened.closed) {
    preOpened.location.href = url;
    return true;
  }

  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    window.location.href = url;
  }
  return true;
}

export async function finalizeCheckoutWithWhatsApp(
  params: FinalizeParams,
  options?: WhatsAppOpenOptions
): Promise<boolean> {
  const businessSnap = await getDoc(doc(db, 'settings', 'business'));
  const business = (businessSnap.exists() ? businessSnap.data() : {}) as BusinessSettings;

  if (!business.whatsapp?.trim()) {
    console.warn('WhatsApp no configurado en el negocio.');
    options?.preOpenedWindow?.close();
    return false;
  }

  const message = buildCheckoutMessage(
    params.order,
    business,
    params.amountPaid,
    params.method,
    null
  );
  return openWhatsAppMessage(business.whatsapp, message, options);
}

export async function finalizeBalancePaymentWithWhatsApp(
  params: {
    customerName: string;
    amount: number;
    method: CheckoutPaymentMethod;
  },
  options?: WhatsAppOpenOptions
): Promise<boolean> {
  const businessSnap = await getDoc(doc(db, 'settings', 'business'));
  const business = (businessSnap.exists() ? businessSnap.data() : {}) as BusinessSettings;

  if (!business.whatsapp?.trim()) {
    options?.preOpenedWindow?.close();
    return false;
  }

  const lines = [
    `Hola ${business.name}! Soy ${params.customerName}.`,
    ``,
    `*Pago de cuenta corriente*`,
    `Monto: $${params.amount.toLocaleString('es-AR')}`,
    `Método: ${params.method === 'mercadopago' ? 'Mercado Pago' : 'Transferencia bancaria'}`,
  ];

  if (params.method === 'transfer') {
    lines.push(
      ``,
      `Realicé una transferencia. Envío el comprobante para que registren el pago en mis movimientos.`
    );
  }

  return openWhatsAppMessage(business.whatsapp, lines.join('\n'), options);
}
