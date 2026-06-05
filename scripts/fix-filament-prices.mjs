/**
 * Resetea priceUsdKg a 0 en filamentos importados con el precio global convertido.
 * 0 = usar el precio de settings/pricing3d (Parámetros de precios).
 *
 * Uso:
 *   node scripts/fix-filament-prices.mjs
 *   node scripts/fix-filament-prices.mjs --execute
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile as readFileFs } from 'node:fs/promises';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { Firestore } from '@google-cloud/firestore';
import { getFirebaseCliAuthClient } from './firebase-cli-auth.mjs';

const PROJECT_ID = 'dualgi3de';
const EXECUTE = process.argv.includes('--execute');

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
  console.log('Autenticado con sesión de Firebase CLI.\n');
  return new Firestore({
    projectId: PROJECT_ID,
    authClient,
    ignoreUndefinedProperties: true,
  });
}

async function main() {
  console.log(EXECUTE ? '\n🚀 Corrigiendo precios de filamentos\n' : '\n🔍 DRY-RUN — precios de filamentos\n');

  const db = await initFirestore();
  const snap = await db.collection('inventory').where('type', '==', 'filament').get();

  let toFix = 0;
  let batch = db.batch();
  let batchCount = 0;

  const commitBatch = async () => {
    if (batchCount > 0) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  };

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const current = Number(data.priceUsdKg) || 0;
    if (current <= 0) continue;

    toFix++;
    console.log(`  ${data.brand ?? ''} ${data.color ?? ''}: ${current} → 0 (usa parámetros)`);

    if (EXECUTE) {
      batch.update(docSnap.ref, { priceUsdKg: 0 });
      batchCount++;
      if (batchCount >= 400) {
        await commitBatch();
      }
    }
  }

  if (EXECUTE) {
    await commitBatch();
  }

  console.log(`\n${toFix} filamentos ${EXECUTE ? 'actualizados' : 'a corregir'}.`);
  if (!EXECUTE && toFix > 0) {
    console.log('Ejecutá: node scripts/fix-filament-prices.mjs --execute\n');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
