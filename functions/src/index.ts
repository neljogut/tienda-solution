import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {MercadoPagoConfig, Preference, Payment} from "mercadopago";
import {allocatePaymentFifo, allocatePaymentToOrder} from "./paymentAllocation.js";
import {db} from "./admin.js";

export {sendNotificationPush} from "./pushNotifications.js";
export {notifyStaffOnNewOrder} from "./orderNotifications.js";
export {notifyStaffOnPaymentDeclaration} from "./paymentNotifications.js";

const HOSTING_URL = process.env.HOSTING_URL || "https://dualgi3de.web.app";

type Role = "owner" | "employee" | "client";

async function requireRole(uid: string | undefined, allowed: Role[]) {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Tenés que iniciar sesión.");
  }
  const user = await db.collection("users").doc(uid).get();
  const role = user.get("role") as Role | undefined;
  if (!role || !allowed.includes(role)) {
    throw new HttpsError("permission-denied", "No tenés permiso para esta acción.");
  }
  return {uid, role, data: user.data() ?? {}};
}

async function getMercadoPagoAccessToken(): Promise<string> {
  const privateSnap = await db.collection("settings_private").doc("mercadopago").get();
  const token = privateSnap.get("accessToken") as string | undefined;
  if (token) return token;
  const envToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (envToken) return envToken;
  throw new HttpsError("failed-precondition", "Mercado Pago no está configurado. Guardá el Access Token en Negocio.");
}

async function resolveCustomerId(uid: string, userData: Record<string, unknown>): Promise<string> {
  let customerId = userData.customerId as string | undefined;
  if (customerId) return customerId;

  const byUser = await db.collection("clients").where("userId", "==", uid).limit(1).get();
  if (!byUser.empty) return byUser.docs[0].id;

  const email = userData.email as string | undefined;
  if (email) {
    const byEmail = await db.collection("clients").where("email", "==", email).limit(1).get();
    if (!byEmail.empty) return byEmail.docs[0].id;
  }

  throw new HttpsError("failed-precondition", "No se encontró el perfil de cliente vinculado.");
}

interface CartItemPayload {
  productId: string;
  name: string;
  type: string;
  quantity: number;
  price: number;
  imageUrl?: string;
}

export const createCatalogOrder = onCall(async (request) => {
  const user = await requireRole(request.auth?.uid, ["client", "owner", "employee"]);
  const payload = request.data as {items: CartItemPayload[]; customerName: string};

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new HttpsError("invalid-argument", "El pedido necesita al menos un producto.");
  }

  const customerId = await resolveCustomerId(user.uid, user.data);
  const customerName = payload.customerName?.trim() || "Cliente";

  const exchangeRateSnap = await db.collection("settings").doc("exchangeRate").get();
  const exchangeRate = exchangeRateSnap.get("currentUsdToArs") as number || 1000;

  const ordersColl = db.collection("orders");
  const countSnap = await ordersColl.count().get();
  const orderNumber = countSnap.data().count + 1;

  const orderItems = [];
  let totalAmount = 0;
  let totalCost = 0;

  for (const item of payload.items) {
    const prodSnap = await db.collection("products").doc(item.productId).get();
    if (!prodSnap.exists) {
      throw new HttpsError("not-found", `Producto no encontrado: ${item.name}`);
    }
    const product = prodSnap.data()!;
    const stock = product.stock || 0;
    if (item.quantity > stock) {
      throw new HttpsError("failed-precondition", `Stock insuficiente para ${item.name}.`);
    }
    const unitCost = product.calculatedCost || 0;
    const unitPrice = item.price;
    orderItems.push({
      productId: item.productId,
      name: item.name,
      type: item.type,
      quantity: item.quantity,
      unitPrice,
      appliedWholesale: false,
      unitCost,
      unitProfit: unitPrice - unitCost,
      imageUrl: item.imageUrl || "",
      isManualPrice: product.useManualPrice || false,
    });
    totalAmount += unitPrice * item.quantity;
    totalCost += unitCost * item.quantity;
  }

  const orderRef = ordersColl.doc();
  const newOrder = {
    orderNumber,
    customerId,
    customerName,
    date: new Date().toISOString(),
    items: orderItems,
    totalAmount,
    paidAmount: 0,
    pendingAmount: totalAmount,
    paymentStatus: "unpaid",
    orderStatus: "pending",
    observationsPublic: "Pedido creado desde el catálogo web.",
    observationsInternal: "Creado desde checkout del catálogo.",
    exchangeRateUsdUsed: exchangeRate,
    exchangeRateDate: new Date().toISOString(),
    totalCost,
    totalProfit: totalAmount - totalCost,
  };

  await orderRef.set(newOrder);

  const batch = db.batch();
  const clientRef = db.collection("clients").doc(customerId);
  const clientSnap = await clientRef.get();
  if (clientSnap.exists) {
    const clientData = clientSnap.data()!;
    batch.update(clientRef, {
      totalPurchased: (clientData.totalPurchased || 0) + totalAmount,
      totalOwed: (clientData.totalOwed || 0) + totalAmount,
    });
  }

  const saleLines: Array<Record<string, unknown>> = [];

  for (const item of orderItems) {
    const prodRef = db.collection("products").doc(item.productId);
    const prodSnap = await prodRef.get();
    if (!prodSnap.exists) continue;
    const product = prodSnap.data()!;
    const prevStock = product.stock || 0;
    const newStock = Math.max(0, prevStock - item.quantity);
    batch.update(prodRef, {stock: newStock});

    saleLines.push({
      itemId: item.productId,
      itemType: "product",
      lineType: "out_sale",
      previousQuantity: prevStock,
      modifiedQuantity: -item.quantity,
      finalQuantity: newStock,
    });

    if (product.type === "3d") {
      const filamentLines = product.filamentLines?.length
        ? product.filamentLines
        : (product.filamentIds ?? []).map((filamentId: string) => ({
          supplyId: filamentId,
          grams: (product.weightGrams * item.quantity) / Math.max(1, product.filamentIds.length),
        }));

      for (const line of filamentLines) {
        const filamentId = line.supplyId;
        const weightToDeduct = (line.grams || 0) * item.quantity;
        if (!filamentId || weightToDeduct <= 0) continue;

        const filRef = db.collection("inventory").doc(filamentId);
        const filSnap = await filRef.get();
        if (filSnap.exists) {
          const filData = filSnap.data()!;
          const prevWeight = filData.availableWeightGrams || 0;
          const newWeight = Math.max(0, prevWeight - weightToDeduct);
          batch.update(filRef, {availableWeightGrams: newWeight});
          saleLines.push({
            itemId: filamentId,
            itemType: "filament",
            lineType: "consumption",
            previousQuantity: prevWeight,
            modifiedQuantity: -weightToDeduct,
            finalQuantity: newWeight,
          });
        }
      }

      if (product.supplyIds?.length) {
        for (const supplyObj of product.supplyIds) {
          const supplyId = supplyObj.supplyId;
          const qtyNeeded = supplyObj.quantity * item.quantity;
          const supRef = db.collection("inventory").doc(supplyId);
          const supSnap = await supRef.get();
          if (supSnap.exists) {
            const supData = supSnap.data()!;
            const prevQty = supData.currentStock || 0;
            const newQty = Math.max(0, prevQty - qtyNeeded);
            batch.update(supRef, {currentStock: newQty});
            saleLines.push({
              itemId: supplyId,
              itemType: "supply",
              lineType: "consumption",
              previousQuantity: prevQty,
              modifiedQuantity: -qtyNeeded,
              finalQuantity: newQty,
            });
          }
        }
      }
    }
  }

  await batch.commit();

  if (saleLines.length > 0) {
    await db.collection("inventory_movements").add({
      date: new Date().toISOString(),
      movementType: "sale",
      reason: `Venta · Pedido #${orderNumber} (Checkout)`,
      userId: user.uid,
      orderId: orderRef.id,
      lines: saleLines,
    });
  }

  return {orderId: orderRef.id, orderNumber, totalAmount};
});

export const createPaymentIntent = onCall(async (request) => {
  const user = await requireRole(request.auth?.uid, ["client", "owner", "employee"]);
  const payload = request.data as {
    type: "catalog" | "balance";
    customerId: string;
    amount: number;
    method: "mercadopago" | "transfer" | "none";
    orderId?: string;
  };

  if (!payload.customerId || payload.amount < 0) {
    throw new HttpsError("invalid-argument", "Datos de pago inválidos.");
  }

  if (user.role === "client") {
    const resolvedId = await resolveCustomerId(user.uid, user.data);
    if (resolvedId !== payload.customerId) {
      throw new HttpsError("permission-denied", "Solo podés crear pagos de tu cuenta.");
    }
  }

  if (payload.type === "balance") {
    const clientSnap = await db.collection("clients").doc(payload.customerId).get();
    const totalOwed = clientSnap.get("totalOwed") as number || 0;
    if (payload.amount > totalOwed) {
      throw new HttpsError("invalid-argument", "El monto supera tu deuda.");
    }
  }

  const intentRef = db.collection("payment_intents").doc();
  await intentRef.set({
    type: payload.type,
    customerId: payload.customerId,
    orderId: payload.orderId || null,
    amount: payload.amount,
    method: payload.method,
    status: payload.method === "transfer" ? "declared" : "pending",
    createdAt: new Date().toISOString(),
    createdBy: user.uid,
  });

  return {paymentIntentId: intentRef.id};
});

export const createMercadoPagoPreference = onCall(async (request) => {
  await requireRole(request.auth?.uid, ["client", "owner", "employee"]);
  const payload = request.data as {paymentIntentId: string; title: string};

  if (!payload.paymentIntentId) {
    throw new HttpsError("invalid-argument", "Falta el intent de pago.");
  }

  const intentSnap = await db.collection("payment_intents").doc(payload.paymentIntentId).get();
  if (!intentSnap.exists) {
    throw new HttpsError("not-found", "Intent de pago no encontrado.");
  }

  const intent = intentSnap.data()!;
  const amount = intent.amount as number;
  if (amount <= 0) {
    throw new HttpsError("invalid-argument", "El monto debe ser mayor a cero para Mercado Pago.");
  }

  const accessToken = await getMercadoPagoAccessToken();
  const client = new MercadoPagoConfig({accessToken});
  const preference = new Preference(client);

  const preferenceBody = {
    items: [
      {
        id: payload.paymentIntentId,
        title: payload.title || "Pedido Dualgi 3D",
        quantity: 1,
        unit_price: amount,
        currency_id: "ARS",
      },
    ],
    external_reference: payload.paymentIntentId,
    back_urls: {
      success: `${HOSTING_URL}/payment/result?status=success&intent=${payload.paymentIntentId}`,
      failure: `${HOSTING_URL}/payment/result?status=failure&intent=${payload.paymentIntentId}`,
      pending: `${HOSTING_URL}/payment/result?status=pending&intent=${payload.paymentIntentId}`,
    },
    auto_return: "approved" as const,
    notification_url: `https://us-central1-${process.env.GCLOUD_PROJECT || "dualgi3de"}.cloudfunctions.net/mercadoPagoWebhook`,
  };

  const result = await preference.create({body: preferenceBody});
  const preferenceId = result.id || "";
  const initPoint = result.init_point || result.sandbox_init_point || "";

  if (!initPoint) {
    throw new HttpsError("internal", "No se pudo crear la preferencia de Mercado Pago.");
  }

  await intentSnap.ref.update({
    mpPreferenceId: preferenceId,
    method: "mercadopago",
  });

  return {initPoint, preferenceId, paymentIntentId: payload.paymentIntentId};
});

async function processApprovedPayment(
  paymentIntentId: string,
  mpPaymentId: string,
  amountPaid: number
) {
  const intentRef = db.collection("payment_intents").doc(paymentIntentId);
  const intentSnap = await intentRef.get();
  if (!intentSnap.exists) return;

  const intent = intentSnap.data()!;
  if (intent.status === "approved") return;

  const customerId = intent.customerId as string;
  const type = intent.type as string;
  const batch = db.batch();

  let totalApplied = amountPaid;

  if (type === "catalog" && intent.orderId) {
    const orderRef = db.collection("orders").doc(intent.orderId as string);
    const orderSnap = await orderRef.get();
    if (orderSnap.exists) {
      const order = {id: orderSnap.id, ...orderSnap.data()} as Parameters<typeof allocatePaymentToOrder>[0];
      const update = allocatePaymentToOrder(order, amountPaid, "[Mercado Pago]");
      if (update) {
        totalApplied = update.appliedAmount;
        batch.update(orderRef, {
          paidAmount: update.paidAmount,
          pendingAmount: update.pendingAmount,
          paymentStatus: update.paymentStatus,
          paymentMethod: "mercadopago",
          mpPaymentId,
          observationsInternal: update.observationsInternal,
        });
      }
    }
  } else if (type === "balance") {
    const ordersSnap = await db.collection("orders")
      .where("customerId", "==", customerId)
      .where("paymentStatus", "in", ["unpaid", "partial"])
      .get();

    const orders = ordersSnap.docs
      .map((d) => ({id: d.id, ...d.data()} as {id: string; date: string; paymentStatus: string; paidAmount?: number; pendingAmount?: number; observationsInternal?: string}))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const fifoResult = allocatePaymentFifo(
      orders as Parameters<typeof allocatePaymentFifo>[0],
      amountPaid,
      "[Mercado Pago Cta Cte]"
    );
    totalApplied = fifoResult.totalApplied;

    for (const upd of fifoResult.orderUpdates) {
      const orderRef = db.collection("orders").doc(upd.orderId);
      batch.update(orderRef, {
        paidAmount: upd.paidAmount,
        pendingAmount: upd.pendingAmount,
        paymentStatus: upd.paymentStatus,
        paymentMethod: "mercadopago",
        observationsInternal: upd.observationsInternal,
      });
    }
  }

  const clientRef = db.collection("clients").doc(customerId);
  const clientSnap = await clientRef.get();
  if (clientSnap.exists && totalApplied > 0) {
    const currentOwed = clientSnap.get("totalOwed") as number || 0;
    batch.update(clientRef, {totalOwed: Math.max(0, currentOwed - totalApplied)});
  }

  batch.update(intentRef, {status: "approved", mpPaymentId});

  const onlinePaymentRef = db.collection("online_payments").doc();
  batch.set(onlinePaymentRef, {
    paymentIntentId,
    customerId,
    orderId: intent.orderId || null,
    amount: amountPaid,
    method: "mercadopago",
    mpPaymentId,
    type: intent.type,
    createdAt: new Date().toISOString(),
    note: "Pago aprobado vía webhook Mercado Pago",
  });

  await batch.commit();

  await db.collection("settings").doc("payments").set({
    mercadopago: {lastWebhookAt: new Date().toISOString()},
  }, {merge: true});
}

export const mercadoPagoWebhook = onRequest({cors: false}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const topic = (req.query.topic || req.query.type) as string | undefined;
    const paymentId = (req.query["data.id"] || req.query.id) as string | undefined;

    if (topic === "payment" && paymentId) {
      const accessToken = await getMercadoPagoAccessToken();
      const client = new MercadoPagoConfig({accessToken});
      const paymentApi = new Payment(client);
      const paymentData = await paymentApi.get({id: paymentId});

      const status = paymentData.status;
      const externalRef = paymentData.external_reference;
      const amountPaid = paymentData.transaction_amount || 0;

      if (status === "approved" && externalRef) {
        await processApprovedPayment(externalRef, paymentId, amountPaid);
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook MP error:", err);
    res.status(200).send("OK");
  }
});

export const saveMercadoPagoCredentials = onCall(async (request) => {
  await requireRole(request.auth?.uid, ["owner"]);
  const payload = request.data as {accessToken: string; publicKey: string; enabled: boolean};

  if (!payload.accessToken?.trim()) {
    throw new HttpsError("invalid-argument", "El Access Token es obligatorio.");
  }

  await db.collection("settings_private").doc("mercadopago").set({
    accessToken: payload.accessToken.trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: request.auth!.uid,
  });

  const paymentsSnap = await db.collection("settings").doc("payments").get();
  const existing = paymentsSnap.data() || {};
  await db.collection("settings").doc("payments").set({
    ...existing,
    mercadopago: {
      ...(existing.mercadopago || {}),
      enabled: payload.enabled,
      publicKey: payload.publicKey?.trim() || "",
    },
  }, {merge: true});

  return {ok: true};
});

export const testMercadoPagoConnection = onCall(async (request) => {
  await requireRole(request.auth?.uid, ["owner"]);
  try {
    const accessToken = await getMercadoPagoAccessToken();
    const response = await fetch("https://api.mercadopago.com/users/me", {
      headers: {Authorization: `Bearer ${accessToken}`},
    });
    if (!response.ok) {
      return {ok: false, message: `Mercado Pago respondió con error ${response.status}.`};
    }
    return {ok: true, message: "Conexión con Mercado Pago exitosa."};
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return {ok: false, message: `Error de conexión: ${msg}`};
  }
});
