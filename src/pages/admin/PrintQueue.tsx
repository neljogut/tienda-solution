import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { NumericInput } from '../../components/NumericInput';
import { defaultPrintQueue } from '../../constants/defaults';
import type { Order } from '../../types/order';
import type { Product3D } from '../../types/product';
import type { PrintQueueSettings } from '../../types/settings';
import {
  Printer, Clock, CalendarDays, Settings2, Package,
  ChevronDown, ChevronRight, CheckCircle2, Loader2,
  CircleDot, TrendingUp, Minus, Plus, Save, User
} from 'lucide-react';

// ─── Helpers ───────────────────────────────────────────────────────────────

interface PrintItem {
  itemIndex: number;
  name: string;
  productId: string;
  imageUrl?: string;
  quantity: number;
  printedQty: number;
  printingQty: number;
  pendingQty: number;
  printTimeMinutes: number;
  remainingMinutes: number;
}

interface OrderGroup {
  orderId: string;
  orderNumber: number;
  customerName: string;
  date: string;
  totalUnits: number;
  printedUnits: number;
  printingUnits: number;
  pendingUnits: number;
  remainingMinutes: number;
  items: PrintItem[];
  estimatedDate?: string;
}

const formatTime = (minutes: number): string => {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
};

const formatDate = (date: Date): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === 2) return 'Pasado mañana';
  return target.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
};

// ─── Component ─────────────────────────────────────────────────────────────

export const PrintQueue: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Record<string, Product3D>>({});
  const [settings, setSettings] = useState<PrintQueueSettings>(defaultPrintQueue);
  const [editSettings, setEditSettings] = useState<{ printerCount: number | ''; workHoursPerDay: number | ''; }>(defaultPrintQueue);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load print queue settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'printQueue'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as PrintQueueSettings;
        setSettings(data);
        setEditSettings(data);
      }
    });
    return () => unsub();
  }, []);

  // Load orders (pending + processing) in real-time sorted chronologically (oldest first)
  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('orderStatus', 'in', ['pending', 'processing'])
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setOrders(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Load 3D products for printTimeMinutes
  useEffect(() => {
    const q = query(collection(db, 'products'), where('type', '==', '3d'));
    const unsub = onSnapshot(q, (snap) => {
      const map: Record<string, Product3D> = {};
      snap.docs.forEach(d => {
        map[d.id] = { id: d.id, ...d.data() } as Product3D;
      });
      setProducts(map);
    });
    return () => unsub();
  }, []);

  // Build order groups with 3D items only
  const orderGroups = useMemo<OrderGroup[]>(() => {
    return orders
      .map(order => {
        const items3D = order.items.filter(item => item.type === '3d');
        if (items3D.length === 0) return null;

        let totalUnits = 0;
        let printedUnits = 0;
        let printingUnits = 0;
        let remainingMinutes = 0;

        const itemsWithPrintTimes: PrintItem[] = items3D.map((item) => {
          const product = products[item.productId];
          const printTime = product?.printTimeMinutes || 0;
          const printed = item.printedQty || 0;
          const printing = item.printingQty || 0;
          const pending = item.quantity - printed - printing;

          totalUnits += item.quantity;
          printedUnits += printed;
          printingUnits += printing;

          // Printing units count for 50% remaining print time
          const itemRem = pending * printTime + printing * 0.5 * printTime;
          remainingMinutes += itemRem;

          return {
            itemIndex: order.items.indexOf(item),
            name: item.name,
            productId: item.productId,
            imageUrl: item.imageUrl,
            quantity: item.quantity,
            printedQty: printed,
            printingQty: printing,
            pendingQty: pending,
            printTimeMinutes: printTime,
            remainingMinutes: itemRem,
          };
        });

        const pendingUnits = totalUnits - printedUnits - printingUnits;

        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          date: order.date,
          totalUnits,
          printedUnits,
          printingUnits,
          pendingUnits,
          remainingMinutes,
          items: itemsWithPrintTimes,
        };
      })
      .filter((g): g is OrderGroup => g !== null);
  }, [orders, products]);

  // Compute estimates and cumulative queue dates
  const ordersWithEstimates = useMemo<OrderGroup[]>(() => {
    let cumulativeMinutes = 0;
    return orderGroups.map(group => {
      cumulativeMinutes += group.remainingMinutes;
      const adjusted = settings.printerCount > 1 ? cumulativeMinutes / settings.printerCount : cumulativeMinutes;
      const days = settings.workHoursPerDay > 0 ? adjusted / 60 / settings.workHoursPerDay : 0;
      const estDate = new Date();
      estDate.setDate(estDate.getDate() + Math.ceil(days));
      return {
        ...group,
        estimatedDate: formatDate(estDate),
      };
    });
  }, [orderGroups, settings]);

  // Calculate global totals
  const totals = useMemo(() => {
    let pending = 0, printing = 0, printed = 0, totalMinutes = 0;
    for (const g of orderGroups) {
      pending += g.pendingUnits;
      printing += g.printingUnits;
      printed += g.printedUnits;
      totalMinutes += g.remainingMinutes;
    }
    const adjustedMinutes = settings.printerCount > 1
      ? totalMinutes / settings.printerCount
      : totalMinutes;
    const estimatedDays = settings.workHoursPerDay > 0
      ? adjustedMinutes / 60 / settings.workHoursPerDay
      : 0;
    return { pending, printing, printed, totalMinutes, adjustedMinutes, estimatedDays };
  }, [orderGroups, settings]);

  // Update a single item's printed/printing counts in Firestore
  const updateItemPrint = useCallback(async (
    orderId: string, itemIndex: number, newPrinted: number, newPrinting: number,
  ) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const newItems = [...order.items];
    newItems[itemIndex] = { ...newItems[itemIndex], printedQty: newPrinted, printingQty: newPrinting };

    let totalItems3D = 0, printedItems3D = 0, printingItems3D = 0;
    for (const item of newItems) {
      if (item.type === '3d') {
        totalItems3D += item.quantity;
        printedItems3D += item.printedQty || 0;
        printingItems3D += item.printingQty || 0;
      }
    }

    await updateDoc(doc(db, 'orders', orderId), {
      items: newItems,
      printProgress: { totalItems3D, printedItems3D, printingItems3D },
    });
  }, [orders]);

  const markOnePrinted = useCallback((orderId: string, itemIndex: number) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const item = order.items[itemIndex];
    const printed = item.printedQty || 0;
    const printing = item.printingQty || 0;
    if (printed >= item.quantity) return;
    if (printing > 0) {
      updateItemPrint(orderId, itemIndex, printed + 1, printing - 1);
    } else {
      updateItemPrint(orderId, itemIndex, printed + 1, printing);
    }
  }, [orders, updateItemPrint]);

  const markOnePrinting = useCallback((orderId: string, itemIndex: number) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const item = order.items[itemIndex];
    const printed = item.printedQty || 0;
    const printing = item.printingQty || 0;
    if (item.quantity - printed - printing <= 0) return;
    updateItemPrint(orderId, itemIndex, printed, printing + 1);
  }, [orders, updateItemPrint]);

  const unmarkOnePrinted = useCallback((orderId: string, itemIndex: number) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const item = order.items[itemIndex];
    const printed = item.printedQty || 0;
    const printing = item.printingQty || 0;
    if (printed <= 0) return;
    updateItemPrint(orderId, itemIndex, printed - 1, printing);
  }, [orders, updateItemPrint]);

  const unmarkOnePrinting = useCallback((orderId: string, itemIndex: number) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const item = order.items[itemIndex];
    const printed = item.printedQty || 0;
    const printing = item.printingQty || 0;
    if (printing <= 0) return;
    updateItemPrint(orderId, itemIndex, printed, printing - 1);
  }, [orders, updateItemPrint]);

  // Save settings
  const saveSettings = async () => {
    setSaving(true);
    try {
      const data: PrintQueueSettings = {
        printerCount: typeof editSettings.printerCount === 'number' ? editSettings.printerCount : 1,
        workHoursPerDay: typeof editSettings.workHoursPerDay === 'number' ? editSettings.workHoursPerDay : 8,
      };
      try {
        await updateDoc(doc(db, 'settings', 'printQueue'), data as any);
      } catch {
        await setDoc(doc(db, 'settings', 'printQueue'), data);
      }
    } finally {
      setSaving(false);
      setShowSettings(false);
    }
  };

  const toggleOrder = (orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  const totalPiecesInQueue = totals.pending + totals.printing + totals.printed;
  const hasItems = totalPiecesInQueue > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/25">
            <Printer className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Cola de Impresión</h1>
            <p className="text-sm text-slate-500">Gestión de impresiones 3D por pedido</p>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors"
        >
          <Settings2 size={16} />
          Configuración
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Settings2 size={16} className="text-slate-500" /> Configuración de Impresión
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Cantidad de Impresoras</label>
              <NumericInput value={editSettings.printerCount} onChange={v => setEditSettings(s => ({ ...s, printerCount: v }))} min={1} max={20} step={1} className="w-full" />
              <p className="text-xs text-slate-400 mt-1">Permite estimar tiempos con impresión en paralelo</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Horas de Trabajo por Día</label>
              <NumericInput value={editSettings.workHoursPerDay} onChange={v => setEditSettings(s => ({ ...s, workHoursPerDay: v }))} min={1} max={24} step={0.5} className="w-full" />
              <p className="text-xs text-slate-400 mt-1">Para calcular en cuántos días terminás todo</p>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button onClick={saveSettings} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <CircleDot size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">Pendientes</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{totals.pending}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Loader2 size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">Imprimiendo</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{totals.printing}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <CheckCircle2 size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">Impresos</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{totals.printed}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <Clock size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">Tiempo Rest.</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatTime(totals.adjustedMinutes)}</p>
          {totals.estimatedDays > 0 && (
            <p className="text-xs text-slate-500 mt-0.5">~{totals.estimatedDays.toFixed(1)} días</p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {hasItems && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
            <span>Progreso General</span>
            <span className="font-semibold">{totals.printed}/{totalPiecesInQueue} piezas</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
            {totals.printed > 0 && (
              <div className="bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                style={{ width: `${(totals.printed / totalPiecesInQueue) * 100}%` }} />
            )}
            {totals.printing > 0 && (
              <div className="bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-500"
                style={{ width: `${(totals.printing / totalPiecesInQueue) * 100}%` }} />
            )}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Impresos</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Imprimiendo</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-200" /> Pendientes</span>
          </div>
        </div>
      )}

      {/* Main List */}
      {!hasItems ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Printer className="text-slate-400" size={28} />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-1">No hay impresiones pendientes</h3>
          <p className="text-sm text-slate-500">Los pedidos pendientes y en proceso con productos 3D aparecerán aquí.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Package size={18} /> Pedidos por Imprimir
          </h2>
          {ordersWithEstimates.map(group => {
            const isExpanded = expandedOrders.has(group.orderId);
            const allDone = group.pendingUnits === 0 && group.printingUnits === 0;

            return (
              <div key={group.orderId} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-colors ${allDone ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200'}`}>
                {/* Order header */}
                <button onClick={() => toggleOrder(group.orderId)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-slate-50/50 transition-colors text-left">
                  <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl flex-shrink-0">
                    <User size={20} className="text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-800">Pedido #{group.orderNumber}</h3>
                      <span className="text-xs text-slate-500">({group.customerName})</span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {group.printedUnits}/{group.totalUnits} piezas
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      {group.pendingUnits > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{group.pendingUnits} pend.</span>}
                      {group.printingUnits > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{group.printingUnits} impr.</span>}
                      {group.printedUnits > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{group.printedUnits} listos</span>}
                      <span className="text-slate-400">· Recibido: {new Date(group.date).toLocaleDateString('es-AR')}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex mt-2 max-w-xs">
                      {group.printedUnits > 0 && <div className="bg-emerald-500 transition-all duration-300" style={{ width: `${(group.printedUnits / group.totalUnits) * 100}%` }} />}
                      {group.printingUnits > 0 && <div className="bg-blue-500 transition-all duration-300" style={{ width: `${(group.printingUnits / group.totalUnits) * 100}%` }} />}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {!allDone && (
                      <>
                        <p className="text-xs text-slate-500 flex items-center gap-1 justify-end"><Clock size={12} /> {formatTime(group.remainingMinutes)}</p>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full mt-1">
                          <CalendarDays size={10} /> {group.estimatedDate}
                        </span>
                      </>
                    )}
                    {allDone && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={12} /> Todo Impreso
                      </span>
                    )}
                  </div>
                  {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                </button>

                {/* Expanded: products list */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-3">
                    {group.items.map(item => {
                      const pending = item.quantity - item.printedQty - item.printingQty;
                      return (
                        <div key={`${group.orderId}-${item.productId}`} className="bg-white rounded-xl border border-slate-200/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                <Package className="text-slate-400" size={16} />
                              </div>
                            )}
                            <div>
                              <h4 className="font-semibold text-slate-800 text-sm">{item.name}</h4>
                              <p className="text-xs text-slate-500">
                                Cantidad: <span className="font-semibold text-slate-700">{item.quantity}</span>
                                {item.printTimeMinutes > 0 && ` · ${formatTime(item.printTimeMinutes)}/ud`}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Printed control */}
                            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-2 py-1">
                              <CheckCircle2 size={12} className="text-emerald-600" />
                              <span className="text-[11px] font-medium text-emerald-700">Impresos</span>
                              <div className="flex items-center gap-1 ml-1">
                                <button onClick={() => unmarkOnePrinted(group.orderId, item.itemIndex)} disabled={item.printedQty <= 0}
                                  className="w-5 h-5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                  <Minus size={10} />
                                </button>
                                <span className="text-xs font-bold text-emerald-700 min-w-[16px] text-center">{item.printedQty}</span>
                                <button onClick={() => markOnePrinted(group.orderId, item.itemIndex)} disabled={item.printedQty + item.printingQty >= item.quantity}
                                  className="w-5 h-5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                  <Plus size={10} />
                                </button>
                              </div>
                            </div>
                            {/* Printing control */}
                            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl px-2 py-1">
                              <Loader2 size={12} className="text-blue-600" />
                              <span className="text-[11px] font-medium text-blue-700">Imprimiendo</span>
                              <div className="flex items-center gap-1 ml-1">
                                <button onClick={() => unmarkOnePrinting(group.orderId, item.itemIndex)} disabled={item.printingQty <= 0}
                                  className="w-5 h-5 rounded bg-blue-100 hover:bg-blue-200 text-blue-700 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                  <Minus size={10} />
                                </button>
                                <span className="text-xs font-bold text-blue-700 min-w-[16px] text-center">{item.printingQty}</span>
                                <button onClick={() => markOnePrinting(group.orderId, item.itemIndex)} disabled={pending <= 0}
                                  className="w-5 h-5 rounded bg-blue-100 hover:bg-blue-200 text-blue-700 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                  <Plus size={10} />
                                </button>
                              </div>
                            </div>
                            {/* Pending badge */}
                            {pending > 0 && (
                              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-xl px-2 py-1">
                                <CircleDot size={12} className="text-amber-600" />
                                <span className="text-[11px] font-medium text-amber-700">Pendientes</span>
                                <span className="text-xs font-bold text-amber-700">{pending}</span>
                              </div>
                            )}
                            {item.printedQty === item.quantity && (
                              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                                <CheckCircle2 size={10} /> Completo
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary box */}
      {ordersWithEstimates.some(e => e.pendingUnits > 0 || e.printingUnits > 0) && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 mt-6">
          <p className="text-sm text-indigo-800 flex items-start gap-2">
            <TrendingUp size={16} className="flex-shrink-0 mt-0.5" />
            <span>
              <strong>Resumen de Capacidad:</strong> Con {settings.printerCount} impresora{settings.printerCount > 1 ? 's' : ''} trabajando {settings.workHoursPerDay}h/día,
              estimás terminar toda la cola en <strong>~{totals.estimatedDays.toFixed(1)} días ({formatTime(totals.adjustedMinutes)})</strong>.
              {ordersWithEstimates.length > 0 && ` El pedido más urgente (#${ordersWithEstimates[0].orderNumber}) estaría listo ${ordersWithEstimates[0].estimatedDate?.toLowerCase()}.`}
            </span>
          </p>
        </div>
      )}
    </div>
  );
};
