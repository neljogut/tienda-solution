/**
 * Repara filamentLines y supplyIds de productos 3D desde ./importar
 * (productos + pedidos con supplyUsage).
 *
 * Uso:
 *   node scripts/fix-product-materials.mjs
 *   node scripts/fix-product-materials.mjs --execute
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile as readFileFs } from 'node:fs/promises';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { Firestore } from '@google-cloud/firestore';
import { getFirebaseCliAuthClient } from './firebase-cli-auth.mjs';
import {
  buildPedidosMaterialMap,
  loadMaterialOverrides,
  resolveProductMaterials,
} from './lib/product-materials.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IMPORT_DIR = join(ROOT, 'importar');
const PROJECT_ID = 'dualgi3de';
const BATCH_SIZE = 400;
const EXECUTE = process.argv.includes('--execute');

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

function linesEqual(a, b) {
  const norm = (lines, key) =>
    [...lines]
      .map((l) => `${l.supplyId}:${l[key]}`)
      .sort()
      .join('|');
  return norm(a, 'grams') === norm(b, 'grams');
}

function suppliesEqual(a, b) {
  const norm = (lines) =>
    [...lines]
      .map((l) => `${l.supplyId}:${l.quantity}`)
      .sort()
      .join('|');
  return norm(a) === norm(b);
}

async function main() {
  console.log(EXECUTE ? '\n🚀 Corrigiendo materiales de productos\n' : '\n🔍 DRY-RUN — materiales de productos\n');

  const productos = await readCollection('productos');
  const pedidos = await readCollection('pedidos');
  const pedidosMap = buildPedidosMaterialMap(pedidos);
  const overridesMap = await loadMaterialOverrides(IMPORT_DIR);

  const patches = [];
  const stillMissingFil = [];
  const stillMissingIns = [];
  let recoveredFromPedidos = 0;
  let consolidated = 0;

  for (const raw of productos) {
    if (raw.productKind === 'reventa') continue;

    const materials = resolveProductMaterials(raw, pedidosMap, overridesMap);
    if (materials.recoveredFrom === 'pedidos') recoveredFromPedidos++;
    if (materials.recoveredFrom === 'override') recoveredFromPedidos++;

    const exportFil = (raw.filamentLines ?? []).filter((l) => l.supplyId);
    if (exportFil.length > materials.filamentLines.length) consolidated++;

    if (!materials.filamentLines.length && (raw.gramsFilament || 0) > 0) {
      stillMissingFil.push(raw.name);
    }
    if (!materials.supplyIds.length && (raw.insumoLines ?? []).length === 0) {
      const hadInsInOther = pedidosMap.get(raw.id)?.supplyIds?.length;
      if (!hadInsInOther) stillMissingIns.push(raw.name);
    }

    patches.push({
      id: raw.id,
      name: raw.name,
      filamentLines: materials.filamentLines,
      supplyIds: materials.supplyIds,
      filamentIds: materials.filamentIds,
      weightGrams: materials.weightGrams,
    });
  }

  console.log(`Productos 3D analizados: ${patches.length}`);
  console.log(`Con filamentos: ${patches.filter((p) => p.filamentLines.length).length}`);
  console.log(`Con insumos: ${patches.filter((p) => p.supplyIds.length).length}`);
  console.log(`Recuperados desde pedidos: ${recoveredFromPedidos}`);
  console.log(`Líneas de filamento unificadas (mismo color): ${consolidated}`);

  if (stillMissingFil.length) {
    console.log(`\n⚠️  Sin filamentos en el export (${stillMissingFil.length}):`);
    stillMissingFil.slice(0, 15).forEach((name) => console.log(`   - ${name}`));
    if (stillMissingFil.length > 15) console.log(`   ... y ${stillMissingFil.length - 15} más`);
  }

  if (!EXECUTE) {
    console.log('\nEjecutá con --execute para aplicar en Firestore.\n');
    return;
  }

  const db = await initFirestore();
  const snap = await db.collection('products').get();
  const existing = new Map(snap.docs.map((d) => [d.id, d.data()]));

  let updated = 0;
  let created = 0;
  const toWrite = [];

  for (const patch of patches) {
    const current = existing.get(patch.id);
    if (!current) {
      console.log(`   Producto ausente en Firestore, reimportar productos: ${patch.name}`);
      created++;
      continue;
    }

    const needsUpdate =
      !linesEqual(current.filamentLines ?? [], patch.filamentLines) ||
      !suppliesEqual(current.supplyIds ?? [], patch.supplyIds) ||
      (current.weightGrams ?? 0) !== patch.weightGrams;

    if (!needsUpdate) continue;
    toWrite.push(patch);
  }

  for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
    const chunk = toWrite.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const patch of chunk) {
      batch.update(db.collection('products').doc(patch.id), {
        filamentLines: patch.filamentLines,
        supplyIds: patch.supplyIds,
        filamentIds: patch.filamentIds,
        weightGrams: patch.weightGrams,
        updatedAt: new Date().toISOString(),
      });
      updated++;
    }
    await batch.commit();
    console.log(`    ✓ ${Math.min(i + BATCH_SIZE, toWrite.length)} / ${toWrite.length}`);
  }

  console.log(`\n✅ ${updated} productos actualizados.`);
  if (created) {
    console.log(`ℹ️  ${created} producto(s) del export no existen en Firestore — corré importación de productos.`);
  }
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
