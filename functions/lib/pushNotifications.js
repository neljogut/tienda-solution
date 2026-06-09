"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotificationPush = void 0;
const messaging_1 = require("firebase-admin/messaging");
const firestore_1 = require("firebase-functions/v2/firestore");
const admin_js_1 = require("./admin.js");
/** Región de la función = misma región que Firestore del proyecto. */
function getFirestoreRegion() {
    const projectId = process.env.GCLOUD_PROJECT ||
        process.env.GCP_PROJECT ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        "";
    if (projectId === "solution-3d")
        return "southamerica-west1";
    return "southamerica-east1";
}
exports.sendNotificationPush = (0, firestore_1.onDocumentCreated)({
    document: "notifications/{notificationId}",
    region: getFirestoreRegion(),
}, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const data = snap.data();
    const recipientUid = data.recipientUid;
    if (!recipientUid)
        return;
    const tokensSnap = await admin_js_1.db
        .collection("users")
        .doc(recipientUid)
        .collection("fcm_tokens")
        .get();
    const tokens = tokensSnap.docs
        .map((d) => d.data().token || "")
        .filter(Boolean);
    if (tokens.length === 0) {
        console.log(`sendNotificationPush: sin tokens FCM para ${recipientUid}`);
        return;
    }
    const title = data.title || "Nueva notificación";
    const fullBody = data.body || "";
    const body = fullBody.split("\n").slice(0, 3).join(" · ");
    const linkPath = data.linkPath || "/";
    const orderId = data.orderId || "";
    const actionTitle = orderId
        ? "Ver pedido"
        : linkPath.includes("accounts")
            ? "Ver cuentas"
            : linkPath.includes("my-account")
                ? "Ver mi cuenta"
                : linkPath.includes("my-orders")
                    ? "Ver pedidos"
                    : "Abrir";
    const response = await (0, messaging_1.getMessaging)().sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: {
            title,
            body,
            linkPath,
            notificationId: snap.id,
            orderId,
        },
        webpush: {
            fcmOptions: { link: linkPath },
            notification: {
                title,
                body,
                icon: "/pwa-192.png",
                badge: "/pwa-192.png",
                silent: false,
                vibrate: [200, 100, 200, 100, 200],
                actions: [{ action: "open", title: actionTitle }],
            },
        },
        android: {
            priority: "high",
            notification: {
                sound: "default",
                channelId: "orders",
                priority: "high",
            },
        },
        apns: {
            payload: {
                aps: {
                    sound: "default",
                    badge: 1,
                    alert: { title, body },
                },
            },
        },
    });
    const staleTokens = [];
    response.responses.forEach((resp, idx) => {
        if (!resp.success) {
            const code = resp.error?.code || "";
            if (code === "messaging/registration-token-not-registered" ||
                code === "messaging/invalid-registration-token") {
                staleTokens.push(tokens[idx]);
            }
            else {
                console.error(`FCM error token ${idx}:`, resp.error?.message);
            }
        }
    });
    if (staleTokens.length > 0) {
        const batch = admin_js_1.db.batch();
        for (const token of staleTokens) {
            const tokenId = `t_${Math.abs(token.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)).toString(36)}`;
            batch.delete(admin_js_1.db.collection("users").doc(recipientUid).collection("fcm_tokens").doc(tokenId));
        }
        await batch.commit();
    }
    console.log(`sendNotificationPush: ${response.successCount}/${tokens.length} enviados a ${recipientUid}`);
});
//# sourceMappingURL=pushNotifications.js.map