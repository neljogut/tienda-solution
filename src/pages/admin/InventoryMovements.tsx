import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, orderBy, onSnapshot, doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import type { InventoryMovement, InventoryMovementType, InventoryMovementLine, Filament } from '../../types/inventory';
import { isGroupedMovement } from '../../types/inventory';
import type { Order } from '../../types/order';
import { formatWeightGrams } from '../../utils/weightGrams';
import {
  ArrowLeftRight, Search, Filter, Eye, X,
  ArrowUpRight, ArrowDownRight, Edit3, User, Clock, AlertCircle, ShoppingBag,
  Package, Droplet, Receipt, Loader2, Trash2, Edit, Palette, Check, ChevronDown,
} from 'lucide-react';

type ItemInfo = { name: string; image?: string; type: string; unit: 'g' | 'u.' };
type OrderInfo = { orderNumber: number; customerName: string };

const LINE_SECTIONS: { itemType: InventoryMovementLine['itemType']; label: string; icon: React.ReactNode }[] = [
  { itemType: 'product', label: 'Productos', icon: <ShoppingBag size={16} /> },
  { itemType: 'filament', label: 'Filamentos', icon: <Droplet size={16} /> },
  { itemType: 'supply', label: 'Insumos', icon: <Package size={16} /> },
];

function unitForItemType(itemType: InventoryMovementLine['itemType']): 'g' | 'u.' {
  return itemType === 'filament' ? 'g' : 'u.';
}

function formatAmount(value: number, unit: 'g' | 'u.'): string {
  const abs = Math.abs(value);
  if (unit === 'g') {
    if (abs % 1 !== 0) {
      return `${abs.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} g`;
    }
    return formatWeightGrams(abs);
  }
  return `${abs.toLocaleString('es-AR')} u.`;
}

function formatDelta(delta: number, unit: 'g' | 'u.'): string {
  if (delta === 0) return `0 ${unit === 'g' ? 'g' : 'u.'}`;
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${formatAmount(delta, unit)}`;
}

function formatStockRange(prev: number, final: number, unit: 'g' | 'u.'): string {
  return `${formatAmount(prev, unit)} → ${formatAmount(final, unit)}`;
}

function groupLinesByItem(lines: InventoryMovementLine[]): InventoryMovementLine[] {
  const grouped: Record<string, InventoryMovementLine> = {};
  const keys: string[] = [];

  lines.forEach((line) => {
    const key = `${line.itemType}-${line.itemId}-${line.relatedProductId || ''}`;
    if (!grouped[key]) {
      keys.push(key);
      grouped[key] = { ...line };
    } else {
      grouped[key].modifiedQuantity += line.modifiedQuantity;
      // We keep the first occurrence's previousQuantity
      // and update the finalQuantity to the last one's
      grouped[key].finalQuantity = line.finalQuantity;
    }
  });

  return keys.map((k) => grouped[k]);
}

// Helper to get color preview styles for filaments
function getFilamentColorStyle(colorName: string): React.CSSProperties {
  const name = colorName.toLowerCase().trim();
  
  if (name.includes('arcoiris') || name.includes('rainbow') || name.includes('arcoris') || name.includes('multicolor')) {
    return { background: 'linear-gradient(135deg, #ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6)' };
  }
  if (name.includes('oro') || name.includes('dorado') || name.includes('gold')) {
    return { background: 'linear-gradient(135deg, #f5c453, #c58d20)' };
  }
  if (name.includes('plata') || name.includes('plateado') || name.includes('silver')) {
    return { background: 'linear-gradient(135deg, #e2e8f0, #94a3b8)' };
  }
  if (name.includes('cobre') || name.includes('copper')) {
    return { background: 'linear-gradient(135deg, #f97316, #b45309)' };
  }
  if (name.includes('bronce') || name.includes('bronze')) {
    return { background: 'linear-gradient(135deg, #ca8a04, #854d0e)' };
  }
  if (name.includes('transparente') || name.includes('clear')) {
    return { 
      background: 'repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 4px, #ffffff 4px, #ffffff 8px)',
      border: '1px solid #cbd5e1'
    };
  }

  const colorMap: Record<string, string> = {
    negro: '#1e293b',
    black: '#1e293b',
    blanco: '#f8fafc',
    white: '#f8fafc',
    rojo: '#ef4444',
    red: '#ef4444',
    azul: '#3b82f6',
    blue: '#3b82f6',
    verde: '#10b981',
    green: '#10b981',
    amarillo: '#f59e0b',
    yellow: '#f59e0b',
    gris: '#64748b',
    gray: '#64748b',
    naranja: '#f97316',
    orange: '#f97316',
    rosa: '#ec4899',
    pink: '#ec4899',
    violeta: '#8b5cf6',
    purpura: '#8b5cf6',
    purple: '#8b5cf6',
    fucsia: '#d946ef',
    celeste: '#60a5fa',
    turquesa: '#14b8a6',
    teal: '#14b8a6'
  };

  for (const [key, hex] of Object.entries(colorMap)) {
    if (name.includes(key)) {
      const border = hex === '#f8fafc' ? '1px solid #cbd5e1' : 'none';
      return { backgroundColor: hex, border };
    }
  }

  return { background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' };
}

// Searchable Filament Select Component for Inventory Movements
const SearchableFilamentSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  filaments: Filament[];
  placeholder?: string;
}> = ({
  value,
  onChange,
  filaments,
  placeholder = 'Buscar filamento...'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const selectedFilament = filaments.find(f => f.id === value);
  const displayValue = selectedFilament 
    ? `${selectedFilament.brand} · ${selectedFilament.material} · ${selectedFilament.color}`
    : '';

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return filaments;
    return filaments.filter(f => 
      f.brand.toLowerCase().includes(term) ||
      f.material.toLowerCase().includes(term) ||
      f.color.toLowerCase().includes(term)
    );
  }, [filaments, search]);

  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left,
        width: rect.width,
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
    
    // Update coordinates on window resize
    window.addEventListener('resize', updateCoords);
    
    const clickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // Check if the click is inside the portal dropdown list
        const portalDropdown = document.getElementById('portal-filament-dropdown');
        if (portalDropdown && portalDropdown.contains(e.target as Node)) {
          return;
        }
        setIsOpen(false);
      }
    };
    
    document.addEventListener('click', clickOutside);
    return () => {
      window.removeEventListener('resize', updateCoords);
      document.removeEventListener('click', clickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          value={isOpen ? search : displayValue}
          onChange={e => setSearch(e.target.value)}
          onFocus={handleFocus}
          className="w-full border border-slate-300 rounded-lg pl-8 pr-8 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-ellipsis truncate transition-all duration-200"
        />
        <div className="absolute left-2.5 top-2.5 text-slate-400">
          <Palette size={14} />
        </div>
        <div className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none">
          <ChevronDown size={14} />
        </div>
      </div>

      {isOpen && coords && createPortal(
        <div 
          id="portal-filament-dropdown"
          className="fixed bg-white border border-slate-200/80 rounded-xl shadow-2xl z-[999] py-1.5 text-xs ring-1 ring-black/5 scrollbar-thin max-h-48 overflow-y-auto"
          style={{
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            bottom: `${window.innerHeight - coords.top + 4}px`,
          }}
          onClick={e => e.stopPropagation()}
        >
          {filtered.length === 0 ? (
            <div className="text-slate-400 py-4 text-center flex flex-col items-center gap-1">
              <Palette size={16} className="opacity-40" />
              <span>No se encontraron filamentos</span>
            </div>
          ) : (
            filtered.map(f => {
              const isSelected = f.id === value;
              const colorStyle = getFilamentColorStyle(f.color);
              
              let stockBadgeClass = 'badge-green';
              if (f.availableWeightGrams < 50) {
                stockBadgeClass = 'badge-red';
              } else if (f.availableWeightGrams < 200) {
                stockBadgeClass = 'badge-yellow';
              }

              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onChange(f.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 transition-colors flex items-center justify-between gap-2 border-b border-slate-50 last:border-0 ${
                    isSelected 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div 
                      className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm border border-black/10" 
                      style={colorStyle}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-slate-800 truncate">{f.brand} · {f.color}</span>
                      <span className={`text-[10px] truncate ${isSelected ? 'text-blue-500 font-medium' : 'text-slate-400'}`}>
                        {f.material}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`badge ${stockBadgeClass} text-[9px] px-1.5 py-0.5`}>
                      {f.availableWeightGrams}g
                    </span>
                    {isSelected && <Check size={12} className="text-blue-600" />}
                  </div>
                </button>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export const InventoryMovements: React.FC = () => {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedMovement, setSelectedMovement] = useState<InventoryMovement | null>(null);
  const [itemsMap, setItemsMap] = useState<Record<string, ItemInfo>>({});
  const [ordersMap, setOrdersMap] = useState<Record<string, OrderInfo>>({});

  // Editing state for movements
  const [isEditingLines, setIsEditingLines] = useState(false);
  const [editingLines, setEditingLines] = useState<{ itemId: string; name: string; grams: number; relatedProductId?: string; }[]>([]);
  const [allFilaments, setAllFilaments] = useState<Filament[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!selectedMovement) {
      setIsEditingLines(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedMovement(null);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [selectedMovement]);

  useEffect(() => {
    const buildMaps = async () => {
      try {
        const tempMap: Record<string, ItemInfo> = {};
        const [prodSnap, invSnap, ordersSnap] = await Promise.all([
          getDocs(collection(db, 'products')),
          getDocs(collection(db, 'inventory')),
          getDocs(collection(db, 'orders')),
        ]);

        prodSnap.docs.forEach((d) => {
          const data = d.data();
          tempMap[d.id] = {
            name: data.name,
            image: data.mainImage || undefined,
            type: data.type === 'resale' ? 'Producto Reventa' : 'Producto 3D',
            unit: 'u.',
          };
        });

        invSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.type === 'filament') {
            tempMap[d.id] = {
              name: `${data.brand} ${data.color} (${data.material})`,
              image: data.mainImage || undefined,
              type: 'Filamento',
              unit: 'g',
            };
          } else {
            tempMap[d.id] = {
              name: data.name,
              image: data.mainImage || undefined,
              type: 'Insumo',
              unit: 'u.',
            };
          }
        });

        const tempOrders: Record<string, OrderInfo> = {};
        ordersSnap.docs.forEach((d) => {
          const data = d.data() as Order;
          tempOrders[d.id] = {
            orderNumber: data.orderNumber,
            customerName: data.customerName,
          };
        });

        setItemsMap(tempMap);
        setOrdersMap(tempOrders);
      } catch (err) {
        console.error('Error building maps for movements:', err);
      }
    };
    buildMaps();

    const q = query(collection(db, 'inventory_movements'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setMovements(snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryMovement)));
      setLoading(false);
    }, (err) => {
      console.error('Error fetching movements:', err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isEditingLines) return;
    const fetchFilaments = async () => {
      try {
        const snap = await getDocs(collection(db, 'inventory'));
        const fils: Filament[] = [];
        snap.docs.forEach((doc) => {
          const data = doc.data();
          if (data.type === 'filament' && data.isActive) {
            fils.push({ id: doc.id, ...data } as Filament);
          }
        });
        setAllFilaments(fils);
      } catch (err) {
        console.error('Error fetching filaments for edit:', err);
      }
    };
    fetchFilaments();
  }, [isEditingLines]);

  const handleStartEdit = () => {
    if (!selectedMovement) return;
    const lines = getLines(selectedMovement);
    const filamentLines = lines.filter((l) => l.itemType === 'filament');
    const mapped = filamentLines.map((l) => {
      const info = itemsMap[l.itemId];
      return {
        itemId: l.itemId,
        name: info?.name || `Filamento ID: ${l.itemId}`,
        grams: Math.abs(l.modifiedQuantity),
        relatedProductId: l.relatedProductId,
      };
    });
    setEditingLines(mapped);
    setIsEditingLines(true);
  };

  const handleSaveEditedLines = async () => {
    if (!selectedMovement) return;
    setSavingEdit(true);
    try {
      const m = selectedMovement;
      const originalLines = getLines(m);
      
      const originalFilamentLines = originalLines.filter((l) => l.itemType === 'filament');
      const nonFilamentLines = originalLines.filter((l) => l.itemType !== 'filament');
      
      const batch = writeBatch(db);
      
      // Map original by itemId__relatedProductId
      const originalMap = new Map<string, { itemId: string; relatedProductId?: string; modifiedQuantity: number }>();
      originalFilamentLines.forEach((l) => {
        const key = `${l.itemId}__${l.relatedProductId || ''}`;
        originalMap.set(key, {
          itemId: l.itemId,
          relatedProductId: l.relatedProductId,
          modifiedQuantity: l.modifiedQuantity,
        });
      });
      
      // Map editingLines by itemId__relatedProductId
      const newMap = new Map<string, { itemId: string; relatedProductId?: string; modifiedQuantity: number }>();
      editingLines.forEach((line) => {
        if (line.grams > 0) {
          const key = `${line.itemId}__${line.relatedProductId || ''}`;
          newMap.set(key, {
            itemId: line.itemId,
            relatedProductId: line.relatedProductId,
            modifiedQuantity: -line.grams,
          });
        }
      });
      
      const allKeys = Array.from(new Set([...Array.from(originalMap.keys()), ...Array.from(newMap.keys())]));
      
      // Group net changes by itemId to update inventory once per filament
      const netChangesByItem = new Map<string, number>();
      for (const key of allKeys) {
        const oldLine = originalMap.get(key);
        const newLine = newMap.get(key);
        
        const oldQty = oldLine ? oldLine.modifiedQuantity : 0;
        const newQty = newLine ? newLine.modifiedQuantity : 0;
        const delta = newQty - oldQty;
        
        const itemId = oldLine ? oldLine.itemId : newLine!.itemId;
        netChangesByItem.set(itemId, (netChangesByItem.get(itemId) || 0) + delta);
      }
      
      // Update inventory database stock and store pre/post stock weights
      const itemStockDetails = new Map<string, { prev: number; final: number }>();
      for (const [itemId, delta] of netChangesByItem.entries()) {
        const filRef = doc(db, 'inventory', itemId);
        const filSnap = await getDoc(filRef);
        if (filSnap.exists()) {
          const filData = filSnap.data();
          const prev = filData.availableWeightGrams || 0;
          const final = Math.max(0, prev + delta);
          itemStockDetails.set(itemId, { prev, final });
          
          batch.update(filRef, { availableWeightGrams: final });
        }
      }
      
      // Build the new movement lines array
      const newMovementLines: InventoryMovementLine[] = [...nonFilamentLines];
      
      for (const [, newLine] of newMap.entries()) {
        const stock = itemStockDetails.get(newLine.itemId);
        newMovementLines.push({
          itemId: newLine.itemId,
          itemType: 'filament',
          lineType: 'consumption',
          modifiedQuantity: newLine.modifiedQuantity,
          previousQuantity: stock ? stock.prev : 0,
          finalQuantity: stock ? stock.final : 0,
          relatedProductId: newLine.relatedProductId,
        });
      }
      
      const movementRef = doc(db, 'inventory_movements', m.id);
      batch.update(movementRef, { lines: newMovementLines });
      
      await batch.commit();
      
      setMovements((prevMovements) =>
        prevMovements.map((item) =>
          item.id === m.id ? { ...item, lines: newMovementLines } : item
        )
      );
      
      setSelectedMovement((prev) => (prev ? { ...prev, lines: newMovementLines } : null));
      setIsEditingLines(false);
    } catch (err) {
      console.error('Error saving edited filament lines:', err);
      alert('Error al guardar los cambios en el movimiento.');
    } finally {
      setSavingEdit(false);
    }
  };

  const getMovementBadgeStyles = (type: InventoryMovementType) => {
    switch (type) {
      case 'sale':
        return {
          bgColor: 'bg-rose-50 border-rose-200 text-rose-700',
          icon: <ShoppingBag size={14} />,
          label: 'Venta',
        };
      case 'in':
      case 'return':
        return {
          bgColor: 'bg-emerald-50 border-emerald-100 text-emerald-600',
          icon: <ArrowUpRight size={14} />,
          label: type === 'in' ? 'Entrada' : 'Devolución',
        };
      case 'out_sale':
      case 'consumption':
        return {
          bgColor: 'bg-rose-50 border-rose-100 text-rose-600',
          icon: <ArrowDownRight size={14} />,
          label: type === 'out_sale' ? 'Salida' : 'Consumo',
        };
      case 'adjustment':
        return {
          bgColor: 'bg-blue-50 border-blue-100 text-blue-600',
          icon: <Edit3 size={14} />,
          label: 'Ajuste',
        };
      case 'correction':
        return {
          bgColor: 'bg-amber-50 border-amber-100 text-amber-600',
          icon: <AlertCircle size={14} />,
          label: 'Corrección',
        };
      default:
        return {
          bgColor: 'bg-slate-50 border-slate-100 text-slate-500',
          icon: <Clock size={14} />,
          label: 'Info',
        };
    }
  };

  const getOrderLabel = (orderId?: string) => {
    if (!orderId) return null;
    const info = ordersMap[orderId];
    if (info) {
      return {
        primary: `Pedido #${info.orderNumber}`,
        secondary: info.customerName,
      };
    }
    return {
      primary: `Ref. ${orderId.slice(0, 8).toUpperCase()}`,
      secondary: 'Pedido histórico importado',
    };
  };

  const getLines = (m: InventoryMovement): InventoryMovementLine[] => {
    let rawLines: InventoryMovementLine[] = [];
    if (isGroupedMovement(m)) {
      rawLines = m.lines!;
    } else {
      rawLines = [{
        itemId: m.itemId!,
        itemType: m.itemType!,
        lineType: m.movementType,
        modifiedQuantity: m.modifiedQuantity ?? 0,
        previousQuantity: m.previousQuantity ?? 0,
        finalQuantity: m.finalQuantity ?? 0,
      }];
    }

    // In-memory reconstruction of relatedProductId for legacy grouped movements
    const hasAnyRelatedProduct = rawLines.some((l) => l.relatedProductId);
    const hasProductLines = rawLines.some((l) => l.itemType === 'product');
    if (!hasAnyRelatedProduct && hasProductLines) {
      let currentProductId: string | null = null;
      rawLines = rawLines.map((line) => {
        if (line.itemType === 'product') {
          currentProductId = line.itemId;
          return line;
        } else if (line.itemType === 'filament' || line.itemType === 'supply') {
          return {
            ...line,
            relatedProductId: currentProductId || undefined,
          };
        }
        return line;
      });
    }

    return groupLinesByItem(rawLines);
  };

  const getMovementSummary = (m: InventoryMovement): string => {
    const lines = getLines(m);
    const counts = { product: 0, filament: 0, supply: 0 };
    lines.forEach((l) => { counts[l.itemType] += 1; });
    const parts: string[] = [];
    if (counts.product) parts.push(`${counts.product} producto${counts.product > 1 ? 's' : ''}`);
    if (counts.filament) parts.push(`${counts.filament} filamento${counts.filament > 1 ? 's' : ''}`);
    if (counts.supply) parts.push(`${counts.supply} insumo${counts.supply > 1 ? 's' : ''}`);
    return parts.join(' · ') || 'Sin ítems';
  };

  const movementMatchesFilter = (m: InventoryMovement): boolean => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'sale') return m.movementType === 'sale';
    if (m.movementType === typeFilter) return true;
    if (m.lines?.some((l) => l.lineType === typeFilter)) return true;
    return false;
  };

  const movementMatchesSearch = (m: InventoryMovement): boolean => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    if (m.reason?.toLowerCase().includes(term)) return true;
    if (m.orderId?.toLowerCase().includes(term)) return true;
    const orderInfo = m.orderId ? ordersMap[m.orderId] : undefined;
    if (orderInfo?.customerName.toLowerCase().includes(term)) return true;
    if (orderInfo && String(orderInfo.orderNumber).includes(term)) return true;
    return getLines(m).some((l) => {
      const info = itemsMap[l.itemId];
      return l.itemId.toLowerCase().includes(term) || (info?.name?.toLowerCase().includes(term) ?? false);
    });
  };

  const filteredMovements = useMemo(
    () => movements.filter((m) => movementMatchesFilter(m) && movementMatchesSearch(m)),
    [movements, typeFilter, searchTerm, itemsMap, ordersMap]
  );

  const renderLineCard = (line: InventoryMovementLine, key: string) => {
    const info = itemsMap[line.itemId];
    const unit = unitForItemType(line.itemType);
    const lineBadge = getMovementBadgeStyles(line.lineType);
    const isOut = line.modifiedQuantity < 0;

    return (
      <div
        key={key}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border border-slate-100 bg-white hover:border-slate-200 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {info?.image ? (
            <img src={info.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
              {line.itemType === 'filament' ? <Droplet size={16} /> : line.itemType === 'product' ? <ShoppingBag size={16} /> : <Package size={16} />}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-800 text-xs sm:text-sm truncate" title={info?.name}>{info?.name || 'Ítem eliminado'}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[9px] sm:text-[10px] font-bold uppercase text-slate-400">{info?.type || 'Desconocido'}</span>
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-bold ${lineBadge.bgColor}`}>
                {lineBadge.label}
              </span>
            </div>
          </div>
        </div>
        
        {/* Quantity/Stock block */}
        <div className="flex sm:flex-col justify-between items-center sm:items-end border-t border-slate-100 sm:border-0 pt-2 sm:pt-0 shrink-0">
          <p className={`font-black text-xs sm:text-sm ${isOut ? 'text-rose-600' : 'text-emerald-600'}`}>
            {formatDelta(line.modifiedQuantity, unit)}
          </p>
          <p className="text-[10px] text-slate-400 font-medium">
            Stock: {formatStockRange(line.previousQuantity, line.finalQuantity, unit)}
          </p>
        </div>
      </div>
    );
  };

  const renderDetailModal = () => {
    if (!selectedMovement) return null;
    const m = selectedMovement;
    const badge = getMovementBadgeStyles(m.movementType);
    const order = getOrderLabel(m.orderId);
    const lines = getLines(m);

    return createPortal(
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        onClick={() => setSelectedMovement(null)}
      >
        <div
          className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[min(90vh,800px)] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-100 bg-slate-50 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold ${badge.bgColor}`}>
                    {badge.icon}
                    {badge.label}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    {new Date(m.date).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}
                    {new Date(m.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-base font-bold text-slate-800">{m.reason || 'Sin descripción'}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMovement(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl transition-colors shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            {order && (
              <div className="mt-3 flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                  <Receipt size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-blue-800">{order.primary}</p>
                  <p className="text-xs text-blue-600/80">{order.secondary}</p>
                </div>
              </div>
            )}
          </div>

          {/* Body */}
          {isEditingLines ? (
            (() => {
              const productLines = lines.filter((l) => l.itemType === 'product');
              const productIds = new Set(productLines.map((p) => p.itemId));
              const unassociated = editingLines.filter(
                (el) => !el.relatedProductId || !productIds.has(el.relatedProductId)
              );

              return (
                <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                  <div className="px-5 pt-4 pb-2 shrink-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Ajustar Consumos de Filamento
                    </p>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4 min-h-0">
                    {/* Edición por Producto */}
                    {productLines.length > 0 ? (
                      productLines.map((prodLine, pIdx) => {
                        const prodInfo = itemsMap[prodLine.itemId];
                        const prodFilaments = editingLines.filter(
                          (el) => el.relatedProductId === prodLine.itemId
                        );
                        
                        return (
                          <div
                            key={`edit-group-${prodLine.itemId}-${pIdx}`}
                            className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3"
                          >
                            <div className="flex items-center gap-3">
                              {prodInfo?.image ? (
                                <img src={prodInfo.image} alt="" className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                                  <ShoppingBag size={14} />
                                </div>
                              )}
                              <div>
                                <p className="font-bold text-slate-800 text-xs sm:text-sm">
                                  {prodInfo?.name || 'Producto'}
                                </p>
                                <p className="text-[10px] text-slate-400 font-semibold uppercase">
                                  {prodInfo?.type}
                                </p>
                              </div>
                            </div>

                            <div className="space-y-2 pt-2 border-t border-slate-200/50">
                              {prodFilaments.length === 0 ? (
                                <p className="text-xs text-slate-400 py-1 italic">
                                  No hay filamentos registrados para este producto.
                                </p>
                              ) : (
                                prodFilaments.map((line) => {
                                  const globalIdx = editingLines.indexOf(line);
                                  return (
                                    <div
                                      key={`line-${line.itemId}-${globalIdx}`}
                                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-100 bg-white"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="font-bold text-slate-700 text-xs truncate" title={line.name}>
                                          {line.name}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <input
                                          type="number"
                                          min="0"
                                          value={line.grams === 0 ? '' : line.grams}
                                          onChange={(e) => {
                                            const val = e.target.value === '' ? 0 : Number(e.target.value);
                                            setEditingLines((prev) =>
                                              prev.map((item, i) => (i === globalIdx ? { ...item, grams: val } : item))
                                            );
                                          }}
                                          className="w-16 p-1 border rounded text-right text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                                          placeholder="0"
                                        />
                                        <span className="text-xs text-slate-400 font-medium">g</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingLines((prev) => prev.filter((_, i) => i !== globalIdx));
                                          }}
                                          className="p-1.5 rounded-lg transition-colors text-red-500 hover:text-red-650 hover:bg-red-50"
                                          title="Quitar filamento"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>

                            {/* Agregar filamento a este producto */}
                            <div className="pt-1.5">
                              <SearchableFilamentSelect
                                value=""
                                placeholder="-- Agregar filamento para este producto --"
                                filaments={allFilaments.filter(
                                  (f) => !prodFilaments.some((el) => el.itemId === f.id)
                                )}
                                onChange={(filId) => {
                                  if (!filId) return;
                                  const filamentObj = allFilaments.find((f) => f.id === filId);
                                  if (filamentObj) {
                                    const name = `${filamentObj.brand} ${filamentObj.color} (${filamentObj.material})`;
                                    setEditingLines((prev) => [
                                      ...prev,
                                      { itemId: filId, name, grams: 100, relatedProductId: prodLine.itemId },
                                    ]);
                                  }
                                }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : null}

                    {/* Consumos sin producto (o generales) */}
                    {(productLines.length === 0 || unassociated.length > 0) && (
                      <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
                        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                          <AlertCircle size={14} className="text-slate-500" />
                          Consumos sin producto asociado
                        </h4>
                        
                        <div className="space-y-2 pt-2 border-t border-slate-200/50">
                          {unassociated.length === 0 ? (
                            <p className="text-xs text-slate-400 py-1 italic">
                              No hay consumos generales registrados.
                            </p>
                          ) : (
                            unassociated.map((line) => {
                              const globalIdx = editingLines.indexOf(line);
                              return (
                                <div
                                  key={`line-unassoc-${line.itemId}-${globalIdx}`}
                                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-100 bg-white"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-bold text-slate-700 text-xs truncate" title={line.name}>
                                      {line.name}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <input
                                      type="number"
                                      min="0"
                                      value={line.grams === 0 ? '' : line.grams}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                                        setEditingLines((prev) =>
                                          prev.map((item, i) => (i === globalIdx ? { ...item, grams: val } : item))
                                        );
                                      }}
                                      className="w-16 p-1 border rounded text-right text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                                      placeholder="0"
                                    />
                                    <span className="text-xs text-slate-400 font-medium">g</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingLines((prev) => prev.filter((_, i) => i !== globalIdx));
                                      }}
                                      className="p-1.5 rounded-lg transition-colors text-red-500 hover:text-red-650 hover:bg-red-50"
                                      title="Quitar filamento"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* Agregar consumo de filamento general */}
                        <div className="pt-1.5">
                          <SearchableFilamentSelect
                            value=""
                            placeholder="-- Agregar consumo de filamento general --"
                            filaments={allFilaments.filter(
                              (f) => !unassociated.some((el) => el.itemId === f.id)
                            )}
                            onChange={(filId) => {
                              if (!filId) return;
                              const filamentObj = allFilaments.find((f) => f.id === filId);
                              if (filamentObj) {
                                const name = `${filamentObj.brand} ${filamentObj.color} (${filamentObj.material})`;
                                setEditingLines((prev) => [...prev, { itemId: filId, name, grams: 100 }]);
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="p-5 overflow-y-auto min-h-[120px] max-h-[500px]">
              {lines.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">Este movimiento no tiene ítems registrados.</p>
              ) : (
                (() => {
                  const productLines = lines.filter((l) => l.itemType === 'product');
                  
                  if (productLines.length > 0) {
                    const otherLines = lines.filter((l) => l.itemType !== 'product');
                    const productIds = new Set(productLines.map((p) => p.itemId));
                    const associatedLines = otherLines.filter(
                      (l) => l.relatedProductId && productIds.has(l.relatedProductId)
                    );
                    const unassociatedLines = otherLines.filter(
                      (l) => !l.relatedProductId || !productIds.has(l.relatedProductId)
                    );

                    return (
                      <div className="space-y-4">
                        {productLines.map((prodLine, pIdx) => {
                          const prodLines = associatedLines.filter(
                            (l) => l.relatedProductId === prodLine.itemId
                          );
                          return (
                            <div
                              key={`group-${prodLine.itemId}-${pIdx}`}
                              className="bg-slate-50/50 rounded-2xl border border-slate-200/60 p-4 space-y-3"
                            >
                              <div className="font-bold text-[10px] text-slate-400 uppercase tracking-wider mb-1">
                                Producto Vendido
                              </div>
                              {renderLineCard(prodLine, `prod-${prodLine.itemId}`)}
                              
                              {prodLines.length > 0 && (
                                <div className="space-y-2 pl-4 sm:pl-8 border-l-2 border-slate-200 mt-3">
                                  <div className="font-bold text-[9px] text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                    <Palette size={11} /> Materiales Consumidos
                                  </div>
                                  {prodLines.map((assocLine, aIdx) =>
                                    renderLineCard(assocLine, `assoc-${assocLine.itemId}-${aIdx}`)
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        
                        {unassociatedLines.length > 0 && (
                          <div className="space-y-3">
                            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                              <AlertCircle size={14} className="text-slate-400" />
                              Consumos sin producto asociado
                              <span className="text-slate-300 font-normal">({unassociatedLines.length})</span>
                            </h3>
                            <div className="space-y-2">
                              {unassociatedLines.map((line, idx) =>
                                renderLineCard(line, `unassoc-${line.itemId}-${idx}`)
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Fallback normal si no hay productos (ajustes, entradas, etc.)
                  return LINE_SECTIONS.map((section) => {
                    const sectionLines = lines.filter((l) => l.itemType === section.itemType);
                    if (!sectionLines.length) return null;
                    return (
                      <div key={section.itemType} className="mb-4 last:mb-0">
                        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                          <span className="text-slate-400">{section.icon}</span>
                          {section.label}
                          <span className="text-slate-300 font-normal">({sectionLines.length})</span>
                        </h3>
                        <div className="space-y-2">
                          {sectionLines.map((line, idx) =>
                            renderLineCard(line, `${m.id}-${section.itemType}-${idx}`)
                          )}
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          )}

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
            {isEditingLines ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditingLines(false)}
                  className="btn-secondary text-sm"
                  disabled={savingEdit}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditedLines}
                  className="btn-primary text-sm flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow-sm"
                  disabled={savingEdit}
                >
                  {savingEdit && <Loader2 size={14} className="animate-spin" />}
                  Guardar Cambios
                </button>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <User size={13} />
                  {m.userId ? `Operador ${m.userId.slice(0, 8)}` : 'Sistema'}
                </span>
                <div className="flex gap-2">
                  {(m.movementType === 'sale' || m.movementType === 'consumption') && (
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="btn-secondary text-sm flex items-center gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                    >
                      <Edit size={14} />
                      Editar Consumos
                    </button>
                  )}
                  <button type="button" onClick={() => setSelectedMovement(null)} className="btn-secondary text-sm">
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ArrowLeftRight size={26} className="text-blue-600" />
            Auditoría de Movimientos
          </h1>
          <p className="page-subtitle">
            Cada venta o devolución es una transacción. Usá <strong>Ver detalle</strong> para ver productos, filamentos (en gramos) e insumos.
          </p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row justify-between gap-4 items-center">
        <div className="relative w-full md:flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Buscar por pedido, cliente, artículo..."
            className="input pl-10 w-full text-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative w-full md:w-48 text-xs">
          <select
            className="input w-full pr-8 appearance-none text-xs"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="sale">Ventas</option>
            <option value="in">Entradas</option>
            <option value="return">Devoluciones</option>
            <option value="adjustment">Ajustes</option>
            <option value="correction">Correcciones</option>
          </select>
          <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 pointer-events-none">
            <Filter size={14} />
          </span>
        </div>
      </div>

      {loading ? (
        <div className="card p-16 text-center text-slate-400">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium">Recuperando transacciones...</p>
        </div>
      ) : filteredMovements.length === 0 ? (
        <div className="card p-16 text-center text-slate-400">
          <ArrowLeftRight size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-semibold">No se encontraron movimientos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMovements.map((m) => {
            const badge = getMovementBadgeStyles(m.movementType);
            const order = getOrderLabel(m.orderId);
            const summary = getMovementSummary(m);
            const grouped = isGroupedMovement(m);

            return (
              <div
                key={m.id}
                className="card p-4 border border-slate-200/80 hover:border-slate-300 hover:shadow-md transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Fecha */}
                  <div className="sm:w-28 shrink-0">
                    <p className="font-bold text-slate-800 text-sm">
                      {new Date(m.date).toLocaleDateString('es-AR')}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(m.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* Contenido principal */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold ${badge.bgColor}`}>
                        {badge.icon}
                        {badge.label}
                      </span>
                      {order && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-100 text-[10px] font-bold text-blue-700">
                          <Receipt size={11} />
                          {order.primary}
                          {order.secondary && (
                            <span className="font-normal text-blue-500">· {order.secondary}</span>
                          )}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 font-medium truncate">{m.reason || 'Sin motivo'}</p>
                    <p className="text-xs text-slate-500">{grouped ? summary : getLines(m)[0] ? itemsMap[getLines(m)[0].itemId]?.name : '—'}</p>
                  </div>

                  {/* Acción */}
                  <button
                    type="button"
                    onClick={() => setSelectedMovement(m)}
                    className="btn-secondary flex items-center justify-center gap-2 text-sm shrink-0 w-full sm:w-auto"
                  >
                    <Eye size={16} />
                    Ver detalle
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {renderDetailModal()}
    </div>
  );
};
