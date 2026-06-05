import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import type { InventoryMovement, InventoryMovementType } from '../../types/inventory';
import { 
  ArrowLeftRight, Search, Filter, 
  ArrowUpRight, ArrowDownRight, Edit3, User, Clock, AlertCircle, ShoppingBag 
} from 'lucide-react';

export const InventoryMovements: React.FC = () => {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  
  // Dictionaries for mapping ID to item name/image for better display
  const [itemsMap, setItemsMap] = useState<Record<string, { name: string; image?: string; type: string }>>({});

  useEffect(() => {
    // 1. Fetch products & inventory to build name maps
    const buildItemsMap = async () => {
      try {
        const tempMap: Record<string, { name: string; image?: string; type: string }> = {};
        
        // Fetch products
        const prodSnap = await getDocs(collection(db, 'products'));
        prodSnap.docs.forEach(d => {
          const data = d.data();
          tempMap[d.id] = { 
            name: data.name, 
            image: data.mainImage || null,
            type: data.type === '3d' ? 'Producto 3D' : 'Producto Reventa'
          };
        });

        // Fetch inventory (filaments + supplies)
        const invSnap = await getDocs(collection(db, 'inventory'));
        invSnap.docs.forEach(d => {
          const data = d.data();
          if (data.type === 'filament') {
            tempMap[d.id] = { 
              name: `${data.brand} ${data.color} (${data.material})`, 
              image: data.mainImage || null,
              type: 'Filamento'
            };
          } else {
            tempMap[d.id] = { 
              name: data.name, 
              image: data.mainImage || null,
              type: 'Insumo'
            };
          }
        });

        setItemsMap(tempMap);
      } catch (err) {
        console.error('Error building items map for movements:', err);
      }
    };

    buildItemsMap();

    // 2. Stream inventory movements in real time
    const q = query(collection(db, 'inventory_movements'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setMovements(snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryMovement)));
      setLoading(false);
    }, (err) => {
      console.error('Error fetching movements:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getMovementBadgeStyles = (type: InventoryMovementType) => {
    switch (type) {
      case 'in':
      case 'return':
        return {
          bgColor: 'bg-emerald-50 border-emerald-100 text-emerald-600',
          icon: <ArrowUpRight size={14} />,
          label: type === 'in' ? 'Entrada' : 'Devolución'
        };
      case 'out_sale':
      case 'consumption':
        return {
          bgColor: 'bg-rose-50 border-rose-100 text-rose-600',
          icon: <ArrowDownRight size={14} />,
          label: type === 'out_sale' ? 'Venta' : 'Consumo'
        };
      case 'adjustment':
        return {
          bgColor: 'bg-blue-50 border-blue-100 text-blue-600',
          icon: <Edit3 size={14} />,
          label: 'Ajuste'
        };
      case 'correction':
        return {
          bgColor: 'bg-amber-50 border-amber-100 text-amber-600',
          icon: <AlertCircle size={14} />,
          label: 'Corrección'
        };
      default:
        return {
          bgColor: 'bg-slate-50 border-slate-100 text-slate-500',
          icon: <Clock size={14} />,
          label: 'Info'
        };
    }
  };

  // Filter movements
  const filteredMovements = movements.filter(m => {
    const itemInfo = itemsMap[m.itemId];
    const itemName = itemInfo?.name || '';
    const reasonText = m.reason || '';
    
    // Search text match
    const matchesSearch = 
      itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reasonText.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.itemId.toLowerCase().includes(searchTerm.toLowerCase());

    // Type filter match
    const matchesType = typeFilter === 'all' || m.movementType === typeFilter;

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ArrowLeftRight size={26} className="text-blue-600" />
            Auditoría de Movimientos
          </h1>
          <p className="page-subtitle">
            Historial detallado de todas las transacciones de entrada, salida y ajustes de inventario.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row justify-between gap-4 items-center">
        {/* Search */}
        <div className="relative w-full md:flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
            <Search size={16} />
          </span>
          <input 
            type="text" 
            placeholder="Buscar por artículo, motivo..."
            className="input pl-10 w-full text-xs"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-48 text-xs">
            <select
              className="input w-full pr-8 appearance-none text-xs"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
            >
              <option value="all">Todos los Movimientos</option>
              <option value="in">Entradas (Compras)</option>
              <option value="out_sale">Salidas por Venta</option>
              <option value="consumption">Consumo en Producción</option>
              <option value="adjustment">Ajustes Manuales</option>
              <option value="correction">Correcciones</option>
              <option value="return">Devoluciones</option>
            </select>
            <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 pointer-events-none">
              <Filter size={14} />
            </span>
          </div>
        </div>
      </div>

      {/* Movements Table */}
      <div className="card overflow-hidden border border-slate-200/80 shadow-sm">
        {loading ? (
          <div className="p-16 text-center text-slate-400">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium">Recuperando transacciones...</p>
          </div>
        ) : filteredMovements.length === 0 ? (
          <div className="p-16 text-center text-slate-400">
            <ArrowLeftRight size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-semibold">No se encontraron movimientos de inventario.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Tipo</th>
                  <th className="p-4">Artículo Afectado</th>
                  <th className="p-4 text-center">Variación</th>
                  <th className="p-4">Motivo / Pedido</th>
                  <th className="p-4">Operador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredMovements.map(m => {
                  const badge = getMovementBadgeStyles(m.movementType);
                  const item = itemsMap[m.itemId];
                  const sign = ['in', 'return'].includes(m.movementType) ? '+' : m.modifiedQuantity < 0 ? '' : '+';
                  const isPositive = ['in', 'return'].includes(m.movementType) || m.modifiedQuantity > 0;
                  
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/30 transition-colors">
                      {/* Date */}
                      <td className="p-4 whitespace-nowrap text-slate-500">
                        <p className="font-semibold text-slate-700">
                          {new Date(m.date).toLocaleDateString('es-AR')}
                        </p>
                        <p className="text-[9px] text-slate-400 mt-0.5">
                          {new Date(m.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </td>

                      {/* Type Badge */}
                      <td className="p-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold ${badge.bgColor}`}>
                          {badge.icon}
                          {badge.label}
                        </span>
                      </td>

                      {/* Item Info */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {item?.image ? (
                            <img 
                              src={item.image} 
                              alt="Item" 
                              className="w-8 h-8 rounded-lg object-cover border border-slate-200"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                              <ShoppingBag size={14} />
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-slate-800">{item?.name || 'Ítem Eliminado'}</p>
                            <p className="text-[9px] text-slate-400 uppercase font-bold">{item?.type || 'Desconocido'}</p>
                          </div>
                        </div>
                      </td>

                      {/* Qty variation */}
                      <td className="p-4 text-center whitespace-nowrap">
                        <div className="inline-block text-right">
                          <p className={`font-black text-sm ${
                            m.movementType === 'adjustment' || m.movementType === 'correction'
                              ? 'text-blue-600'
                              : isPositive ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {sign}{m.modifiedQuantity.toLocaleString('es-AR')}
                          </p>
                          <p className="text-[9px] text-slate-400">
                            {m.previousQuantity.toLocaleString('es-AR')} &rarr; {m.finalQuantity.toLocaleString('es-AR')}
                          </p>
                        </div>
                      </td>

                      {/* Reason / Order */}
                      <td className="p-4 max-w-xs">
                        <p className="text-slate-700 font-medium leading-relaxed">{m.reason || 'Sin motivo'}</p>
                        {m.orderId && (
                          <span className="inline-block mt-1 text-[9px] text-blue-600 font-bold bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">
                            Pedido: #{m.orderId.slice(0,8).toUpperCase()}
                          </span>
                        )}
                      </td>

                      {/* User operator */}
                      <td className="p-4 whitespace-nowrap text-slate-500">
                        <span className="flex items-center gap-1.5 font-semibold text-slate-600">
                          <User size={13} className="text-slate-400" />
                          {m.userId ? `ID: ${m.userId.slice(0, 6).toUpperCase()}` : 'Sistema'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
