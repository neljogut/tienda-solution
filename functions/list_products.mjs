import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile as readFileFs } from 'node:fs/promises';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { Firestore } from '@google-cloud/firestore';
import { getFirebaseCliAuthClient } from '../../../../Desktop/Tienda solution/Tienda solution/scripts/firebase-cli-auth.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function getProjectId() {
  try {
    const envPath = join(__dirname, '..', '..', '..', '..', 'Desktop', 'Tienda solution', 'Tienda solution', '.env.local');
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
  return new Firestore({
    projectId: PROJECT_ID,
    authClient,
    ignoreUndefinedProperties: true,
  });
}

async function run() {
  const db = await initFirestore();
  const prodSnap = await db.collection('products').where('isActive', '==', true).get();
  console.log(`Found ${prodSnap.docs.length} active products:`);
  for (const doc of prodSnap.docs) {
    const data = doc.data();
    console.log(` - ID: ${doc.id} | Name: "${data.name}" | Stock: ${data.stock} | Type: ${data.type}`);
  }
}

run().catch(console.error);
