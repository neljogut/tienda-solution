import { Firestore } from '@google-cloud/firestore';
import { getFirebaseCliAuthClient } from './firebase-cli-auth.mjs';

const PROJECT_ID = 'dualgi3de';

async function main() {
  const authClient = await getFirebaseCliAuthClient();
  const db = new Firestore({
    projectId: PROJECT_ID,
    authClient,
    ignoreUndefinedProperties: true,
  });

  // 1. Get settings/pricing3d
  const p3dSnap = await db.doc('settings/pricing3d').get();
  console.log('--- settings/pricing3d ---');
  console.log(p3dSnap.data());

  // 2. Get settings/exchangeRate
  const rateSnap = await db.doc('settings/exchangeRate').get();
  console.log('\n--- settings/exchangeRate ---');
  console.log(rateSnap.data());

  // 3. Get first 3 products
  const productsSnap = await db.collection('products').limit(5).get();
  console.log('\n--- Sample Products ---');
  for (const doc of productsSnap.docs) {
    const data = doc.data();
    console.log(`Product: ${data.name}`);
    console.log(`  Type: ${data.type}`);
    console.log(`  Weight: ${data.weightGrams}g`);
    console.log(`  Print Time: ${data.printTimeMinutes}m`);
    console.log(`  Manual Price: ${data.useManualPrice} (retail: ${data.manualRetailPrice})`);
    console.log(`  Calculated Cost: ${data.calculatedCost}`);
    console.log(`  Calculated Retail Price: ${data.calculatedRetailPrice}`);
    console.log(`  Calculated Wholesale Price: ${data.calculatedWholesalePrice}`);
    if (data.type === '3d') {
      console.log(`  Filament IDs:`, data.filamentIds);
    }
  }

  // 4. Get inventory filaments
  const filSnap = await db.collection('inventory').where('type', '==', 'filament').get();
  console.log('\n--- Filaments in Inventory ---');
  for (const doc of filSnap.docs) {
    const data = doc.data();
    console.log(`Filament: ${data.brand} ${data.color}`);
    console.log(`  priceUsdKg: ${data.priceUsdKg}`);
  }
}

main().catch(console.error);
