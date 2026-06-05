import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import type { Filament, Supply, InventoryMovementType } from '../../types/inventory';
import { 
  Plus, Edit, Trash2, Droplet, Package, AlertTriangle, 
  Search, Image, X 
} from 'lucide-react';

export const Inventory: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'filaments' | 'supplies'>('filaments');
  const [filaments, setFilaments] = useState<Filament[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const { currentUser } = useAuth();

  useEffect(() => {
    setLoading(true);
    const unsubFilaments = onSnapshot(
      query(collection(db, 'inventory'), where('type', '==', 'filament')), 
      (snap) => {
        setFilaments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Filament)));
        setLoading(false);
      },
      (err) => console.error('Error fetching filaments:', err)
    );

    const unsubSupplies = onSnapshot(
      query(collection(db, 'inventory'), where('type', '==', 'supply')), 
      (snap) => {
        setSupplies(snap.docs.map(d => ({ id: d.id, ...d.data() } as Supply)));
      },
      (err) => console.error('Error fetching supplies:', err)
    );

    return () => {
      unsubFilaments();
      unsubSupplies();
    };
  }, []);

  const handleDelete = async (id: string, name: string, type: 'filament' | 'supply', currentQty: number) => {
    if (window.confirm(`¿Seguro que querés eliminar "${name}" del inventario?`)) {
      try {
        await deleteDoc(doc(db, 'inventory', id));
        
        // Log movement
        const userId = currentUser?.uid || 'system';
        const movement = {
          date: new Date().toISOString(),
          movementType: 'correction' as InventoryMovementType,
          itemId: id,
          itemType: type,
          previousQuantity: currentQty,
          modifiedQuantity: -currentQty,
          finalQuantity: 0,
          reason: `Eliminación de ítem: ${name}`,
          userId
        };
        await addDoc(collection(db, 'inventory_movements'), movement);
      } catch (err) {
        console.error('Error deleting inventory item:', err);
      }
    }
  };

  const openModal = (item?: any) => {
    setEditingItem(item || null);
    setIsModalOpen(true);
  };

  const filteredFilaments = filaments.filter(f => 
    f.color.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.material.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (f.provider && f.provider.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredSupplies = supplies.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.provider && s.provider.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Package size={26} className="text-blue-600" />
            Inventario de Insumos
          </h1>
          <p className="page-subtitle">
            Control de stock de filamentos e insumos generales de producción.
          </p>
        </div>
        <button 
          onClick={() => openModal()} 
          className="btn-primary flex items-center gap-2 w-full md:w-auto justify-center"
        >
          <Plus size={20} />
          Nuevo {activeTab === 'filaments' ? 'Filamento' : 'Insumo'}
        </button>
      </div>

      {/* Search and Tabs Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row justify-between gap-4 items-center">
        {/* Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto">
          <button 
            onClick={() => { setActiveTab('filaments'); setSearchTerm(''); }}
            className={`px-5 py-2 font-semibold text-xs rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'filaments' 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Droplet size={14} className={activeTab === 'filaments' ? 'text-blue-500' : ''} />
            Filamentos ({filaments.length})
          </button>
          <button 
            onClick={() => { setActiveTab('supplies'); setSearchTerm(''); }}
            className={`px-5 py-2 font-semibold text-xs rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'supplies' 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Package size={14} className={activeTab === 'supplies' ? 'text-blue-500' : ''} />
            Insumos Generales ({supplies.length})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
            <Search size={16} />
          </span>
          <input 
            type="text" 
            placeholder={`Buscar por color, marca, nombre...`}
            className="input pl-10 w-full text-xs"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="card p-16 text-center text-slate-400">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium">Cargando inventario...</p>
        </div>
      ) : activeTab === 'filaments' ? (
        /* Filaments list */
        <div className="card overflow-hidden border border-slate-200/80 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-4">Color / Material</th>
                  <th className="p-4">Marca / Prov.</th>
                  <th className="p-4 text-right">Peso Disp.</th>
                  <th className="p-4 text-right">Precio USD/Kg</th>
                  <th className="p-4">Fecha Compra</th>
                  <th className="p-4 text-center">Estado</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredFilaments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400">
                      No se encontraron filamentos registrados.
                    </td>
                  </tr>
                )}
                {filteredFilaments.map(f => {
                  const isLowStock = f.availableWeightGrams <= f.minStockGrams;
                  return (
                    <tr key={f.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {f.mainImage ? (
                            <img 
                              src={f.mainImage} 
                              alt={f.color} 
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200 shadow-sm flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-400 flex-shrink-0">
                              <Droplet size={18} style={{ color: f.hexColor || '#94a3b8' }} />
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                              {f.color}
                              <span 
                                className="w-3 h-3 rounded-full border border-slate-300 shadow-inner" 
                                style={{ backgroundColor: f.hexColor || '#ccc' }} 
                              />
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">{f.material}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="font-semibold text-slate-800">{f.brand}</p>
                        <p className="text-[10px] text-slate-400">{f.provider || 'Sin proveedor'}</p>
                      </td>
                      <td className="p-4 text-right">
                        <div className="inline-block text-right">
                          <p className={`font-extrabold text-sm ${isLowStock ? 'text-red-500' : 'text-slate-800'}`}>
                            {f.availableWeightGrams.toLocaleString('es-AR')} g
                          </p>
                          <p className="text-[9px] text-slate-400">Min: {f.minStockGrams}g</p>
                        </div>
                        {isLowStock && (
                          <span className="inline-block ml-1.5 text-red-500" title="Bajo Stock">
                            <AlertTriangle size={14} className="inline align-text-bottom" />
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right font-bold text-slate-800">
                        U$D {f.priceUsdKg.toLocaleString('es-AR', {minimumFractionDigits: 1})}
                      </td>
                      <td className="p-4 text-slate-500">
                        {f.purchaseDate ? new Date(f.purchaseDate).toLocaleDateString('es-AR') : '—'}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          f.isActive 
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                            : 'bg-slate-100 text-slate-400 border border-slate-200'
                        }`}>
                          {f.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button 
                            onClick={() => openModal(f)} 
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Editar"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(f.id, `${f.brand} ${f.color}`, 'filament', f.availableWeightGrams)} 
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Supplies list */
        <div className="card overflow-hidden border border-slate-200/80 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-4">Insumo</th>
                  <th className="p-4">Categoría / Marca</th>
                  <th className="p-4 text-right">Stock Actual</th>
                  <th className="p-4 text-right">Costo Unit.</th>
                  <th className="p-4">Observaciones</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredSupplies.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400">
                      No se encontraron insumos registrados.
                    </td>
                  </tr>
                )}
                {filteredSupplies.map(s => {
                  const isLowStock = s.currentStock <= s.minStock;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {s.mainImage ? (
                            <img 
                              src={s.mainImage} 
                              alt={s.name} 
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200 shadow-sm flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-400 flex-shrink-0">
                              <Package size={18} />
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{s.name}</p>
                            <p className="text-[10px] text-slate-400">ID: #{s.id.slice(0,6).toUpperCase()}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="font-semibold text-slate-800">{s.category}</p>
                        <p className="text-[10px] text-slate-400">{s.provider || 'Sin proveedor'}</p>
                      </td>
                      <td className="p-4 text-right">
                        <div className="inline-block text-right">
                          <p className={`font-extrabold text-sm ${isLowStock ? 'text-red-500' : 'text-slate-800'}`}>
                            {s.currentStock.toLocaleString('es-AR')} {s.unitOfMeasure || 'u'}
                          </p>
                          <p className="text-[9px] text-slate-400">Min: {s.minStock} {s.unitOfMeasure || 'u'}</p>
                        </div>
                        {isLowStock && (
                          <span className="inline-block ml-1.5 text-red-500" title="Bajo Stock">
                            <AlertTriangle size={14} className="inline align-text-bottom" />
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right font-bold text-slate-800">
                        ${s.unitCostArs.toLocaleString('es-AR', {minimumFractionDigits: 1})}
                      </td>
                      <td className="p-4 text-slate-400 italic max-w-xs truncate">
                        {s.observations || 'Sin observaciones'}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button 
                            onClick={() => openModal(s)} 
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Editar"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(s.id, s.name, 'supply', s.currentStock)} 
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <InventoryModal 
          type={activeTab} 
          item={editingItem} 
          onClose={() => setIsModalOpen(false)} 
          userId={currentUser?.uid || 'system'}
        />
      )}
    </div>
  );
};

// Modal Component
const InventoryModal = ({ 
  type, 
  item, 
  onClose,
  userId
}: { 
  type: 'filaments' | 'supplies'; 
  item: any; 
  onClose: () => void;
  userId: string;
}) => {
  const [formData, setFormData] = useState<any>(
    item || { 
      type: type === 'filaments' ? 'filament' : 'supply',
      isActive: true,
      hexColor: '#3b82f6',
      purchaseDate: new Date().toISOString().split('T')[0],
      initialWeightGrams: 1000,
      availableWeightGrams: 1000,
      priceUsdKg: 20,
      minStockGrams: 200,
      currentStock: 10,
      minStock: 2,
      unitCostArs: 100,
      unitOfMeasure: 'unidades'
    }
  );
  
  const [imagePreview, setImagePreview] = useState<string | null>(formData.mainImage || null);
  const [saving, setSaving] = useState(false);

  // Compress & convert file to Base64
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new window.Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 500;
        const MAX_HEIGHT = 500;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setImagePreview(dataUrl);
        setFormData((prev: any) => ({ ...prev, mainImage: dataUrl }));
      };
    };
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (item?.id) {
        // Compute delta and type of movement for update
        let delta = 0;
        let prevVal = 0;
        let finalVal = 0;
        
        if (type === 'filaments') {
          prevVal = item.availableWeightGrams || 0;
          finalVal = Number(formData.availableWeightGrams);
          delta = finalVal - prevVal;
        } else {
          prevVal = item.currentStock || 0;
          finalVal = Number(formData.currentStock);
          delta = finalVal - prevVal;
        }

        await updateDoc(doc(db, 'inventory', item.id), formData);
        
        if (Math.abs(delta) > 0.01) {
          // Log adjustment
          const movType = delta > 0 ? 'in' : 'adjustment';
          const reason = delta > 0 
            ? 'Ingreso / Incremento manual de stock' 
            : 'Corrección manual / Ajuste de stock';

          const movement = {
            date: new Date().toISOString(),
            movementType: movType as InventoryMovementType,
            itemId: item.id,
            itemType: type === 'filaments' ? 'filament' : 'supply',
            previousQuantity: prevVal,
            modifiedQuantity: delta,
            finalQuantity: finalVal,
            reason: `${reason}: ${type === 'filaments' ? formData.color : formData.name}`,
            userId
          };
          await addDoc(collection(db, 'inventory_movements'), movement);
        }
      } else {
        // Create new item
        const docRef = await addDoc(collection(db, 'inventory'), formData);
        
        // Log "in" movement
        const qty = type === 'filaments' ? Number(formData.availableWeightGrams) : Number(formData.currentStock);
        const movement = {
          date: new Date().toISOString(),
          movementType: 'in' as InventoryMovementType,
          itemId: docRef.id,
          itemType: type === 'filaments' ? 'filament' : 'supply',
          previousQuantity: 0,
          modifiedQuantity: qty,
          finalQuantity: qty,
          reason: `Alta de ítem en inventario: ${type === 'filaments' ? formData.color : formData.name}`,
          userId
        };
        await addDoc(collection(db, 'inventory_movements'), movement);
      }
      onClose();
    } catch (err) {
      console.error('Error saving inventory item:', err);
      alert('Error al guardar el ítem.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 border border-slate-100 max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="flex justify-between items-center border-b pb-3 mb-4">
          <h2 className="text-base font-extrabold text-slate-800">
            {item ? 'Editar' : 'Nuevo'} {type === 'filaments' ? 'Filamento' : 'Insumo'}
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* Image Upload Block */}
          <div className="flex items-center gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
            {imagePreview ? (
              <div className="relative">
                <img src={imagePreview} alt="Preview" className="w-16 h-16 rounded-xl object-cover border border-slate-200 shadow-sm" />
                <button 
                  type="button" 
                  onClick={() => { setImagePreview(null); setFormData((prev: any) => ({ ...prev, mainImage: null })); }}
                  className="absolute -top-1.5 -right-1.5 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                >
                  <X size={10} />
                </button>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-xl bg-slate-200/50 flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-300">
                <Image size={18} />
              </div>
            )}
            <div className="flex-1">
              <p className="font-bold text-slate-700">Foto del Ítem</p>
              <p className="text-[10px] text-slate-400">Formatos: JPG, PNG. Máx. 1MB. Se redimensiona automáticamente.</p>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleImageUpload}
                className="mt-2 text-[10px] text-slate-500 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
              />
            </div>
          </div>

          {type === 'filaments' ? (
            /* Filaments Form Fields */
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Material / Polímero</label>
                  <select 
                    className="input w-full mt-1" 
                    value={formData.material || 'PLA'} 
                    onChange={e => setFormData({...formData, material: e.target.value})}
                  >
                    <option value="PLA">PLA</option>
                    <option value="PETG">PETG</option>
                    <option value="ABS">ABS</option>
                    <option value="TPU">TPU</option>
                    <option value="Nylon">Nylon</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Color del Filamento</label>
                  <input 
                    required 
                    type="text"
                    placeholder="Ej: Rojo Semáforo"
                    className="input w-full mt-1" 
                    value={formData.color || ''} 
                    onChange={e => setFormData({...formData, color: e.target.value})} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Marca / Fabricante</label>
                  <input 
                    required 
                    type="text"
                    placeholder="Ej: Grilon3"
                    className="input w-full mt-1" 
                    value={formData.brand || ''} 
                    onChange={e => setFormData({...formData, brand: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Muestra HEX (Código Color)</label>
                  <div className="flex gap-2 items-center mt-1">
                    <input 
                      type="color" 
                      className="w-10 h-9 p-0.5 border rounded-lg cursor-pointer" 
                      value={formData.hexColor || '#3b82f6'} 
                      onChange={e => setFormData({...formData, hexColor: e.target.value})} 
                    />
                    <input 
                      type="text" 
                      className="input flex-1 text-center font-mono font-semibold"
                      value={formData.hexColor || '#3b82f6'}
                      onChange={e => setFormData({...formData, hexColor: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Precio USD/Kg (Costo)</label>
                  <div className="relative mt-1">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-semibold">U$D</span>
                    <input 
                      required 
                      type="number" 
                      step="0.01"
                      className="input w-full pl-10" 
                      value={formData.priceUsdKg || ''} 
                      onChange={e => setFormData({...formData, priceUsdKg: Number(e.target.value)})} 
                    />
                  </div>
                </div>
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Stock Mínimo Alerta (g)</label>
                  <input 
                    required 
                    type="number" 
                    className="input w-full mt-1" 
                    value={formData.minStockGrams || ''} 
                    onChange={e => setFormData({...formData, minStockGrams: Number(e.target.value)})} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Peso Inicial Bobina (g)</label>
                  <input 
                    required 
                    type="number" 
                    className="input w-full mt-1" 
                    value={formData.initialWeightGrams || ''} 
                    onChange={e => {
                      const val = Number(e.target.value);
                      setFormData({
                        ...formData, 
                        initialWeightGrams: val,
                        // If creating, set availableWeight too
                        availableWeightGrams: item ? formData.availableWeightGrams : val
                      });
                    }} 
                  />
                </div>
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Peso Disponible Actual (g)</label>
                  <input 
                    required 
                    type="number" 
                    className="input w-full mt-1 font-bold text-blue-600" 
                    value={formData.availableWeightGrams || ''} 
                    onChange={e => setFormData({...formData, availableWeightGrams: Number(e.target.value)})} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Proveedor</label>
                  <input 
                    type="text" 
                    placeholder="Nombre del distribuidor"
                    className="input w-full mt-1" 
                    value={formData.provider || ''} 
                    onChange={e => setFormData({...formData, provider: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Fecha Compra</label>
                  <input 
                    type="date" 
                    className="input w-full mt-1" 
                    value={formData.purchaseDate || ''} 
                    onChange={e => setFormData({...formData, purchaseDate: e.target.value})} 
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="isActiveCheck"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                  checked={formData.isActive !== false} 
                  onChange={e => setFormData({...formData, isActive: e.target.checked})} 
                />
                <label htmlFor="isActiveCheck" className="font-bold text-slate-600 cursor-pointer">Filamento Habilitado para Producción</label>
              </div>
            </>
          ) : (
            /* Supplies Form Fields */
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="input-label font-bold text-slate-500 uppercase">Nombre del Insumo / Repuesto</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="Ej: Imanes de Neodimio 8mm x 2mm"
                    className="input w-full mt-1" 
                    value={formData.name || ''} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Categoría</label>
                  <select 
                    className="input w-full mt-1" 
                    value={formData.category || 'Packaging'} 
                    onChange={e => setFormData({...formData, category: e.target.value})}
                  >
                    <option value="Packaging">Packaging / Bolsas</option>
                    <option value="Tornillos">Tornillos / Tuercas</option>
                    <option value="Pegamentos">Pegamentos / Lijas</option>
                    <option value="Accesorios">Accesorios / Imanes</option>
                    <option value="Repuestos">Repuestos de Impresora</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Unidad de Medida</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="Ej: unidades, metros, gr"
                    className="input w-full mt-1" 
                    value={formData.unitOfMeasure || ''} 
                    onChange={e => setFormData({...formData, unitOfMeasure: e.target.value})} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Stock Actual</label>
                  <input 
                    required 
                    type="number" 
                    className="input w-full mt-1 font-bold text-blue-600" 
                    value={formData.currentStock || ''} 
                    onChange={e => setFormData({...formData, currentStock: Number(e.target.value)})} 
                  />
                </div>
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Stock Mínimo</label>
                  <input 
                    required 
                    type="number" 
                    className="input w-full mt-1" 
                    value={formData.minStock || ''} 
                    onChange={e => setFormData({...formData, minStock: Number(e.target.value)})} 
                  />
                </div>
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Costo Unitario ARS</label>
                  <div className="relative mt-1">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-semibold">$</span>
                    <input 
                      required 
                      type="number" 
                      className="input w-full pl-6" 
                      value={formData.unitCostArs || ''} 
                      onChange={e => setFormData({...formData, unitCostArs: Number(e.target.value)})} 
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="input-label font-bold text-slate-500 uppercase">Proveedor / Distribuidor</label>
                  <input 
                    type="text" 
                    placeholder="Proveedor de este insumo"
                    className="input w-full mt-1" 
                    value={formData.provider || ''} 
                    onChange={e => setFormData({...formData, provider: e.target.value})} 
                  />
                </div>
              </div>

              <div>
                <label className="input-label font-bold text-slate-500 uppercase">Observaciones</label>
                <textarea 
                  placeholder="Detalles sobre uso, empaquetado o referencias"
                  className="input w-full mt-1 h-16" 
                  value={formData.observations || ''} 
                  onChange={e => setFormData({...formData, observations: e.target.value})} 
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 border-t pt-4 mt-6">
            <button 
              type="button" 
              onClick={onClose} 
              disabled={saving}
              className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={saving}
              className="btn-primary"
            >
              {saving ? 'Guardando...' : 'Guardar Ítem'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
