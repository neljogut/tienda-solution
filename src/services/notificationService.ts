import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Order, OrderItem, OrderStatus, PaymentStatus } from '../types/order';
import type { NotificationType } from '../types/notification';

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  processing: 'En proceso',
  finished: 'Terminado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Sin abonar',
  partial: 'Señado',
  paid: 'Pagado',
};

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString('es-AR')}`;
}

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> {
  if (!metadata) return {};
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) clean[key] = value;
  }
  return clean;
}

export function formatOrderItemsSummary(items: OrderItem[], maxItems = 4): string {
  const lines = items.slice(0, maxItems).map((i) => `${i.name} × ${i.quantity}`);
  if (items.length > maxItems) {
    lines.push(`y ${items.length - maxItems} producto(s) más`);
  }
  return lines.join(', ');
}

async function getStaffRecipientUids(): Promise<string[]> {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const uids: string[] = [];
    snap.forEach((userDoc) => {
      const data = userDoc.data();
      if (data.role === 'owner') {
        uids.push(userDoc.id);
        return;
      }
      if (data.role === 'employee' && data.permissions?.viewOrders !== false) {
        uids.push(userDoc.id);
      }
    });
    return uids;
  } catch (err) {
    console.error('No se pudo obtener usuarios staff para notificaciones:', err);
    return [];
  }
}

async function getClientUserId(customerId: string): Promise<string | null> {
  if (!customerId) return null;

  const clientSnap = await getDoc(doc(db, 'clients', customerId));
  if (clientSnap.exists()) {
    const linkedUid = clientSnap.data().userId as string | undefined;
    if (linkedUid) return linkedUid;
  }

  // Fallback: vínculo solo en users.customerId (clientes creados desde admin)
  const userSnap = await getDocs(
    query(collection(db, 'users'), where('customerId', '==', customerId))
  );
  if (!userSnap.empty) {
    const uid = userSnap.docs[0].id;
    if (clientSnap.exists() && !clientSnap.data().userId) {
      try {
        await updateDoc(doc(db, 'clients', customerId), { userId: uid });
      } catch {
        // no bloquear notificación si falla el sync
      }
    }
    return uid;
  }

  return null;
}

/** Asegura userId en clients cuando el usuario ya tiene customerId */
export async function syncClientUserLink(customerId: string, userUid: string): Promise<void> {
  if (!customerId || !userUid) return;
  const clientSnap = await getDoc(doc(db, 'clients', customerId));
  if (clientSnap.exists() && !clientSnap.data().userId) {
    await updateDoc(doc(db, 'clients', customerId), { userId: userUid });
  }
}

async function createNotifications(
  entries: Array<{
    recipientUid: string;
    type: NotificationType;
    title: string;
    body: string;
    orderId: string;
    orderNumber: number;
    linkPath: string;
    metadata?: Record<string, unknown>;
  }>
): Promise<void> {
  if (entries.length === 0) return;

  const now = new Date().toISOString();
  const batch = writeBatch(db);

  for (const entry of entries) {
    const ref = doc(collection(db, 'notifications'));
    batch.set(ref, {
      recipientUid: entry.recipientUid,
      type: entry.type,
      title: entry.title,
      body: entry.body,
      orderId: entry.orderId,
      orderNumber: entry.orderNumber,
      read: false,
      createdAt: now,
      linkPath: entry.linkPath,
      metadata: sanitizeMetadata(entry.metadata),
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    console.error('Error creando notificaciones en Firestore:', err, entries);
    throw err;
  }
}

/** Nuevo pedido → owner y empleados con permiso de ver pedidos */
export async function notifyStaffNewOrder(order: Order): Promise<void> {
  const staffUids = await getStaffRecipientUids();
  if (staffUids.length === 0) {
    console.warn('notifyStaffNewOrder: no hay owner/empleados para notificar.');
    return;
  }

  const orderNum = String(order.orderNumber).padStart(5, '0');
  const itemsSummary = formatOrderItemsSummary(order.items);
  const title = `Nuevo pedido #${orderNum}`;
  const body = [
    `Cliente: ${order.customerName}`,
    `Total: ${formatMoney(order.totalAmount)}`,
    `Abonado: ${formatMoney(order.paidAmount)} · Pendiente: ${formatMoney(order.pendingAmount)}`,
    `Estado: ${ORDER_STATUS_LABELS[order.orderStatus]} · Pago: ${PAYMENT_STATUS_LABELS[order.paymentStatus]}`,
    `Productos: ${itemsSummary}`,
  ].join('\n');

  await createNotifications(
    staffUids.map((uid) => ({
      recipientUid: uid,
      type: 'new_order' as const,
      title,
      body,
      orderId: order.id,
      orderNumber: order.orderNumber,
      linkPath: `/orders?open=${order.id}`,
      metadata: {
        customerName: order.customerName,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        totalAmount: order.totalAmount,
        paidAmount: order.paidAmount,
        pendingAmount: order.pendingAmount,
        itemsSummary,
      },
    }))
  );
}

/** Cambios de estado o pago → cliente vinculado al pedido */
export async function notifyClientOrderChanges(
  order: Order,
  changes: {
    orderStatus?: OrderStatus;
    paymentStatus?: PaymentStatus;
    paidAmount?: number;
    pendingAmount?: number;
    previousOrderStatus?: OrderStatus;
    previousPaymentStatus?: PaymentStatus;
    paymentNote?: string;
  }
): Promise<void> {
  const clientUid = await getClientUserId(order.customerId);
  if (!clientUid) {
    console.warn('notifyClientOrderChanges: cliente sin cuenta vinculada (userId).', order.customerId);
    return;
  }

  const orderNum = String(order.orderNumber).padStart(5, '0');
  const lines: string[] = [`Pedido #${orderNum} — ${order.customerName}`];
  let type: NotificationType = 'order_updated';
  let title = `Actualización del pedido #${orderNum}`;

  if (changes.orderStatus && changes.orderStatus !== changes.previousOrderStatus) {
    type = 'order_status';
    title = `Pedido #${orderNum} — ${ORDER_STATUS_LABELS[changes.orderStatus]}`;
    const prev = changes.previousOrderStatus
      ? ORDER_STATUS_LABELS[changes.previousOrderStatus]
      : '—';
    lines.push(`Estado: ${ORDER_STATUS_LABELS[changes.orderStatus]} (antes: ${prev})`);
  }

  if (
    changes.paymentStatus !== undefined &&
    (changes.paymentStatus !== changes.previousPaymentStatus ||
      changes.paidAmount !== order.paidAmount)
  ) {
    type = changes.orderStatus ? 'order_updated' : 'order_payment';
    if (type === 'order_payment') {
      title = `Pedido #${orderNum} — Pago ${PAYMENT_STATUS_LABELS[changes.paymentStatus]}`;
    }
    lines.push(
      `Pago: ${PAYMENT_STATUS_LABELS[changes.paymentStatus]}`,
      `Abonado: ${formatMoney(changes.paidAmount ?? order.paidAmount)}`,
      `Pendiente: ${formatMoney(changes.pendingAmount ?? order.pendingAmount)}`
    );
    if (changes.paymentNote) {
      lines.push(changes.paymentNote);
    }
  }

  lines.push(`Total del pedido: ${formatMoney(order.totalAmount)}`);

  await createNotifications([
    {
      recipientUid: clientUid,
      type,
      title,
      body: lines.join('\n'),
      orderId: order.id,
      orderNumber: order.orderNumber,
      linkPath: `/my-orders?open=${order.id}`,
      metadata: {
        orderStatus: changes.orderStatus ?? order.orderStatus,
        paymentStatus: changes.paymentStatus ?? order.paymentStatus,
        totalAmount: order.totalAmount,
        paidAmount: changes.paidAmount ?? order.paidAmount,
        pendingAmount: changes.pendingAmount ?? order.pendingAmount,
        previousOrderStatus: changes.previousOrderStatus,
        previousPaymentStatus: changes.previousPaymentStatus,
      },
    },
  ]);
}

/** Cliente declara pago → notifica owner/empleados (campanita + push vía CF) */
export async function notifyStaffPaymentDeclared(params: {
  declarationId: string;
  customerId: string;
  customerName: string;
  amount: number;
  method: string;
  orderId?: string;
  orderNumber?: number;
}): Promise<void> {
  const staffUids = await getStaffRecipientUids();
  if (staffUids.length === 0) {
    console.warn('notifyStaffPaymentDeclared: no hay staff para notificar.');
    return;
  }

  const methodLabel = params.method === 'transfer' ? 'Transferencia' : params.method;
  let title = `Pago declarado — ${params.customerName}`;
  let body = [
    `${params.customerName} informó un pago de ${formatMoney(params.amount)}.`,
    `Método: ${methodLabel}`,
    'Revisá el comprobante en WhatsApp y registrá el pago en Cuentas corrientes.',
  ].join('\n');
  let linkPath = '/accounts';

  if (params.orderId) {
    const orderNum = String(params.orderNumber || 0).padStart(5, '0');
    title = `Pago declarado — Pedido #${orderNum}`;
    body = [
      `${params.customerName} informó transferencia de ${formatMoney(params.amount)}.`,
      `Pedido #${orderNum}`,
      'Revisá WhatsApp y registrá el pago.',
    ].join('\n');
    linkPath = `/accounts?client=${params.customerId}`;
  } else if (params.customerId) {
    linkPath = `/accounts?client=${params.customerId}`;
  }

  await createNotifications(
    staffUids.map((uid) => ({
      recipientUid: uid,
      type: 'balance_payment' as const,
      title,
      body,
      orderId: params.orderId || '',
      orderNumber: params.orderNumber || 0,
      linkPath,
      metadata: {
        customerName: params.customerName,
        customerId: params.customerId,
        amount: params.amount,
        method: params.method,
        declarationId: params.declarationId,
      },
    }))
  );
}

/** Pago confirmado en cuentas corrientes → notifica al cliente una sola vez */
export async function notifyClientAccountPayment(params: {
  customerId: string;
  customerName: string;
  amount: number;
  paymentMethod: string;
  remainingOwed: number;
}): Promise<void> {
  const clientUid = await getClientUserId(params.customerId);
  if (!clientUid) {
    console.warn('notifyClientAccountPayment: cliente sin cuenta vinculada.', params.customerId);
    return;
  }

  const methodLabels: Record<string, string> = {
    cash: 'Efectivo',
    transfer: 'Transferencia',
    mercadopago: 'MercadoPago',
    card: 'Tarjeta',
    other: 'Otro',
  };
  const methodLabel = methodLabels[params.paymentMethod] || params.paymentMethod;

  const title = `Pago confirmado — ${formatMoney(params.amount)}`;
  const body = [
    `Hola ${params.customerName},`,
    `Confirmamos tu pago de ${formatMoney(params.amount)} (${methodLabel}).`,
    params.remainingOwed > 0
      ? `Saldo pendiente en tu cuenta: ${formatMoney(params.remainingOwed)}.`
      : 'Tu cuenta corriente quedó al día.',
  ].join('\n');

  await createNotifications([
    {
      recipientUid: clientUid,
      type: 'order_payment',
      title,
      body,
      orderId: '',
      orderNumber: 0,
      linkPath: '/my-account-balance',
      metadata: {
        customerName: params.customerName,
        paidAmount: params.amount,
        pendingAmount: params.remainingOwed,
        paymentStatus: params.remainingOwed <= 0 ? 'paid' : 'partial',
      },
    },
  ]);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await updateDoc(doc(db, 'notifications', notificationId), { read: true });
}

export async function markAllNotificationsRead(recipientUid: string): Promise<void> {
  const snap = await getDocs(
    query(collection(db, 'notifications'), where('recipientUid', '==', recipientUid))
  );

  const unread = snap.docs.filter((d) => !d.data().read);
  if (unread.length === 0) return;

  const batch = writeBatch(db);
  unread.forEach((notifDoc) => {
    batch.update(notifDoc.ref, { read: true });
  });
  await batch.commit();
}
