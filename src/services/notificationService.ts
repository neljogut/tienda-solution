import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Order, OrderItem, OrderStatus, PaymentStatus } from '../types/order';
import type { NotificationType } from '../types/notification';

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
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

export function formatOrderItemsSummary(items: OrderItem[], maxItems = 4): string {
  const lines = items.slice(0, maxItems).map((i) => `${i.name} × ${i.quantity}`);
  if (items.length > maxItems) {
    lines.push(`y ${items.length - maxItems} producto(s) más`);
  }
  return lines.join(', ');
}

async function getStaffRecipientUids(): Promise<string[]> {
  const snap = await getDocs(
    query(collection(db, 'users'), where('role', 'in', ['owner', 'employee']))
  );
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
}

async function getClientUserId(customerId: string): Promise<string | null> {
  if (!customerId) return null;
  const snap = await getDoc(doc(db, 'clients', customerId));
  if (!snap.exists()) return null;
  return (snap.data().userId as string) || null;
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
      metadata: entry.metadata || {},
    });
  }

  await batch.commit();
}

/** Nuevo pedido → owner y empleados con permiso de ver pedidos */
export async function notifyStaffNewOrder(order: Order): Promise<void> {
  const staffUids = await getStaffRecipientUids();
  if (staffUids.length === 0) return;

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
  if (!clientUid) return;

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

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { updateDoc } = await import('firebase/firestore');
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
