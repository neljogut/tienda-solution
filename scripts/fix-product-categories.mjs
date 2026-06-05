/**
 * Unifica categorías duplicadas y reasigna productos.
 *
 * Uso:
 *   node scripts/fix-product-categories.mjs
 *   node scripts/fix-product-categories.mjs --execute
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile as readFileFs } from 'node:fs/promises';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { Firestore } from '@google-cloud/firestore';
import { getFirebaseCliAuthClient } from './firebase-cli-auth.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IMPORT_DIR = join(ROOT, 'importar');
const PROJECT_ID = 'dualgi3de';
const BATCH_SIZE = 400;
const EXECUTE = process.argv.includes('--execute');

const categoryIdByPath = new Map();
let categoriesOut = [];
let orderCounter = 0;

function slug(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function categoryKey(name, parentId) {
  return `${parentId ?? 'root'}::${String(name).trim().toLowerCase()}`;
}

function ensureCategoryPath(pathKey) {
  if (categoryIdByPath.has(pathKey)) return categoryIdByPath.get(pathKey);
  const parts = pathKey.split('>');
  let currentPath = '';
  let parentId = null;
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}>${part}` : part;
    if (!categoryIdByPath.has(currentPath)) {
      const id = `imp_cat_${slug(currentPath)}`;
      categoryIdByPath.set(currentPath, id);
      categoriesOut.push({
        id,
        name: part,
        parentId,
        order: orderCounter++,
        createdAt: new Date().toISOString(),
      });
    }
    parentId = categoryIdByPath.get(currentPath);
  }
  return parentId;
}

function buildCategories(meta, productos) {
  categoryIdByPath.clear();
  categoriesOut = [];
  orderCounter = 0;

  const add = (pathKey, name, parentId) => {
    if (categoryIdByPath.has(pathKey)) return categoryIdByPath.get(pathKey);
    const id = `imp_cat_${slug(pathKey)}`;
    categoryIdByPath.set(pathKey, id);
    categoriesOut.push({ id, name, parentId, order: orderCounter++, createdAt: new Date().toISOString() });
    return id;
  };

  for (const name of meta.customCategories ?? []) add(name, name, null);

  for (const [parent, subs] of Object.entries(meta.subcategoriesByParent ?? {})) {
    const parentId = categoryIdByPath.has(parent) ? categoryIdByPath.get(parent) : add(parent, parent, null);
    for (const sub of subs ?? []) add(`${parent}>${sub}`, sub, parentId);
  }

  for (const name of meta.customCategoriesReventa ?? []) {
    if (!categoryIdByPath.has(name)) add(name, name, null);
  }

  for (const [parent, subs] of Object.entries(meta.subcategoriesReventaByParent ?? {})) {
    const parentId = parent.includes('>')
      ? ensureCategoryPath(parent)
      : (categoryIdByPath.has(parent) ? categoryIdByPath.get(parent) : add(parent, parent, null));
    for (const sub of subs ?? []) add(`${parent}>${sub}`, sub, parentId);
  }

  for (const raw of productos) {
    if (raw.category) {
      if (!categoryIdByPath.has(raw.category)) add(raw.category, raw.category, null);
      if (raw.subcategory) {
        const path = `${raw.category}>${raw.subcategory}`;
        if (!categoryIdByPath.has(path)) {
          add(path, raw.subcategory, categoryIdByPath.get(raw.category));
        }
      }
    }
  }

  categoriesOut.push({
    id: 'imp_cat_sin_categoria',
    name: 'Sin categoría',
    parentId: null,
    order: 999,
    createdAt: new Date().toISOString(),
  });
  categoryIdByPath.set('Sin categoría', 'imp_cat_sin_categoria');

  return categoriesOut;
}

function resolveCategoryId(category, subcategory) {
  if (subcategory && category) {
    const path = `${category}>${subcategory}`;
    if (categoryIdByPath.has(path)) {
      return { id: categoryIdByPath.get(path), name: subcategory, parentName: category };
    }
  }
  if (category && categoryIdByPath.has(category)) {
    return { id: categoryIdByPath.get(category), name: category, parentName: null };
  }
  return { id: 'imp_cat_sin_categoria', name: category || 'Sin categoría', parentName: null };
}

function displayCategory(name, sub, parent) {
  if (sub && parent) return `${parent} › ${sub}`;
  return name;
}

function buildRemapFromFirestore(existing, canonical) {
  const canonicalByKey = new Map(canonical.map((c) => [categoryKey(c.name, c.parentId), c]));
  const idRemap = new Map();

  for (const cat of existing) {
    const key = categoryKey(cat.name, cat.parentId);
    const target = canonicalByKey.get(key);
    if (target && target.id !== cat.id) {
      idRemap.set(cat.id, target.id);
      console.log(`  Duplicado: "${cat.name}" ${cat.id} → ${target.id}`);
    }
  }
  return idRemap;
}

async function readCollection(folder) {
  const dir = join(IMPORT_DIR, folder);
  const files = await readdir(dir);
  const docs = [];
  for (const file of files) {
    if (!file.endsWith('.json') || file === '_index.json') continue;
    docs.push(JSON.parse(await readFile(join(dir, file), 'utf8')));
  }
  return docs;
}

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
  } catch { /* fallback */ }

  const authClient = await getFirebaseCliAuthClient();
  console.log('Autenticado con sesión de Firebase CLI.\n');
  return new Firestore({ projectId: PROJECT_ID, authClient, ignoreUndefinedProperties: true });
}

async function wipeCollection(db, collectionName) {
  const snap = await db.collection(collectionName).get();
  if (snap.empty) return 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const chunk = snap.docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return snap.size;
}

async function main() {
  console.log(EXECUTE ? '\n🚀 Unificando categorías\n' : '\n🔍 DRY-RUN unificación\n');

  const meta = (await readCollection('meta')).find((m) => m.id === 'categorias_producto') ?? {};
  const productos = await readCollection('productos');
  const canonical = buildCategories(meta, productos);

  const importUpdates = new Map(
    productos.map((raw) => {
      const { id: categoryId, name, parentName } = resolveCategoryId(raw.category, raw.subcategory);
      const category = displayCategory(name, raw.subcategory, parentName ?? raw.category);
      return [raw.id, { categoryId, category }];
    })
  );

  console.log(`Categorías canónicas: ${canonical.length}`);
  console.log(`Productos a reasignar: ${importUpdates.size}`);

  if (!EXECUTE) {
    console.log('\nEjecutá con --execute (requiere permisos de admin en Firestore)');
    return;
  }

  const db = await initFirestore();

  const existingSnap = await db.collection('categories').get();
  const existing = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const idRemap = buildRemapFromFirestore(existing, canonical);

  const removed = await wipeCollection(db, 'categories');
  console.log(`Eliminadas ${removed} categorías anteriores`);

  let batch = db.batch();
  let batchCount = 0;
  const commitBatch = async () => {
    if (batchCount > 0) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  };

  for (const cat of canonical) {
    batch.set(db.collection('categories').doc(cat.id), cat);
    batchCount++;
    if (batchCount >= BATCH_SIZE) await commitBatch();
  }
  await commitBatch();

  const prodSnap = await db.collection('products').get();
  for (const docSnap of prodSnap.docs) {
    const data = docSnap.data();
    const imported = importUpdates.get(docSnap.id);
    let categoryId = imported?.categoryId ?? data.categoryId;
    let category = imported?.category ?? data.category;

    if (categoryId && idRemap.has(categoryId)) {
      categoryId = idRemap.get(categoryId);
    }

    batch.update(docSnap.ref, { categoryId, category });
    batchCount++;
    if (batchCount >= BATCH_SIZE) await commitBatch();
  }
  await commitBatch();

  console.log(`\n✅ ${canonical.length} categorías unificadas, ${prodSnap.size} productos actualizados.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
