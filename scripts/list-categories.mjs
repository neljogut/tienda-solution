import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile as readFileFs } from 'node:fs/promises';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { Firestore } from '@google-cloud/firestore';
import { getFirebaseCliAuthClient } from './firebase-cli-auth.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  const EXECUTE = process.argv.includes('--execute');
  
  // 1. Fetch categories
  const catSnap = await db.collection('categories').get();
  const categories = catSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Helper to resolve full category path
  const resolveCategoryPath = (catId) => {
    if (!catId) return '';
    const path = [];
    let currentId = catId;
    while (currentId) {
      const cat = categories.find(c => c.id === currentId);
      if (cat) {
        path.unshift(cat.name);
        currentId = cat.parentId;
      } else {
        currentId = null;
      }
    }
    return path.join(' › ');
  };
  
  console.log(EXECUTE ? '🚀 ACTUALIZANDO CATEGORÍAS EN FIRESTORE...\n' : '🔍 SIMULACIÓN (DRY-RUN) - Comparando categorías...\n');
  
  const prodSnap = await db.collection('products').get();
  let modifiedCount = 0;
  
  for (const doc of prodSnap.docs) {
    const data = doc.data();
    const resolvedPath = resolveCategoryPath(data.categoryId) || 'Sin categoría';
    
    // Normalize spaces and arrows for comparison
    const normActual = (data.category || '').replace(/\s+/g, ' ').trim();
    const normResolved = resolvedPath.replace(/\s+/g, ' ').trim();
    
    if (normActual !== normResolved) {
      console.log(`Producto: "${data.name}"`);
      console.log(`  Actual: "${data.category}"`);
      console.log(`  Nuevo:  "${resolvedPath}"`);
      
      if (EXECUTE) {
        await doc.ref.update({ category: resolvedPath });
        console.log(`  -> ¡Actualizado en Firestore!`);
      }
      modifiedCount++;
    }
  }
  
  console.log(`\nTotal de productos inconsistentes: ${modifiedCount}`);
  if (!EXECUTE && modifiedCount > 0) {
    console.log('\nPara aplicar estos cambios en la base de datos, ejecuta:');
    console.log('node scripts/list-categories.mjs --execute');
  }
}

run().catch(console.error);
