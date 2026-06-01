import {initializeApp} from "firebase-admin/app";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/https";

initializeApp();

const db = getFirestore();

type Role = "owner" | "employee" | "client";

async function requireRole(uid: string | undefined, allowed: Role[]) {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Tenes que iniciar sesion.");
  }
  const user = await db.collection("users").doc(uid).get();
  const role = user.get("role") as Role | undefined;
  if (!role || !allowed.includes(role)) {
    throw new HttpsError("permission-denied", "No tenes permiso para esta accion.");
  }
  return {uid, role, data: user.data() ?? {}};
}

export const createOrderSnapshot = onCall(async (request) => {
  const user = await requireRole(request.auth?.uid, ["owner", "employee", "client"]);
  const payload = request.data as {
    customerId: string;
    items: unknown[];
    paymentMethod?: string;
    initialPayment?: number;
  };

  if (!payload.customerId || !Array.isArray(payload.items) || payload.items.length === 0) {
    throw new HttpsError("invalid-argument", "El pedido necesita cliente e items.");
  }

  if (user.role === "client" && user.data.customerId !== payload.customerId) {
    throw new HttpsError("permission-denied", "Un cliente solo puede crear pedidos propios.");
  }

  const orderRef = db.collection("orders").doc();
  await orderRef.set({
    customerId: payload.customerId,
    items: payload.items,
    paymentMethod: payload.paymentMethod ?? null,
    paid: payload.initialPayment ?? 0,
    createdBy: user.uid,
    createdByRole: user.role,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    status: "pending",
    paymentStatus: (payload.initialPayment ?? 0) > 0 ? "depositPaid" : "unpaid",
    snapshotVersion: 1
  });

  return {orderId: orderRef.id};
});

export const registerPayment = onCall(async (request) => {
  const user = await requireRole(request.auth?.uid, ["owner", "employee"]);
  const payload = request.data as {
    orderId?: string;
    customerId: string;
    amount: number;
    method: string;
    note?: string;
  };

  if (!payload.customerId || !payload.amount || payload.amount <= 0) {
    throw new HttpsError("invalid-argument", "El pago necesita cliente y monto valido.");
  }

  const paymentRef = db.collection("payments").doc();
  await paymentRef.set({
    ...payload,
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp()
  });

  return {paymentId: paymentRef.id};
});

export const createMercadoPagoPreference = onCall(async (request) => {
  await requireRole(request.auth?.uid, ["owner", "employee", "client"]);
  const payload = request.data as {orderId: string; amount: number};
  if (!payload.orderId || !payload.amount || payload.amount <= 0) {
    throw new HttpsError("invalid-argument", "La preferencia necesita pedido y monto.");
  }

  throw new HttpsError(
    "failed-precondition",
    "Configurar MERCADO_PAGO_ACCESS_TOKEN y completar la integracion antes de usar pagos online."
  );
});

export const generateInternalPdf = onCall(async (request) => {
  await requireRole(request.auth?.uid, ["owner", "employee"]);
  const payload = request.data as {orderId?: string; balanceRange?: unknown};
  if (!payload.orderId && !payload.balanceRange) {
    throw new HttpsError("invalid-argument", "Indicar pedido o rango de balance.");
  }

  throw new HttpsError(
    "failed-precondition",
    "Servicio PDF preparado. Completar plantilla visual y escritura en Storage."
  );
});
