import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  query,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  setDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { Category } from '../../types/category';
import { dedupeCategories, countProductsInSubtree } from '../../utils/categories';
import {
  Tag,
  Plus,
  Edit,
  Trash2,
  ChevronDown,
  FolderOpen,
  Folder,
  ArrowUp,
  ArrowDown,
  X,
  Save,
  FolderPlus,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Build a map of parentId → sorted children, sorted manually or alphabetically */
function buildChildrenMap(categories: Category[], sortMode: 'manual' | 'alphabetical' = 'manual'): Map<string | null, Category[]> {
  const map = new Map<string | null, Category[]>();
  for (const cat of categories) {
    const key = cat.parentId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(cat);
  }
  
  for (const [, children] of map) {
    children.sort((a, b) => {
      if (sortMode === 'alphabetical') {
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      } else {
        return (a.order ?? 0) - (b.order ?? 0);
      }
    });
  }
  return map;
}

/** Recursively collect all descendant IDs of a category */


// ─── Tree Node Component ────────────────────────────────────────────────────────

interface TreeNodeProps {
  category: Category;
  depth: number;
  childrenMap: Map<string | null, Category[]>;
  allCategories: Category[];
  remappedProductCounts: Map<string, number>;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onEdit: (cat: Category) => void;
  onDelete: (cat: Category) => void;
  onMoveUp: (cat: Category) => void;
  onMoveDown: (cat: Category) => void;
  onAddSub: (cat: Category) => void;
  siblingCount: number;
  siblingIndex: number;
  categorySortMode: 'manual' | 'alphabetical';
}

const TreeNode: React.FC<TreeNodeProps> = ({
  category,
  depth,
  childrenMap,
  allCategories,
  remappedProductCounts,
  expandedIds,
  onToggleExpand,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddSub,
  siblingCount,
  siblingIndex,
  categorySortMode,
}) => {
  const children = childrenMap.get(category.id) ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(category.id);
  const productCount = countProductsInSubtree(
    category.id,
    allCategories,
    remappedProductCounts,
    new Map()
  );
  const isRoot = depth === 0;

  return (
    <div>
      {/* Category row */}
      <div
        className={`
          group flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl transition-all duration-200
          hover:bg-slate-50 border-b border-slate-50 last:border-0 cursor-default
          ${isRoot ? 'bg-slate-50/30 font-semibold text-slate-800' : 'text-slate-700'}
        `}
        style={{ paddingLeft: `${Math.max(12, depth * 24)}px` }}
      >
        <div className="flex-1 flex items-center gap-2 min-w-0 py-0.5">
          {/* Expand / collapse toggle */}
          <span
            onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggleExpand(category.id); }}
            className={`p-1 -ml-1 rounded transition-colors flex items-center justify-center flex-shrink-0 cursor-pointer ${
              hasChildren
                ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
                : 'text-transparent cursor-default'
            }`}
          >
            {hasChildren ? (
              <ChevronDown
                size={12}
                className={`transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
              />
            ) : (
              <span className="w-3" />
            )}
          </span>
   
          {/* Folder icon */}
          <span className="text-amber-500 flex-shrink-0">
            {hasChildren ? (
              isExpanded ? <FolderOpen size={16} className="text-amber-500" /> : <Folder size={16} className="text-amber-500" />
            ) : (
              <Folder size={16} className="opacity-50 text-slate-400" />
            )}
          </span>
   
          {/* Name */}
          <span className="text-xs sm:text-sm font-medium truncate text-slate-800 group-hover:text-slate-900">
            {category.name}
          </span>
   
          {/* Product count badge */}
          <span
            className={`badge ${
              productCount > 0 ? 'badge-blue' : 'badge-gray'
            } text-[9px] sm:text-[10px] tabular-nums ml-1 flex-shrink-0`}
          >
            {productCount} <span className="hidden sm:inline">{productCount === 1 ? 'producto' : 'productos'}</span><span className="inline sm:hidden">p.</span>
          </span>

          {/* Actions toolbar — positioned close to the badge, visible on hover / always on mobile */}
          <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-150 flex-shrink-0 ml-3 bg-slate-100/60 p-0.5 rounded-lg border border-slate-200/40">
            {categorySortMode === 'manual' && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onMoveUp(category); }}
                  disabled={siblingIndex === 0}
                  className="p-1 hover:bg-white text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition-colors flex items-center justify-center"
                  title="Subir categoría"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onMoveDown(category); }}
                  disabled={siblingIndex === siblingCount - 1}
                  className="p-1 hover:bg-white text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition-colors flex items-center justify-center"
                  title="Bajar categoría"
                >
                  <ArrowDown size={14} />
                </button>
              </>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onAddSub(category); }}
              className="p-1 hover:bg-blue-50 text-blue-500 hover:text-blue-700 rounded-md transition-colors flex items-center justify-center"
              title="Crear subcategoría"
            >
              <FolderPlus size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(category); }}
              className="p-1 hover:bg-amber-50 text-amber-500 hover:text-amber-700 rounded-md transition-colors flex items-center justify-center"
              title="Editar nombre"
            >
              <Edit size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(category); }}
              className="p-1 hover:bg-red-50 text-red-500 hover:text-red-700 rounded-md transition-colors flex items-center justify-center"
              title="Eliminar categoría"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
 
      {/* Children (recursive) */}
      {hasChildren && isExpanded && (
        <div className="relative">
          {/* Connector line */}
          <div
            className="absolute top-0 bottom-4 border-l border-slate-200/80"
            style={{ left: `calc((${depth} * var(--indent-step)) + 16px)` } as React.CSSProperties}
          />
          {children.map((child, idx) => (
            <TreeNode
              key={child.id}
              category={child}
              depth={depth + 1}
              childrenMap={childrenMap}
              allCategories={allCategories}
              remappedProductCounts={remappedProductCounts}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onEdit={onEdit}
              onDelete={onDelete}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onAddSub={onAddSub}
              siblingCount={children.length}
              siblingIndex={idx}
              categorySortMode={categorySortMode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main Page ──────────────────────────────────────────────────────────────────

export const Categories: React.FC = () => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySortMode, setCategorySortMode] = useState<'manual' | 'alphabetical'>('manual');
  const [productCounts, setProductCounts] = useState<Map<string, number>>(new Map());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formName, setFormName] = useState('');
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Firestore listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'categories'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cats: Category[] = [];
      snapshot.forEach((d) => {
        cats.push({ id: d.id, ...d.data() } as Category);
      });
      setCategories(cats);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen to Business settings for categorySortMode
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'business'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.categorySortMode) {
          setCategorySortMode(data.categorySortMode);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen to products to count per categoryId
  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const counts = new Map<string, number>();
      snapshot.forEach((d) => {
        const data = d.data();
        const catId = data.categoryId as string | undefined;
        if (catId) {
          counts.set(catId, (counts.get(catId) ?? 0) + 1);
        }
      });
      setProductCounts(counts);
    });
    return () => unsubscribe();
  }, []);

  // ── Derived data ───────────────────────────────────────────────────────────
  const { canonical: canonicalCategories, idRemap } = useMemo(
    () => dedupeCategories(categories),
    [categories]
  );

  const remappedProductCounts = useMemo(() => {
    const merged = new Map<string, number>();
    for (const [catId, count] of productCounts) {
      const canonicalId = idRemap.get(catId) ?? catId;
      merged.set(canonicalId, (merged.get(canonicalId) ?? 0) + count);
    }
    return merged;
  }, [productCounts, idRemap]);

  const childrenMap = useMemo(() => buildChildrenMap(canonicalCategories, categorySortMode), [canonicalCategories, categorySortMode]);
  const rootCategories = useMemo(() => childrenMap.get(null) ?? [], [childrenMap]);

  const handleUpdateSortMode = async (mode: 'manual' | 'alphabetical') => {
    setCategorySortMode(mode);
    try {
      await setDoc(doc(db, 'settings', 'business'), { categorySortMode: mode }, { merge: true });
    } catch (err) {
      console.error('Error actualizando modo de ordenamiento:', err);
    }
  };

  const parentCategory = useMemo(() => {
    if (!formParentId) return null;
    return categories.find((c) => c.id === formParentId) ?? null;
  }, [formParentId, categories]);

  // ── Expand / Collapse ──────────────────────────────────────────────────────
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedIds(new Set(categories.map((c) => c.id)));
  }, [categories]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  // ── Form handlers ──────────────────────────────────────────────────────────
  const openAddForm = (parentId: string | null = null) => {
    setEditingCategory(null);
    setFormName('');
    setFormParentId(parentId);
    setShowForm(true);
  };

  const openEditForm = (cat: Category) => {
    setEditingCategory(cat);
    setFormName(cat.name);
    setFormParentId(cat.parentId);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingCategory(null);
    setFormName('');
    setFormParentId(null);
  };

  const handleSave = async () => {
    const trimmed = formName.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      if (editingCategory) {
        // Update
        await updateDoc(doc(db, 'categories', editingCategory.id), {
          name: trimmed,
          parentId: formParentId,
        });
      } else {
        // Compute next order within this parent
        const siblings = childrenMap.get(formParentId) ?? [];
        const nextOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;

        await addDoc(collection(db, 'categories'), {
          name: trimmed,
          parentId: formParentId,
          order: nextOrder,
          createdAt: new Date().toISOString(),
        });
      }
      closeForm();
    } catch (err) {
      console.error('Error guardando categoría:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete handler ─────────────────────────────────────────────────────────
  const handleDelete = async (cat: Category) => {
    const children = childrenMap.get(cat.id) ?? [];
    if (children.length > 0) {
      alert('No se puede eliminar una categoría que tiene subcategorías. Eliminá primero las subcategorías.');
      return;
    }
    const count = productCounts.get(cat.id) ?? 0;
    if (count > 0) {
      alert(`No se puede eliminar esta categoría porque tiene ${count} producto(s) asignado(s).`);
      return;
    }
    if (!window.confirm(`¿Estás seguro de eliminar la categoría "${cat.name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'categories', cat.id));
    } catch (err) {
      console.error('Error eliminando categoría:', err);
    }
  };

  // ── Reorder handlers ──────────────────────────────────────────────────────
  const swapOrder = async (cat: Category, direction: 'up' | 'down') => {
    const siblings = childrenMap.get(cat.parentId ?? null) ?? [];
    const idx = siblings.findIndex((s) => s.id === cat.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;

    const other = siblings[swapIdx];
    const batch = writeBatch(db);
    batch.update(doc(db, 'categories', cat.id), { order: other.order });
    batch.update(doc(db, 'categories', other.id), { order: cat.order });
    try {
      await batch.commit();
    } catch (err) {
      console.error('Error reordenando:', err);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fadeIn [--indent-step:10px] sm:[--indent-step:24px]">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Tag size={24} className="text-blue-600" />
            Gestión de Categorías
          </h1>
          <p className="page-subtitle">
            Organizá tus productos en categorías y subcategorías sin límite de profundidad.
          </p>
        </div>
        <button onClick={() => openAddForm(null)} className="btn-primary flex items-center gap-2">
          <Plus size={20} />
          Nueva Categoría
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2">
          <button onClick={expandAll} className="btn-ghost text-xs">
            Expandir todo
          </button>
          <button onClick={collapseAll} className="btn-ghost text-xs">
            Colapsar todo
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ordenamiento:</span>
            <select
              value={categorySortMode}
              onChange={(e) => handleUpdateSortMode(e.target.value as 'manual' | 'alphabetical')}
              className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-slate-50 text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
            >
              <option value="manual">Manual (Subir / Bajar)</option>
              <option value="alphabetical">Alfabético (A - Z)</option>
            </select>
          </div>
          <span className="text-xs text-slate-400">
            {categories.length} {categories.length === 1 ? 'categoría' : 'categorías'} en total
          </span>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="card-glass p-6 w-full max-w-lg mx-4 space-y-5 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
              </h2>
              <button onClick={closeForm} className="btn-icon">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="input-label">Nombre</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ej: Llaveros, Figuras, Accesorios…"
                  className="input"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
              </div>

              {/* Parent category selector */}
              <div>
                <label className="input-label">
                  {editingCategory ? 'Mover a categoría padre' : 'Categoría padre'}
                </label>
                <select
                  value={formParentId ?? ''}
                  onChange={(e) => setFormParentId(e.target.value || null)}
                  className="input w-full"
                >
                  <option value="">— Sin padre (categoría raíz) —</option>
                  {canonicalCategories
                    .filter((c) => {
                      // Excluir la categoría que se está editando y todos sus descendientes
                      if (!editingCategory) return true;
                      if (c.id === editingCategory.id) return false;
                      // Verificar que no sea descendiente de la categoría editada
                      let current: Category | undefined = c;
                      while (current?.parentId) {
                        if (current.parentId === editingCategory.id) return false;
                        current = canonicalCategories.find(x => x.id === current!.parentId);
                      }
                      return true;
                    })
                    .map((c) => {
                      // Construir el path completo para mostrar en el select
                      const path: string[] = [];
                      let cur: Category | undefined = c;
                      while (cur) {
                        path.unshift(cur.name);
                        cur = canonicalCategories.find(x => x.id === cur!.parentId);
                      }
                      return (
                        <option key={c.id} value={c.id}>
                          {path.join(' › ')}
                        </option>
                      );
                    })
                  }
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={closeForm} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!formName.trim() || saving}
                className="btn-primary flex items-center gap-2"
              >
                <Save size={16} />
                {saving ? 'Guardando…' : editingCategory ? 'Guardar Cambios' : 'Crear Categoría'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tree */}
      <div className="card p-4">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse-soft">
            Cargando categorías…
          </div>
        ) : rootCategories.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <FolderOpen size={48} className="mx-auto text-slate-300" />
            <p className="text-slate-400 text-sm">
              No hay categorías creadas todavía.
            </p>
            <button
              onClick={() => openAddForm(null)}
              className="btn-primary inline-flex items-center gap-2 text-sm"
            >
              <Plus size={16} />
              Crear primera categoría
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100/60">
            {rootCategories.map((cat, idx) => (
              <TreeNode
                key={cat.id}
                category={cat}
                depth={0}
                childrenMap={childrenMap}
                allCategories={canonicalCategories}
                remappedProductCounts={remappedProductCounts}
                expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
                onEdit={openEditForm}
                onDelete={handleDelete}
                onMoveUp={(c) => swapOrder(c, 'up')}
                onMoveDown={(c) => swapOrder(c, 'down')}
                onAddSub={(c) => openAddForm(c.id)}
                siblingCount={rootCategories.length}
                siblingIndex={idx}
                categorySortMode={categorySortMode}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
