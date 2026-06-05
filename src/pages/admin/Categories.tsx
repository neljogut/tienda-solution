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
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { Category } from '../../types/category';
import {
  Tag,
  Plus,
  Edit,
  Trash2,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  ArrowUp,
  ArrowDown,
  X,
  Save,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Build a map of parentId → sorted children */
function buildChildrenMap(categories: Category[]): Map<string | null, Category[]> {
  const map = new Map<string | null, Category[]>();
  for (const cat of categories) {
    const key = cat.parentId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(cat);
  }
  // sort each group by order
  for (const [, children] of map) {
    children.sort((a, b) => a.order - b.order);
  }
  return map;
}

/** Recursively collect all descendant IDs of a category */
function getDescendantIds(
  categoryId: string,
  childrenMap: Map<string | null, Category[]>,
): string[] {
  const ids: string[] = [];
  const children = childrenMap.get(categoryId) ?? [];
  for (const child of children) {
    ids.push(child.id);
    ids.push(...getDescendantIds(child.id, childrenMap));
  }
  return ids;
}

/** Flatten categories into a list of { id, label } with indented names for <select> */
function flattenForSelect(
  parentId: string | null,
  childrenMap: Map<string | null, Category[]>,
  depth: number,
): { id: string; label: string }[] {
  const result: { id: string; label: string }[] = [];
  const children = childrenMap.get(parentId) ?? [];
  for (const cat of children) {
    result.push({ id: cat.id, label: '─'.repeat(depth) + (depth > 0 ? ' ' : '') + cat.name });
    result.push(...flattenForSelect(cat.id, childrenMap, depth + 1));
  }
  return result;
}

// ─── Tree Node Component ────────────────────────────────────────────────────────

interface TreeNodeProps {
  category: Category;
  depth: number;
  childrenMap: Map<string | null, Category[]>;
  productCounts: Map<string, number>;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onEdit: (cat: Category) => void;
  onDelete: (cat: Category) => void;
  onMoveUp: (cat: Category) => void;
  onMoveDown: (cat: Category) => void;
  siblingCount: number;
  siblingIndex: number;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  category,
  depth,
  childrenMap,
  productCounts,
  expandedIds,
  onToggleExpand,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  siblingCount,
  siblingIndex,
}) => {
  const children = childrenMap.get(category.id) ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(category.id);
  const productCount = productCounts.get(category.id) ?? 0;
  const isRoot = depth === 0;

  return (
    <div>
      {/* Category row */}
      <div
        className={`
          group flex items-center gap-2 px-4 py-3 rounded-xl transition-all duration-200
          hover:bg-blue-50/60 cursor-default
          ${isRoot ? 'bg-slate-50/50' : ''}
        `}
        style={{ marginLeft: `${depth * 24}px` }}
      >
        {/* Expand / collapse toggle */}
        <button
          onClick={() => hasChildren && onToggleExpand(category.id)}
          className={`p-1 rounded-lg transition-colors duration-150 ${
            hasChildren
              ? 'text-slate-400 hover:text-blue-600 hover:bg-blue-100/60'
              : 'text-transparent cursor-default'
          }`}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )
          ) : (
            <ChevronRight size={16} />
          )}
        </button>

        {/* Folder icon */}
        {hasChildren && isExpanded ? (
          <FolderOpen size={18} className="text-blue-500 flex-shrink-0" />
        ) : hasChildren ? (
          <Folder size={18} className="text-blue-400 flex-shrink-0" />
        ) : (
          <Tag size={16} className="text-slate-400 flex-shrink-0" />
        )}

        {/* Name */}
        <span
          className={`flex-1 truncate ${
            isRoot ? 'font-bold text-slate-900 text-sm' : 'font-medium text-slate-700 text-sm'
          }`}
        >
          {category.name}
        </span>

        {/* Product count badge */}
        <span
          className={`badge ${
            productCount > 0 ? 'badge-blue' : 'badge-gray'
          } text-[11px] tabular-nums`}
        >
          {productCount} {productCount === 1 ? 'producto' : 'productos'}
        </span>

        {/* Actions — visible on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            onClick={() => onMoveUp(category)}
            disabled={siblingIndex === 0}
            className="btn-icon !p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Subir"
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => onMoveDown(category)}
            disabled={siblingIndex === siblingCount - 1}
            className="btn-icon !p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Bajar"
          >
            <ArrowDown size={14} />
          </button>
          <button
            onClick={() => onEdit(category)}
            className="btn-icon !p-1.5 hover:!text-blue-600 hover:!bg-blue-50"
            title="Editar"
          >
            <Edit size={14} />
          </button>
          <button
            onClick={() => onDelete(category)}
            className="btn-icon !p-1.5 hover:!text-red-600 hover:!bg-red-50"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Children (recursive) */}
      {hasChildren && isExpanded && (
        <div className="relative">
          {/* Connector line */}
          <div
            className="absolute top-0 bottom-4 border-l-2 border-slate-200/80"
            style={{ left: `${depth * 24 + 28}px` }}
          />
          {children.map((child, idx) => (
            <TreeNode
              key={child.id}
              category={child}
              depth={depth + 1}
              childrenMap={childrenMap}
              productCounts={productCounts}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onEdit={onEdit}
              onDelete={onDelete}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              siblingCount={children.length}
              siblingIndex={idx}
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
  const childrenMap = useMemo(() => buildChildrenMap(categories), [categories]);
  const rootCategories = useMemo(() => childrenMap.get(null) ?? [], [childrenMap]);

  const flatOptions = useMemo(
    () => flattenForSelect(null, childrenMap, 0),
    [childrenMap],
  );

  // Filter out self + descendants when editing so you can't parent a node under itself
  const availableParentOptions = useMemo(() => {
    if (!editingCategory) return flatOptions;
    const excluded = new Set([
      editingCategory.id,
      ...getDescendantIds(editingCategory.id, childrenMap),
    ]);
    return flatOptions.filter((o) => !excluded.has(o.id));
  }, [flatOptions, editingCategory, childrenMap]);

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
    <div className="space-y-6 animate-fadeIn">
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
      <div className="flex items-center gap-2">
        <button onClick={expandAll} className="btn-ghost text-xs">
          Expandir todo
        </button>
        <button onClick={collapseAll} className="btn-ghost text-xs">
          Colapsar todo
        </button>
        <span className="ml-auto text-xs text-slate-400">
          {categories.length} {categories.length === 1 ? 'categoría' : 'categorías'} en total
        </span>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="card-glass p-6 w-full max-w-md mx-4 space-y-5 animate-fadeIn">
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

              {/* Parent selector */}
              <div>
                <label className="input-label">Categoría padre</label>
                <select
                  value={formParentId ?? ''}
                  onChange={(e) => setFormParentId(e.target.value || null)}
                  className="input"
                >
                  <option value="">Ninguna (raíz)</option>
                  {availableParentOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
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
      <div className="card p-2">
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
                productCounts={productCounts}
                expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
                onEdit={openEditForm}
                onDelete={handleDelete}
                onMoveUp={(c) => swapOrder(c, 'up')}
                onMoveDown={(c) => swapOrder(c, 'down')}
                siblingCount={rootCategories.length}
                siblingIndex={idx}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
