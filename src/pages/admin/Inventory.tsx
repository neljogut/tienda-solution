import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import type { Filament, Supply, InventoryMovementType } from '../../types/inventory';
import { getFilamentPriceUsdKg, hasCustomFilamentPrice } from '../../types/inventory';
import type { PricingSettings3D, BusinessSettings } from '../../types/settings';
import { default3D } from '../../constants/defaults';
import { recalculateAllProductsInFirestore } from '../../services/pricingService';
import { generateInventoryOrderPDF } from '../../services/pdfService';
import { 
  Plus, Edit, Trash2, Droplet, Package, AlertTriangle, 
  Search, Image, X, Settings, Loader2, ArrowUpDown, FileText, CheckSquare, Square,
  Copy
} from 'lucide-react';
import { NumericInput } from '../../components/NumericInput';
import { WeightKgGramsInput } from '../../components/WeightKgGramsInput';
import { formatWeightGrams } from '../../utils/weightGrams';

export const Inventory: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'filaments' | 'supplies'>('filaments');
  const [filaments, setFilaments] = useState<Filament[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros filamentos
  const [filamentFilterBrand, setFilamentFilterBrand] = useState('');
  const [filamentFilterMaterial, setFilamentFilterMaterial] = useState('');
  const [filamentSearchTerm, setFilamentSearchTerm] = useState('');

  // Buscador insumos
  const [supplySearchTerm, setSupplySearchTerm] = useState('');
  const [supplyFilterCategory, setSupplyFilterCategory] = useState('');

  // Stock mínimo inline y configuración masiva
  const [minStockDrafts, setMinStockDrafts] = useState<Record<string, number | ''>>({});
  const [savingMinId, setSavingMinId] = useState<string | null>(null);
  const [bulkMinStockGrams, setBulkMinStockGrams] = useState<number | ''>(200);
  const [applyingBulkMin, setApplyingBulkMin] = useState(false);
  const [resettingFilamentPrices, setResettingFilamentPrices] = useState(false);
  const [pricing3D, setPricing3D] = useState<PricingSettings3D>(default3D);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  // Sorting and Business Settings States
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [business, setBusiness] = useState<BusinessSettings>({
    name: 'Dualgi 3D',
    ownerName: 'Maxi',
    phone: '+54 9 11 1234-5678',
    email: 'contacto@dualgi3d.com',
    address: 'Calle Falsa 123',
    city: 'Buenos Aires',
    province: 'CABA',
    cuit: '20-12345678-9',
    socialMedia: '@dualgi3d',
    description: 'Materializando tus ideas en 3D'
  });
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  const { currentUser } = useAuth();

  const filamentBrands = useMemo(
    () => [...new Set(filaments.map(f => f.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [filaments]
  );
  const filamentMaterials = useMemo(
    () => [...new Set(filaments.map(f => f.material).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [filaments]
  );
  const supplyCategories = useMemo(
    () => [...new Set(supplies.map(s => s.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [supplies]
  );

  useEffect(() => {
    const unsubPricing = onSnapshot(doc(db, 'settings', 'pricing3d'), (snap) => {
      if (snap.exists()) {
        setPricing3D({ ...default3D, ...snap.data() } as PricingSettings3D);
      }
    });
    const unsubBusiness = onSnapshot(doc(db, 'settings', 'business'), (snap) => {
      if (snap.exists()) {
        setBusiness(snap.data() as BusinessSettings);
      }
    });
    return () => {
      unsubPricing();
      unsubBusiness();
    };
  }, []);

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
        if (type === 'filament') {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await recalculateAllProductsInFirestore();
        }
      } catch (err) {
        console.error('Error deleting inventory item:', err);
      }
    }
  };

  const openModal = (item?: any) => {
    setEditingItem(item || null);
    setIsModalOpen(true);
  };

  const handleDuplicate = (item: any) => {
    const cloned = { ...item };
    delete cloned.id;
    if (cloned.type === 'filament') {
      cloned.color = `${cloned.color} (Copia)`;
      cloned.availableWeightGrams = 0;
      cloned.initialWeightGrams = 0;
    } else {
      cloned.name = `${cloned.name} (Copia)`;
      cloned.currentStock = 0;
    }
    setEditingItem(cloned);
    setIsModalOpen(true);
  };

  const resetFilamentFilters = () => {
    setFilamentFilterBrand('');
    setFilamentFilterMaterial('');
    setFilamentSearchTerm('');
  };

  const resetSupplyFilters = () => {
    setSupplySearchTerm('');
    setSupplyFilterCategory('');
  };

  const getMinStockValue = (id: string, fallback: number) =>
    minStockDrafts[id] !== undefined ? minStockDrafts[id] : fallback;

  const saveFilamentMinStock = async (id: string) => {
    const filament = filaments.find(f => f.id === id);
    if (!filament) return;
    const raw = getMinStockValue(id, filament.minStockGrams ?? 0);
    const value = raw === '' ? 0 : Number(raw);
    if (value === (filament.minStockGrams ?? 0)) {
      setMinStockDrafts(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    setSavingMinId(id);
    try {
      await updateDoc(doc(db, 'inventory', id), { minStockGrams: value });
      setMinStockDrafts(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      console.error('Error saving filament min stock:', err);
      alert('No se pudo guardar el stock mínimo del filamento.');
    } finally {
      setSavingMinId(null);
    }
  };

  const saveSupplyMinStock = async (id: string) => {
    const supply = supplies.find(s => s.id === id);
    if (!supply) return;
    const raw = getMinStockValue(id, supply.minStock ?? 0);
    const value = raw === '' ? 0 : Number(raw);
    if (value === (supply.minStock ?? 0)) {
      setMinStockDrafts(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    setSavingMinId(id);
    try {
      await updateDoc(doc(db, 'inventory', id), { minStock: value });
      setMinStockDrafts(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      console.error('Error saving supply min stock:', err);
      alert('No se pudo guardar el stock mínimo del insumo.');
    } finally {
      setSavingMinId(null);
    }
  };

  const resetAllFilamentPricesToGlobal = async () => {
    const withCustom = filaments.filter(f => hasCustomFilamentPrice(f));
    if (withCustom.length === 0) {
      alert('Todos los filamentos ya usan el precio de Parámetros de precios.');
      return;
    }
    if (!window.confirm(
      `¿Quitar el precio fijo de ${withCustom.length} filamento(s) y usar el precio global (U$D ${pricing3D.filamentPriceUsdKg}/kg)?`
    )) return;

    setResettingFilamentPrices(true);
    try {
      await Promise.all(
        withCustom.map(f => updateDoc(doc(db, 'inventory', f.id), { priceUsdKg: 0 }))
      );
      await new Promise(resolve => setTimeout(resolve, 1500));
      await recalculateAllProductsInFirestore();
    } catch (err) {
      console.error('Error resetting filament prices:', err);
      alert('No se pudieron actualizar los precios.');
    } finally {
      setResettingFilamentPrices(false);
    }
  };

  const applyBulkFilamentMinStock = async () => {
    const value = bulkMinStockGrams === '' ? 0 : Number(bulkMinStockGrams);
    if (filaments.length === 0) return;
    if (!window.confirm(
      `¿Aplicar ${formatWeightGrams(value)} como stock mínimo de alerta a los ${filaments.length} filamentos?`
    )) return;

    setApplyingBulkMin(true);
    try {
      await Promise.all(
        filaments.map(f => updateDoc(doc(db, 'inventory', f.id), { minStockGrams: value }))
      );
      setMinStockDrafts({});
    } catch (err) {
      console.error('Error applying bulk min stock:', err);
      alert('No se pudo aplicar la configuración general.');
    } finally {
      setApplyingBulkMin(false);
    }
  };

  // Helper to convert HEX color to HSL Hue (0-360)
  const getHexHue = (hex: string) => {
    let r = parseInt(hex.substring(1, 3), 16) / 255;
    let g = parseInt(hex.substring(3, 5), 16) / 255;
    let b = parseInt(hex.substring(5, 7), 16) / 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0;
    if (max !== min) {
      let d = max - min;
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return h * 360;
  };

  const filteredFilaments = useMemo(() => {
    const list = filaments.filter(f => {
      if (filamentFilterBrand && f.brand !== filamentFilterBrand) return false;
      if (filamentFilterMaterial && f.material !== filamentFilterMaterial) return false;
      
      const term = filamentSearchTerm.trim().toLowerCase();
      if (term) {
        const matchesSearch =
          f.color.toLowerCase().includes(term) ||
          f.brand.toLowerCase().includes(term) ||
          f.material.toLowerCase().includes(term);
        if (!matchesSearch) return false;
      }
      return true;
    });

    // Logical Sort:
    // 1. Quantity (descending/ascending based on sortDirection)
    // 2. Brand
    // 3. Material
    // 4. Color hue (HSL)
    return list.sort((a, b) => {
      const qA = a.availableWeightGrams;
      const qB = b.availableWeightGrams;
      if (qA !== qB) {
        return sortDirection === 'desc' ? qB - qA : qA - qB;
      }
      const bComp = a.brand.localeCompare(b.brand, 'es');
      if (bComp !== 0) return bComp;

      const mComp = a.material.localeCompare(b.material, 'es');
      if (mComp !== 0) return mComp;

      const hueA = getHexHue(a.hexColor || '#ffffff');
      const hueB = getHexHue(b.hexColor || '#ffffff');
      return hueA - hueB;
    });
  }, [filaments, filamentFilterBrand, filamentFilterMaterial, filamentSearchTerm, sortDirection]);

  const filteredSupplies = useMemo(() => {
    const list = supplies.filter(s => {
      const term = supplySearchTerm.trim().toLowerCase();
      if (term) {
        const matchesSearch =
          s.name.toLowerCase().includes(term) ||
          s.category.toLowerCase().includes(term) ||
          (s.provider && s.provider.toLowerCase().includes(term));
        if (!matchesSearch) return false;
      }
      if (supplyFilterCategory && s.category !== supplyFilterCategory) return false;
      return true;
    });

    // Ordered by Quantity
    return list.sort((a, b) => {
      const qA = a.currentStock;
      const qB = b.currentStock;
      return sortDirection === 'desc' ? qB - qA : qA - qB;
    });
  }, [supplies, supplySearchTerm, supplyFilterCategory, sortDirection]);

  const hasActiveFilamentFilters = !!(filamentFilterBrand || filamentFilterMaterial || filamentSearchTerm.trim());
  const hasActiveSupplyFilters = !!(supplySearchTerm.trim() || supplyFilterCategory);

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
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <button 
            onClick={() => setIsOrderModalOpen(true)}
            className="text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-2 justify-center"
            title="Armar Pedido de Reposición"
          >
            <FileText size={18} className="text-slate-500" />
            Armar Pedido
          </button>
          <button 
            onClick={() => openModal()} 
            className="btn-primary flex items-center gap-2 justify-center"
          >
            <Plus size={20} />
            Nuevo {activeTab === 'filaments' ? 'Filamento' : 'Insumo'}
          </button>
        </div>
      </div>

      {/* Search and Tabs Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row justify-between gap-4 items-center">
        {/* Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto">
          <button 
            onClick={() => { setActiveTab('filaments'); resetSupplyFilters(); }}
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
            onClick={() => { setActiveTab('supplies'); resetFilamentFilters(); }}
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

        {activeTab === 'filaments' ? (
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:justify-end">
            <select
              className="input text-xs min-w-[130px]"
              value={filamentFilterBrand}
              onChange={e => setFilamentFilterBrand(e.target.value)}
            >
              <option value="">Todas las marcas</option>
              {filamentBrands.map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
            <select
              className="input text-xs min-w-[120px]"
              value={filamentFilterMaterial}
              onChange={e => setFilamentFilterMaterial(e.target.value)}
            >
              <option value="">Todos los tipos</option>
              {filamentMaterials.map(material => (
                <option key={material} value={material}>{material}</option>
              ))}
            </select>
            <div className="relative flex-1 min-w-[180px] md:w-56">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                placeholder="Buscar color, marca o tipo..."
                className="input pl-10 w-full text-xs"
                value={filamentSearchTerm}
                onChange={e => setFilamentSearchTerm(e.target.value)}
              />
            </div>
            {hasActiveFilamentFilters && (
              <button
                type="button"
                onClick={resetFilamentFilters}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-2"
              >
                Limpiar
              </button>
            )}
            <button
              type="button"
              onClick={() => setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-650 hover:bg-slate-50 flex items-center gap-1.5"
              title="Alternar Orden de Stock (Mayor a Menor / Menor a Mayor)"
            >
              <ArrowUpDown size={14} />
              Stock: {sortDirection === 'desc' ? 'Mayor a Menor' : 'Menor a Mayor'}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:justify-end">
            <div className="relative flex-1 min-w-[180px] md:w-56">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                placeholder="Buscar insumo, categoría..."
                className="input pl-10 w-full text-xs"
                value={supplySearchTerm}
                onChange={e => setSupplySearchTerm(e.target.value)}
              />
            </div>
            <select
              className="input text-xs min-w-[150px]"
              value={supplyFilterCategory}
              onChange={e => setSupplyFilterCategory(e.target.value)}
            >
              <option value="">Todas las categorías</option>
              {supplyCategories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            {hasActiveSupplyFilters && (
              <button
                type="button"
                onClick={resetSupplyFilters}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-2"
              >
                Limpiar
              </button>
            )}
            <button
              type="button"
              onClick={() => setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-650 hover:bg-slate-50 flex items-center gap-1.5"
              title="Alternar Orden de Stock (Mayor a Menor / Menor a Mayor)"
            >
              <ArrowUpDown size={14} />
              Stock: {sortDirection === 'desc' ? 'Mayor a Menor' : 'Menor a Mayor'}
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="card p-16 text-center text-slate-400">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium">Cargando inventario...</p>
        </div>
      ) : activeTab === 'filaments' ? (
        <>
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 bg-white rounded-xl border border-slate-200 text-blue-600 shrink-0">
              <Settings size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Alerta de stock bajo — configuración general</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Define el mínimo (kg + g) para todos los filamentos. También podés ajustar cada uno en la tabla.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2 sm:shrink-0">
            <WeightKgGramsInput
              label="Mínimo global"
              valueGrams={bulkMinStockGrams}
              onChangeGrams={setBulkMinStockGrams}
              className="text-sm"
            />
            <button
              type="button"
              onClick={applyBulkFilamentMinStock}
              disabled={applyingBulkMin || filaments.length === 0}
              className="btn-primary text-xs px-4 py-2.5 flex items-center gap-2"
            >
              {applyingBulkMin ? <Loader2 size={14} className="animate-spin" /> : null}
              Aplicar mínimos
            </button>
            <button
              type="button"
              onClick={resetAllFilamentPricesToGlobal}
              disabled={resettingFilamentPrices || filaments.length === 0}
              className="text-xs px-4 py-2.5 rounded-xl font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center gap-2"
            >
              {resettingFilamentPrices ? <Loader2 size={14} className="animate-spin" /> : null}
              Usar precio de parámetros
            </button>
          </div>
        </div>

        <div className="card overflow-hidden border border-slate-200/80 shadow-sm">
          {/* Desktop View: Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-4">Color / Material</th>
                  <th className="p-4">Marca / Prov.</th>
                  <th className="p-4 text-right">Peso Disp.</th>
                  <th className="p-4 text-right">Mín. Alerta</th>
                  <th className="p-4 text-right">Precio USD/Kg</th>
                  <th className="p-4">Fecha Compra</th>
                  <th className="p-4 text-center">Estado</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredFilaments.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-400">
                      {hasActiveFilamentFilters
                        ? 'No hay filamentos que coincidan con los filtros.'
                        : 'No se encontraron filamentos registrados.'}
                    </td>
                  </tr>
                )}
                {filteredFilaments.map(f => {
                  const minStock = f.minStockGrams ?? 0;
                  const isLowStock = f.availableWeightGrams <= minStock;
                  const draftMin = getMinStockValue(f.id, minStock);
                  const hasUnsavedMin = minStockDrafts[f.id] !== undefined && (draftMin === '' ? 0 : Number(draftMin)) !== minStock;
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
                            {formatWeightGrams(f.availableWeightGrams)}
                          </p>
                        </div>
                        {isLowStock && (
                          <span className="inline-block ml-1.5 text-red-500" title="Bajo Stock">
                            <AlertTriangle size={14} className="inline align-text-bottom" />
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className={`inline-flex items-center gap-1 justify-end ${hasUnsavedMin ? 'ring-2 ring-amber-300 rounded-lg p-0.5' : ''}`}>
                          <WeightKgGramsInput
                            compact
                            valueGrams={draftMin}
                            onChangeGrams={val => setMinStockDrafts(prev => ({ ...prev, [f.id]: val }))}
                            onBlur={() => saveFilamentMinStock(f.id)}
                            disabled={savingMinId === f.id}
                          />
                          {savingMinId === f.id && (
                            <Loader2 size={14} className="animate-spin text-slate-400" />
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <p className="font-bold text-slate-800">
                          U$D {getFilamentPriceUsdKg(f, pricing3D.filamentPriceUsdKg).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        {!hasCustomFilamentPrice(f) && (
                          <p className="text-[9px] text-blue-500 font-semibold">Parámetros</p>
                        )}
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
                            onClick={() => handleDuplicate(f)} 
                            className="p-1.5 text-slate-400 hover:text-purple-600 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Duplicar"
                          >
                            <Copy size={16} />
                          </button>
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

          {/* Mobile View: Cards */}
          <div className="block md:hidden divide-y divide-slate-100 text-xs">
            {filteredFilaments.length === 0 ? (
              <div className="p-8 text-center text-slate-400 animate-fadeIn">
                {hasActiveFilamentFilters
                  ? 'No hay filamentos que coincidan con los filtros.'
                  : 'No se encontraron filamentos registrados.'}
              </div>
            ) : (
              filteredFilaments.map(f => {
                const minStock = f.minStockGrams ?? 0;
                const isLowStock = f.availableWeightGrams <= minStock;
                const draftMin = getMinStockValue(f.id, minStock);
                const hasUnsavedMin = minStockDrafts[f.id] !== undefined && (draftMin === '' ? 0 : Number(draftMin)) !== minStock;
                return (
                  <div key={f.id} className="p-4 space-y-3 animate-fadeIn">
                    {/* Header: Color & Material & Brand */}
                    <div className="flex items-start justify-between gap-3">
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
                          <p className="font-bold text-slate-800 text-sm flex items-center gap-1.5 leading-tight">
                            {f.color}
                            <span 
                              className="w-2.5 h-2.5 rounded-full border border-slate-300 shadow-inner flex-shrink-0" 
                              style={{ backgroundColor: f.hexColor || '#ccc' }} 
                            />
                          </p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{f.material} • {f.brand}</p>
                        </div>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        f.isActive 
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                          : 'bg-slate-100 text-slate-400 border border-slate-200'
                      }`}>
                        {f.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>

                    {/* Stock & Cost info row */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Peso Disp.</span>
                        <span className={`font-extrabold text-xs flex items-center gap-1 ${isLowStock ? 'text-red-500' : 'text-slate-800'}`}>
                          {formatWeightGrams(f.availableWeightGrams)}
                          {isLowStock && <AlertTriangle size={12} className="text-red-500 shrink-0" />}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Precio USD/Kg</span>
                        <span className="font-bold text-slate-800">
                          U$D {getFilamentPriceUsdKg(f, pricing3D.filamentPriceUsdKg).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {!hasCustomFilamentPrice(f) && (
                          <span className="block text-[8px] text-blue-500 font-bold">Global Parámetros</span>
                        )}
                      </div>
                    </div>

                    {/* Editable Minimum Alert */}
                    <div className="flex items-center justify-between border-t border-slate-50 pt-2 text-xs">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Mín. Alerta:</span>
                      <div className={`inline-flex items-center gap-1 justify-end ${hasUnsavedMin ? 'ring-2 ring-amber-300 rounded-lg p-0.5' : ''}`}>
                        <WeightKgGramsInput
                          compact
                          valueGrams={draftMin}
                          onChangeGrams={val => setMinStockDrafts(prev => ({ ...prev, [f.id]: val }))}
                          onBlur={() => saveFilamentMinStock(f.id)}
                          disabled={savingMinId === f.id}
                        />
                        {savingMinId === f.id && (
                          <Loader2 size={12} className="animate-spin text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Actions and purchase date row */}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                      <span className="text-[10px] text-slate-400">
                        {f.provider ? `Proveedor: ${f.provider}` : 'Sin proveedor'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button 
                          onClick={() => handleDuplicate(f)} 
                          className="p-1.5 text-slate-505 hover:text-purple-600 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors"
                          title="Duplicar"
                        >
                          <Copy size={14} />
                        </button>
                        <button 
                          onClick={() => openModal(f)} 
                          className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors"
                          title="Editar"
                        >
                          <Edit size={14} />
                        </button>
                        <button 
                          onClick={() => handleDelete(f.id, `${f.brand} ${f.color}`, 'filament', f.availableWeightGrams)} 
                          className="p-1.5 text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 border border-slate-100 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        </>
      ) : (
        /* Supplies list */
        <div className="card overflow-hidden border border-slate-200/80 shadow-sm">
          {/* Desktop View: Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-4">Insumo</th>
                  <th className="p-4">Categoría / Marca</th>
                  <th className="p-4 text-right">Stock Actual</th>
                  <th className="p-4 text-right">Mín. Alerta</th>
                  <th className="p-4 text-right">Costo Unit.</th>
                  <th className="p-4">Observaciones</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredSupplies.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400">
                      {hasActiveSupplyFilters
                        ? 'No hay insumos que coincidan con la búsqueda.'
                        : 'No se encontraron insumos registrados.'}
                    </td>
                  </tr>
                )}
                {filteredSupplies.map(s => {
                  const minStock = s.minStock ?? 0;
                  const isLowStock = s.currentStock <= minStock;
                  const draftMin = getMinStockValue(s.id, minStock);
                  const hasUnsavedMin = minStockDrafts[s.id] !== undefined && (draftMin === '' ? 0 : Number(draftMin)) !== minStock;
                  const unit = s.unitOfMeasure || 'u';
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
                            {s.currentStock.toLocaleString('es-AR')} {unit}
                          </p>
                        </div>
                        {isLowStock && (
                          <span className="inline-block ml-1.5 text-red-500" title="Bajo Stock">
                            <AlertTriangle size={14} className="inline align-text-bottom" />
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="inline-flex flex-col items-end gap-0.5">
                          <div className="inline-flex items-center gap-1">
                            <NumericInput
                              className={`input w-20 text-right text-xs py-1.5 ${hasUnsavedMin ? 'ring-2 ring-amber-300' : ''}`}
                              value={draftMin}
                              onChange={val => setMinStockDrafts(prev => ({ ...prev, [s.id]: val }))}
                              onBlur={() => saveSupplyMinStock(s.id)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              disabled={savingMinId === s.id}
                            />
                            {savingMinId === s.id && (
                              <Loader2 size={14} className="animate-spin text-slate-400" />
                            )}
                          </div>
                          <span className="text-[9px] text-slate-400">{unit}</span>
                        </div>
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
                            onClick={() => handleDuplicate(s)} 
                            className="p-1.5 text-slate-400 hover:text-purple-600 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Duplicar"
                          >
                            <Copy size={16} />
                          </button>
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

          {/* Mobile View: Cards */}
          <div className="block md:hidden divide-y divide-slate-100 text-xs">
            {filteredSupplies.length === 0 ? (
              <div className="p-8 text-center text-slate-400 animate-fadeIn">
                {hasActiveSupplyFilters
                  ? 'No hay insumos que coincidan con la búsqueda.'
                  : 'No se encontraron insumos registrados.'}
              </div>
            ) : (
              filteredSupplies.map(s => {
                const minStock = s.minStock ?? 0;
                const isLowStock = s.currentStock <= minStock;
                const draftMin = getMinStockValue(s.id, minStock);
                const hasUnsavedMin = minStockDrafts[s.id] !== undefined && (draftMin === '' ? 0 : Number(draftMin)) !== minStock;
                const unit = s.unitOfMeasure || 'u';
                return (
                  <div key={s.id} className="p-4 space-y-3 animate-fadeIn">
                    {/* Header: Name & Category */}
                    <div className="flex items-start justify-between gap-3">
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
                          <p className="font-bold text-slate-800 text-sm leading-tight">{s.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{s.category} • {s.provider || 'Sin proveedor'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Stock & Cost info row */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Stock Actual</span>
                        <span className={`font-extrabold text-xs flex items-center gap-1 ${isLowStock ? 'text-red-500' : 'text-slate-800'}`}>
                          {s.currentStock.toLocaleString('es-AR')} {unit}
                          {isLowStock && <AlertTriangle size={12} className="text-red-500 shrink-0" />}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Costo Unitario</span>
                        <span className="font-bold text-slate-850">
                          ${s.unitCostArs.toLocaleString('es-AR', {minimumFractionDigits: 1})}
                        </span>
                      </div>
                    </div>

                    {/* Editable Minimum Alert */}
                    <div className="flex items-center justify-between border-t border-slate-50 pt-2 text-xs">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Mín. Alerta ({unit}):</span>
                      <div className="inline-flex items-center gap-1">
                        <NumericInput
                          className={`input w-20 text-right text-xs py-1.5 ${hasUnsavedMin ? 'ring-2 ring-amber-300' : ''}`}
                          value={draftMin}
                          onChange={val => setMinStockDrafts(prev => ({ ...prev, [s.id]: val }))}
                          onBlur={() => saveSupplyMinStock(s.id)}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          disabled={savingMinId === s.id}
                        />
                        {savingMinId === s.id && (
                          <Loader2 size={12} className="animate-spin text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Observations and actions row */}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-50 gap-2">
                      <span className="text-[10px] text-slate-400 italic truncate max-w-[150px]">
                        {s.observations || 'Sin observaciones'}
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button 
                          onClick={() => handleDuplicate(s)} 
                          className="p-1.5 text-slate-500 hover:text-purple-600 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors"
                          title="Duplicar"
                        >
                          <Copy size={14} />
                        </button>
                        <button 
                          onClick={() => openModal(s)} 
                          className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors"
                          title="Editar"
                        >
                          <Edit size={14} />
                        </button>
                        <button 
                          onClick={() => handleDelete(s.id, s.name, 'supply', s.currentStock)} 
                          className="p-1.5 text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 border border-slate-100 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {isModalOpen && (
        <InventoryModal 
          type={activeTab} 
          item={editingItem} 
          onClose={() => setIsModalOpen(false)} 
          userId={currentUser?.uid || 'system'}
          defaultFilamentPriceUsdKg={pricing3D.filamentPriceUsdKg}
        />
      )}

      {isOrderModalOpen && (
        <OrderModal
          activeTab={activeTab}
          filaments={filteredFilaments}
          supplies={filteredSupplies}
          business={business}
          onClose={() => setIsOrderModalOpen(false)}
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
  userId,
  defaultFilamentPriceUsdKg,
}: { 
  type: 'filaments' | 'supplies'; 
  item: any; 
  onClose: () => void;
  userId: string;
  defaultFilamentPriceUsdKg: number;
}) => {
  const [formData, setFormData] = useState<any>(
    item
      ? {
          ...item,
          minStockGrams: item.minStockGrams ?? 200,
          minStock: item.minStock ?? 2,
          priceUsdKg: hasCustomFilamentPrice(item) ? item.priceUsdKg : 0,
        }
      : { 
          type: type === 'filaments' ? 'filament' : 'supply',
          isActive: true,
          hexColor: '#3b82f6',
          purchaseDate: new Date().toISOString().split('T')[0],
          initialWeightGrams: 1000,
          availableWeightGrams: 1000,
          priceUsdKg: 0,
          minStockGrams: 200,
          currentStock: 10,
          minStock: 2,
          unitCostArs: 100,
          unitOfMeasure: 'unidades'
        }
  );
  const [useCustomFilamentPrice, setUseCustomFilamentPrice] = useState(
    item ? hasCustomFilamentPrice(item) : false
  );
  
  const [imagePreview, setImagePreview] = useState<string | null>(formData.mainImage || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

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
      // Sanitize fields before saving
      const dataToSave = { ...formData };
      if (type === 'filaments') {
        dataToSave.priceUsdKg = useCustomFilamentPrice
          ? (dataToSave.priceUsdKg === '' ? 0 : Number(dataToSave.priceUsdKg))
          : 0;
        dataToSave.minStockGrams = dataToSave.minStockGrams === '' ? 0 : Number(dataToSave.minStockGrams);
        dataToSave.availableWeightGrams = dataToSave.availableWeightGrams === '' ? 0 : Number(dataToSave.availableWeightGrams);
        if (!item?.id) {
          dataToSave.initialWeightGrams = dataToSave.availableWeightGrams;
        } else {
          dataToSave.initialWeightGrams = item.initialWeightGrams ?? dataToSave.availableWeightGrams;
        }
      } else {
        dataToSave.currentStock = dataToSave.currentStock === '' ? 0 : Number(dataToSave.currentStock);
        dataToSave.minStock = dataToSave.minStock === '' ? 0 : Number(dataToSave.minStock);
        dataToSave.unitCostArs = dataToSave.unitCostArs === '' ? 0 : Number(dataToSave.unitCostArs);
      }

      if (item?.id) {
        // Compute delta and type of movement for update
        let delta = 0;
        let prevVal = 0;
        let finalVal = 0;
        
        if (type === 'filaments') {
          prevVal = item.availableWeightGrams || 0;
          finalVal = Number(dataToSave.availableWeightGrams);
          delta = finalVal - prevVal;
        } else {
          prevVal = item.currentStock || 0;
          finalVal = Number(dataToSave.currentStock);
          delta = finalVal - prevVal;
        }

        await updateDoc(doc(db, 'inventory', item.id), dataToSave);
        
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
            reason: `${reason}: ${type === 'filaments' ? dataToSave.color : dataToSave.name}`,
            userId
          };
          await addDoc(collection(db, 'inventory_movements'), movement);
        }
      } else {
        // Create new item
        const docRef = await addDoc(collection(db, 'inventory'), dataToSave);
        
        // Log "in" movement
        const qty = type === 'filaments' ? Number(dataToSave.availableWeightGrams) : Number(dataToSave.currentStock);
        const movement = {
          date: new Date().toISOString(),
          movementType: 'in' as InventoryMovementType,
          itemId: docRef.id,
          itemType: type === 'filaments' ? 'filament' : 'supply',
          previousQuantity: 0,
          modifiedQuantity: qty,
          finalQuantity: qty,
          reason: `Alta de ítem en inventario: ${type === 'filaments' ? dataToSave.color : dataToSave.name}`,
          userId
        };
        await addDoc(collection(db, 'inventory_movements'), movement);
      }
      if (type === 'filaments') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await recalculateAllProductsInFirestore();
      }
      onClose();
    } catch (err) {
      console.error('Error saving inventory item:', err);
      alert('Error al guardar el ítem.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative z-10 bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 border border-slate-100 max-h-[min(90vh,800px)] overflow-y-auto no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
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

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="useCustomFilamentPrice"
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    checked={useCustomFilamentPrice}
                    onChange={e => {
                      const checked = e.target.checked;
                      setUseCustomFilamentPrice(checked);
                      if (!checked) {
                        setFormData({ ...formData, priceUsdKg: 0 });
                      } else if (!formData.priceUsdKg) {
                        setFormData({ ...formData, priceUsdKg: defaultFilamentPriceUsdKg });
                      }
                    }}
                  />
                  <label htmlFor="useCustomFilamentPrice" className="font-bold text-slate-600 cursor-pointer text-sm">
                    Usar precio personalizado (USD/Kg)
                  </label>
                </div>
                {useCustomFilamentPrice ? (
                  <div>
                    <label className="input-label font-bold text-slate-500 uppercase">Precio USD/Kg (Costo)</label>
                    <div className="relative mt-1">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-semibold">U$D</span>
                      <NumericInput
                        allowDecimals
                        required
                        className="input w-full pl-10"
                        value={formData.priceUsdKg}
                        onChange={val => setFormData({ ...formData, priceUsdKg: val })}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    Usa el precio global de{' '}
                    <strong>Parámetros de precios</strong>:{' '}
                    <span className="text-blue-600 font-bold">
                      U$D {defaultFilamentPriceUsdKg.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg
                    </span>
                  </p>
                )}
              </div>

              <WeightKgGramsInput
                label="Stock Mínimo Alerta"
                required
                valueGrams={formData.minStockGrams}
                onChangeGrams={val => setFormData({ ...formData, minStockGrams: val })}
              />

              <WeightKgGramsInput
                label="Peso Disponible Actual"
                required
                valueGrams={formData.availableWeightGrams}
                onChangeGrams={val => setFormData({ ...formData, availableWeightGrams: val })}
                className="[&_input]:font-bold [&_input]:text-blue-600"
              />

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
                  <NumericInput 
                    required 
                    className="input w-full mt-1 font-bold text-blue-600" 
                    value={formData.currentStock} 
                    onChange={val => setFormData({...formData, currentStock: val})} 
                  />
                </div>
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Stock Mínimo</label>
                  <NumericInput 
                    required 
                    className="input w-full mt-1" 
                    value={formData.minStock} 
                    onChange={val => setFormData({...formData, minStock: val})} 
                  />
                </div>
                <div>
                  <label className="input-label font-bold text-slate-500 uppercase">Costo Unitario ARS</label>
                  <div className="relative mt-1">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-semibold">$</span>
                    <NumericInput 
                      allowDecimals
                      required 
                      className="input w-full pl-6" 
                      value={formData.unitCostArs} 
                      onChange={val => setFormData({...formData, unitCostArs: val})} 
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
    </div>,
    document.body
  );
};

// Order Pre-Checkout/Preview modal for low stock items
const OrderModal = ({
  activeTab,
  filaments,
  supplies,
  business,
  onClose,
}: {
  activeTab: 'filaments' | 'supplies';
  filaments: Filament[];
  supplies: Supply[];
  business: BusinessSettings;
  onClose: () => void;
}) => {
  // Pre-filter items that have low stock (available weight/stock <= minimum stock)
  const lowStockItemsInitial = useMemo(() => {
    if (activeTab === 'filaments') {
      return filaments
        .filter(f => f.availableWeightGrams <= (f.minStockGrams ?? 0))
        .map(f => {
          // Calculate deficit to cover minimum stock. Spools are typically 1000g (1kg).
          // We calculate spools needed = ceil((minStockGrams - availableWeightGrams) / 1000)
          const deficitGrams = Math.max(0, (f.minStockGrams ?? 0) - f.availableWeightGrams);
          const spoolsNeeded = Math.max(1, Math.ceil(deficitGrams / 1000));
          return {
            id: f.id,
            name: f.color,
            brandOrCategory: f.brand,
            typeDetail: f.material,
            quantity: spoolsNeeded,
            unit: 'bobina',
            selected: true
          };
        });
    } else {
      return supplies
        .filter(s => s.currentStock <= (s.minStock ?? 0))
        .map(s => ({
          id: s.id,
          name: s.name,
          brandOrCategory: s.category,
          typeDetail: 'Insumo',
          quantity: Math.max(1, (s.minStock ?? 0) - s.currentStock), // Deficit needed to cover minimum stock
          unit: s.unitOfMeasure || 'unidad',
          selected: true
        }));
    }
  }, [activeTab, filaments, supplies]);

  const [orderLines, setOrderLines] = useState(lowStockItemsInitial);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const toggleSelect = (id: string) => {
    setOrderLines(prev =>
      prev.map(line => (line.id === id ? { ...line, selected: !line.selected } : line))
    );
  };

  const updateQuantity = (id: string, qty: number) => {
    setOrderLines(prev =>
      prev.map(line => (line.id === id ? { ...line, quantity: Math.max(1, qty) } : line))
    );
  };

  const handleGenerate = () => {
    const selectedLines = orderLines.filter(line => line.selected);
    if (selectedLines.length === 0) {
      alert('Por favor selecciona al menos un ítem para generar el pedido.');
      return;
    }
    generateInventoryOrderPDF(selectedLines, activeTab, business);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative z-10 bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 border border-slate-100 max-h-[min(90vh,800px)] overflow-y-auto no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center border-b pb-3 mb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <FileText size={18} className="text-blue-500" />
              Armar Pedido de Reposición ({activeTab === 'filaments' ? 'Filamentos' : 'Insumos'})
            </h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Revisá y modificá la lista de stock de alerta antes de generar el PDF de compra.
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
            <X size={18} />
          </button>
        </div>

        {orderLines.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <AlertTriangle size={32} className="mx-auto text-amber-500" />
            <p className="text-xs font-bold text-slate-650">No hay productos en stock bajo</p>
            <p className="text-[10px] text-slate-400">
              Todos los ítems de esta categoría se encuentran por encima de su stock mínimo de alerta.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto pr-1">
              {orderLines.map(item => (
                <div key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleSelect(item.id)}
                      className="text-slate-400 hover:text-blue-600 shrink-0"
                    >
                      {item.selected ? (
                        <CheckSquare size={18} className="text-blue-600" />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                    <div className="truncate">
                      <p className="font-bold text-slate-800 truncate">{item.name}</p>
                      <p className="text-[9px] text-slate-400 font-semibold uppercase">
                        {item.typeDetail} • {item.brandOrCategory}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Pedir:</span>
                    <input
                      type="number"
                      min={1}
                      className="input w-16 text-center text-xs py-1"
                      value={item.quantity}
                      onChange={e => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                      disabled={!item.selected}
                    />
                    <span className="text-[10px] text-slate-400 font-medium">
                      {item.quantity === 1 ? item.unit : (item.unit + (item.unit === 'bobina' ? 's' : ''))}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 flex justify-between items-center text-xs">
              <span className="font-bold text-slate-500 uppercase tracking-wider">Total del Pedido:</span>
              <span className="font-black text-slate-800 text-sm">
                {activeTab === 'filaments' ? (
                  `${orderLines.reduce((sum, item) => sum + (item.selected ? item.quantity : 0), 0)} kg`
                ) : (
                  `${orderLines.reduce((sum, item) => sum + (item.selected ? item.quantity : 0), 0)} unidades`
                )}
              </span>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4 mt-6">
              <button 
                type="button" 
                onClick={onClose} 
                className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl font-semibold transition-colors text-xs"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={handleGenerate}
                className="btn-primary text-xs"
              >
                Generar PDF de Compra
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

