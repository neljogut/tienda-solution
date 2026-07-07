import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, deleteDoc, doc, updateDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Product } from '../../types/product';
import type { Category } from '../../types/category';
import type { VariantGroup } from '../../types/variantGroup';
import { dedupeCategories, resolveCategoryId, getSortedCategoryTree, getCategoryTreeIds, resolveCategoryPath } from '../../utils/categories';
import { useNavigate } from 'react-router-dom';
import { Edit, Trash2, Plus, Minus, Power, PowerOff, Search, Copy, Check, ChevronDown, ChevronRight, Loader2, Barcode } from 'lucide-react';
import { StockControl } from './StockControl';
import { useAuth } from '../../context/AuthContext';
import { useCategories } from '../../hooks/useCategories';
import CategoryTreeModal from '../../components/CategoryTreeModal';
import { SearchableCategorySelect } from '../../components/SearchableCategorySelect';
import { SearchableVariantGroupSelect } from '../../components/SearchableVariantGroupSelect';
import { calculateResaleRetailPrice, calculateResaleWholesalePrice, roundPriceUp100 } from '../../services/pricingService';



export const ProductList: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { rootCategories, childrenMap, canonicalCategories, setSortMode, categorySortMode } = useCategories();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [variantGroups, setVariantGroups] = useState<VariantGroup[]>([]);
  const [settingsResale, setSettingsResale] = useState<any>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedRootId, setSelectedRootId] = useState<string | 'sin_categoria' | null>(null);

  const toggleGroupCollapse = (categoryId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'general' | 'stock'>('general');
  const [editingStock, setEditingStock] = useState<{ productId: string; value: string } | null>(null);
  const [recentlySaved, setRecentlySaved] = useState<Record<string, boolean>>({});

  // Bulk Edit Form state
  const [bulkIsActive, setBulkIsActive] = useState<'keep' | 'active' | 'inactive'>('keep');
  const [bulkUseManualPrice, setBulkUseManualPrice] = useState<'keep' | 'manual' | 'calculated'>('keep');
  const [bulkPurchaseCostMode, setBulkPurchaseCostMode] = useState<'keep' | 'set' | 'percent' | 'add'>('keep');
  const [bulkPurchaseCostValue, setBulkPurchaseCostValue] = useState<string>('');
  const [bulkManualRetailPriceMode, setBulkManualRetailPriceMode] = useState<'keep' | 'set' | 'percent' | 'add'>('keep');
  const [bulkManualRetailPriceValue, setBulkManualRetailPriceValue] = useState<string>('');
  const [bulkStockMode, setBulkStockMode] = useState<'keep' | 'set' | 'add'>('keep');
  const [bulkStockValue, setBulkStockValue] = useState<string>('');
  const [bulkCategoryMode, setBulkCategoryMode] = useState<'keep' | 'clear' | 'set'>('keep');
  const [bulkCategoryIdValue, setBulkCategoryIdValue] = useState<string>('');
  const [bulkVariantGroupMode, setBulkVariantGroupMode] = useState<'keep' | 'clear' | 'set'>('keep');
  const [bulkVariantGroupValue, setBulkVariantGroupValue] = useState<string>('');

  const openBulkEdit = () => {
    setBulkIsActive('keep');
    setBulkUseManualPrice('keep');
    setBulkPurchaseCostMode('keep');
    setBulkPurchaseCostValue('');
    setBulkManualRetailPriceMode('keep');
    setBulkManualRetailPriceValue('');
    setBulkStockMode('keep');
    setBulkStockValue('');
    setBulkCategoryMode('keep');
    setBulkCategoryIdValue('');
    setBulkVariantGroupMode('keep');
    setBulkVariantGroupValue('');
    setShowBulkEditModal(true);
  };

  const assignCategoryToProducts = async (categoryId: string | null) => {
    if (selectedIds.size === 0) return;
    const batch = writeBatch(db);
    selectedIds.forEach((id) => {
      const pRef = doc(db, 'products', id);
      batch.update(pRef, { 
        categoryId: categoryId,
        category: categoryId ? resolveCategoryPath(categoryId, canonicalCategories) : 'Sin categoría'
      });
    });
    await batch.commit();
    clearSelection();
    setShowCategoryModal(false);
  };

  const handleBulkUpdate = async () => {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => {
        const p = products.find(prod => prod.id === id);
        if (!p) return;

        const pRef = doc(db, 'products', id);
        const updatedFields: any = {};

        // 1. Active status
        if (bulkIsActive !== 'keep') {
          updatedFields.isActive = bulkIsActive === 'active';
        }

        // 2. Price type (manual vs calculated)
        let nextUseManualPrice = p.useManualPrice;
        if (bulkUseManualPrice !== 'keep') {
          nextUseManualPrice = bulkUseManualPrice === 'manual';
          updatedFields.useManualPrice = nextUseManualPrice;
        }

        // 3. Purchase Cost
        let nextPurchaseCost = p.purchaseCost ?? 0;
        if (bulkPurchaseCostMode !== 'keep') {
          const val = parseFloat(bulkPurchaseCostValue) || 0;
          if (bulkPurchaseCostMode === 'set') {
            nextPurchaseCost = val;
          } else if (bulkPurchaseCostMode === 'percent') {
            nextPurchaseCost = nextPurchaseCost * (1 + val / 100);
          } else if (bulkPurchaseCostMode === 'add') {
            nextPurchaseCost = nextPurchaseCost + val;
          }
          nextPurchaseCost = Math.max(0, nextPurchaseCost);
          updatedFields.purchaseCost = nextPurchaseCost;
        }

        // 4. Manual Retail Price
        let nextManualRetailPrice = p.manualRetailPrice ?? 0;
        if (bulkManualRetailPriceMode !== 'keep') {
          const val = parseFloat(bulkManualRetailPriceValue) || 0;
          if (bulkManualRetailPriceMode === 'set') {
            nextManualRetailPrice = val;
          } else if (bulkManualRetailPriceMode === 'percent') {
            nextManualRetailPrice = nextManualRetailPrice * (1 + val / 100);
          } else if (bulkManualRetailPriceMode === 'add') {
            nextManualRetailPrice = nextManualRetailPrice + val;
          }
          nextManualRetailPrice = Math.max(0, nextManualRetailPrice);
          updatedFields.manualRetailPrice = nextManualRetailPrice;
        }

        // 5. Stock
        if (bulkStockMode !== 'keep') {
          const val = parseInt(bulkStockValue, 10) || 0;
          let nextStock = p.stock ?? 0;
          if (bulkStockMode === 'set') {
            nextStock = val;
          } else if (bulkStockMode === 'add') {
            nextStock = nextStock + val;
          }
          updatedFields.stock = Math.max(0, nextStock);
        }

        // 6. Category
        if (bulkCategoryMode !== 'keep') {
          if (bulkCategoryMode === 'clear') {
            updatedFields.categoryId = '';
            updatedFields.category = 'Sin categoría';
          } else {
            updatedFields.categoryId = bulkCategoryIdValue;
            updatedFields.category = bulkCategoryIdValue
              ? resolveCategoryPath(bulkCategoryIdValue, canonicalCategoriesDeduped)
              : 'Sin categoría';
          }
        }

        // 7. Variant Group
        if (bulkVariantGroupMode !== 'keep') {
          updatedFields.variantGroup = bulkVariantGroupMode === 'clear' ? '' : bulkVariantGroupValue;
        }

        // Recalculations
        const cost = nextPurchaseCost;
        updatedFields.calculatedCost = cost;

        const settings = settingsResale || { profitMarginPercent: 0, wholesaleDiscountPercent: 0, enableWholesale: true };
        const retail = nextUseManualPrice && nextManualRetailPrice
          ? nextManualRetailPrice
          : calculateResaleRetailPrice(nextPurchaseCost, settings);

        let wholesale = 0;
        if (nextUseManualPrice && nextManualRetailPrice) {
          wholesale = roundPriceUp100(nextManualRetailPrice * (1 - (settings.wholesaleDiscountPercent || 0) / 100));
        } else {
          wholesale = calculateResaleWholesalePrice(nextPurchaseCost, settings);
        }

        updatedFields.calculatedRetailPrice = retail;
        updatedFields.calculatedWholesalePrice = wholesale;

        batch.update(pRef, updatedFields);
      });

      await batch.commit();
      clearSelection();
      setShowBulkEditModal(false);
      alert('¡Listo! Se actualizaron los productos seleccionados en lote.');
    } catch (err: any) {
      console.error('Error in handleBulkUpdate:', err);
      alert('Hubo un error al actualizar los productos: ' + err.message);
    } finally {
      setBulkSaving(false);
    }
  };

  const handleUpdateStock = async (productId: string, newStock: number) => {
    try {
      await updateDoc(doc(db, 'products', productId), { stock: Math.max(0, newStock) });
      setRecentlySaved(prev => ({ ...prev, [productId]: true }));
      setTimeout(() => {
        setRecentlySaved(prev => {
          const next = { ...prev };
          delete next[productId];
          return next;
        });
      }, 1500);
    } catch (err) {
      console.error('Error updating stock:', err);
      alert('Error al actualizar el stock.');
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach((doc) => {
        prods.push({ id: doc.id, ...doc.data() } as Product);
      });
      setProducts(prods);
    });

    const unsubCategories = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const cats: Category[] = [];
      snapshot.forEach((d) => cats.push({ id: d.id, ...d.data() } as Category));
      setCategories(cats);
    });

    const unsubGroups = onSnapshot(collection(db, 'variantGroups'), (snapshot) => {
      const groups: VariantGroup[] = [];
      snapshot.forEach((d) => {
        groups.push({ id: d.id, ...d.data() } as VariantGroup);
      });
      setVariantGroups(groups);
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'pricingResale'), (snap) => {
      if (snap.exists()) {
        setSettingsResale(snap.data());
      }
    });

    return () => {
      unsubscribe();
      unsubCategories();
      unsubGroups();
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const fetchOrders = async () => {
      try {
        const snap = await getDocs(collection(db, 'orders'));
        const ords: any[] = [];
        snap.forEach((doc) => {
          ords.push({ id: doc.id, ...doc.data() });
        });
        setOrders(ords);
      } catch (err) {
        console.warn("No se pudieron cargar los pedidos para ranking de ventas:", err);
      }
    };
    fetchOrders();
  }, [currentUser]);

  const soldQuantities = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((order) => {
      if (order.orderStatus === 'cancelled') return;
      order.items?.forEach((item: any) => {
        const pId = item.productId;
        if (!pId) return;
        counts[pId] = (counts[pId] || 0) + (item.quantity || 0);
      });
    });
    return counts;
  }, [orders]);

  const { canonical: canonicalCategoriesDeduped, idRemap } = useMemo(
    () => dedupeCategories(categories),
    [categories]
  );

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(term));
  }, [products, searchTerm]);

  const llaverosCatIds = useMemo(() => {
    const ids = new Set<string>();
    const llaverosRoot = canonicalCategoriesDeduped.find(
      c => c.name.toLowerCase().trim() === 'llaveros'
    );
    if (llaverosRoot) {
      const treeIds = getCategoryTreeIds(canonicalCategoriesDeduped, llaverosRoot.id);
      treeIds.forEach(id => ids.add(id));
    }
    return ids;
  }, [canonicalCategoriesDeduped]);

  const categorySalesTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    products.forEach((p) => {
      const catId = resolveCategoryId(p.categoryId, idRemap) ?? 'sin_categoria';
      const resolvedCatId = resolveCategoryId(p.categoryId, idRemap) ?? '';
      const isLlavero = (p.type === '3d' && (p as any).isKeychain) ||
                        (resolvedCatId && llaverosCatIds.has(resolvedCatId));
      const qty = soldQuantities[p.id] || 0;
      const score = isLlavero ? (qty > 0 ? 1 : 0) : qty;
      totals[catId] = (totals[catId] || 0) + score;
    });
    return totals;
  }, [products, soldQuantities, idRemap, llaverosCatIds]);

  const sortedCategories = useMemo(() => {
    return getSortedCategoryTree(canonicalCategoriesDeduped, categorySalesTotals);
  }, [canonicalCategoriesDeduped, categorySalesTotals]);

  const allProductsByCategory = useMemo(() => {
    const groups = new Map<string, Product[]>();
    for (const product of filteredProducts) {
      const categoryId = resolveCategoryId(product.categoryId, idRemap) ?? 'sin_categoria';
      if (!groups.has(categoryId)) groups.set(categoryId, []);
      groups.get(categoryId)!.push(product);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => {
        const scoreA = soldQuantities[a.id] || 0;
        const scoreB = soldQuantities[b.id] || 0;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.name.localeCompare(b.name, 'es');
      });
    }
    return [...groups.entries()]
      .sort(([idA], [idB]) => {
        if (idA === 'sin_categoria') return 1;
        if (idB === 'sin_categoria') return -1;
        const indexA = sortedCategories.findIndex(c => c.id === idA);
        const indexB = sortedCategories.findIndex(c => c.id === idB);
        const idxA = indexA === -1 ? 9999 : indexA;
        const idxB = indexB === -1 ? 9999 : indexB;
        return idxA - idxB;
      })
      .map(([categoryId, items]) => {
        const sortedCat = sortedCategories.find(c => c.id === categoryId);
        let label = 'Sin categoría';
        if (categoryId !== 'sin_categoria' && sortedCat) {
          label = resolveCategoryPath(categoryId, canonicalCategoriesDeduped) || sortedCat.name;
        }
        return { categoryId, label, products: items };
      });
  }, [filteredProducts, canonicalCategoriesDeduped, idRemap, sortedCategories, soldQuantities]);

  // Raíces que tienen al menos 1 producto
  const rootsWithProducts = useMemo(() => {
    const allCatIds = new Set(allProductsByCategory.map(g => g.categoryId));
    return canonicalCategoriesDeduped.filter(c => {
      if (c.parentId) return false; // solo raíces
      const treeIds = getCategoryTreeIds(canonicalCategoriesDeduped, c.id);
      return [...allCatIds].some(id => treeIds.has(id));
    });
  }, [allProductsByCategory, canonicalCategoriesDeduped]);

  // Grupos filtrados por categoría raíz seleccionada
  const productsByCategory = useMemo(() => {
    if (!selectedRootId) return allProductsByCategory;
    if (selectedRootId === 'sin_categoria') {
      return allProductsByCategory.filter(g => g.categoryId === 'sin_categoria');
    }
    const treeIds = getCategoryTreeIds(canonicalCategoriesDeduped, selectedRootId);
    return allProductsByCategory.filter(g => treeIds.has(g.categoryId));
  }, [allProductsByCategory, selectedRootId, canonicalCategoriesDeduped]);

  const toggleActive = async (id: string, currentStatus: boolean) => {
    await updateDoc(doc(db, 'products', id), { isActive: !currentStatus });
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este producto?')) {
      await deleteDoc(doc(db, 'products', id));
    }
  };

  return (
    <div className="space-y-6">
      <CategoryTreeModal 
        isOpen={showCategoryModal} 
        onClose={() => setShowCategoryModal(false)} 
        onSelect={(id) => assignCategoryToProducts(id)}
        categories={canonicalCategories}
      />
      {showBulkEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-2xl mx-auto space-y-5 animate-scaleUp max-h-[90vh] overflow-y-auto flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-lg text-slate-800">✏️ Edición Masiva</h3>
                <p className="text-xs text-slate-500 font-semibold">{selectedIds.size} productos seleccionados</p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkEditModal(false)}
                className="text-slate-400 hover:text-slate-600 font-semibold"
              >
                ✕
              </button>
            </div>

            {/* Form Fields container */}
            <div className="space-y-4 flex-1 overflow-y-auto pr-1">
              
              {/* Activo / Inactivo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Estado Activo:</span>
                <select
                  value={bulkIsActive}
                  onChange={(e) => setBulkIsActive(e.target.value as any)}
                  className="input col-span-2 text-xs py-1.5"
                >
                  <option value="keep">— Mantener original —</option>
                  <option value="active">Activo (visible en catálogo)</option>
                  <option value="inactive">Inactivo (oculto)</option>
                </select>
              </div>

              {/* Tipo de precio */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Tipo de precio:</span>
                <select
                  value={bulkUseManualPrice}
                  onChange={(e) => setBulkUseManualPrice(e.target.value as any)}
                  className="input col-span-2 text-xs py-1.5"
                >
                  <option value="keep">— Mantener original —</option>
                  <option value="calculated">Calculado automáticamente (según costo y margen)</option>
                  <option value="manual">Precio manual fijo (sobrescribe cálculo)</option>
                </select>
              </div>

              {/* Costo de compra */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Costo de compra ($):</span>
                <select
                  value={bulkPurchaseCostMode}
                  onChange={(e) => setBulkPurchaseCostMode(e.target.value as any)}
                  className="input text-xs py-1.5"
                >
                  <option value="keep">— Mantener original —</option>
                  <option value="set">Establecer costo fijo</option>
                  <option value="percent">Modificar en porcentaje (+/- %)</option>
                  <option value="add">Modificar en monto (+/- $)</option>
                </select>
                {bulkPurchaseCostMode !== 'keep' ? (
                  <input
                    type="number"
                    step="any"
                    value={bulkPurchaseCostValue}
                    onChange={(e) => setBulkPurchaseCostValue(e.target.value)}
                    placeholder={bulkPurchaseCostMode === 'percent' ? 'Ej. 10 para aumentar 10%' : 'Ej. 5000'}
                    className="input text-xs py-1.5 w-full"
                  />
                ) : (
                  <div className="hidden sm:block" />
                )}
              </div>

              {/* Precio manual minorista */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Precio manual minorista ($):</span>
                <select
                  value={bulkManualRetailPriceMode}
                  onChange={(e) => setBulkManualRetailPriceMode(e.target.value as any)}
                  className="input text-xs py-1.5"
                >
                  <option value="keep">— Mantener original —</option>
                  <option value="set">Establecer precio fijo</option>
                  <option value="percent">Modificar en porcentaje (+/- %)</option>
                  <option value="add">Modificar en monto (+/- $)</option>
                </select>
                {bulkManualRetailPriceMode !== 'keep' ? (
                  <input
                    type="number"
                    step="any"
                    value={bulkManualRetailPriceValue}
                    onChange={(e) => setBulkManualRetailPriceValue(e.target.value)}
                    placeholder={bulkManualRetailPriceMode === 'percent' ? 'Ej. -5 para descontar 5%' : 'Ej. 15000'}
                    className="input text-xs py-1.5 w-full"
                  />
                ) : (
                  <div className="hidden sm:block" />
                )}
              </div>

              {/* Stock */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Stock disponible:</span>
                <select
                  value={bulkStockMode}
                  onChange={(e) => setBulkStockMode(e.target.value as any)}
                  className="input text-xs py-1.5"
                >
                  <option value="keep">— Mantener original —</option>
                  <option value="set">Establecer stock fijo</option>
                  <option value="add">Sumar / restar unidades (+/-)</option>
                </select>
                {bulkStockMode !== 'keep' ? (
                  <input
                    type="number"
                    value={bulkStockValue}
                    onChange={(e) => setBulkStockValue(e.target.value)}
                    placeholder="Ej. -2 para restar, 15 para fijar/sumar"
                    className="input text-xs py-1.5 w-full"
                  />
                ) : (
                  <div className="hidden sm:block" />
                )}
              </div>

              {/* Categoría */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Categoría:</span>
                <select
                  value={bulkCategoryMode}
                  onChange={(e) => setBulkCategoryMode(e.target.value as any)}
                  className="input text-xs py-1.5"
                >
                  <option value="keep">— Mantener original —</option>
                  <option value="clear">Quitar categoría (Sin categoría)</option>
                  <option value="set">Asignar categoría específica</option>
                </select>
                {bulkCategoryMode === 'set' ? (
                  <div className="col-span-1 sm:col-span-1">
                    <SearchableCategorySelect
                      categories={canonicalCategoriesDeduped}
                      categorySortMode={categorySortMode}
                      value={bulkCategoryIdValue}
                      onChange={(id) => setBulkCategoryIdValue(id)}
                    />
                  </div>
                ) : (
                  <div className="hidden sm:block" />
                )}
              </div>

              {/* Grupo de tramos */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center pb-3">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Grupo de Tramos:</span>
                <select
                  value={bulkVariantGroupMode}
                  onChange={(e) => setBulkVariantGroupMode(e.target.value as any)}
                  className="input text-xs py-1.5"
                >
                  <option value="keep">— Mantener original —</option>
                  <option value="clear">Quitar de grupo de tramos</option>
                  <option value="set">Asignar a grupo específico</option>
                </select>
                {bulkVariantGroupMode === 'set' ? (
                  <div className="col-span-1 sm:col-span-1">
                    <SearchableVariantGroupSelect
                      variantGroups={variantGroups}
                      value={bulkVariantGroupValue}
                      onChange={(val) => setBulkVariantGroupValue(val)}
                      canManage={false}
                    />
                  </div>
                ) : (
                  <div className="hidden sm:block" />
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowBulkEditModal(false)}
                className="btn-secondary !py-2 !px-4 text-xs font-bold"
                disabled={bulkSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleBulkUpdate}
                disabled={bulkSaving}
                className="btn-primary !bg-amber-600 hover:!bg-amber-700 !py-2 !px-4 text-xs font-bold flex items-center justify-center gap-2"
              >
                {bulkSaving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Aplicando cambios...</span>
                  </>
                ) : (
                  <span>Aplicar Cambios Masivos</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestión de Productos</h1>
          <p className="text-slate-500">Administra tu catálogo, precios y stock.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              viewMode === 'general' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setViewMode('general')}
          >
            Gestión General
          </button>
          <button
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'stock' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setViewMode('stock')}
          >
            <Barcode size={16} />
            Control de Stock
          </button>
        </div>
      </div>

      {/* Filtro por categoría raíz */}
      {rootsWithProducts.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedRootId(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              selectedRootId === null
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            Todas
          </button>
          {rootsWithProducts.map(root => (
            <button
              key={root.id}
              onClick={() => setSelectedRootId(root.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                selectedRootId === root.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {root.name}
            </button>
          ))}
          {allProductsByCategory.some(g => g.categoryId === 'sin_categoria') && (
            <button
              onClick={() => setSelectedRootId('sin_categoria')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                selectedRootId === 'sin_categoria'
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              Sin categoría
            </button>
          )}
        </div>
      )}

      {viewMode === 'stock' ? (
        <StockControl products={productsByCategory.flatMap(g => g.products)} />
      ) : (
        <>
          <div className="flex justify-end items-center gap-2">
          <button 
            onClick={openBulkEdit} 
            disabled={selectedIds.size === 0}
            className={`flex items-center gap-2 text-xs font-semibold py-2.5 px-4 rounded-xl transition-all duration-200 ${
              selectedIds.size > 0
                ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            ✏️ Edición Masiva
          </button>
          <button 
            onClick={() => assignCategoryToProducts(null)} 
            disabled={selectedIds.size === 0}
            className={`flex items-center gap-2 text-xs font-semibold py-2.5 px-4 rounded-xl transition-all duration-200 ${
              selectedIds.size > 0
                ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            Quitar categoría
          </button>
          <button 
            onClick={() => setShowCategoryModal(true)} 
            disabled={selectedIds.size === 0}
            className={`flex items-center gap-2 text-xs font-semibold py-2.5 px-4 rounded-xl transition-all duration-200 ${
              selectedIds.size > 0
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            Asignar categoría(s)
          </button>
          <button 
            onClick={() => navigate('/admin/products/new')} 
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={20} /> Nuevo Producto
          </button>
        </div>
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col gap-3">
        {/* Buscador */}
        <div className="relative w-full">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Buscar producto por nombre..."
            className="input pl-10 w-full text-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm">
                <th className="p-4 font-medium w-10"></th>
                <th className="p-4 font-medium">Producto</th>
                <th className="p-4 font-medium">Stock</th>
                <th className="p-4 font-medium">Precio</th>
                <th className="p-4 font-medium">Estado</th>
                <th className="p-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400">No hay productos creados.</td></tr>
              ) : productsByCategory.map((group) => {
                const isCollapsed = collapsedGroups.has(group.categoryId);
                return (
                <React.Fragment key={group.categoryId}>
                  <tr className="bg-slate-100/80">
                    <td className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600" colSpan={6}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleGroupCollapse(group.categoryId)}
                          className="text-slate-400 hover:text-slate-700 transition-colors"
                          title={isCollapsed ? 'Expandir' : 'Colapsar'}
                        >
                          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <input 
                          type="checkbox" 
                          checked={group.products.every(p => selectedIds.has(p.id)) && group.products.length > 0} 
                          onChange={(e) => { 
                            const checked = e.target.checked; 
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              group.products.forEach(p => {
                                if (checked) next.add(p.id);
                                else next.delete(p.id);
                              });
                              return next;
                            });
                          }} 
                        />
                        <span>{group.label}</span>
                        <span className="font-normal text-slate-400">({group.products.length})</span>
                      </div>
                    </td>
                  </tr>
                  {!isCollapsed && group.products.map((product) => {
                    const price = product.useManualPrice ? product.manualRetailPrice : product.calculatedRetailPrice;
                    return (
                      <tr key={product.id} className="hover:bg-slate-50/50">
                        <td className="p-4"><input type="checkbox" checked={selectedIds.has(product.id)} onChange={() => toggleSelect(product.id)} /></td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded bg-slate-100 border overflow-hidden">
                              {product.mainImage && <img src={product.mainImage} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                            </div>
                            <p className="font-semibold text-slate-800">{product.name}</p>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-1.5">
                            <div className={`inline-flex items-center bg-slate-50 border rounded-xl p-0.5 transition-all duration-300 ${
                              recentlySaved[product.id]
                                ? 'border-emerald-400 bg-emerald-50/50 shadow-sm shadow-emerald-100 ring-1 ring-emerald-400/25'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}>
                              <button
                                type="button"
                                onClick={() => {
                                  const current = product.stock ?? 0;
                                  handleUpdateStock(product.id, Math.max(0, current - 1));
                                }}
                                disabled={(product.stock ?? 0) <= 0}
                                className="w-6 h-6 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors disabled:opacity-30 disabled:hover:bg-transparent shrink-0"
                              >
                                <Minus size={12} />
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={editingStock?.productId === product.id ? editingStock.value : (product.stock ?? 0)}
                                onFocus={() => setEditingStock({ productId: product.id, value: String(product.stock ?? 0) })}
                                onChange={(e) => {
                                  let val = e.target.value.replace(/\D/g, ''); // only allow digits
                                  setEditingStock({ productId: product.id, value: val });
                                }}
                                onBlur={() => {
                                  if (editingStock && editingStock.productId === product.id) {
                                    const parsed = parseInt(editingStock.value, 10);
                                    handleUpdateStock(product.id, isNaN(parsed) ? 0 : parsed);
                                    setEditingStock(null);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                  }
                                }}
                                className={`w-10 text-center text-xs font-bold bg-transparent border-0 focus:outline-none focus:ring-0 p-0 transition-colors duration-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                  recentlySaved[product.id] ? 'text-emerald-600' : 'text-slate-700'
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const current = product.stock ?? 0;
                                  handleUpdateStock(product.id, current + 1);
                                }}
                                className="w-6 h-6 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors shrink-0"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                            <div className="w-5 h-5 flex items-center justify-center shrink-0">
                              {recentlySaved[product.id] && (
                                <Check size={14} className="text-emerald-500 stroke-[3] animate-bounce" />
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 font-medium text-slate-900">
                          ${price?.toLocaleString('es-AR') || 0}
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => toggleActive(product.id, product.isActive)}
                            className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-md transition-colors ${product.isActive ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-slate-500 bg-slate-100 hover:bg-slate-200'}`}
                          >
                            {product.isActive ? <Power size={14} /> : <PowerOff size={14} />}
                            {product.isActive ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => navigate(`/admin/products/new?duplicateId=${product.id}`)}
                              className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                              title="Duplicar"
                            >
                              <Copy size={18} />
                            </button>
                            <button
                              onClick={() => navigate(`/admin/products/${product.id}`)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Editar"
                            >
                              <Edit size={18} />
                            </button>
                            <button
                              onClick={() => handleDelete(product.id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
                );
              })}

            </tbody>
          </table>
        </div>

        {/* Mobile View: Cards */}
        <div className="block md:hidden divide-y divide-slate-100 text-xs">
          {products.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              No hay productos creados. Empieza creando uno nuevo.
            </div>
          ) : (
            <>
              {productsByCategory.map((group) => (
                <div key={group.categoryId} className="space-y-1 bg-slate-50/50">
                  {/* Encabezado de categoría con checkbox */}
                  <div className="bg-slate-100/80 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={group.products.every(p => selectedIds.has(p.id)) && group.products.length > 0}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          group.products.forEach(p => {
                            if (checked) next.add(p.id);
                            else next.delete(p.id);
                          });
                          return next;
                        });
                      }}
                    />
                    {group.label}
                    <span className="font-semibold text-slate-400 normal-case">
                      ({group.products.length})
                    </span>
                  </div>
                  {/* Cards de productos */}
                  <div className="divide-y divide-slate-100 bg-white">
                    {group.products.map((product) => {
                      const price = product.useManualPrice
                        ? product.manualRetailPrice
                        : product.calculatedRetailPrice;
                      return (
                        <div key={product.id} className="p-4 space-y-3">
                          {/* Fila 1: checkbox + imagen + nombre */}
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(product.id)}
                              onChange={() => toggleSelect(product.id)}
                              className="mt-1 shrink-0"
                            />
                            <div className="w-12 h-12 rounded bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0">
                              {product.mainImage ? (
                                <img
                                  src={product.mainImage}
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : null}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-slate-800 text-sm truncate">{product.name}</h4>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  Reventa
                                </span>
                                {product.useManualPrice && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                    Manual
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Fila 2: stock + precio */}
                          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100 text-center text-[10px]">
                            <div className="flex flex-col items-center justify-center">
                              <span className="text-slate-400 block font-bold uppercase tracking-wider mb-1">Stock</span>
                              <div className="flex items-center gap-1 justify-center">
                                <div className={`flex items-center bg-white border rounded-lg p-0.5 shadow-sm transition-all duration-300 ${
                                  recentlySaved[product.id]
                                    ? 'border-emerald-400 bg-emerald-50/50 ring-1 ring-emerald-400/25'
                                    : 'border-slate-200'
                                }`}>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStock(product.id, Math.max(0, (product.stock ?? 0) - 1))}
                                    disabled={(product.stock ?? 0) <= 0}
                                    className="w-5 h-5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors disabled:opacity-30 disabled:hover:bg-transparent shrink-0"
                                  >
                                    <Minus size={10} />
                                  </button>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={editingStock?.productId === product.id ? editingStock.value : (product.stock ?? 0)}
                                    onFocus={() => setEditingStock({ productId: product.id, value: String(product.stock ?? 0) })}
                                    onChange={(e) => setEditingStock({ productId: product.id, value: e.target.value.replace(/\D/g, '') })}
                                    onBlur={() => {
                                      if (editingStock && editingStock.productId === product.id) {
                                        const parsed = parseInt(editingStock.value, 10);
                                        handleUpdateStock(product.id, isNaN(parsed) ? 0 : parsed);
                                        setEditingStock(null);
                                      }
                                    }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                    className={`w-8 text-center text-[10px] font-bold bg-transparent border-0 focus:outline-none focus:ring-0 p-0 transition-colors duration-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                      recentlySaved[product.id] ? 'text-emerald-600' : 'text-slate-700'
                                    }`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStock(product.id, (product.stock ?? 0) + 1)}
                                    className="w-5 h-5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors shrink-0"
                                  >
                                    <Plus size={10} />
                                  </button>
                                </div>
                                <div className="w-4 h-4 flex items-center justify-center shrink-0">
                                  {recentlySaved[product.id] && (
                                    <Check size={10} className="text-emerald-500 stroke-[3] animate-bounce" />
                                  )}
                                </div>
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-bold uppercase tracking-wider">Precio (Min)</span>
                              <span className="font-extrabold text-slate-900 text-[11px]">
                                ${price?.toLocaleString('es-AR') || 0}
                              </span>
                            </div>
                          </div>

                          {/* Fila 3: estado + acciones */}
                          <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                            <button
                              onClick={() => toggleActive(product.id, product.isActive)}
                              className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                                product.isActive
                                  ? 'text-green-600 bg-green-50 border-green-100 hover:bg-green-100'
                                  : 'text-slate-500 bg-slate-100 border-slate-200 hover:bg-slate-200'
                              }`}
                            >
                              {product.isActive ? <Power size={12} /> : <PowerOff size={12} />}
                              {product.isActive ? 'Activo' : 'Inactivo'}
                            </button>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => navigate(`/admin/products/new?duplicateId=${product.id}`)}
                                className="p-1.5 text-slate-500 hover:text-purple-600 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors"
                                title="Duplicar"
                              >
                                <Copy size={14} />
                              </button>
                              <button
                                onClick={() => navigate(`/admin/products/${product.id}`)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors"
                                title="Editar"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(product.id)}
                                className="p-1.5 text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 border border-slate-100 transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
};
