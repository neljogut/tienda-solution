import { Firestore } from '@google-cloud/firestore';
import { getFirebaseCliAuthClient } from './scripts/firebase-cli-auth.mjs';

async function inspectProject(projectId) {
  console.log(`\n===================================`);
  console.log(`QUERYING PROJECT: ${projectId}`);
  console.log(`===================================`);
  try {
    const authClient = await getFirebaseCliAuthClient();
    const db = new Firestore({
      projectId: projectId,
      authClient,
      ignoreUndefinedProperties: true,
    });

    const clientsSnap = await db.collection('clients').get();
    const usersSnap = await db.collection('users').get();
    const ordersSnap = await db.collection('orders').get();

    console.log("=== CLIENTS ===");
    clientsSnap.forEach(d => {
      const data = d.data();
      console.log(`ID: ${d.id} | Name: ${data.firstName} ${data.lastName} | Email: ${data.email} | DNI: ${data.dni} | userId: ${data.userId}`);
    });

    console.log("\n=== USERS ===");
    usersSnap.forEach(d => {
      const data = d.data();
      console.log(`UID: ${d.id} | Name: ${data.displayName} | Email: ${data.email} | role: ${data.role} | customerId: ${data.customerId} | DNI: ${data.dni}`);
    });

    console.log("\n=== ORDERS ===");
    ordersSnap.forEach(d => {
      const data = d.data();
      const str = JSON.stringify(data).toLowerCase();
      const isRelevant = str.includes("gamarra") || 
                         str.includes("jarra") ||
                         str.includes("coopera");
      if (isRelevant) {
        console.log(`ID: ${d.id} | Number: #${data.orderNumber} | CustomerId: ${data.customerId} | CustomerName: ${data.customerName} | Status: ${data.orderStatus} | Total: ${data.totalAmount} | Items: ${JSON.stringify(data.items?.map(i => i.name))}`);
      }
    });
  } catch (error) {
    console.error(`Error querying project ${projectId}:`, error.message);
  }
}

async function main() {
  await inspectProject('dualgi3de');
  await inspectProject('solution-3d');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
