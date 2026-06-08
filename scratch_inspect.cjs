const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

// Parse .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*["']?([^"']*)["']?/);
  if (match) {
    env[match[1]] = match[2];
  }
});

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspect() {
  const clientsSnap = await getDocs(collection(db, 'clients'));
  const usersSnap = await getDocs(collection(db, 'users'));
  const ordersSnap = await getDocs(collection(db, 'orders'));

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
}

inspect().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
