/**
 * Migrates all products of type '3d' in Firestore to type 'resale' and cleans up 3D fields.
 *
 * Usage:
 *   node scripts/migrate-to-resale.mjs
 *   node scripts/migrate-to-resale.mjs --execute
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile as readFileFs } from 'node:fs/promises';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { Firestore } from '@google-cloud/firestore';
import { getFirebaseCliAuthClient } from './firebase-cli-auth.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read project ID from .env.local if present
async function getProjectId() {
  try {
    const envPath = join(__dirname, '..', '.env.local');
    const content = await readFileFs(envPath, 'utf8');
    const match = content.match(/VITE_FIREBASE_PROJECT_ID=(.+)/);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch (err) {
    // ignore
  }
  return 'solution-3d';
}

const PROJECT_ID = await getProjectId();
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
  console.log(`Proyecto Target: ${PROJECT_ID}`);
  console.log(EXECUTE ? '\n🚀 Migrando productos a reventa (EJECUCIÓN REAL)\n' : '\n🔍 DRY-RUN — migración de productos\n');

  const db = await initFirestore();
  const snap = await db.collection('products').where('type', '==', '3d').get();

  console.log(`Productos 3D encontrados a migrar: ${snap.size}`);

  if (snap.size === 0) {
    console.log('No hay productos de tipo "3d" que requieran migración.');
    return;
  }

  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`- A migrar: [${doc.id}] ${data.name}`);

    if (EXECUTE) {
      // Prepare update to change type and delete 3D fields
      const updateData = {
        type: 'resale',
        purchaseCost: data.purchaseCost || 0,
        // Firebase field deletes:
        filamentLines: FieldValueDelete(),
        supplyIds: FieldValueDelete(),
        filamentIds: FieldValueDelete(),
        weightGrams: FieldValueDelete(),
        printTimeMinutes: FieldValueDelete(),
        isKeychain: FieldValueDelete(),
      };

      batch.update(doc.ref, updateData);
      batchCount++;

      if (batchCount >= 400) {
        await batch.commit();
        console.log(`Lote de ${batchCount} productos guardado.`);
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  if (EXECUTE && batchCount > 0) {
    await batch.commit();
    console.log(`Lote final de ${batchCount} productos guardado.`);
  }

  console.log('\nOperación completada.');
  if (!EXECUTE) {
    console.log('Usa --execute para aplicar los cambios en la base de datos.');
  }
}

// Helpers for FieldValue.delete() depending on whether we use firestore or admin
function FieldValueDelete() {
  // Try to use Cloud Firestore SDK or Admin SDK FieldValue
  try {
    return Firestore.FieldValue.delete();
  } catch {
    return getAdminFirestore.FieldValue.delete();
  }
}

main().catch(err => {
  console.error('Error durante la migración:', err);
});
