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

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString("es-AR")}`;
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

/** Cliente declara pago de cuenta corriente → notifica owner/empleados. */
export const notifyStaffOnPaymentDeclaration = onDocumentCreated(
  {
    document: "payment_declarations/{declarationId}",
    region: getFirestoreRegion(),
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const staffUids = await getStaffRecipientUids();
    if (staffUids.length === 0) {
      console.log("notifyStaffOnPaymentDeclaration: no hay staff.");
      return;
    }

    const customerName = (data.customerName as string) || "Cliente";
    const amount = (data.amount as number) || 0;
    const method = (data.method as string) || "transfer";
    const customerId = (data.customerId as string) || "";
    const orderId = (data.orderId as string) || "";
    const orderNumber = (data.orderNumber as number) || 0;

    const methodLabel = method === "transfer" ? "Transferencia" : method;
    let title = `Pago declarado — ${customerName}`;
    let body = [
      `${customerName} informó un pago de ${formatMoney(amount)}.`,
      `Método: ${methodLabel}`,
      "Revisá el comprobante en WhatsApp y registrá el pago en Cuentas corrientes.",
    ].join("\n");
    let linkPath = "/accounts";

    if (orderId) {
      const orderNum = String(orderNumber).padStart(5, "0");
      title = `Pago declarado — Pedido #${orderNum}`;
      body = [
        `${customerName} informó transferencia de ${formatMoney(amount)}.`,
        `Pedido #${orderNum}`,
        "Revisá WhatsApp y registrá el pago.",
      ].join("\n");
      linkPath = `/orders?open=${orderId}`;
    } else if (customerId) {
      linkPath = `/accounts?client=${customerId}`;
    }

    const now = new Date().toISOString();
    const batch = db.batch();

    for (const uid of staffUids) {
      const ref = db.collection("notifications").doc();
      batch.set(ref, {
        recipientUid: uid,
        type: "balance_payment",
        title,
        body,
        orderId: orderId || "",
        orderNumber,
        read: false,
        createdAt: now,
        linkPath,
        metadata: {
          customerName,
          customerId,
          amount,
          method,
          declarationId: snap.id,
        },
      });
    }

    await batch.commit();
    console.log(
      `notifyStaffOnPaymentDeclaration: ${staffUids.length} notificaciones (${formatMoney(amount)})`
    );
  }
);
