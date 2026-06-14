import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Folder, FolderOpen, FolderPlus, Edit, Trash2, X, PlusCircle, Loader2 } from 'lucide-react';
import type { Category } from '../types/category';
import { db } from '../firebase';
import { collection, addDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

export interface CategoryNode {
  category: Category;
  children: CategoryNode[];
}

export function buildCategoryTree(cats: Category[], sortMode: 'manual' | 'alphabetical' = 'manual'): CategoryNode[] {
  const nodeMap = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  cats.forEach(c => {
    nodeMap.set(c.id, { category: c, children: [] });
  });

  cats.forEach(c => {
    const node = nodeMap.get(c.id)!;
    if (c.parentId) {
      const parent = nodeMap.get(c.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  const sortFn = (a: CategoryNode, b: CategoryNode) => {
    if (sortMode === 'alphabetical') {
      return a.category.name.localeCompare(b.category.name, undefined, { sensitivity: 'base' });
    } else {
      return (a.category.order ?? 0) - (b.category.order ?? 0);
    }
  };

  nodeMap.forEach(node => {
    node.children.sort(sortFn);
  });

  roots.sort(sortFn);

  return roots;
}

interface CategoryTreeNodeProps {
  node: CategoryNode;
  level: number;
  selectedValue: string;
  onSelect: (id: string) => void;
  expandedIds: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  onAddSub: (parent: Category) => void;
  onEdit: (cat: Category) => void;
  onDelete: (cat: Category) => void;
  canManage: boolean;
}

const CategoryTreeNode: React.FC<CategoryTreeNodeProps> = ({
  node,
  level,
  selectedValue,
  onSelect,
  expandedIds,
  onToggleExpand,
  onAddSub,
  onEdit,
  onDelete,
  canManage
}) => {
  const cat = node.category;
  const hasChildren = node.children.length > 0;
  const isExpanded = !!expandedIds[cat.id];
  const isSelected = cat.id === selectedValue;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(cat.id);
  };

  return (
    <div className="flex flex-col">
      <div 
        className={`group flex items-center justify-between py-2 px-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors ${
          isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700'
        }`}
        style={{ paddingLeft: `${Math.max(12, level * 16)}px` }}
      >
        <div 
          onClick={() => onSelect(cat.id)}
          className="flex-1 flex items-center gap-2 cursor-pointer min-w-0 py-0.5"
        >
          <span 
            onClick={handleToggle}
            className="p-1 -ml-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200/50 transition-colors flex items-center justify-center flex-shrink-0"
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

          <span className="text-slate-400 flex-shrink-0">
            {hasChildren ? (
              isExpanded ? <FolderOpen size={14} className="text-amber-500" /> : <Folder size={14} className="text-amber-500" />
            ) : (
              <Folder size={14} className="opacity-50 text-slate-400" />
            )}
          </span>

          <span className="text-xs truncate text-slate-800 font-medium group-hover:text-slate-900">
            {cat.name}
          </span>

          {isSelected && <Check size={12} className="text-blue-600 flex-shrink-0 ml-1" />}
        </div>

        {canManage && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 flex-shrink-0 ml-2 bg-slate-50 group-hover:bg-slate-50 transition-opacity">
            <button
              type="button"
              title="Agregar subcategoría"
              onClick={(e) => { e.stopPropagation(); onAddSub(cat); }}
              className="p-1 hover:bg-slate-200 text-slate-500 hover:text-blue-600 rounded transition-colors"
            >
              <FolderPlus size={12} />
            </button>
            <button
              type="button"
              title="Editar nombre"
              onClick={(e) => { e.stopPropagation(); onEdit(cat); }}
              className="p-1 hover:bg-slate-200 text-slate-500 hover:text-amber-600 rounded transition-colors"
            >
              <Edit size={12} />
            </button>
            <button
              type="button"
              title="Eliminar categoría"
              onClick={(e) => { e.stopPropagation(); onDelete(cat); }}
              className="p-1 hover:bg-slate-200 text-slate-500 hover:text-red-600 rounded transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="flex flex-col">
          {node.children.map(child => (
            <CategoryTreeNode
              key={child.category.id}
              node={child}
              level={level + 1}
              selectedValue={selectedValue}
              onSelect={onSelect}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onAddSub={onAddSub}
              onEdit={onEdit}
              onDelete={onDelete}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface SearchableCategorySelectProps {
  value: string;
  onChange: (value: string) => void;
  categories: Category[];
  placeholder?: string;
  required?: boolean;
  categorySortMode?: 'manual' | 'alphabetical';
  canManageOverride?: boolean;
}

export const SearchableCategorySelect: React.FC<SearchableCategorySelectProps> = ({
  value,
  onChange,
  categories,
  placeholder = 'Buscar categoría...',
  required = false,
  categorySortMode = 'manual',
  canManageOverride
}) => {
  const { userData } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // Category CRUD states
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [modalParentId, setModalParentId] = useState<string | null>(null);
  const [modalParentName, setModalParentName] = useState<string>('');
  const [modalEditId, setModalEditId] = useState<string | null>(null);
  const [modalValue, setModalValue] = useState<string>('');
  const [modalSaving, setModalSaving] = useState(false);

  const canManage = canManageOverride !== undefined ? canManageOverride : (userData?.role !== 'employee');

  const getCategoryPath = useCallback((catId: string): Category[] => {
    const path: Category[] = [];
    let current: Category | undefined = categories.find(c => c.id === catId);
    const visited = new Set<string>();
    while (current) {
      if (visited.has(current.id)) break;
      visited.add(current.id);
      path.unshift(current);
      const parentId: string | null = current.parentId;
      current = parentId ? categories.find(c => c.id === parentId) : undefined;
    }
    return path;
  }, [categories]);

  const displayValue = useMemo(() => {
    if (!value) return '';
    const path = getCategoryPath(value);
    return path.map((c: Category) => c.name).join(' › ');
  }, [value, getCategoryPath]);

  // Expand categories in path when selected value changes
  useEffect(() => {
    if (value && categories.length > 0) {
      setExpandedIds(prev => {
        const next = { ...prev };
        let current = categories.find(c => c.id === value);
        while (current && current.parentId) {
          const parentId = current.parentId;
          next[parentId] = true;
          current = categories.find(c => c.id === parentId);
        }
        return next;
      });
    }
  }, [value, categories]);

  const categoriesWithPaths = useMemo(() => {
    const mapped = categories.map(cat => {
      const path = getCategoryPath(cat.id);
      const fullPathLabel = path.map((c: Category) => c.name).join(' › ');
      return {
        ...cat,
        path,
        fullPathLabel
      };
    });
    mapped.sort((a, b) => a.fullPathLabel.localeCompare(b.fullPathLabel, undefined, { sensitivity: 'base' }));
    return mapped;
  }, [categories, getCategoryPath]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return categoriesWithPaths;
    return categoriesWithPaths.filter((c: Category & { path: Category[]; fullPathLabel: string }) => c.fullPathLabel.toLowerCase().includes(term));
  }, [categoriesWithPaths, search]);

  const tree = useMemo(() => buildCategoryTree(categories, categorySortMode), [categories, categorySortMode]);

  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      });
    }
  };

  const handleFocus = () => {
    setIsOpen(true);
    setSearch('');
    updateCoords();
  };

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);

    const clickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const portalDropdown = document.getElementById('portal-category-dropdown');
        if (portalDropdown && portalDropdown.contains(e.target as Node)) {
          return;
        }
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', clickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
      document.removeEventListener('mousedown', clickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleToggleExpand = (id: string) => {
    setExpandedIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleTriggerAddSub = (parent: Category) => {
    setModalMode('create');
    setModalParentId(parent.id);
    setModalParentName(parent.name);
    setModalValue('');
    setIsOpen(false);
  };

  const handleTriggerEdit = (cat: Category) => {
    setModalMode('edit');
    setModalEditId(cat.id);
    setModalValue(cat.name);
    setIsOpen(false);
  };

  const handleSaveCategoryDb = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!modalValue.trim()) return;

    setModalSaving(true);
    try {
      if (modalMode === 'create') {
        const newCat = {
          name: modalValue.trim(),
          parentId: modalParentId,
          order: categories.length,
          createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'categories'), newCat);
        onChange(docRef.id);
      } else if (modalMode === 'edit' && modalEditId) {
        await setDoc(doc(db, 'categories', modalEditId), {
          name: modalValue.trim()
        }, { merge: true });
        
        if (value === modalEditId) {
          onChange(modalEditId);
        }
      }
      setModalMode(null);
      setModalValue('');
      setModalEditId(null);
      setModalParentId(null);
    } catch (err) {
      console.error('Error saving category:', err);
      alert('Error al guardar la categoría.');
    } finally {
      setModalSaving(false);
    }
  };

  const handleDeleteCategoryDb = async (catId: string, catName: string) => {
    const hasChildren = categories.some(c => c.parentId === catId);
    if (hasChildren) {
      alert(`No se puede eliminar la categoría "${catName}" porque tiene subcategorías. Eliminá primero sus subcategorías.`);
      return;
    }

    if (!window.confirm(`¿Estás seguro de que querés eliminar la categoría "${catName}"?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'categories', catId));
      if (value === catId) {
        onChange('');
      }
    } catch (err) {
      console.error('Error deleting category:', err);
      alert('Error al eliminar la categoría.');
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          required={required && !value}
          value={isOpen ? search : displayValue}
          onChange={e => setSearch(e.target.value)}
          onFocus={handleFocus}
          className="w-full border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-ellipsis truncate transition-all duration-200 animate-fadeIn"
        />
        <div className="absolute left-3 top-2.5 text-slate-400">
          <Folder size={16} />
        </div>
        <div className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none">
          <ChevronDown size={16} />
        </div>
      </div>

      {isOpen && coords && createPortal(
        <div 
          id="portal-category-dropdown"
          className="fixed bg-white border border-slate-200/80 rounded-xl shadow-2xl z-[999] text-xs ring-1 ring-black/5 flex flex-col overflow-hidden"
          style={{
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            top: `${coords.top + coords.height + 4}px`,
            maxHeight: '280px'
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="overflow-y-auto flex-1 max-h-[230px] scrollbar-thin py-1">
            {search.trim() ? (
              filtered.length === 0 ? (
                <div className="text-slate-400 py-6 text-center flex flex-col items-center gap-1">
                  <Folder size={20} className="opacity-40" />
                  <span>No se encontraron categorías</span>
                </div>
              ) : (
                filtered.map((c) => {
                  const isSelected = c.id === value;
                  const parentPath = c.path.slice(0, -1);
                  const name = c.name;

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChange(c.id);
                        setIsOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 transition-colors flex items-center justify-between gap-2 border-b border-slate-50 last:border-0 ${
                        isSelected 
                          ? 'bg-blue-50 text-blue-700 font-semibold' 
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        {parentPath.length > 0 && (
                          <span className={`text-[9px] uppercase tracking-wider font-medium truncate ${isSelected ? 'text-blue-500/80' : 'text-slate-400'}`}>
                            {parentPath.map((p) => p.name).join(' › ')}
                          </span>
                        )}
                        <span className="font-semibold text-slate-700 text-xs truncate">{name}</span>
                      </div>
                      {isSelected && <Check size={14} className="text-blue-600 flex-shrink-0" />}
                    </button>
                  );
                })
              )
            ) : (
              tree.length === 0 ? (
                <div className="text-slate-400 py-6 text-center flex flex-col items-center gap-1">
                  <Folder size={20} className="opacity-40" />
                  <span>No hay categorías registradas</span>
                </div>
              ) : (
                tree.map(node => (
                  <CategoryTreeNode
                    key={node.category.id}
                    node={node}
                    level={0}
                    selectedValue={value}
                    onSelect={(id) => {
                      onChange(id);
                      setIsOpen(false);
                    }}
                    expandedIds={expandedIds}
                    onToggleExpand={handleToggleExpand}
                    onAddSub={handleTriggerAddSub}
                    onEdit={handleTriggerEdit}
                    onDelete={(cat) => handleDeleteCategoryDb(cat.id, cat.name)}
                    canManage={canManage}
                  />
                ))
              )
            )}
          </div>

          {canManage && (
            <div className="border-t border-slate-100 p-1.5 bg-slate-50/80 backdrop-blur-[2px] flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setModalMode('create');
                  setModalParentId(null);
                  setModalParentName('');
                  setModalValue(search.trim());
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-sm"
              >
                <PlusCircle size={13} />
                <span>{search.trim() ? `Crear categoría "${search.trim()}"` : 'Crear categoría principal'}</span>
              </button>
            </div>
          )}
        </div>,
        document.body
      )}

      {modalMode && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setModalMode(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm animate-fadeIn flex flex-col" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setModalMode(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-blue-50">
                <Folder size={20} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {modalMode === 'create' 
                    ? (modalParentId ? 'Crear Subcategoría' : 'Crear Categoría Principal')
                    : 'Editar Categoría'
                  }
                </h3>
                <p className="text-slate-400 text-[10px]">
                  {modalMode === 'create'
                    ? (modalParentId ? `Agregando subcategoría en: ${modalParentName}` : 'Agregando nueva categoría principal')
                    : 'Modificando nombre de la categoría'
                  }
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveCategoryDb} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nombre *</label>
                <input
                  type="text"
                  required
                  value={modalValue}
                  onChange={e => setModalValue(e.target.value)}
                  placeholder="Ej. Filamentos Especiales"
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="flex-1 py-2 text-xs font-bold border border-slate-200 hover:border-slate-300 text-slate-500 hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalSaving}
                  className="flex-1 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-600/10"
                >
                  {modalSaving ? (
                    <>
                      <Loader2 className="animate-spin" size={13} />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
