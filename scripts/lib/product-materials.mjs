export function mergeFilamentLinesBySupplyId(lines) {
  const byId = new Map();
  for (const line of lines) {
    if (!line?.supplyId) continue;
    const grams = Number(line.grams) || 0;
    if (grams <= 0) continue;
    byId.set(line.supplyId, (byId.get(line.supplyId) ?? 0) + grams);
  }
  return [...byId.entries()].map(([supplyId, grams]) => ({
    supplyId,
    grams: Math.round(grams * 100) / 100,
  }));
}

export function mergeSupplyLinesBySupplyId(lines) {
  const byId = new Map();
  for (const line of lines) {
    if (!line?.supplyId) continue;
    const quantity = Number(line.quantity) || 0;
    if (quantity <= 0) continue;
    byId.set(line.supplyId, (byId.get(line.supplyId) ?? 0) + quantity);
  }
  return [...byId.entries()].map(([supplyId, quantity]) => ({
    supplyId,
    quantity: Math.round(quantity * 1000) / 1000,
  }));
}

export function extractFilamentLines(raw) {
  const candidates = [
    ...(raw.filamentLines ?? []),
    ...(raw.filamentUsages ?? []),
    ...(raw.filaments ?? []),
  ];

  const lines = candidates
    .map((line) => ({
      supplyId: line.supplyId ?? line.filamentId ?? line.id ?? line.refId ?? '',
      grams: Number(line.grams ?? line.weightGrams ?? line.amount ?? line.amountPerUnit) || 0,
    }))
    .filter((line) => line.supplyId && line.grams > 0);

  return mergeFilamentLinesBySupplyId(lines);
}

export function extractInsumoLines(raw) {
  const candidates = [
    ...(raw.insumoLines ?? []),
    ...(raw.supplyLines ?? []),
    ...(raw.supplies ?? []),
    ...(raw.insumos ?? []),
  ];

  const lines = candidates
    .map((line) => ({
      supplyId: line.supplyId ?? line.insumoId ?? line.id ?? line.refId ?? '',
      quantity: Number(line.amount ?? line.quantity ?? line.amountPerUnit) || 0,
    }))
    .filter((line) => line.supplyId && line.quantity > 0);

  return mergeSupplyLinesBySupplyId(lines);
}

function iso(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value.iso) return value.iso;
  return '';
}

/** Última receta conocida por producto según supplyUsage en pedidos. */
export function buildPedidosMaterialMap(pedidos) {
  const byProduct = new Map();
  const sorted = [...pedidos].sort(
    (a, b) => new Date(iso(a.createdAt)).getTime() - new Date(iso(b.createdAt)).getTime()
  );

  for (const ped of sorted) {
    for (const item of ped.items ?? []) {
      if (!item.productId || !item.supplyUsage?.length) continue;

      const filamentAcc = [];
      const supplyAcc = [];

      for (const usage of item.supplyUsage) {
        if (!usage.supplyId) continue;
        const amount = Number(usage.amountPerUnit) || 0;
        if (amount <= 0) continue;

        if (usage.kind === 'filament') {
          filamentAcc.push({ supplyId: usage.supplyId, grams: amount });
        } else {
          supplyAcc.push({ supplyId: usage.supplyId, quantity: amount });
        }
      }

      if (!filamentAcc.length && !supplyAcc.length) continue;

      byProduct.set(item.productId, {
        date: iso(ped.createdAt),
        filamentLines: mergeFilamentLinesBySupplyId(filamentAcc),
        supplyIds: mergeSupplyLinesBySupplyId(supplyAcc),
      });
    }
  }

  return byProduct;
}

export async function loadMaterialOverrides(importDir) {
  try {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const raw = await readFile(join(importDir, 'product-materials-overrides.json'), 'utf8');
    const data = JSON.parse(raw);
    const map = new Map();
    for (const [id, entry] of Object.entries(data)) {
      if (id.startsWith('_')) continue;
      map.set(id, entry);
    }
    return map;
  } catch {
    return new Map();
  }
}

function scaleLinesToWeight(lines, targetGrams) {
  const current = lines.reduce((sum, line) => sum + line.grams, 0);
  if (!current || !targetGrams || Math.abs(current - targetGrams) < 0.5) {
    return mergeFilamentLinesBySupplyId(lines);
  }
  const factor = targetGrams / current;
  return mergeFilamentLinesBySupplyId(
    lines.map((line) => ({
      supplyId: line.supplyId,
      grams: Math.round(line.grams * factor * 100) / 100,
    }))
  );
}

export function resolveProductMaterials(raw, pedidosMap, overridesMap) {
  let filamentLines = extractFilamentLines(raw);
  let supplyIds = extractInsumoLines(raw);
  let recoveredFrom = null;

  const fromPedidos = pedidosMap?.get(raw.id);
  if (fromPedidos) {
    if (!filamentLines.length && fromPedidos.filamentLines.length) {
      filamentLines = fromPedidos.filamentLines;
      recoveredFrom = 'pedidos';
    }
    if (!supplyIds.length && fromPedidos.supplyIds.length) {
      supplyIds = fromPedidos.supplyIds;
      recoveredFrom = recoveredFrom ? 'pedidos' : 'pedidos';
    }
  }

  const override = overridesMap?.get(raw.id);
  if (override) {
    if (!filamentLines.length && override.filamentLines?.length) {
      filamentLines = scaleLinesToWeight(
        override.filamentLines,
        Number(raw.gramsFilament) || 0
      );
      recoveredFrom = 'override';
    }
    if (!supplyIds.length && override.supplyIds?.length) {
      supplyIds = mergeSupplyLinesBySupplyId(override.supplyIds);
      recoveredFrom = recoveredFrom ?? 'override';
    }
  }

  const weightFromLines = filamentLines.reduce((sum, line) => sum + line.grams, 0);
  const weightGrams =
    weightFromLines > 0
      ? Math.round(weightFromLines * 100) / 100
      : Number(raw.gramsFilament) || 0;

  return {
    filamentLines,
    supplyIds,
    filamentIds: filamentLines.map((line) => line.supplyId),
    weightGrams,
    recoveredFrom,
  };
}
