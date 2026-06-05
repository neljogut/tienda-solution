/**
 * Importa datos desde ./importar (export de gestión de negocios) hacia Firestore de Dualgi 3D.
 *
 * Uso:
 *   node scripts/import-gestion-data.mjs --dry-run
 *   node scripts/import-gestion-data.mjs --execute
 *   node scripts/import-gestion-data.mjs --execute --only=clients,products
 *
 * Requiere credenciales de administrador (una de estas):
 *   - Variable GOOGLE_APPLICATION_CREDENTIALS apuntando a un JSON de cuenta de servicio
 *   - gcloud auth application-default login
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { Firestore } from '@google-cloud/firestore';
import { readFile as readFileFs } from 'node:fs/promises';
import { getFirebaseCliAuthClient } from './firebase-cli-auth.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IMPORT_DIR = join(ROOT, 'importar');
const PROJECT_ID = 'dualgi3de';
const BATCH_SIZE = 400;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || !args.includes('--execute');
const ONLY = (args.find((a) => a.startsWith('--only='))?.split('=')[1] ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const STEPS = [
  'settings',
  'categories',
  'inventory',
  'products',
  'clients',
  'orders',
  'cash_sessions',
  'inventory_movements',
];

function shouldRun(step) {
  return ONLY.length === 0 || ONLY.includes(step);
}

function iso(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (value.iso) return value.iso;
  return new Date().toISOString();
}

function slug(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

async function readCollection(folder) {
  const dir = join(IMPORT_DIR, folder);
  const files = await readdir(dir);
  const docs = [];
  for (const file of files) {
    if (!file.endsWith('.json') || file === '_index.json') continue;
    const raw = await readFile(join(dir, file), 'utf8');
    docs.push(JSON.parse(raw));
  }
  return docs;
}

async function readJson(path) {
  const raw = await readFile(join(IMPORT_DIR, path), 'utf8');
  return JSON.parse(raw);
}

function splitName(fullName) {
  const parts = String(fullName || 'Sin nombre').trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function mapPaymentMethod(method) {
  const map = {
    cash: 'cash',
    bankTransfer: 'transfer',
    creditCard: 'card',
    mercadopago: 'mercadopago',
  };
  return map[method] ?? 'other';
}

function mapOrderStatus(status) {
  const map = {
    pending: 'pending',
    delivered: 'delivered',
    processing: 'processing',
    finished: 'finished',
    cancelled: 'cancelled',
  };
  return map[status] ?? 'pending';
}

function mapPaymentStatus(total, paid) {
  if (paid <= 0) return 'unpaid';
  if (paid >= total) return 'paid';
  return 'partial';
}

/** @type {Map<string, string>} */
const categoryIdByPath = new Map();

function buildCategories(meta) {
  const categories = [];
  let order = 0;

  const add = (pathKey, name, parentId) => {
    const id = `imp_cat_${slug(pathKey)}`;
    categoryIdByPath.set(pathKey, id);
    categories.push({
      id,
      name,
      parentId,
      order: order++,
      createdAt: new Date().toISOString(),
    });
  };

  for (const name of meta.customCategories ?? []) {
    add(name, name, null);
  }

  for (const [parent, subs] of Object.entries(meta.subcategoriesByParent ?? {})) {
    if (!categoryIdByPath.has(parent)) add(parent, parent, null);
    const parentId = categoryIdByPath.get(parent);
    for (const sub of subs ?? []) {
      add(`${parent}>${sub}`, sub, parentId);
    }
  }

  for (const name of meta.customCategoriesReventa ?? []) {
    if (!categoryIdByPath.has(name)) add(name, name, null);
  }

  for (const [parent, subs] of Object.entries(meta.subcategoriesReventaByParent ?? {})) {
    if (!categoryIdByPath.has(parent)) add(parent, parent, null);
    const parentId = categoryIdByPath.get(parent);
    for (const sub of subs ?? []) {
      add(`${parent}>${sub}`, sub, parentId);
    }
  }

  return categories;
}

function resolveCategoryId(category, subcategory) {
  if (subcategory && category) {
    const path = `${category}>${subcategory}`;
    if (categoryIdByPath.has(path)) return { id: categoryIdByPath.get(path), name: subcategory };
  }
  if (category && categoryIdByPath.has(category)) {
    return { id: categoryIdByPath.get(category), name: category };
  }
  const fallback = categoryIdByPath.get('Sin categoría') ?? 'imp_cat_sin_categoria';
  return { id: fallback, name: category || 'Sin categoría' };
}

const DEFAULT_EXCHANGE_RATE = 1200;

function filamentPricePerKgArs(insumo, config) {
  if (insumo?.filamentCustomPricePerKg != null && insumo.filamentCustomPricePerKg > 0) {
    return insumo.filamentCustomPricePerKg;
  }
  return Number(config?.pricePerKg) || 20000;
}

function computeLegacyProductCost(raw, config, insumoMap) {
  let filamentCost = 0;
  const lines = raw.filamentLines ?? [];
  if (lines.length > 0) {
    for (const line of lines) {
      const insumo = insumoMap.get(line.supplyId);
      const pricePerKg = filamentPricePerKgArs(insumo, config);
      filamentCost += (Number(line.grams) || 0) / 1000 * pricePerKg;
    }
  } else {
    const grams = Number(raw.gramsFilament) || 0;
    filamentCost = (grams / 1000) * (Number(config?.pricePerKg) || 20000);
  }

  let suppliesCost = 0;
  for (const line of raw.insumoLines ?? []) {
    const insumo = insumoMap.get(line.supplyId);
    suppliesCost += (Number(line.amount) || 1) * (Number(insumo?.price) || 0);
  }

  const timeHours = Number(raw.printingTimeHours) || 0;
  const electricity = timeHours * (Number(config?.consumptionWatts) || 120) / 1000 * (Number(config?.priceKwh) || 140);
  const maintenance = timeHours * (Number(config?.repairCost) || 150000) / (Number(config?.machineLifeHours) || 4320);
  const subtotal = filamentCost + suppliesCost + electricity + maintenance;
  const margin = Number(config?.errorMargin) || 8;
  return Math.round(subtotal * (1 + margin / 100));
}

function mapProduct(raw, config, insumoMap) {
  const { id: categoryId, name: categoryName } = resolveCategoryId(raw.category, raw.subcategory);
  const is3d = raw.productKind !== 'reventa';
  const thresholdKeychain = config?.thresholdKeychainGrams ?? 600;

  const filamentLines = (raw.filamentLines ?? [])
    .map((l) => ({
      supplyId: l.supplyId,
      grams: Number(l.grams) || 0,
    }))
    .filter((l) => l.supplyId);

  const supplyIds = (raw.insumoLines ?? [])
    .map((l) => ({
      supplyId: l.supplyId,
      quantity: Number(l.amount) || 1,
    }))
    .filter((l) => l.supplyId);

  const calculatedCost = is3d
    ? computeLegacyProductCost(raw, config, insumoMap)
    : Number(raw.purchaseCost) || 0;

  const base = {
    id: raw.id,
    name: raw.name,
    categoryId,
    category: subcategoryOrParent(categoryName, raw.subcategory, raw.category),
    description: raw.description ?? '',
    mainImage: raw.imageUrl || raw.imageUrls?.[0] || '',
    gallery: raw.imageUrls ?? (raw.imageUrl ? [raw.imageUrl] : []),
    isActive: !raw.isDraft,
    stock: Number(raw.stock) || 0,
    useManualPrice: Boolean(raw.manualPricing),
    manualRetailPrice: Number(raw.priceRetail) || 0,
    calculatedRetailPrice: Number(raw.priceRetail) || 0,
    calculatedWholesalePrice: Number(raw.priceWholesale) || 0,
    calculatedCost,
    createdAt: iso(raw.createdAt),
    updatedAt: iso(raw.updatedAt),
  };

  const tiers = (raw.quantityTiers ?? []).map((t) => ({
    minQty: t.minUnits ?? t.minQty ?? 1,
    maxQty: t.maxUnits ?? t.maxQty ?? 9999,
    unitPrice: t.unitPriceRetail ?? t.unitPrice ?? 0,
  }));
  if (tiers.length) base.priceTiers = tiers;

  if (is3d) {
    return {
      ...base,
      type: '3d',
      weightGrams: Number(raw.gramsFilament) || 0,
      printTimeMinutes: Math.round((Number(raw.printingTimeHours) || 0) * 60),
      isKeychain: (Number(raw.gramsFilament) || 0) > 0 && (Number(raw.gramsFilament) || 0) <= thresholdKeychain,
      filamentIds: filamentLines.map((l) => l.supplyId),
      filamentLines,
      supplyIds,
    };
  }

  return {
    ...base,
    type: 'resale',
    purchaseCost: Number(raw.purchaseCost) || 0,
  };
}

function subcategoryOrParent(catName, sub, parent) {
  return sub ? `${parent} › ${sub}` : catName;
}

function mapFilament(raw, config, exchangeRate = DEFAULT_EXCHANGE_RATE) {
  const priceArsPerKg = filamentPricePerKgArs(raw, config);
  return {
    id: raw.id,
    type: 'filament',
    brand: raw.brand ?? 'Sin marca',
    material: (raw.subtype ?? 'PLA').toUpperCase(),
    color: raw.filamentColorName ?? raw.description ?? 'Sin color',
    hexColor: raw.filamentColor ?? '#888888',
    mainImage: raw.imageUrl || undefined,
    initialWeightGrams: Number(raw.stock) || 0,
    availableWeightGrams: Number(raw.stock) || 0,
    priceUsdKg: Number((priceArsPerKg / exchangeRate).toFixed(2)),
    provider: '',
    purchaseDate: iso(raw.purchaseDate ?? raw.createdAt),
    minStockGrams: Number(raw.minimumStock) || 0,
    isActive: !raw.isDraft,
  };
}

function mapSupply(raw) {
  return {
    id: raw.id,
    type: 'supply',
    name: raw.description ?? 'Insumo',
    category: 'Insumos',
    mainImage: raw.imageUrl || undefined,
    unitOfMeasure: 'u.',
    currentStock: Number(raw.stock) || 0,
    minStock: Number(raw.minimumStock) || 0,
    unitCostArs: Number(raw.price) || 0,
    provider: '',
    observations: '',
  };
}

function mapClient(raw) {
  const { firstName, lastName } = splitName(raw.fullName);
  let clientType = 'normal';
  if (raw.isWholesale) clientType = 'wholesale';

  return {
    id: raw.id,
    firstName,
    lastName,
    phone: raw.phone ?? '',
    email: raw.email ?? '',
    address: raw.address ?? '',
    city: '',
    province: '',
    postalCode: '',
    cuit: '',
    observations: raw.notes ?? '',
    createdAt: iso(raw.fechaRegistro ?? raw.createdAt),
    clientType,
    totalPurchased: 0,
    totalOwed: 0,
  };
}

function mapOrder(raw, orderNumber) {
  const total = Number(raw.totalAmount) || 0;
  const paid = Number(raw.amountPaid) || 0;

  const items = (raw.items ?? []).map((item) => ({
    productId: item.productId ?? '',
    name: item.productName ?? 'Ítem',
    type: item.productKind === 'reventa' ? 'resale' : '3d',
    quantity: Number(item.quantity) || 1,
    unitPrice: Number(item.unitPrice) || 0,
    appliedWholesale: false,
    unitCost: 0,
    unitProfit: Number(item.unitPrice) || 0,
    imageUrl: item.productImage || undefined,
    isManualPrice: false,
  }));

  return {
    id: raw.id,
    orderNumber,
    customerId: raw.clientId ?? '',
    customerName: raw.clientName ?? 'Cliente',
    date: iso(raw.createdAt),
    items,
    totalAmount: total,
    paidAmount: paid,
    pendingAmount: Math.max(0, total - paid),
    paymentStatus: mapPaymentStatus(total, paid),
    orderStatus: mapOrderStatus(raw.status),
    paymentMethod: raw.paymentMethod ? mapPaymentMethod(raw.paymentMethod) : undefined,
    observationsPublic: raw.notes ?? '',
    observationsInternal: 'Importado desde plataforma de gestión anterior.',
    exchangeRateUsdUsed: 0,
    exchangeRateDate: iso(raw.createdAt),
    totalCost: 0,
    totalProfit: total,
  };
}

function mapLineCategory(category) {
  if (category === 'filament') return 'filament';
  if (category === 'insumo') return 'supply';
  if (category === 'productPrint3d' || category === 'productReventa') return 'product';
  return 'supply';
}

function mapLegacyMovementType(parentType, category, delta) {
  const isProduct = category === 'productPrint3d' || category === 'productReventa';
  if (parentType === 'sale') return isProduct ? 'out_sale' : 'consumption';
  if (parentType === 'replenishment') return delta >= 0 ? 'in' : 'adjustment';
  if (parentType === 'stockReturn') return 'return';
  if (parentType === 'manual') {
    if (delta > 0) return 'in';
    return isProduct ? 'out_sale' : 'consumption';
  }
  return delta >= 0 ? 'in' : 'consumption';
}

const LEGACY_TYPE_LABEL = {
  sale: 'Venta',
  replenishment: 'Reposición de stock',
  manual: 'Movimiento manual',
  stockReturn: 'Devolución al stock',
};

function buildMovementReason(parent, line) {
  const base = parent.reason || LEGACY_TYPE_LABEL[parent.type] || 'Importado desde gestión anterior';
  if (line.label && line.label !== line.refId) {
    return `${base} · ${line.label}`;
  }
  return base;
}

function expandLegacyMovements(rawMovements) {
  const expanded = [];

  for (const parent of rawMovements) {
    const date = iso(parent.createdAt);
    const userId = parent.actorUid ?? 'import';
    const orderId = parent.orderId || undefined;

    (parent.lines ?? []).forEach((line, lineIndex) => {
      const delta = Number(line.delta) || 0;
      if (!line.refId || delta === 0) return;

      expanded.push({
        id: `imp_mov_${parent.id}__${lineIndex}`,
        date,
        movementType: mapLegacyMovementType(parent.type, line.category, delta),
        itemId: line.refId,
        itemType: mapLineCategory(line.category),
        modifiedQuantity: delta,
        previousQuantity: 0,
        finalQuantity: 0,
        reason: buildMovementReason(parent, line),
        userId,
        orderId,
        _sortKey: `${date}__${parent.id}__${lineIndex}`,
      });
    });
  }

  expanded.sort((a, b) => a._sortKey.localeCompare(b._sortKey));

  const stockByItem = new Map();
  for (const mov of expanded) {
    const prev = stockByItem.get(mov.itemId) ?? 0;
    const final = prev + mov.modifiedQuantity;
    mov.previousQuantity = prev;
    mov.finalQuantity = final;
    stockByItem.set(mov.itemId, final);
    delete mov._sortKey;
  }

  return expanded;
}

function mapCashSession(raw) {
  const ingress = raw.atCloseIngressSalesByMethod ?? {};
  return {
    id: raw.id,
    openedAt: iso(raw.openedAt),
    openedBy: raw.openedByUid ?? 'import',
    openedByName: raw.openedByLabel ?? 'Importación',
    initialAmount: Number(raw.openingFloat) || 0,
    status: raw.status === 'open' ? 'open' : 'closed',
    closedAt: raw.closedAt ? iso(raw.closedAt) : undefined,
    closedBy: raw.closedByUid,
    closedByName: raw.closedByLabel,
    totalIncome:
      (Number(ingress.cash) || 0) +
      (Number(ingress.bankTransfer) || 0) +
      (Number(ingress.creditCard) || 0),
    totalExpense: 0,
    expectedAmount: Number(raw.expectedCashAtClose) || 0,
    declaredAmount: Number(raw.closingCountedCash) || 0,
    difference: Number(raw.variance) || 0,
    breakdown: {
      cash: Number(ingress.cash) || 0,
      transfer: Number(ingress.bankTransfer) || 0,
      mercadopago: 0,
      card: Number(ingress.creditCard) || 0,
      other: 0,
    },
    observations: 'Sesión importada del sistema anterior.',
  };
}

function mapPricing3d(config, exchangeRate = DEFAULT_EXCHANGE_RATE) {
  const pricePerKgArs = Number(config?.pricePerKg) || 20000;
  return {
    filamentPriceUsdKg: Number((pricePerKgArs / exchangeRate).toFixed(2)),
    kwhPriceArs: Number(config.priceKwh) || 140,
    printerWatts: Number(config.consumptionWatts) || 120,
    printerLifespanHours: Number(config.machineLifeHours) || 4320,
    estimatedSparesCostArs: Number(config.repairCost) || 150000,
    errorMarginPercent: Number(config.errorMargin) || 8,
    multiplierRetailNormal: Number(config.multiplierRetail) || 3,
    multiplierRetailKeychain: Number(config.multiplierKeychain) || 4,
    wholesaleDiscountPercentNormal: Number(config.wholesaleDiscountPercentGeneral) || 15,
    wholesaleDiscountPercentKeychain: Number(config.wholesaleDiscountPercentKeychain) || 10,
    wholesaleThresholdGramsNormal: Number(config.thresholdWholesaleGrams) || 1000,
    wholesaleThresholdGramsKeychain: Number(config.thresholdKeychainGrams) || 600,
  };
}

function mapPricingResale(config) {
  return {
    profitMarginPercent: Number(config.reventaDefaultMarkupOnCostPercent) || 30,
    enableWholesale: true,
    wholesaleDiscountPercent: Number(config.reventaDefaultWholesaleDiscountPercent) || 10,
    wholesaleMinimumOrderArs: Number(config.reventaDefaultWholesaleMinAmountPesos) || 200000,
  };
}

function mapBusiness(perfil) {
  const addr = perfil.address ?? {};
  const street = [addr.calle, addr.altura].filter(Boolean).join(' ');
  return {
    name: perfil.businessName ?? 'Dualgi 3D',
    ownerName: perfil.ownerName ?? '',
    phone: '',
    email: '',
    address: street,
    city: addr.ciudad ?? '',
    province: addr.provincia ?? '',
    cuit: '',
    socialMedia: perfil.tiendaSlug ? `@${perfil.tiendaSlug}` : '',
    description: 'Importado desde gestión de negocios',
    logoUrl: perfil.businessLogoUrl ?? '',
  };
}

async function commitBatches(db, label, items, collectionName) {
  if (!items.length) {
    console.log(`  ${label}: 0 documentos`);
    return;
  }
  console.log(`  ${label}: ${items.length} documentos`);
  if (DRY_RUN) return;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const item of chunk) {
      const { id, ...data } = item;
      batch.set(db.collection(collectionName).doc(id), data, { merge: true });
    }
    await batch.commit();
    console.log(`    ✓ ${Math.min(i + BATCH_SIZE, items.length)} / ${items.length}`);
  }
}

async function commitSettings(db, docs) {
  console.log(`  settings: ${docs.length} documentos`);
  if (DRY_RUN) return;
  const batch = db.batch();
  for (const { id, data } of docs) {
    batch.set(db.collection('settings').doc(id), data, { merge: true });
  }
  await batch.commit();
}

function recomputeClientBalances(clients, orders) {
  const owed = new Map();
  const purchased = new Map();

  for (const order of orders) {
    const cid = order.customerId;
    if (!cid) continue;
    purchased.set(cid, (purchased.get(cid) ?? 0) + order.totalAmount);
    if (order.pendingAmount > 0) {
      owed.set(cid, (owed.get(cid) ?? 0) + order.pendingAmount);
    }
  }

  return clients.map((c) => ({
    ...c,
    totalPurchased: purchased.get(c.id) ?? 0,
    totalOwed: owed.get(c.id) ?? 0,
  }));
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
    /* fallback a CLI */
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
  console.log(DRY_RUN ? '\n🔍 MODO DRY-RUN (sin escribir en Firestore)\n' : '\n🚀 IMPORTACIÓN A FIRESTORE\n');
  console.log(`Proyecto: ${PROJECT_ID}`);
  if (ONLY.length) console.log(`Solo: ${ONLY.join(', ')}\n`);

  let db;
  if (!DRY_RUN) {
    db = await initFirestore();
  }

  const summary = await readJson('_summary.json');
  console.log(`Export origen: ${summary.totalDocuments} documentos (${iso({ iso: summary.exportedAt })})\n`);

  const configCalc = (await readCollection('configuracion_calculadora'))[0] ?? {};
  const perfil = await readJson('_perfil.json');
  const metaCats = (await readCollection('meta')).find((m) => m.id === 'categorias_producto') ?? {
    customCategories: [],
    subcategoriesByParent: {},
  };

  if (!categoryIdByPath.has('Sin categoría')) {
    categoryIdByPath.set('Sin categoría', 'imp_cat_sin_categoria');
  }

  if (shouldRun('settings')) {
    console.log('⚙️  Settings');
    await commitSettings(db, [
      { id: 'pricing3d', data: mapPricing3d(configCalc) },
      { id: 'pricingResale', data: mapPricingResale(configCalc) },
      { id: 'business', data: mapBusiness(perfil) },
    ]);
  }

  if (shouldRun('categories')) {
    console.log('📁 Categorías');
    const categories = buildCategories(metaCats);
    categories.push({
      id: 'imp_cat_sin_categoria',
      name: 'Sin categoría',
      parentId: null,
      order: 999,
      createdAt: new Date().toISOString(),
    });
    await commitBatches(db, 'categories', categories, 'categories');
  } else {
    // Cargar paths mínimos para productos si solo importamos products
    buildCategories(metaCats);
    categoryIdByPath.set('Sin categoría', 'imp_cat_sin_categoria');
  }

  const insumos = await readCollection('insumos');
  const insumoMap = new Map(insumos.map((i) => [i.id, i]));
  const filamentos = insumos.filter((i) => i.type === 'filament');
  const supplies = insumos.filter((i) => i.type === 'insumo');

  if (shouldRun('inventory')) {
    console.log('📦 Inventario (filamentos + insumos)');
    const inventory = [
      ...filamentos.map((f) => mapFilament(f, configCalc)),
      ...supplies.map(mapSupply),
    ];
    await commitBatches(db, 'inventory', inventory, 'inventory');
  }

  if (shouldRun('products')) {
    console.log('🛍️  Productos');
    const productos = (await readCollection('productos')).map((p) => mapProduct(p, configCalc, insumoMap));
    const withMaterials = productos.filter((p) => p.type === '3d' && ((p.filamentLines?.length) || (p.supplyIds?.length)));
    const withCost = productos.filter((p) => (p.calculatedCost || 0) > 0);
    console.log(`    Con filamentos/insumos: ${withMaterials.length} | Con costo > 0: ${withCost.length}`);
    await commitBatches(db, 'products', productos, 'products');
  }

  let clients = [];
  if (shouldRun('clients')) {
    console.log('👥 Clientes');
    clients = (await readCollection('clientes')).map(mapClient);
  }

  let orders = [];
  if (shouldRun('orders')) {
    console.log('📋 Pedidos');
    const pedidos = (await readCollection('pedidos')).sort(
      (a, b) => new Date(iso(a.createdAt)).getTime() - new Date(iso(b.createdAt)).getTime()
    );
    orders = pedidos.map((p, idx) => mapOrder(p, idx + 1));
    await commitBatches(db, 'orders', orders, 'orders');
  }

  if (shouldRun('clients') && orders.length) {
    console.log('👥 Clientes (saldos recalculados)');
    if (!clients.length) clients = (await readCollection('clientes')).map(mapClient);
    clients = recomputeClientBalances(clients, orders);
    await commitBatches(db, 'clients', clients, 'clients');
  } else if (shouldRun('clients')) {
    await commitBatches(db, 'clients', clients, 'clients');
  }

  if (shouldRun('cash_sessions')) {
    console.log('💵 Sesiones de caja (histórico)');
    const sessions = (await readCollection('cash_sessions')).map(mapCashSession);
    await commitBatches(db, 'cash_sessions', sessions, 'cash_sessions');
  }

  if (shouldRun('inventory_movements')) {
    console.log('📒 Movimientos de inventario (histórico)');
    const legacyMovements = await readCollection('inventario_movimientos');
    const movements = expandLegacyMovements(legacyMovements);
    const byType = {};
    for (const m of movements) {
      byType[m.movementType] = (byType[m.movementType] ?? 0) + 1;
    }
    console.log(`    ${legacyMovements.length} eventos → ${movements.length} líneas (${JSON.stringify(byType)})`);
    await commitBatches(db, 'inventory_movements', movements, 'inventory_movements');
  }

  console.log('\n✅ Proceso finalizado.');
  if (DRY_RUN) {
    console.log('\nPara escribir en Firestore ejecutá:');
    console.log('  node scripts/import-gestion-data.mjs --execute\n');
    console.log('(Usa sesión de Firebase CLI si no tenés cuenta de servicio)\n');
  } else {
    console.log('\nRevisá la app en /admin → Auditoría de Movimientos.\n');
  }

  if (!shouldRun('inventory_movements')) {
    console.log('No importado en esta corrida:');
    console.log('  - inventory_movements (usar --only=inventory_movements)\n');
  }

  console.log('No importado a propósito:');
  console.log('  - integraciones/mercadopago (token sensible; configurar de nuevo en la app)');
  console.log('  - staff_members (vincular empleados manualmente en Firebase Auth)\n');
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message || err);
  if (String(err).includes('Could not load the default credentials')) {
    console.error('\nConfigurá credenciales de administrador:');
    console.error('  1. Firebase Console → Configuración → Cuentas de servicio → Generar clave JSON');
    console.error('  2. set GOOGLE_APPLICATION_CREDENTIALS=ruta\\al-archivo.json');
    console.error('  O: gcloud auth application-default login\n');
  }
  process.exit(1);
});
