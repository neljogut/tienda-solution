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

  console.log('Fetching products...');
  const productsSnap = await db.collection('products').get();
  const matchedProducts = [];

  for (const doc of productsSnap.docs) {
    const data = doc.data();
    data.id = doc.id;
    const nameLower = (data.name || '').toLowerCase();
    if (nameLower.includes('afa') || nameLower.includes('newell') || nameLower.includes('jarra')) {
      matchedProducts.push(data);
    }
  }

  console.log('\n=== MATCHED PRODUCTS ===');
  matchedProducts.forEach(p => {
    console.log(`ID: ${p.id}`);
    console.log(`  Name: "${p.name}"`);
    console.log(`  Type: ${p.type}`);
    console.log(`  Active: ${p.isActive}`);
    console.log(`  Image: ${p.mainImage}`);
    console.log(`  Stock: ${p.stock}`);
    console.log(`  Category: ${p.category} (${p.categoryId})`);
    console.log(`  Variant Group: ${p.variantGroup}`);
    console.log('-----------------------------------');
  });

  const matchedProductIds = matchedProducts.map(p => p.id);
  console.log(`Searching orders for product IDs:`, matchedProductIds);

  const ordersSnap = await db.collection('orders').get();
  let totalSalesCount = 0;

  console.log('\n=== MATCHED ORDER ITEMS ===');
  for (const doc of ordersSnap.docs) {
    const order = doc.data();
    order.id = doc.id;

    if (order.items && Array.isArray(order.items)) {
      const matchedItems = order.items.filter(item => matchedProductIds.includes(item.productId));
      if (matchedItems.length > 0) {
        console.log(`Order #${order.orderNumber} (ID: ${order.id}) | Status: ${order.orderStatus} | Date: ${order.date}`);
        matchedItems.forEach(item => {
          console.log(`  Item: "${item.name}"`);
          console.log(`    ProductId: ${item.productId}`);
          console.log(`    Quantity: ${item.quantity}`);
          console.log(`    UnitPrice: ${item.unitPrice}`);
          console.log(`    Total: $${item.quantity * item.unitPrice}`);
          totalSalesCount += item.quantity;
        });
        console.log('  ---------------------------------');
      }
    }
  }

  console.log(`\nDiagnostics finished. Total items sold across matched orders: ${totalSalesCount}`);
}

main().catch(console.error);
