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
  CircleDot, TrendingUp, Minus, Plus, Save
} from 'lucide-react';

// ─── Helpers ───────────────────────────────────────────────────────────────

interface OrderBreakdown {
  orderId: string;
  orderNumber: number;
  customerName: string;
  orderDate: string;
  itemIndex: number;
  total: number;
  printed: number;
  printing: number;
}

interface ProductGroup {
  productId: string;
  productName: string;
  imageUrl?: string;
  printTimeMinutes: number;
  totalUnits: number;
  printedUnits: number;
  printingUnits: number;
  pendingUnits: number;
  orders: OrderBreakdown[];
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
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
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

  // Load orders (pending + processing) in real-time
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

  // Build product groups
  const productGroups = useMemo<ProductGroup[]>(() => {
    const groupMap = new Map<string, ProductGroup>();

    for (const order of orders) {
      for (let idx = 0; idx < order.items.length; idx++) {
        const item = order.items[idx];
        if (item.type !== '3d') continue;

        const product = products[item.productId];
        const printTime = product?.printTimeMinutes || 0;

        if (!groupMap.has(item.productId)) {
          groupMap.set(item.productId, {
            productId: item.productId,
            productName: item.name,
            imageUrl: item.imageUrl,
            printTimeMinutes: printTime,
            totalUnits: 0,
            printedUnits: 0,
            printingUnits: 0,
            pendingUnits: 0,
            orders: [],
          });
        }

        const group = groupMap.get(item.productId)!;
        if (printTime > 0) group.printTimeMinutes = printTime;
        if (item.imageUrl && !group.imageUrl) group.imageUrl = item.imageUrl;

        const printed = item.printedQty || 0;
        const printing = item.printingQty || 0;
        const pending = item.quantity - printed - printing;

        group.totalUnits += item.quantity;
        group.printedUnits += printed;
        group.printingUnits += printing;
        group.pendingUnits += pending;

        group.orders.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          orderDate: order.date,
          itemIndex: idx,
          total: item.quantity,
          printed,
          printing,
        });
      }
    }

    return Array.from(groupMap.values()).sort((a, b) => {
      const aRemaining = (a.pendingUnits + a.printingUnits) * a.printTimeMinutes;
      const bRemaining = (b.pendingUnits + b.printingUnits) * b.printTimeMinutes;
      return bRemaining - aRemaining;
    });
  }, [orders, products]);

  // Calculate totals
  const totals = useMemo(() => {
    let pending = 0, printing = 0, printed = 0, totalMinutes = 0;
    for (const g of productGroups) {
      pending += g.pendingUnits;
      printing += g.printingUnits;
      printed += g.printedUnits;
      totalMinutes += (g.pendingUnits + g.printingUnits * 0.5) * g.printTimeMinutes;
    }
    const adjustedMinutes = settings.printerCount > 1
      ? totalMinutes / settings.printerCount
      : totalMinutes;
    const estimatedDays = settings.workHoursPerDay > 0
      ? adjustedMinutes / 60 / settings.workHoursPerDay
      : 0;
    return { pending, printing, printed, totalMinutes, adjustedMinutes, estimatedDays };
  }, [productGroups, settings]);

  // Calculate per-order estimates
  const orderEstimates = useMemo(() => {
    const orderMap = new Map<string, { orderId: string; orderNumber: number; customerName: string; date: string; totalItems3D: number; printed: number; printing: number; totalMinutes: number }>();

    for (const g of productGroups) {
      for (const o of g.orders) {
        if (!orderMap.has(o.orderId)) {
          orderMap.set(o.orderId, {
            orderId: o.orderId, orderNumber: o.orderNumber, customerName: o.customerName,
            date: o.orderDate, totalItems3D: 0, printed: 0, printing: 0, totalMinutes: 0,
          });
        }
        const entry = orderMap.get(o.orderId)!;
        entry.totalItems3D += o.total;
        entry.printed += o.printed;
        entry.printing += o.printing;
        entry.totalMinutes += (o.total - o.printed - o.printing) * g.printTimeMinutes;
      }
    }

    const sorted = Array.from(orderMap.values()).sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let cumulativeMinutes = 0;
    return sorted.map(o => {
      const remaining = o.totalItems3D - o.printed - o.printing;
      cumulativeMinutes += o.totalMinutes;
      const adjusted = settings.printerCount > 1 ? cumulativeMinutes / settings.printerCount : cumulativeMinutes;
      const days = settings.workHoursPerDay > 0 ? adjusted / 60 / settings.workHoursPerDay : 0;
      const estDate = new Date();
      estDate.setDate(estDate.getDate() + Math.ceil(days));
      return {
        orderId: o.orderId, orderNumber: o.orderNumber, customerName: o.customerName,
        totalItems3D: o.totalItems3D, printed: o.printed, printing: o.printing,
        remaining, remainingMinutes: o.totalMinutes, estimatedDate: formatDate(estDate),
        cumulativeMinutes: adjusted,
      };
    });
  }, [productGroups, settings]);

  // Update a single item's printed/printing counts
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

  const toggleProduct = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
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

  const total = totals.pending + totals.printing + totals.printed;
  const hasItems = total > 0;

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
            <p className="text-sm text-slate-500">Gestión de impresiones 3D pendientes</p>
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
            <span className="font-semibold">{totals.printed}/{total} piezas</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
            {totals.printed > 0 && (
              <div className="bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                style={{ width: `${(totals.printed / total) * 100}%` }} />
            )}
            {totals.printing > 0 && (
              <div className="bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-500"
                style={{ width: `${(totals.printing / total) * 100}%` }} />
            )}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Impresos</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Imprimiendo</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-200" /> Pendientes</span>
          </div>
        </div>
      )}

      {/* Product Groups */}
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
            <Package size={18} /> Productos por Imprimir
          </h2>
          {productGroups.map(group => {
            const isExpanded = expandedProducts.has(group.productId);
            const remainingMinutes = (group.pendingUnits + group.printingUnits * 0.5) * group.printTimeMinutes;
            const allDone = group.pendingUnits === 0 && group.printingUnits === 0;

            return (
              <div key={group.productId} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-colors ${allDone ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200'}`}>
                {/* Product header */}
                <button onClick={() => toggleProduct(group.productId)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-slate-50/50 transition-colors text-left">
                  {group.imageUrl ? (
                    <img src={group.imageUrl} alt={group.productName} className="w-12 h-12 rounded-xl object-cover border border-slate-200 flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Package className="text-slate-400" size={20} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-800 truncate">{group.productName}</h3>
                      <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full flex-shrink-0">x{group.totalUnits}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      {group.pendingUnits > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{group.pendingUnits} pend.</span>}
                      {group.printingUnits > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{group.printingUnits} impr.</span>}
                      {group.printedUnits > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{group.printedUnits} listos</span>}
                      {group.printTimeMinutes > 0 && <span className="text-slate-400">· {formatTime(group.printTimeMinutes)}/ud</span>}
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex mt-2 max-w-xs">
                      {group.printedUnits > 0 && <div className="bg-emerald-500 transition-all duration-300" style={{ width: `${(group.printedUnits / group.totalUnits) * 100}%` }} />}
                      {group.printingUnits > 0 && <div className="bg-blue-500 transition-all duration-300" style={{ width: `${(group.printingUnits / group.totalUnits) * 100}%` }} />}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {remainingMinutes > 0 && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 justify-end"><Clock size={12} /> {formatTime(remainingMinutes)}</p>
                    )}
                    {allDone && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={12} /> Listo
                      </span>
                    )}
                  </div>
                  {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                </button>

                {/* Expanded: per-order breakdown */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50">
                    {group.orders
                      .sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime())
                      .map(o => {
                        const pending = o.total - o.printed - o.printing;
                        return (
                          <div key={`${o.orderId}-${o.itemIndex}`} className="px-4 py-3 border-b border-slate-100 last:border-b-0">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-700">Pedido #{o.orderNumber}</span>
                                <span className="text-xs text-slate-500">({o.customerName})</span>
                                <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">x{o.total}</span>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Printed control */}
                              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-1.5">
                                <CheckCircle2 size={14} className="text-emerald-600" />
                                <span className="text-xs font-medium text-emerald-700">Impresos</span>
                                <div className="flex items-center gap-1 ml-1">
                                  <button onClick={() => unmarkOnePrinted(o.orderId, o.itemIndex)} disabled={o.printed <= 0}
                                    className="w-6 h-6 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                    <Minus size={12} />
                                  </button>
                                  <span className="text-sm font-bold text-emerald-700 min-w-[20px] text-center">{o.printed}</span>
                                  <button onClick={() => markOnePrinted(o.orderId, o.itemIndex)} disabled={o.printed + o.printing >= o.total}
                                    className="w-6 h-6 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                    <Plus size={12} />
                                  </button>
                                </div>
                              </div>
                              {/* Printing control */}
                              <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl px-2.5 py-1.5">
                                <Loader2 size={14} className="text-blue-600" />
                                <span className="text-xs font-medium text-blue-700">Imprimiendo</span>
                                <div className="flex items-center gap-1 ml-1">
                                  <button onClick={() => unmarkOnePrinting(o.orderId, o.itemIndex)} disabled={o.printing <= 0}
                                    className="w-6 h-6 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                    <Minus size={12} />
                                  </button>
                                  <span className="text-sm font-bold text-blue-700 min-w-[20px] text-center">{o.printing}</span>
                                  <button onClick={() => markOnePrinting(o.orderId, o.itemIndex)} disabled={pending <= 0}
                                    className="w-6 h-6 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                    <Plus size={12} />
                                  </button>
                                </div>
                              </div>
                              {/* Pending badge */}
                              {pending > 0 && (
                                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5">
                                  <CircleDot size={14} className="text-amber-600" />
                                  <span className="text-xs font-medium text-amber-700">Pendientes</span>
                                  <span className="text-sm font-bold text-amber-700">{pending}</span>
                                </div>
                              )}
                              {o.printed === o.total && (
                                <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full flex items-center gap-1">
                                  <CheckCircle2 size={12} /> Completo
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

      {/* Order Estimates */}
      {orderEstimates.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
            <CalendarDays size={18} className="text-indigo-600" /> Estimación por Pedido
          </h2>
          <div className="space-y-3">
            {orderEstimates.map(est => {
              const allDone = est.remaining === 0 && est.printing === 0;
              return (
                <div key={est.orderId}
                  className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-xl transition-colors ${allDone ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-100'}`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-semibold text-slate-800 text-sm">#{est.orderNumber}</span>
                    <span className="text-sm text-slate-600 truncate">{est.customerName}</span>
                    <span className="text-xs text-slate-400 bg-slate-200/50 px-1.5 py-0.5 rounded flex-shrink-0">
                      {est.printed}/{est.totalItems3D} piezas
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {!allDone && (
                      <>
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock size={12} /> {formatTime(est.remainingMinutes)}
                        </span>
                        <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CalendarDays size={12} /> {est.estimatedDate}
                        </span>
                      </>
                    )}
                    {allDone && (
                      <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 size={14} /> Todo impreso
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Suggestion text */}
          {orderEstimates.some(e => e.remaining > 0) && (
            <div className="mt-4 p-3 rounded-xl bg-indigo-50 border border-indigo-200">
              <p className="text-sm text-indigo-800 flex items-start gap-2">
                <TrendingUp size={16} className="flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Sugerencia:</strong> Con {settings.printerCount} impresora{settings.printerCount > 1 ? 's' : ''} trabajando {settings.workHoursPerDay}h/día,
                  estimás terminar toda la cola en <strong>~{totals.estimatedDays.toFixed(1)} días ({formatTime(totals.adjustedMinutes)})</strong>.
                  {orderEstimates.length > 0 && ` El pedido más urgente (#${orderEstimates[0].orderNumber}) estaría listo ${orderEstimates[0].estimatedDate.toLowerCase()}.`}
                </span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
