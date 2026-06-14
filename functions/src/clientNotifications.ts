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

async function getOwnerRecipientUids(): Promise<string[]> {
  const snap = await db.collection("users").where("role", "==", "owner").get();
  const uids: string[] = [];
  snap.forEach((userDoc) => {
    uids.push(userDoc.id);
  });
  return uids;
}

export const notifyOwnerOnNewClient = onDocumentCreated(
  {
    document: "clients/{clientId}",
    region: getFirestoreRegion(),
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const client = snap.data();
    const clientId = snap.id;
    const ownerUids = await getOwnerRecipientUids();

    if (ownerUids.length === 0) {
      console.log("notifyOwnerOnNewClient: no hay owners para notificar.");
      return;
    }

    const firstName = (client.firstName as string) || "";
    const lastName = (client.lastName as string) || "";
    const fullName = `${firstName} ${lastName}`.trim() || "Cliente sin nombre";
    const email = (client.email as string) || "";
    const phone = (client.phone as string) || "";
    const employeeName = (client.employeeName as string) || "";

    const title = "Nuevo cliente registrado";
    const bodyLines = [
      `Cliente: ${fullName}`,
    ];
    if (phone) bodyLines.push(`Teléfono: ${phone}`);
    if (email) bodyLines.push(`Email: ${email}`);
    
    if (employeeName) {
      bodyLines.push(`Registrado por: ${employeeName}`);
    } else {
      bodyLines.push("Registro: Web / Voluntario");
    }

    const body = bodyLines.join("\n");
    const now = new Date().toISOString();
    const batch = db.batch();

    for (const uid of ownerUids) {
      const ref = db.collection("notifications").doc();
      batch.set(ref, {
        recipientUid: uid,
        type: "new_client",
        title,
        body,
        orderId: "",
        orderNumber: 0,
        read: false,
        createdAt: now,
        linkPath: "/clients",
        metadata: {
          clientId,
          fullName,
          email,
          phone,
          employeeName,
        },
      });
    }

    await batch.commit();
    console.log(`notifyOwnerOnNewClient: ${ownerUids.length} notificaciones para cliente ${fullName}`);
  }
);
