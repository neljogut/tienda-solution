import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc, writeBatch, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Category } from '../types/category';
import { dedupeCategories, countProductsInSubtree } from '../utils/categories';

/**
 * Hook that encapsulates all category listeners and CRUD helpers.
 * Re‑used by the admin Categories page and the bulk‑assignment modal.
 */
export const useCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [productCounts, setProductCounts] = useState<Map<string, number>>(new Map());
  const [categorySortMode, setCategorySortMode] = useState<'manual' | 'alphabetical'>('manual');

  // Listen to categories collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'categories'), snapshot => {
      const cats: Category[] = [];
      snapshot.forEach(doc => cats.push({ id: doc.id, ...doc.data() } as Category));
      setCategories(cats);
    });
    return () => unsub();
  }, []);

  // Listen to settings for sort mode
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'business'), docSnap => {
      const data = docSnap.data();
      if (data?.categorySortMode) setCategorySortMode(data.categorySortMode);
    });
    return () => unsub();
  }, []);

  // Count products per category (used for badges)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), snap => {
      const counts = new Map<string, number>();
      snap.forEach(p => {
        const prod = p.data() as any;
        const catId = prod.categoryId;
        if (catId) {
          counts.set(catId, (counts.get(catId) ?? 0) + 1);
        }
      });
      setProductCounts(counts);
    });
    return () => unsub();
  }, []);

  // ----- derived data ----------------------------------------------------
  const { canonical: canonicalCategories, idRemap } = useMemo(() => dedupeCategories(categories), [categories]);

  const childrenMap = useMemo(() => {
    const map = new Map<string | null, Category[]>();
    canonicalCategories.forEach(cat => {
      const parent = cat.parentId ?? null;
      const arr = map.get(parent) ?? [];
      arr.push(cat);
      map.set(parent, arr.sort((a, b) => {
        if (categorySortMode === 'manual') return (a.order ?? 0) - (b.order ?? 0);
        return a.name.localeCompare(b.name);
      }));
    });
    return map;
  }, [canonicalCategories, categorySortMode]);

  const rootCategories = useMemo(() => childrenMap.get(null) ?? [], [childrenMap]);

  // ----- CRUD helpers ----------------------------------------------------
  const addCategory = async (name: string, parentId: string | null) => {
    const col = collection(db, 'categories');
    const newDocRef = doc(col); // generate ID
    const order = (childrenMap.get(parentId) ?? []).length;
    await setDoc(newDocRef, { name, parentId, order });
  };

  const updateCategory = async (id: string, data: Partial<Category>) => {
    await updateDoc(doc(db, 'categories', id), data);
  };

  const deleteCategory = async (id: string) => {
    const hasChildren = (childrenMap.get(id) ?? []).length > 0;
    const assigned = productCounts.get(id) ?? 0;
    if (hasChildren || assigned) {
      throw new Error('Cannot delete category with children or assigned products');
    }
    await deleteDoc(doc(db, 'categories', id));
  };

  const moveCategory = async (id: string, newParentId: string | null, newOrder: number) => {
    const batch = writeBatch(db);
    const catRef = doc(db, 'categories', id);
    batch.update(catRef, { parentId: newParentId, order: newOrder });
    // Adjust sibling orders in new parent
    const siblings = (childrenMap.get(newParentId) ?? []).filter(c => c.id !== id);
    siblings.forEach((s, idx) => {
      const sRef = doc(db, 'categories', s.id);
      batch.update(sRef, { order: idx >= newOrder ? idx + 1 : idx });
    });
    await batch.commit();
  };

  const setSortMode = async (mode: 'manual' | 'alphabetical') => {
    await setDoc(doc(db, 'settings', 'business'), { categorySortMode: mode }, { merge: true });
  };

  return {
    categories,
    canonicalCategories,
    idRemap,
    childrenMap,
    rootCategories,
    productCounts,
    categorySortMode,
    setSortMode,
    addCategory,
    updateCategory,
    deleteCategory,
    moveCategory,
  };
};
