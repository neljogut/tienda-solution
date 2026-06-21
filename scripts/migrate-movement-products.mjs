/**
 * Migra los movimientos de inventario históricos (inventory_movements) para
 * asociar cada línea de consumo de filamento/insumo con su respectivo producto
 * basándose en el orden secuencial en el que fueron registradas en el array.
 *
 * Uso:
 *   node scripts/migrate-movement-products.mjs --project dualgi3de
 *   node scripts/migrate-movement-products.mjs --project dualgi3de --execute
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
  console.log(EXECUTE ? `\n🚀 Ejecutando migración de movimientos de inventario en ${PROJECT_ID}...\n` : `\n🔍 DRY-RUN — migración de movimientos en ${PROJECT_ID}\n`);

  const db = await initFirestore();

  // Obtener todos los movimientos de inventario
  const movementsSnap = await db.collection('inventory_movements').get();
  console.log(`Movimientos de inventario encontrados: ${movementsSnap.size}`);

  let updatedCount = 0;
  let linesUpdatedCount = 0;

  for (const docSnap of movementsSnap.docs) {
    const data = docSnap.data();
    if (!Array.isArray(data.lines) || data.lines.length === 0) {
      continue;
    }

    const originalLines = data.lines;
    const newLines = [];
    let currentProductId = null;
    let hasChanges = false;

    for (const line of originalLines) {
      const updatedLine = { ...line };
      
      if (line.itemType === 'product') {
        currentProductId = line.itemId;
      } else if (line.itemType === 'filament' || line.itemType === 'supply') {
        if (currentProductId && line.relatedProductId !== currentProductId) {
          updatedLine.relatedProductId = currentProductId;
          hasChanges = true;
          linesUpdatedCount++;
        }
      }
      
      newLines.push(updatedLine);
    }

    if (hasChanges) {
      updatedCount++;
      console.log(`Movimiento [${docSnap.id}]:`);
      console.log(`  Motivo: "${data.reason || 'Sin motivo'}"`);
      console.log(`  Fecha: ${data.date}`);
      
      // Mostrar resumen de las asociaciones hechas
      newLines.forEach((l, idx) => {
        const oldL = originalLines[idx];
        if (l.relatedProductId && l.relatedProductId !== oldL.relatedProductId) {
          console.log(`    -> Línea ${l.itemType} (${l.itemId}): asociado al producto ${l.relatedProductId}`);
        }
      });

      if (EXECUTE) {
        await docSnap.ref.update({ lines: newLines });
      }
    }
  }

  console.log(`\n======================================================`);
  console.log(`Resumen de la migración:`);
  console.log(`- Movimientos que requieren actualización: ${updatedCount}`);
  console.log(`- Líneas de material asociadas a producto: ${linesUpdatedCount}`);
  console.log(`======================================================`);
  
  if (!EXECUTE && updatedCount > 0) {
    console.log(`\n💡 Para aplicar los cambios en la base de datos de producción, ejecutá:`);
    console.log(`   node scripts/migrate-movement-products.mjs --project ${PROJECT_ID} --execute\n`);
  } else if (EXECUTE) {
    console.log(`\n✅ Cambios aplicados con éxito en la base de datos.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
