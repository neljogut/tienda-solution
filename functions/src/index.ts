import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {MercadoPagoConfig, Preference, Payment} from "mercadopago";
import {allocatePaymentFifo, allocatePaymentToOrder} from "./paymentAllocation.js";
import {db} from "./admin.js";
import * as fs from "fs";
import * as path from "path";

export {sendNotificationPush} from "./pushNotifications.js";
export {notifyStaffOnNewOrder} from "./orderNotifications.js";
export {notifyStaffOnPaymentDeclaration} from "./paymentNotifications.js";
export {notifyOwnerOnNewClient} from "./clientNotifications.js";

function getFirestoreRegion(): string {
  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    "";
  if (projectId === "solution-3d") return "southamerica-west1";
  return "southamerica-east1";
}

const getHostingUrl = () => {
  if (process.env.HOSTING_URL) return process.env.HOSTING_URL;
  const project = process.env.GCLOUD_PROJECT || "dualgi3de";
  return `https://${project}.web.app`;
};
const HOSTING_URL = getHostingUrl();

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
  const customerId = userData.customerId as string | undefined;
  if (customerId) {
    const clientSnap = await db.collection("clients").doc(customerId).get();
    if (clientSnap.exists) {
      return customerId;
    }
  }

  const byUser = await db.collection("clients").where("userId", "==", uid).limit(1).get();
  if (!byUser.empty) {
    const resolved = byUser.docs[0].id;
    await db.collection("users").doc(uid).update({ customerId: resolved });
    return resolved;
  }

  const email = userData.email as string | undefined;
  if (email) {
    const byEmail = await db.collection("clients").where("email", "==", email).limit(1).get();
    if (!byEmail.empty) {
      const resolved = byEmail.docs[0].id;
      await db.collection("clients").doc(resolved).update({ userId: uid });
      await db.collection("users").doc(uid).update({ customerId: resolved });
      return resolved;
    }
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

export const createCatalogOrder = onCall({ region: getFirestoreRegion() }, async (request) => {
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

export const finalizeSharedOrder = onCall({ region: getFirestoreRegion() }, async (request) => {
  const payload = request.data as {
    orderId: string;
    paymentMethod: "later" | "transfer" | "mercadopago";
  };

  if (!payload.orderId) {
    throw new HttpsError("invalid-argument", "ID de pedido inválido.");
  }

  const orderRef = db.collection("orders").doc(payload.orderId);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "No se encontró el pedido.");
  }

  const order = orderSnap.data()!;
  if (order.orderStatus !== "draft") {
    throw new HttpsError("failed-precondition", "Este pedido ya fue procesado o no es un borrador.");
  }

  const ordersColl = db.collection("orders");
  const countSnap = await ordersColl.count().get();
  const orderNumber = countSnap.data().count;

  const batch = db.batch();
  const saleLines: Array<Record<string, any>> = [];

  for (const item of order.items || []) {
    const prodRef = db.collection("products").doc(item.productId);
    const prodSnap = await prodRef.get();
    if (!prodSnap.exists) continue;
    const product = prodSnap.data()!;
    const prevStock = product.stock || 0;
    const newStock = Math.max(0, prevStock - item.quantity);
    batch.update(prodRef, { stock: newStock });
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
        : (product.filamentIds ?? []).map((filId: string) => ({
            supplyId: filId,
            grams: (product.weightGrams * item.quantity) / Math.max(1, product.filamentIds?.length || 1),
          }));

      for (const line of filamentLines) {
        const weightToDeduct = (line.grams || 0) * item.quantity;
        if (!line.supplyId || weightToDeduct <= 0) continue;
        const filRef = db.collection("inventory").doc(line.supplyId);
        const filSnap = await filRef.get();
        if (filSnap.exists) {
          const filData = filSnap.data()!;
          const prevWeight = filData.availableWeightGrams || 0;
          const newWeight = Math.max(0, prevWeight - weightToDeduct);
          batch.update(filRef, { availableWeightGrams: newWeight });
          saleLines.push({ itemId: line.supplyId, itemType: "filament", lineType: "consumption", previousQuantity: prevWeight, modifiedQuantity: -weightToDeduct, finalQuantity: newWeight });
        }
      }

      if (product.supplyIds?.length) {
        for (const supObj of product.supplyIds) {
          const qtyNeeded = supObj.quantity * item.quantity;
          const supRef = db.collection("inventory").doc(supObj.supplyId);
          const supSnap = await supRef.get();
          if (supSnap.exists) {
            const supData = supSnap.data()!;
            const prevQty = supData.currentStock || 0;
            const newQty = Math.max(0, prevQty - qtyNeeded);
            batch.update(supRef, { currentStock: newQty });
            saleLines.push({ itemId: supObj.supplyId, itemType: "supply", lineType: "consumption", previousQuantity: prevQty, modifiedQuantity: -qtyNeeded, finalQuantity: newQty });
          }
        }
      }
    }
  }

  // Update client totals
  if (order.customerId) {
    const clientRef = db.collection("clients").doc(order.customerId);
    const clientSnap = await clientRef.get();
    if (clientSnap.exists) {
      const clientData = clientSnap.data()!;
      batch.update(clientRef, {
        totalPurchased: (clientData.totalPurchased || 0) + order.totalAmount,
        totalOwed: (clientData.totalOwed || 0) + order.totalAmount,
      });
    }
  }

  // Commit the stock/client updates
  await batch.commit();

  if (saleLines.length > 0) {
    await db.collection("inventory_movements").add({
      date: new Date().toISOString(),
      movementType: "sale",
      reason: `Venta · Pedido #${orderNumber} (Link compartido)`,
      userId: request.auth?.uid || "guest_checkout",
      orderId: payload.orderId,
      lines: saleLines,
    });
  }

  const observations =
    (order.observationsInternal || "") +
    `\n[Checkout] Confirmado vía link compartido. Método: ${payload.paymentMethod === "later" ? "pagar después" : payload.paymentMethod}.`;

  const orderUpdate: Record<string, any> = {
    orderStatus: "pending",
    orderNumber,
    observationsInternal: observations,
  };
  if (payload.paymentMethod !== "later") {
    orderUpdate.paymentMethod = payload.paymentMethod;
  }

  await orderRef.update(orderUpdate);

  return {
    orderNumber,
    totalAmount: order.totalAmount,
  };
});

export const createPaymentIntent = onCall({ region: getFirestoreRegion() }, async (request) => {
  const payload = request.data as {
    type: "catalog" | "balance";
    customerId: string;
    amount: number;
    method: "mercadopago" | "transfer" | "none";
    orderId?: string;
  };

  let isGuestCheckout = false;
  if (!request.auth?.uid && payload.orderId && payload.type === "catalog") {
    const orderSnap = await db.collection("orders").doc(payload.orderId).get();
    if (orderSnap.exists) {
      const order = orderSnap.data()!;
      if (order.orderStatus === "draft" && order.sharedAt) {
        isGuestCheckout = true;
      }
    }
  }

  let user = null;
  if (!isGuestCheckout) {
    user = await requireRole(request.auth?.uid, ["client", "owner", "employee"]);
  }

  if (!payload.customerId || payload.amount < 0) {
    throw new HttpsError("invalid-argument", "Datos de pago inválidos.");
  }

  if (!isGuestCheckout && user && user.role === "client") {
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

  let feeAmount = 0;
  let totalAmount = payload.amount;
  if (payload.method === "mercadopago") {
    const paymentsSnap = await db.collection("settings").doc("payments").get();
    if (paymentsSnap.exists) {
      const commissionPercent = paymentsSnap.get("mercadopago.commissionPercent") as number || 0;
      feeAmount = Math.round(payload.amount * (commissionPercent / 100));
      totalAmount = payload.amount + feeAmount;
    }
  }

  const intentRef = db.collection("payment_intents").doc();
  await intentRef.set({
    type: payload.type,
    customerId: payload.customerId,
    orderId: payload.orderId || null,
    netAmount: payload.amount,
    feeAmount,
    amount: totalAmount,
    method: payload.method,
    status: payload.method === "transfer" ? "declared" : "pending",
    createdAt: new Date().toISOString(),
    createdBy: request.auth?.uid || "guest_checkout",
  });

  return {paymentIntentId: intentRef.id};
});

export const createMercadoPagoPreference = onCall({ region: getFirestoreRegion() }, async (request) => {
  const payload = request.data as {paymentIntentId: string; title: string};

  if (!payload.paymentIntentId) {
    throw new HttpsError("invalid-argument", "Falta el intent de pago.");
  }

  const intentSnap = await db.collection("payment_intents").doc(payload.paymentIntentId).get();
  if (!intentSnap.exists) {
    throw new HttpsError("not-found", "Intent de pago no encontrado.");
  }

  const intent = intentSnap.data()!;
  
  let isGuestCheckout = false;
  if (!request.auth?.uid && intent.createdBy === "guest_checkout") {
    isGuestCheckout = true;
  }

  if (!isGuestCheckout) {
    await requireRole(request.auth?.uid, ["client", "owner", "employee"]);
  }

  const amount = intent.amount as number;
  if (amount <= 0) {
    throw new HttpsError("invalid-argument", "El monto debe ser mayor a cero para Mercado Pago.");
  }

  const accessToken = await getMercadoPagoAccessToken();
  const client = new MercadoPagoConfig({accessToken});
  const preference = new Preference(client);

  let businessName = (process.env.GCLOUD_PROJECT || "dualgi3de") === "solution-3d" ? "Solution 3D" : "Dualgi 3D";
  try {
    const bizSnap = await db.collection("settings").doc("business").get();
    if (bizSnap.exists) {
      businessName = bizSnap.get("name") || businessName;
    }
  } catch (err) {
    console.error("Error fetching business name:", err);
  }

  const preferenceBody = {
    items: [
      {
        id: payload.paymentIntentId,
        title: payload.title || `Pedido ${businessName}`,
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
    payment_methods: {
      excluded_payment_types: [
        { id: "ticket" },
        { id: "bank_transfer" }
      ]
    },
    notification_url: `https://${getFirestoreRegion()}-${process.env.GCLOUD_PROJECT || "dualgi3de"}.cloudfunctions.net/mercadoPagoWebhook`,
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

  const netAmount = (intent.netAmount !== undefined ? intent.netAmount : intent.amount) as number;
  let totalApplied = netAmount;

  if (type === "catalog" && intent.orderId) {
    const orderRef = db.collection("orders").doc(intent.orderId as string);
    const orderSnap = await orderRef.get();
    if (orderSnap.exists) {
      const order = {id: orderSnap.id, ...orderSnap.data()} as Parameters<typeof allocatePaymentToOrder>[0];
      const update = allocatePaymentToOrder(order, netAmount, "[Mercado Pago]");
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
      netAmount,
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

export const mercadoPagoWebhook = onRequest({cors: false, region: getFirestoreRegion()}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const topic = (req.query.topic || req.query.type || req.body?.type || req.body?.topic) as string | undefined;
    const paymentId = (req.query["data.id"] || req.query.id || req.body?.data?.id || req.body?.id) as string | undefined;

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

export const saveMercadoPagoCredentials = onCall({ region: getFirestoreRegion() }, async (request) => {
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

export const testMercadoPagoConnection = onCall({ region: getFirestoreRegion() }, async (request) => {
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

let cachedHtml: string | null = null;

async function getIndexHtmlTemplate(): Promise<string> {
  if (cachedHtml) return cachedHtml;

  // Try local paths first (useful for emulators)
  const localPaths = [
    path.join(__dirname, "..", "dist", "index.html"),
    path.join(__dirname, "..", "..", "dist", "index.html"),
    path.join(__dirname, "index.html"),
  ];

  for (const p of localPaths) {
    try {
      if (fs.existsSync(p)) {
        cachedHtml = fs.readFileSync(p, "utf8");
        return cachedHtml;
      }
    } catch (err) {
      // ignore
    }
  }

  // Fallback to fetching over HTTP
  try {
    const res = await fetch(`${HOSTING_URL}/index.html`);
    if (res.ok) {
      cachedHtml = await res.text();
      return cachedHtml;
    }
  } catch (err) {
    console.error("Failed to fetch index.html from hosting:", err);
  }

  // Absolute fallback
  return `<!DOCTYPE html><html><head><title>Catálogo</title></head><body><div id="root"></div></body></html>`;
}

function replaceMetaTags(
  html: string,
  title: string,
  description: string,
  imageUrl: string,
  url: string
): string {
  let result = html;

  // Replace title tag
  result = result.replace(/<title>.*?<\/title>/gi, `<title>${title}</title>`);

  // Helper to replace or insert meta tag
  const replaceOrInsertMeta = (nameOrProperty: string, value: string, isProperty = false) => {
    const attr = isProperty ? "property" : "name";
    const regex = new RegExp(`<meta\\s+[^>]*${attr}=["']${nameOrProperty}["'][^>]*content=["'][^"']*["'][^>]*>`, "gi");
    const regex2 = new RegExp(`<meta\\s+[^>]*content=["'][^"']*["'][^>]*${attr}=["']${nameOrProperty}["'][^>]*>`, "gi");
    
    const replacement = `<meta ${attr}="${nameOrProperty}" content="${value}" />`;
    
    if (regex.test(result)) {
      result = result.replace(regex, replacement);
    } else if (regex2.test(result)) {
      result = result.replace(regex2, replacement);
    } else {
      // Insert right before </head> if it doesn't exist
      result = result.replace("</head>", `${replacement}\n</head>`);
    }
  };

  // Replace standard description
  replaceOrInsertMeta("description", description);

  // Replace Open Graph tags
  replaceOrInsertMeta("og:title", title, true);
  replaceOrInsertMeta("og:description", description, true);
  replaceOrInsertMeta("og:image", imageUrl, true);
  replaceOrInsertMeta("og:url", url, true);

  // Replace Twitter tags
  replaceOrInsertMeta("twitter:title", title);
  replaceOrInsertMeta("twitter:description", description);
  replaceOrInsertMeta("twitter:image", imageUrl);

  return result;
}

export const serveDynamicMeta = onRequest({cors: false, region: getFirestoreRegion()}, async (req, res) => {
  const pathStr = req.path || "";
  
  let title = "";
  let description = "";
  let imageUrl = "";
  const requestUrl = `${HOSTING_URL}${pathStr}`;

  // Fetch business settings first to get fallbacks
  let businessName = (process.env.GCLOUD_PROJECT || "dualgi3de") === "solution-3d" ? "Solution 3D" : "Dualgi 3D";
  let businessLogo = "";
  let businessDesc = "Servicios de impresión 3D de alta precisión y regalos personalizados.";

  try {
    const bizSnap = await db.collection("settings").doc("business").get();
    if (bizSnap.exists) {
      businessName = bizSnap.get("name") || businessName;
      businessLogo = bizSnap.get("logoUrl") || "";
      businessDesc = bizSnap.get("description") || businessDesc;
    }
  } catch (err) {
    console.error("Error fetching business settings:", err);
  }

  if (businessLogo && !businessLogo.startsWith("http")) {
    businessLogo = `${HOSTING_URL}${businessLogo}`;
  }
  if (!businessLogo) {
    businessLogo = `${HOSTING_URL}/favicon.svg`;
  }

  // Set default fallbacks
  title = `${businessName} · Impresión 3D`;
  description = businessDesc;
  imageUrl = businessLogo;

  try {
    // 1. Is it a category path? /catalog/category/:categoryId
    const categoryMatch = pathStr.match(/^\/catalog\/category\/([a-zA-Z0-9_-]+)/);
    if (categoryMatch) {
      const categoryId = categoryMatch[1];
      const catSnap = await db.collection("categories").doc(categoryId).get();
      if (catSnap.exists) {
        const categoryName = catSnap.get("name") || "Categoría";
        title = `${categoryName} · ${businessName}`;
        description = `Explorá todos los productos en la categoría ${categoryName} en ${businessName}.`;
        
        // Fetch the first product in this category to use as the image preview
        const prodSnap = await db.collection("products")
          .where("categoryId", "==", categoryId)
          .where("isActive", "==", true)
          .limit(1)
          .get();
        
        if (!prodSnap.empty) {
          const firstProduct = prodSnap.docs[0].data();
          imageUrl = firstProduct.mainImage || businessLogo;
        }
      }
    } else {
      // 2. Is it a product path? /catalog/:productId
      const productMatch = pathStr.match(/^\/catalog\/([a-zA-Z0-9_-]+)/);
      if (productMatch) {
        const productId = productMatch[1];
        if (productId !== "category") {
          const prodSnap = await db.collection("products").doc(productId).get();
          if (prodSnap.exists) {
            const product = prodSnap.data()!;
            title = `${product.name} · ${businessName}`;
            description = product.description || `Comprá ${product.name} al mejor precio en ${businessName}.`;
            imageUrl = product.mainImage || businessLogo;
          }
        }
      }
    }
  } catch (err) {
    console.error("Error generating dynamic metadata:", err);
  }

  // Load index.html template and inject values
  try {
    const template = await getIndexHtmlTemplate();
    const filledHtml = replaceMetaTags(template, title, description, imageUrl, requestUrl);
    
    // Set headers
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
    res.status(200).send(filledHtml);
  } catch (err) {
    console.error("Error serving index template:", err);
    res.status(500).send("Internal Server Error");
  }
});
