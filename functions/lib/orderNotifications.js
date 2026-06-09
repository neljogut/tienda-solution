"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyStaffOnNewOrder = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin_js_1 = require("./admin.js");
function getFirestoreRegion() {
    const projectId = process.env.GCLOUD_PROJECT ||
        process.env.GCP_PROJECT ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        "";
    if (projectId === "solution-3d")
        return "southamerica-west1";
    return "southamerica-east1";
}
const ORDER_STATUS_LABELS = {
    pending: "Pendiente",
    processing: "En proceso",
    finished: "Terminado",
    delivered: "Entregado",
    cancelled: "Cancelado",
};
const PAYMENT_STATUS_LABELS = {
    unpaid: "Sin abonar",
    partial: "Señado",
    paid: "Pagado",
};
function formatMoney(amount) {
    return `$${amount.toLocaleString("es-AR")}`;
}
function formatItemsSummary(items, maxItems = 4) {
    const lines = items.slice(0, maxItems).map((i) => `${i.name || "Producto"} × ${i.quantity || 1}`);
    if (items.length > maxItems) {
        lines.push(`y ${items.length - maxItems} producto(s) más`);
    }
    return lines.join(", ");
}
async function getStaffRecipientUids() {
    const snap = await admin_js_1.db.collection("users").get();
    const uids = [];
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
exports.notifyStaffOnNewOrder = (0, firestore_1.onDocumentCreated)({
    document: "orders/{orderId}",
    region: getFirestoreRegion(),
}, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const order = snap.data();
    const orderId = snap.id;
    const staffUids = await getStaffRecipientUids();
    if (staffUids.length === 0) {
        console.log("notifyStaffOnNewOrder: no hay staff para notificar.");
        return;
    }
    const orderNumber = order.orderNumber || 0;
    const orderNum = String(orderNumber).padStart(5, "0");
    const items = order.items || [];
    const itemsSummary = formatItemsSummary(items);
    const customerName = order.customerName || "Cliente";
    const orderStatus = order.orderStatus || "pending";
    const paymentStatus = order.paymentStatus || "unpaid";
    const totalAmount = order.totalAmount || 0;
    const paidAmount = order.paidAmount || 0;
    const pendingAmount = order.pendingAmount || 0;
    const title = `Nuevo pedido #${orderNum}`;
    const body = [
        `Cliente: ${customerName}`,
        `Total: ${formatMoney(totalAmount)}`,
        `Abonado: ${formatMoney(paidAmount)} · Pendiente: ${formatMoney(pendingAmount)}`,
        `Estado: ${ORDER_STATUS_LABELS[orderStatus] || orderStatus} · Pago: ${PAYMENT_STATUS_LABELS[paymentStatus] || paymentStatus}`,
        `Productos: ${itemsSummary}`,
    ].join("\n");
    const now = new Date().toISOString();
    const batch = admin_js_1.db.batch();
    for (const uid of staffUids) {
        const ref = admin_js_1.db.collection("notifications").doc();
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
});
//# sourceMappingURL=orderNotifications.js.map