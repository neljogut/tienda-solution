import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {db} from "./admin.js";

function getFirestoreRegion(): string {
  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    "";
  if (projectId === "solution-3d") return "southamerica-west1";
  return "southamerica-east1";
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  processing: "En proceso",
  finished: "Terminado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Sin abonar",
  partial: "Señado",
  paid: "Pagado",
};

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString("es-AR")}`;
}

function formatItemsSummary(items: Array<{name?: string; quantity?: number}>, maxItems = 4): string {
  const lines = items.slice(0, maxItems).map((i) => `${i.name || "Producto"} × ${i.quantity || 1}`);
  if (items.length > maxItems) {
    lines.push(`y ${items.length - maxItems} producto(s) más`);
  }
  return lines.join(", ");
}

async function getStaffRecipientUids(): Promise<string[]> {
  const snap = await db.collection("users").get();
  const uids: string[] = [];
  snap.forEach((userDoc) => {
    const data = userDoc.data();
    if (data.role === "owner") {
      uids.push(userDoc.id);
      return;
    }
    if (data.role === "employee" && data.permissions?.viewOrders !== false) {
      uids.push(userDoc.id);
    }
  });
  return uids;
}

/** Nuevo pedido en Firestore → notifica owner y empleados (siempre, aunque el cliente cierre la pestaña). */
export const notifyStaffOnNewOrder = onDocumentCreated(
  {
    document: "orders/{orderId}",
    region: getFirestoreRegion(),
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const order = snap.data();
    const orderId = snap.id;
    const staffUids = await getStaffRecipientUids();

    const commissionEmployeeId = order.commissionEmployeeId as string | undefined;
    if (commissionEmployeeId && !staffUids.includes(commissionEmployeeId)) {
      staffUids.push(commissionEmployeeId);
    }

    if (staffUids.length === 0) {
      console.log("notifyStaffOnNewOrder: no hay staff para notificar.");
      return;
    }

    const orderNumber = (order.orderNumber as number) || 0;
    const orderNum = String(orderNumber).padStart(5, "0");
    const items = (order.items as Array<{name?: string; quantity?: number}>) || [];
    const itemsSummary = formatItemsSummary(items);
    const customerName = (order.customerName as string) || "Cliente";
    const orderStatus = (order.orderStatus as string) || "pending";
    const paymentStatus = (order.paymentStatus as string) || "unpaid";
    const totalAmount = (order.totalAmount as number) || 0;
    const paidAmount = (order.paidAmount as number) || 0;
    const pendingAmount = (order.pendingAmount as number) || 0;

    const title = `Nuevo pedido #${orderNum}`;
    const body = [
      `Cliente: ${customerName}`,
      `Total: ${formatMoney(totalAmount)}`,
      `Abonado: ${formatMoney(paidAmount)} · Pendiente: ${formatMoney(pendingAmount)}`,
      `Estado: ${ORDER_STATUS_LABELS[orderStatus] || orderStatus} · Pago: ${PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus}`,
      `Productos: ${itemsSummary}`,
    ].join("\n");

    const now = new Date().toISOString();
    const batch = db.batch();

    for (const uid of staffUids) {
      const ref = db.collection("notifications").doc();
      batch.set(ref, {
        recipientUid: uid,
        type: "new_order",
        title,
        body,
        orderId,
        orderNumber,
        read: false,
        createdAt: now,
        linkPath: `/orders?open=${orderId}`,
        metadata: {
          customerName,
          orderStatus,
          paymentStatus,
          totalAmount,
          paidAmount,
          pendingAmount,
          itemsSummary,
        },
      });
    }

    await batch.commit();
    console.log(`notifyStaffOnNewOrder: ${staffUids.length} notificaciones para pedido #${orderNum}`);
  }
);
