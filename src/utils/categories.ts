import type { Category } from '../types/category';

function categoryKey(name: string, parentId: string | null): string {
  return `${parentId ?? 'root'}::${name.trim().toLowerCase()}`;
}

/** Agrupa categorías duplicadas (mismo nombre y mismo padre) y elige una canónica. */
export function dedupeCategories(categories: Category[]): {
  canonical: Category[];
  idRemap: Map<string, string>;
} {
  const groups = new Map<string, Category[]>();
  for (const cat of categories) {
    const key = categoryKey(cat.name, cat.parentId);
    const list = groups.get(key) ?? [];
    list.push(cat);
    groups.set(key, list);
  }

  const pickWinner = (group: Category[]) =>
    [...group].sort((a, b) => {
      const aImp = a.id.startsWith('imp_cat_') ? 0 : 1;
      const bImp = b.id.startsWith('imp_cat_') ? 0 : 1;
      if (aImp !== bImp) return aImp - bImp;
      return (a.order ?? 0) - (b.order ?? 0);
    })[0];

  const idRemap = new Map<string, string>();
  let canonical = categories.map((c) => ({ ...c }));

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const winner = pickWinner(group);
    for (const c of group) {
      idRemap.set(c.id, winner.id);
    }
  }

  if (idRemap.size > 0) {
    canonical = canonical.map((c) => ({
      ...c,
      id: idRemap.get(c.id) ?? c.id,
      parentId: c.parentId ? (idRemap.get(c.parentId) ?? c.parentId) : null,
    }));
  }

  // Colapsar de nuevo por si el remap de parentId generó duplicados
  const unique = new Map<string, Category>();
  for (const cat of canonical) {
    const key = categoryKey(cat.name, cat.parentId);
    if (!unique.has(key)) {
      unique.set(key, cat);
    } else {
      const existing = unique.get(key)!;
      idRemap.set(cat.id, existing.id);
    }
  }

  return { canonical: [...unique.values()], idRemap };
}

export function resolveCategoryId(
  categoryId: string | undefined,
  idRemap: Map<string, string>
): string | undefined {
  if (!categoryId) return undefined;
  return idRemap.get(categoryId) ?? categoryId;
}

/** IDs de una categoría y todas sus subcategorías (para filtros). */
export function getCategoryTreeIds(categories: Category[], rootId: string): Set<string> {
  const byParent = new Map<string | null, Category[]>();
  for (const cat of categories) {
    const list = byParent.get(cat.parentId) ?? [];
    list.push(cat);
    byParent.set(cat.parentId, list);
  }

  const result = new Set<string>();
  const walk = (id: string) => {
    result.add(id);
    for (const child of byParent.get(id) ?? []) {
      walk(child.id);
    }
  };
  walk(rootId);
  return result;
}

/** Productos en una categoría incluyendo subcategorías. */
export function countProductsInSubtree(
  categoryId: string,
  categories: Category[],
  directCounts: Map<string, number>,
  idRemap: Map<string, string>
): number {
  const treeIds = getCategoryTreeIds(categories, categoryId);
  let total = 0;
  for (const [rawId, count] of directCounts) {
    const resolved = resolveCategoryId(rawId, idRemap) ?? rawId;
    if (treeIds.has(resolved)) total += count;
  }
  return total;
}

export function flattenCategoriesForSelect(categories: Category[]): { id: string; label: string }[] {
  const { canonical } = dedupeCategories(categories);
  const byParent = new Map<string | null, Category[]>();
  for (const cat of canonical) {
    const list = byParent.get(cat.parentId) ?? [];
    list.push(cat);
    byParent.set(cat.parentId, list);
  }
  for (const [, list] of byParent) {
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  const result: { id: string; label: string }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const cat of byParent.get(parentId) ?? []) {
      const prefix = depth > 0 ? `${'  '.repeat(depth)}— ` : '';
      result.push({ id: cat.id, label: `${prefix}${cat.name}` });
      walk(cat.id, depth + 1);
    }
  };
  walk(null, 0);
  return result;
}
