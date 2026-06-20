/**
 * Migra los pedidos activos (pending o processing) para calcular y guardar
 * su fecha de entrega estimada basada en la cola de producción actual.
 *
 * Uso:
 *   node scripts/migrate-delivery-dates.mjs --project dualgi3de
 *   node scripts/migrate-delivery-dates.mjs --project dualgi3de --execute
 *   node scripts/migrate-delivery-dates.mjs --project solution-3d --execute
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile as readFileFs } from 'node:fs/promises';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { Firestore } from '@google-cloud/firestore';
import { getFirebaseCliAuthClient } from './firebase-cli-auth.mjs';

const EXECUTE = process.argv.includes('--execute');
const PROJECT_ID = process.argv.includes('--project') 
  ? process.argv[process.argv.indexOf('--project') + 1] 
  : 'dualgi3de';

async function initFirestore() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ projectId: PROJECT_ID, credential: applicationDefault() });
    const db = getAdminFirestore();
    db.settings({ ignoreUndefinedProperties: true });
    return db;
  }

  try {
    const saPath = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (saPath) {
      const sa = JSON.parse(await readFileFs(saPath, 'utf8'));
      initializeApp({ projectId: PROJECT_ID, credential: cert(sa) });
      const db = getAdminFirestore();
      db.settings({ ignoreUndefinedProperties: true });
      return db;
    }
  } catch {
    /* fallback */
  }

  const authClient = await getFirebaseCliAuthClient();
  console.log(`Autenticado con sesión de Firebase CLI para el proyecto: ${PROJECT_ID}.\n`);
  return new Firestore({
    projectId: PROJECT_ID,
    authClient,
    ignoreUndefinedProperties: true,
  });
}

async function main() {
  console.log(EXECUTE ? `\n🚀 Ejecutando migración de fechas de entrega en ${PROJECT_ID}...\n` : `\n🔍 DRY-RUN — fechas de entrega en ${PROJECT_ID}\n`);

  const db = await initFirestore();

  // 1. Obtener la configuración de la cola
  const settingsSnap = await db.collection('settings').doc('printQueue').get();
  const printerCount = settingsSnap.exists ? (settingsSnap.data().printerCount || 1) : 1;
  const workHoursPerDay = settingsSnap.exists ? (settingsSnap.data().workHoursPerDay || 8) : 8;
  console.log(`Parámetros de impresión: Impresoras: ${printerCount}, Horas de trabajo/día: ${workHoursPerDay}h`);

  // 2. Obtener productos 3D para el tiempo de impresión
  const prodsSnap = await db.collection('products').where('type', '==', '3d').get();
  const productTimes = {};
  prodsSnap.forEach(d => {
    productTimes[d.id] = d.data().printTimeMinutes || 0;
  });
  console.log(`Productos 3D cargados: ${prodsSnap.size}`);

  // 3. Obtener todos los pedidos activos (pending o processing)
  const activeOrdersSnap = await db.collection('orders')
    .where('orderStatus', 'in', ['pending', 'processing'])
    .get();

  const activeOrders = [];
  activeOrdersSnap.forEach(docSnap => {
    activeOrders.push({ id: docSnap.id, ...docSnap.data() });
  });

  // Ordenar cronológicamente (más antiguos primero)
  activeOrders.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  console.log(`Pedidos activos encontrados: ${activeOrders.length}`);

  let cumulativeMinutes = 0;
  let updatedCount = 0;

  for (const order of activeOrders) {
    let remainingMinutes = 0;
    const items = order.items || [];
    
    items.forEach(item => {
      if (item.type === '3d') {
        const printTime = productTimes[item.productId] || 0;
        const printed = item.printedQty || 0;
        const printing = item.printingQty || 0;
        const pending = item.quantity - printed - printing;
        
        const remainingUnits = pending + printing * 0.5;
        if (remainingUnits > 0) {
          remainingMinutes += remainingUnits * printTime;
        }
      }
    });

    cumulativeMinutes += remainingMinutes;
    
    // Calcular días necesarios basado en impresoras y horas de trabajo
    const adjusted = printerCount > 1 ? cumulativeMinutes / printerCount : cumulativeMinutes;
    const days = workHoursPerDay > 0 ? (adjusted / 60 / workHoursPerDay) : 0;
    
    // Aplicar margen de seguridad (40% de buffer) y 1 día de armado/empaque
    const estimatedDays = Math.ceil(days * 1.4) + 1;
    
    // La fecha estimada es a partir de la fecha de creación del pedido o del momento actual
    // Si la fecha del pedido es muy vieja, calculamos a partir de hoy, pero si es reciente, desde la fecha del pedido.
    // Usamos el momento actual como base mínima para estimar entregas futuras realistas.
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + estimatedDays);
    
    console.log(`Pedido #${String(order.orderNumber).padStart(5, '0')} (${order.customerName}):`);
    console.log(`  Tiempo restante propio: ${remainingMinutes} min (Acumulado en cola: ${cumulativeMinutes} min)`);
    console.log(`  Días estimados: ${estimatedDays} -> Nueva fecha estimada de entrega: ${baseDate.toLocaleDateString('es-AR')}`);

    if (EXECUTE) {
      await db.collection('orders').doc(order.id).update({
        deliveryDate: baseDate.toISOString()
      });
      updatedCount++;
      console.log(`  ✅ Actualizado en Firestore.`);
    }
  }

  console.log(`\nProceso finalizado. ${updatedCount} pedidos ${EXECUTE ? 'actualizados' : 'simulados'}.`);
  if (!EXECUTE) {
    console.log(`Ejecutá el script agregando --execute para aplicar los cambios:\n  node scripts/migrate-delivery-dates.mjs --project ${PROJECT_ID} --execute\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
