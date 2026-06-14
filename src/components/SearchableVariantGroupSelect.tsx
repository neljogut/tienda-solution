import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Layers, ChevronDown, Check, PlusCircle, X, Trash2, Edit2, Save, Loader2 } from 'lucide-react';
import type { VariantGroup } from '../types/variantGroup';
import type { PriceTier } from '../types/product';
import { NumericInput } from './NumericInput';
import { db } from '../firebase';
import { collection, addDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';

interface SearchableVariantGroupSelectProps {
  variantGroups: VariantGroup[];
  value: string; // holds the variantGroup.id
  onChange: (value: string) => void;
  placeholder?: string;
  canManage?: boolean;
}

export const SearchableVariantGroupSelect: React.FC<SearchableVariantGroupSelectProps> = ({
  variantGroups,
  value,
  onChange,
  placeholder = 'Seleccionar grupo de tramos...',
  canManage = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // Modal State for creation/edit
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [modalEditId, setModalEditId] = useState<string | null>(null);
  const [modalValue, setModalValue] = useState('');
  const [modalPriceTiers, setModalPriceTiers] = useState<PriceTier[]>([]);
  const [modalSaving, setModalSaving] = useState(false);

  const selectedGroup = variantGroups.find(g => g.id === value);
  const displayValue = selectedGroup ? selectedGroup.name : '';

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return variantGroups;
    return variantGroups.filter(g => g.name.toLowerCase().includes(term));
  }, [variantGroups, search]);

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
        const portalDropdown = document.getElementById('portal-variant-group-dropdown');
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
    setModalPriceTiers([]);
    setIsOpen(false);
  };

  const handleTriggerEdit = (group: VariantGroup) => {
    setModalMode('edit');
    setModalEditId(group.id);
    setModalValue(group.name);
    setModalPriceTiers(group.priceTiers ? group.priceTiers.map(t => ({ ...t })) : []);
    setIsOpen(false);
  };

  const handleSaveGroupDb = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!modalValue.trim()) return;

    setModalSaving(true);
    try {
      if (modalMode === 'create') {
        const newGroup = {
          name: modalValue.trim(),
          priceTiers: modalPriceTiers,
          createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'variantGroups'), newGroup);
        onChange(docRef.id);
      } else if (modalMode === 'edit' && modalEditId) {
        await setDoc(doc(db, 'variantGroups', modalEditId), {
          name: modalValue.trim(),
          priceTiers: modalPriceTiers,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        if (value === modalEditId) {
          onChange(modalEditId);
        }
      }
      setModalMode(null);
      setModalValue('');
      setModalPriceTiers([]);
      setModalEditId(null);
    } catch (err) {
      console.error('Error saving variant group:', err);
      alert('Error al guardar el grupo de tramos.');
    } finally {
      setModalSaving(false);
    }
  };

  const handleDeleteGroupDb = async (groupId: string, groupName: string) => {
    if (!window.confirm(`¿Estás seguro de que querés eliminar el grupo "${groupName}"?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'variantGroups', groupId));
      if (value === groupId) {
        onChange('');
      }
    } catch (err) {
      console.error('Error deleting variant group:', err);
      alert('Error al eliminar el grupo de tramos.');
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
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setSearch('');
              }}
              className="p-0.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              title="Quitar grupo de tramos"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={16} className="text-slate-400 pointer-events-none" />
        </div>
      </div>

      {isOpen && coords && createPortal(
        <div
          id="portal-variant-group-dropdown"
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
            {!search.trim() && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 transition-colors flex items-center justify-between border-b border-slate-50 text-slate-500 hover:bg-slate-50 ${
                  !value ? 'bg-blue-50 text-blue-700 font-semibold' : ''
                }`}
              >
                <span className="font-semibold text-xs text-slate-500">Ninguno (Sin grupo de tramos)</span>
                {!value && <Check size={14} className="text-blue-600 flex-shrink-0" />}
              </button>
            )}

            {filtered.length === 0 ? (
              !search.trim() ? null : (
                <div className="text-slate-400 py-6 text-center flex flex-col items-center gap-1">
                  <Layers size={20} className="opacity-40" />
                  <span>No se encontraron grupos de tramos</span>
                </div>
              )
            ) : (
              filtered.map((g) => {
                const isSelected = g.id === value;
                return (
                  <div
                    key={g.id}
                    className={`w-full text-left px-3 py-2 transition-colors flex items-center justify-between gap-2 border-b border-slate-50 last:border-0 hover:bg-slate-50 ${
                      isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onChange(g.id);
                        setIsOpen(false);
                      }}
                      className="flex-1 text-left font-semibold text-slate-700 text-xs truncate mr-2"
                    >
                      {g.name}
                      {g.priceTiers && g.priceTiers.length > 0 && (
                        <span className="text-[10px] text-emerald-600 font-normal ml-2">
                          ({g.priceTiers.length} tramos)
                        </span>
                      )}
                    </button>
                    <div className="flex items-center gap-1">
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleTriggerEdit(g)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"
                            title="Editar grupo y tramos"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGroupDb(g.id, g.name)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                            title="Eliminar grupo"
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
                <span>{search.trim() ? `Crear grupo "${search.trim()}"` : 'Crear grupo de tramos'}</span>
              </button>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Group Creation / Edit Modal */}
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
                  {modalMode === 'create' ? 'Crear Grupo de Tramos' : 'Editar Grupo de Tramos'}
                </h3>
                <p className="text-slate-400 text-[10px]">
                  {modalMode === 'create' ? 'Define un nuevo grupo con tramos de precios' : 'Modifica el grupo y sus tramos'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveGroupDb} className="space-y-4 overflow-y-auto flex-1 pr-1">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del Grupo</label>
                <input
                  type="text"
                  required
                  value={modalValue}
                  onChange={e => setModalValue(e.target.value)}
                  placeholder="Ej: FILAR PLA"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Price Tiers (Tramos de precio) */}
              <div className="border-t pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Tramos de Precios</span>
                  <button
                    type="button"
                    onClick={() => {
                      const lastTier = modalPriceTiers[modalPriceTiers.length - 1];
                      const nextMin = lastTier ? lastTier.maxQty + 1 : 2;
                      setModalPriceTiers([
                        ...modalPriceTiers,
                        { minQty: nextMin, maxQty: nextMin + 9, unitPrice: 0 }
                      ]);
                    }}
                    className="btn-secondary !py-1.5 !px-2.5 text-[10px] flex items-center gap-1 font-bold"
                  >
                    <PlusCircle size={12} /> Agregar Tramo
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(!modalPriceTiers || modalPriceTiers.length === 0) && (
                    <p className="text-[11px] text-slate-400 text-center py-2">
                      Sin tramos configurados. Los productos heredarán de la categoría.
                    </p>
                  )}

                  {modalPriceTiers.map((tier, index) => (
                    <div key={index} className="flex items-center gap-2 bg-slate-50/50 p-2 rounded-lg border border-slate-200">
                      <div className="flex-1 grid grid-cols-3 gap-1.5">
                        <div>
                          <label className="block text-[8px] uppercase font-bold text-slate-400 mb-0.5">Min</label>
                          <NumericInput
                            required
                            value={tier.minQty}
                            onChange={(val) => {
                              const newTiers = [...modalPriceTiers];
                              newTiers[index].minQty = val === '' ? 0 : val;
                              setModalPriceTiers(newTiers);
                            }}
                            className="w-full border border-slate-300 rounded-md p-1 text-xs text-center"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] uppercase font-bold text-slate-400 mb-0.5">Max</label>
                          <NumericInput
                            required
                            value={tier.maxQty}
                            onChange={(val) => {
                              const newTiers = [...modalPriceTiers];
                              newTiers[index].maxQty = val === '' ? 0 : val;
                              setModalPriceTiers(newTiers);
                            }}
                            className="w-full border border-slate-300 rounded-md p-1 text-xs text-center"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] uppercase font-bold text-slate-400 mb-0.5">Precio Unit ($)</label>
                          <NumericInput
                            required
                            value={tier.unitPrice}
                            onChange={(val) => {
                              const newTiers = [...modalPriceTiers];
                              newTiers[index].unitPrice = val === '' ? 0 : val;
                              setModalPriceTiers(newTiers);
                            }}
                            className="w-full border border-slate-300 rounded-md p-1 text-xs text-right font-semibold text-emerald-600"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const newTiers = modalPriceTiers.filter((_, i) => i !== index);
                          setModalPriceTiers(newTiers);
                        }}
                        className="text-red-500 hover:bg-red-50 p-1 rounded-lg self-end"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

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
                  {modalSaving ? 'Guardando…' : modalMode === 'create' ? 'Crear Grupo' : 'Guardar Cambios'}
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
