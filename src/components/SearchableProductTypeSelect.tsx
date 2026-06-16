import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Layers, ChevronDown, Check, PlusCircle, X, Trash2, Edit2, Save, Loader2 } from 'lucide-react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';

interface ProductTypeDoc {
  id: string;
  name: string;
  isSystem?: boolean;
  createdAt?: string;
}

interface SearchableProductTypeSelectProps {
  value: string; // holds the product type ID
  onChange: (value: string) => void;
  placeholder?: string;
  canManage?: boolean;
}

export const SearchableProductTypeSelect: React.FC<SearchableProductTypeSelectProps> = ({
  value,
  onChange,
  placeholder = 'Seleccionar tipo de producto...',
  canManage = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // Types list loaded from Firestore
  const [types, setTypes] = useState<ProductTypeDoc[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);

  // Modal State for creation/edit
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [modalEditId, setModalEditId] = useState<string | null>(null);
  const [modalValue, setModalValue] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // 1. Listen to product_types
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'product_types'), async (snapshot) => {
      if (snapshot.empty) {
        // Self-initialize defaults if empty
        const defaults = [
          { id: '3d', name: 'Impresión 3D', isSystem: true, createdAt: new Date().toISOString() },
          { id: 'resale', name: 'Productos Varios', isSystem: false, createdAt: new Date().toISOString() }
        ];
        for (const t of defaults) {
          await setDoc(doc(db, 'product_types', t.id), t);
        }
      } else {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProductTypeDoc));
        const sorted = list.sort((a, b) => {
          if (a.id === '3d') return -1;
          if (b.id === '3d') return 1;
          return a.name.localeCompare(b.name, 'es');
        });
        setTypes(sorted);
        setLoadingTypes(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const selectedType = types.find(t => t.id === value);
  const displayValue = selectedType ? selectedType.name : '';

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return types;
    return types.filter(t => t.name.toLowerCase().includes(term));
  }, [types, search]);

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
        const portalDropdown = document.getElementById('portal-product-type-dropdown');
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

  const handleTriggerAdd = () => {
    setModalMode('create');
    setModalEditId(null);
    setModalValue(search.trim());
    setModalError('');
    setIsOpen(false);
  };

  const handleTriggerEdit = (t: ProductTypeDoc) => {
    if (t.isSystem) return;
    setModalMode('edit');
    setModalEditId(t.id);
    setModalValue(t.name);
    setModalError('');
    setIsOpen(false);
  };

  const handleSaveTypeDb = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nameTrimmed = modalValue.trim();
    if (!nameTrimmed) return;

    setModalSaving(true);
    setModalError('');

    try {
      if (modalMode === 'create') {
        const slug = nameTrimmed.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

        if (!slug || slug === '3d') {
          setModalError('El nombre elegido genera un identificador no permitido.');
          setModalSaving(false);
          return;
        }

        // Check if ID already exists
        const exists = types.some(t => t.id === slug);
        if (exists) {
          setModalError('Ya existe un tipo de producto con un nombre similar.');
          setModalSaving(false);
          return;
        }

        const newType = {
          id: slug,
          name: nameTrimmed,
          isSystem: false,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'product_types', slug), newType);
        onChange(slug);
      } else if (modalMode === 'edit' && modalEditId) {
        await setDoc(doc(db, 'product_types', modalEditId), {
          name: nameTrimmed
        }, { merge: true });

        if (value === modalEditId) {
          onChange(modalEditId);
        }
      }
      setModalMode(null);
      setModalValue('');
      setModalEditId(null);
    } catch (err) {
      console.error('Error saving product type:', err);
      setModalError('Error al guardar el tipo de producto.');
    } finally {
      setModalSaving(false);
    }
  };

  const handleDeleteTypeDb = async (typeId: string, typeName: string) => {
    if (typeId === '3d') return;

    // Check if any product is currently using this type
    try {
      const q = query(collection(db, 'products'), where('type', '==', typeId));
      const snap = await getDocs(q);

      if (!snap.empty) {
        alert(`No se puede eliminar el tipo "${typeName}" porque está siendo usado por ${snap.size} producto(s). Primero cambiá el tipo de esos productos.`);
        return;
      }

      if (window.confirm(`¿Estás seguro de que querés eliminar el tipo de producto "${typeName}"?`)) {
        await deleteDoc(doc(db, 'product_types', typeId));
        if (value === typeId) {
          onChange('resale'); // fallback to resale or empty
        }
      }
    } catch (err) {
      console.error('Error deleting product type:', err);
      alert('Error al eliminar el tipo de producto.');
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          value={isOpen ? search : displayValue}
          onChange={e => setSearch(e.target.value)}
          onFocus={handleFocus}
          className="w-full border border-slate-300 rounded-lg pl-9 pr-12 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-ellipsis truncate transition-all duration-200"
        />
        <div className="absolute left-3 top-2.5 text-slate-400">
          <Layers size={16} />
        </div>
        <div className="absolute right-2.5 top-2 flex items-center gap-1.5">
          {value && value !== '3d' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setSearch('');
              }}
              className="p-0.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              title="Quitar tipo de producto"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={16} className="text-slate-400 pointer-events-none" />
        </div>
      </div>

      {isOpen && coords && createPortal(
        <div
          id="portal-product-type-dropdown"
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
            {loadingTypes ? (
              <div className="flex items-center justify-center py-6 text-slate-400 gap-1.5">
                <Loader2 size={14} className="animate-spin" />
                <span>Cargando tipos...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-slate-400 py-6 text-center flex flex-col items-center gap-1">
                <Layers size={20} className="opacity-40" />
                <span>No se encontraron tipos de producto</span>
              </div>
            ) : (
              filtered.map((t) => {
                const isSelected = t.id === value;
                return (
                  <div
                    key={t.id}
                    className={`w-full text-left px-3 py-2 transition-colors flex items-center justify-between gap-2 border-b border-slate-50 last:border-0 hover:bg-slate-50 ${
                      isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onChange(t.id);
                        setIsOpen(false);
                      }}
                      className="flex-1 text-left font-semibold text-slate-700 text-xs truncate mr-2"
                    >
                      {t.name}
                      {t.isSystem && (
                        <span className="text-[9px] bg-slate-100 text-slate-600 rounded px-1 ml-1.5 py-0.5">
                          Sistema
                        </span>
                      )}
                    </button>
                    <div className="flex items-center gap-1">
                      {canManage && !t.isSystem && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleTriggerEdit(t)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"
                            title="Editar nombre"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTypeDb(t.id, t.name)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                            title="Eliminar tipo"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                      {isSelected && <Check size={14} className="text-blue-600 flex-shrink-0" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {canManage && (
            <div className="border-t border-slate-100 p-1.5 bg-slate-50/80 backdrop-blur-[2px] flex-shrink-0">
              <button
                type="button"
                onClick={handleTriggerAdd}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-sm"
              >
                <PlusCircle size={13} />
                <span>{search.trim() ? `Crear tipo "${search.trim()}"` : 'Crear tipo de producto'}</span>
              </button>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Product Type Creation / Edit Modal */}
      {modalMode && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setModalMode(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm animate-fadeIn flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setModalMode(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-blue-50">
                <Layers size={20} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {modalMode === 'create' ? 'Crear Tipo de Producto' : 'Editar Tipo de Producto'}
                </h3>
                <p className="text-slate-400 text-[10px]">
                  {modalMode === 'create' ? 'Define una nueva clasificación de producto' : 'Modifica la clasificación existente'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveTypeDb} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del Tipo</label>
                <input
                  type="text"
                  required
                  value={modalValue}
                  onChange={e => setModalValue(e.target.value)}
                  placeholder="Ej: Sublimación"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {modalError && (
                <p className="text-[10px] text-red-600 font-semibold bg-red-50 p-2 rounded-lg border border-red-100">
                  {modalError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="btn-secondary text-xs !py-1.5 !px-3 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!modalValue.trim() || modalSaving}
                  className="btn-primary text-xs !py-1.5 !px-3 flex items-center gap-1.5 font-bold"
                >
                  {modalSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  {modalSaving ? 'Guardando…' : modalMode === 'create' ? 'Crear Tipo' : 'Guardar Cambios'}
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
