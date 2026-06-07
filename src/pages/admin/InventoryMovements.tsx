import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import type { InventoryMovement, InventoryMovementType, InventoryMovementLine } from '../../types/inventory';
import { isGroupedMovement } from '../../types/inventory';
import type { Order } from '../../types/order';
import { formatWeightGrams } from '../../utils/weightGrams';
import {
  ArrowLeftRight, Search, Filter, Eye, X,
  ArrowUpRight, ArrowDownRight, Edit3, User, Clock, AlertCircle, ShoppingBag,
  Package, Droplet, Receipt,
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
    const key = `${line.itemType}-${line.itemId}`;
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

export const InventoryMovements: React.FC = () => {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedMovement, setSelectedMovement] = useState<InventoryMovement | null>(null);
  const [itemsMap, setItemsMap] = useState<Record<string, ItemInfo>>({});
  const [ordersMap, setOrdersMap] = useState<Record<string, OrderInfo>>({});

  useEffect(() => {
    if (!selectedMovement) return;
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
        className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white hover:border-slate-200 transition-colors"
      >
        {info?.image ? (
          <img src={info.image} alt="" className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0" />
        ) : (
          <div className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
            {line.itemType === 'filament' ? <Droplet size={18} /> : line.itemType === 'product' ? <ShoppingBag size={18} /> : <Package size={18} />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm truncate">{info?.name || 'Ítem eliminado'}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase text-slate-400">{info?.type || 'Desconocido'}</span>
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-bold ${lineBadge.bgColor}`}>
              {lineBadge.label}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`font-black text-sm ${isOut ? 'text-rose-600' : 'text-emerald-600'}`}>
            {formatDelta(line.modifiedQuantity, unit)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
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
          <div className="p-5 overflow-y-auto space-y-5 min-h-[120px]">
            {lines.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">Este movimiento no tiene ítems registrados.</p>
            ) : (
              LINE_SECTIONS.map((section) => {
                const sectionLines = lines.filter((l) => l.itemType === section.itemType);
                if (!sectionLines.length) return null;
                return (
                  <div key={section.itemType}>
                    <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      <span className="text-slate-400">{section.icon}</span>
                      {section.label}
                      <span className="text-slate-300 font-normal">({sectionLines.length})</span>
                    </h3>
                    <div className="space-y-2">
                      {sectionLines.map((line, idx) => renderLineCard(line, `${m.id}-${section.itemType}-${idx}`))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <User size={13} />
              {m.userId ? `Operador ${m.userId.slice(0, 8)}` : 'Sistema'}
            </span>
            <button type="button" onClick={() => setSelectedMovement(null)} className="btn-secondary text-sm">
              Cerrar
            </button>
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
