import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Order } from '../../types/order';
import type { Product } from '../../types/product';
import type { PricingSettings3D, BusinessSettings } from '../../types/settings';
import { generateBalancePDF } from '../../services/pdfService';
import { calculate3DCostBreakdown } from '../../services/pricingService';
import { 
  BarChart3, TrendingUp, TrendingDown, DollarSign, 
  RefreshCw, ShoppingBag, CreditCard, Award, 
  Sparkles, ShieldCheck
} from 'lucide-react';

const defaultSettings3D: PricingSettings3D = {
  filamentPriceUsdKg: 20,
  kwhPriceArs: 150,
  printerWatts: 300,
  printerLifespanHours: 8000,
  estimatedSparesCostArs: 60000,
  errorMarginPercent: 10,
  multiplierRetailNormal: 3,
  multiplierRetailKeychain: 4,
  wholesaleDiscountPercentNormal: 20,
  wholesaleDiscountPercentKeychain: 25,
  wholesaleThresholdGramsNormal: 500,
  wholesaleThresholdGramsKeychain: 100,
};

const defaultBusinessSettings: BusinessSettings = {
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
};

export const Balance: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings3d, setSettings3d] = useState<PricingSettings3D>(defaultSettings3D);
  const [business, setBusiness] = useState<BusinessSettings>(defaultBusinessSettings);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [filterType, setFilterType] = useState<'day' | 'week' | 'month' | 'year' | 'all' | 'custom'>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Orders
      const ordersSnap = await getDocs(query(collection(db, 'orders')));
      const loadedOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setOrders(loadedOrders);

      // 2. Fetch Products (for 3D cost proportion mapping)
      const productsSnap = await getDocs(query(collection(db, 'products')));
      setProducts(productsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));

      // 3. Fetch 3D Pricing Settings
      const settingsSnap = await getDoc(doc(db, 'settings', 'pricing3d'));
      if (settingsSnap.exists()) {
        setSettings3d(settingsSnap.data() as PricingSettings3D);
      }

      // 4. Fetch Business Settings
      const bizSnap = await getDoc(doc(db, 'settings', 'business'));
      if (bizSnap.exists()) {
        setBusiness(bizSnap.data() as BusinessSettings);
      }
    } catch (error) {
      console.error('Error fetching balance data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filterOrders = (ordersList: Order[]) => {
    const now = new Date();
    let startLimit: Date | null = null;
    let endLimit: Date | null = null;

    if (filterType === 'day') {
      startLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      endLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (filterType === 'week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Start week on Monday
      startLimit = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0);
      endLimit = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59);
    } else if (filterType === 'month') {
      startLimit = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      endLimit = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (filterType === 'year') {
      startLimit = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
      endLimit = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    } else if (filterType === 'custom') {
      if (customStart) {
        startLimit = new Date(customStart + 'T00:00:00');
      }
      if (customEnd) {
        endLimit = new Date(customEnd + 'T23:59:59');
      }
    }

    return ordersList.filter(order => {
      if (order.orderStatus === 'cancelled') return false;
      const orderDate = new Date(order.date);
      if (startLimit && orderDate < startLimit) return false;
      if (endLimit && orderDate > endLimit) return false;
      return true;
    });
  };

  const getPeriodLabel = () => {
    const now = new Date();
    if (filterType === 'day') return `Hoy (${now.toLocaleDateString('es-AR')})`;
    if (filterType === 'week') return 'Esta Semana';
    if (filterType === 'month') return `Este Mes (${now.toLocaleString('es-AR', { month: 'long', year: 'numeric' })})`;
    if (filterType === 'year') return `Año ${now.getFullYear()}`;
    if (filterType === 'all') return 'Todo el Período';
    if (filterType === 'custom') {
      return `Personalizado: ${customStart || 'Inicio'} al ${customEnd || 'Fin'}`;
    }
    return '';
  };

  const activeOrders = filterOrders(orders);

  // Financial calculations
  let totalRevenue = 0;
  let totalCost = 0;
  let totalProfit = 0;
  let totalPaid = 0;
  let totalPending = 0;
  let totalSignals = 0;
  let totalCommissionsPeriod = 0;

  // 3D Specifics
  let revenue3D = 0;
  let cost3D = 0;
  let profit3D = 0;
  let paid3D = 0;
  let pending3D = 0;
  let signals3D = 0;

  let cost3DDetails = {
    filament: 0,
    electricity: 0,
    maintenance: 0,
    supplies: 0,
    errorMargin: 0,
  };

  // Resale Specifics
  let revenueResale = 0;
  let costResale = 0;
  let profitResale = 0;
  let paidResale = 0;
  let pendingResale = 0;
  let signalsResale = 0;

  // Product & Client Aggregations
  const productStats: Record<string, { name: string; quantity: number; revenue: number; cost: number; profit: number }> = {};
  const clientStats: Record<string, { name: string; purchased: number; debt: number }> = {};

  activeOrders.forEach(order => {
    totalRevenue += order.totalAmount;
    totalCost += order.totalCost;
    totalProfit += order.totalProfit;
    totalPaid += order.paidAmount;
    totalPending += order.pendingAmount;

    if (order.paymentStatus === 'partial') {
      totalSignals += order.paidAmount;
    }

    totalCommissionsPeriod += order.commissionAmount || 0;

    // Client aggregation
    if (!clientStats[order.customerId]) {
      clientStats[order.customerId] = { name: order.customerName, purchased: 0, debt: 0 };
    }
    clientStats[order.customerId].purchased += order.totalAmount;
    clientStats[order.customerId].debt += order.pendingAmount;

    // Split order revenue by product types
    const order3DRevenue = order.items
      .filter(item => item.type === '3d')
      .reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);
      
    const orderResaleRevenue = order.items
      .filter(item => item.type === 'resale')
      .reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);

    const payRatio = order.totalAmount > 0 ? (order.paidAmount / order.totalAmount) : 0;
    const pendingRatio = order.totalAmount > 0 ? (order.pendingAmount / order.totalAmount) : 0;

    paid3D += order3DRevenue * payRatio;
    pending3D += order3DRevenue * pendingRatio;
    if (order.paymentStatus === 'partial') {
      signals3D += order3DRevenue * payRatio;
    }

    paidResale += orderResaleRevenue * payRatio;
    pendingResale += orderResaleRevenue * pendingRatio;
    if (order.paymentStatus === 'partial') {
      signalsResale += orderResaleRevenue * payRatio;
    }

    // Process items for cost breakdowns
    order.items.forEach(item => {
      // Product Stats
      if (!productStats[item.productId]) {
        productStats[item.productId] = { name: item.name, quantity: 0, revenue: 0, cost: 0, profit: 0 };
      }
      productStats[item.productId].quantity += item.quantity;
      productStats[item.productId].revenue += item.unitPrice * item.quantity;
      productStats[item.productId].cost += item.unitCost * item.quantity;
      productStats[item.productId].profit += item.unitProfit * item.quantity;

      const itemCostTotal = item.unitCost * item.quantity;

      if (item.type === '3d') {
        revenue3D += item.unitPrice * item.quantity;
        cost3D += itemCostTotal;
        profit3D += item.unitProfit * item.quantity;

        const originalProd = products.find(p => p.id === item.productId);
        if (originalProd && originalProd.type === '3d') {
          const rate = order.exchangeRateUsdUsed || 1000;
          const breakdown = calculate3DCostBreakdown(
            originalProd,
            settings3d,
            { currentUsdToArs: rate, lastUpdate: '', provider: '' }
          );
          const unitBreakdownTotal = breakdown.total * item.quantity;

          if (unitBreakdownTotal > 0) {
            const factor = itemCostTotal / unitBreakdownTotal;
            cost3DDetails.filament += breakdown.filament * item.quantity * factor;
            cost3DDetails.electricity += breakdown.electricity * item.quantity * factor;
            cost3DDetails.maintenance += breakdown.maintenance * item.quantity * factor;
            cost3DDetails.supplies += breakdown.supplies * item.quantity * factor;
            cost3DDetails.errorMargin += breakdown.errorMargin * item.quantity * factor;
          } else {
            cost3DDetails.filament += itemCostTotal * 0.70;
            cost3DDetails.electricity += itemCostTotal * 0.12;
            cost3DDetails.maintenance += itemCostTotal * 0.13;
            cost3DDetails.errorMargin += itemCostTotal * 0.05;
          }
        } else {
          cost3DDetails.filament += itemCostTotal * 0.70;
          cost3DDetails.electricity += itemCostTotal * 0.12;
          cost3DDetails.maintenance += itemCostTotal * 0.13;
          cost3DDetails.errorMargin += itemCostTotal * 0.05;
        }
      } else {
        revenueResale += item.unitPrice * item.quantity;
        costResale += itemCostTotal;
        profitResale += item.unitProfit * item.quantity;
      }
    });
  });

  // Calculate Aggregated Metrics
  const orderCount = activeOrders.length;
  const ticketAverage = orderCount > 0 ? (totalRevenue / orderCount) : 0;
  const adjustedNetProfit = totalProfit - totalCommissionsPeriod;

  // Sorting products
  const productsArray = Object.keys(productStats).map(id => ({ id, ...productStats[id] }));
  const topSoldProduct = productsArray.length > 0 ? [...productsArray].sort((a, b) => b.quantity - a.quantity)[0] : null;
  const leastSoldProduct = productsArray.length > 0 ? [...productsArray].sort((a, b) => a.quantity - b.quantity)[0] : null;
  const topProfitProduct = productsArray.length > 0 ? [...productsArray].sort((a, b) => b.profit - a.profit)[0] : null;
  const topMarginProduct = productsArray.length > 0 ? [...productsArray]
    .map(p => ({ ...p, margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0 }))
    .sort((a, b) => b.margin - a.margin)[0] : null;
  const leastMarginProduct = productsArray.length > 0 ? [...productsArray]
    .map(p => ({ ...p, margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0 }))
    .sort((a, b) => a.margin - b.margin)[0] : null;

  // Sorting clients
  const clientsArray = Object.keys(clientStats).map(id => ({ id, ...clientStats[id] }));
  const topClient = clientsArray.length > 0 ? [...clientsArray].sort((a, b) => b.purchased - a.purchased)[0] : null;
  const topDebtClient = clientsArray.length > 0 ? [...clientsArray].sort((a, b) => b.debt - a.debt)[0] : null;

  // Package bundle for PDF
  const balancePacket = {
    totalRevenue,
    totalCost,
    totalProfit,
    totalPaid,
    totalPending,
    totalSignals,
    totalCommissionsPeriod,
    adjustedNetProfit,
    revenue3D,
    profit3D,
    paid3D,
    pending3D,
    signals3D,
    cost3DDetails,
    revenueResale,
    costResale,
    profitResale,
    paidResale,
    pendingResale,
    signalsResale,
    orderCount,
    ticketAverage,
    topSoldProduct,
    leastSoldProduct,
    topProfitProduct,
    topMarginProduct,
    topClient,
    topDebtClient
  };

  const handleDownloadPDF = () => {
    generateBalancePDF(balancePacket, getPeriodLabel(), business, activeOrders);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <BarChart3 size={26} className="text-blue-600" />
            Balance Financiero
          </h1>
          <p className="page-subtitle">
            Monitoreo real de ingresos, costos de filamento/energía y rentabilidad del negocio.
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={fetchData}
            className="btn-secondary p-2.5 flex items-center justify-center rounded-xl"
            title="Sincronizar Datos"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={handleDownloadPDF} 
            disabled={loading || orderCount === 0}
            className="btn-primary flex items-center justify-center gap-2 flex-1 md:flex-initial"
          >
            <BarChart3 size={18} />
            Descargar Reporte PDF
          </button>
        </div>
      </div>

      {/* Period Filter Buttons */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {(['day', 'week', 'month', 'year', 'all', 'custom'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 py-2 text-xs font-semibold rounded-xl capitalize transition-all ${
                filterType === type 
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {type === 'day' ? 'Hoy' :
               type === 'week' ? 'Semana' :
               type === 'month' ? 'Mes' :
               type === 'year' ? 'Año' :
               type === 'all' ? 'Todo' : 'Personalizado'}
            </button>
          ))}
        </div>
        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
          {getPeriodLabel()}
        </span>
      </div>

      {/* Custom Date Range Picker */}
      {filterType === 'custom' && (
        <div className="card p-4 bg-slate-50 border border-slate-200/80 flex flex-wrap gap-4 items-end animate-fadeIn">
          <div className="flex-1 min-w-[200px]">
            <label className="input-label text-xs font-bold text-slate-500 uppercase">Fecha Desde</label>
            <input 
              type="date" 
              className="input w-full mt-1.5"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="input-label text-xs font-bold text-slate-500 uppercase">Fecha Hasta</label>
            <input 
              type="date" 
              className="input w-full mt-1.5"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-24 text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500 font-medium">Recopilando registros históricos...</p>
        </div>
      ) : orderCount === 0 ? (
        <div className="card p-16 text-center text-slate-400 border-dashed border-2 border-slate-200">
          <ShoppingBag size={48} className="mx-auto text-slate-300 mb-3" />
          <h3 className="text-base font-bold text-slate-600">Sin datos comerciales</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            No se registraron ventas válidas en el período seleccionado.
          </p>
        </div>
      ) : (
        <>
          {/* Main KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI: Ingresos */}
            <div className="card p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 text-white shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl -mr-4 -mt-4" />
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <TrendingUp size={14} className="text-blue-400" />
                Ingresos Brutos
              </p>
              <p className="text-2xl font-black">${totalRevenue.toLocaleString('es-AR')}</p>
              <div className="text-[10px] text-slate-500 mt-2 flex justify-between">
                <span>Cobrado: ${totalPaid.toLocaleString('es-AR')}</span>
                <span>Faltan: ${totalPending.toLocaleString('es-AR')}</span>
              </div>
            </div>

            {/* KPI: Costos */}
            <div className="card p-5 bg-white border border-slate-200/80 shadow-sm relative overflow-hidden">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <TrendingDown size={14} className="text-red-500" />
                Costos Totales
              </p>
              <p className="text-2xl font-black text-slate-800">-${totalCost.toLocaleString('es-AR')}</p>
              <div className="text-[10px] text-slate-500 mt-2">
                <span>3D: ${cost3D.toLocaleString('es-AR')}</span>
                <span className="mx-1.5">|</span>
                <span>Reventa: ${costResale.toLocaleString('es-AR')}</span>
              </div>
            </div>

            {/* KPI: Ganancia */}
            <div className="card p-5 bg-emerald-50/50 border border-emerald-200/60 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-lg" />
              <p className="text-emerald-800/80 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <DollarSign size={14} className="text-emerald-600" />
                Ganancia Neta Real
              </p>
              <p className="text-2xl font-black text-emerald-700">${adjustedNetProfit.toLocaleString('es-AR')}</p>
              <div className="text-[10px] text-emerald-600 mt-2 space-y-0.5 font-semibold">
                <div className="flex justify-between">
                  <span>Ganancia Bruta:</span>
                  <span>${totalProfit.toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between border-t border-emerald-200/40 pt-0.5">
                  <span>Comisiones:</span>
                  <span>-${totalCommissionsPeriod.toLocaleString('es-AR')}</span>
                </div>
                <div className="flex items-center gap-1 text-[9px] pt-1 text-emerald-500 font-bold border-t border-emerald-200/40 mt-1">
                  <Sparkles size={11} className="flex-shrink-0" /> Margen neto: {totalRevenue > 0 ? ((adjustedNetProfit / totalRevenue) * 100).toFixed(1) : 0}%
                </div>
              </div>
            </div>

            {/* KPI: Cuentas por Cobrar */}
            <div className="card p-5 bg-amber-50/50 border border-amber-200/60 shadow-sm relative overflow-hidden">
              <p className="text-amber-800/80 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <CreditCard size={14} className="text-amber-600" />
                Deudas Activas
              </p>
              <p className="text-2xl font-black text-amber-700">${totalPending.toLocaleString('es-AR')}</p>
              <p className="text-[10px] text-amber-600 mt-2 font-semibold">
                Señas recibidas en partial: ${totalSignals.toLocaleString('es-AR')}
              </p>
            </div>
          </div>

          {/* Ticket Average & Volume Row */}
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 flex flex-col md:flex-row justify-around gap-6 items-center">
            <div className="text-center md:text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cantidad Pedidos</span>
              <p className="text-xl font-extrabold text-slate-700 mt-0.5">{orderCount} ventas</p>
            </div>
            <div className="h-8 w-px bg-slate-200 hidden md:block" />
            <div className="text-center md:text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ticket Promedio</span>
              <p className="text-xl font-extrabold text-slate-700 mt-0.5">${ticketAverage.toLocaleString('es-AR')}</p>
            </div>
            <div className="h-8 w-px bg-slate-200 hidden md:block" />
            <div className="text-center md:text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Línea Mayorista</span>
              <p className="text-xl font-extrabold text-slate-700 mt-0.5">
                {activeOrders.filter(o => o.items.some(i => i.appliedWholesale)).length} mayoristas
              </p>
            </div>
          </div>

          {/* Line breakdown 3D vs Resale */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* 3D Printing Balance */}
            <div className="card p-6 border border-slate-200/80 shadow-sm space-y-5">
              <div className="flex justify-between items-center border-b pb-3">
                <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  Impresión 3D
                </h3>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                  {revenue3D > 0 ? ((revenue3D / totalRevenue) * 100).toFixed(0) : 0}% de ingresos
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Ventas 3D</span>
                  <p className="text-lg font-extrabold text-slate-700 mt-0.5">${revenue3D.toLocaleString('es-AR')}</p>
                </div>
                <div className="bg-emerald-50/40 p-3 rounded-xl">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase">Ganancia Neta</span>
                  <p className="text-lg font-extrabold text-emerald-700 mt-0.5">${profit3D.toLocaleString('es-AR')}</p>
                </div>
              </div>

              {/* Proportional Cost details */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Detalle Proporcional de Costos</h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Material (Filamento):</span>
                    <span className="font-semibold text-slate-800">${cost3DDetails.filament.toLocaleString('es-AR', {maximumFractionDigits: 0})}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Electricidad (KWh):</span>
                    <span className="font-semibold text-slate-800">${cost3DDetails.electricity.toLocaleString('es-AR', {maximumFractionDigits: 0})}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Mantenimiento & Repuestos:</span>
                    <span className="font-semibold text-slate-800">${cost3DDetails.maintenance.toLocaleString('es-AR', {maximumFractionDigits: 0})}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Insumos adicionales:</span>
                    <span className="font-semibold text-slate-800">${cost3DDetails.supplies.toLocaleString('es-AR', {maximumFractionDigits: 0})}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Margen de error:</span>
                    <span className="font-semibold text-slate-800">${cost3DDetails.errorMargin.toLocaleString('es-AR', {maximumFractionDigits: 0})}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-800 border-t pt-1.5 mt-2">
                    <span>Costo Real Consumido:</span>
                    <span>${cost3D.toLocaleString('es-AR')}</span>
                  </div>
                </div>
              </div>

              {/* Status details */}
              <div className="flex justify-between text-xs text-slate-500 border-t pt-3">
                <span>Efectivo Cobrado: ${paid3D.toLocaleString('es-AR')}</span>
                <span>Pendiente: ${pending3D.toLocaleString('es-AR')}</span>
              </div>
            </div>

            {/* Resale Balance */}
            <div className="card p-6 border border-slate-200/80 shadow-sm space-y-5">
              <div className="flex justify-between items-center border-b pb-3">
                <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  Productos de Reventa
                </h3>
                <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-lg">
                  {revenueResale > 0 ? ((revenueResale / totalRevenue) * 100).toFixed(0) : 0}% de ingresos
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Ventas Reventa</span>
                  <p className="text-lg font-extrabold text-slate-700 mt-0.5">${revenueResale.toLocaleString('es-AR')}</p>
                </div>
                <div className="bg-emerald-50/40 p-3 rounded-xl">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase">Ganancia Neta</span>
                  <p className="text-lg font-extrabold text-emerald-700 mt-0.5">${profitResale.toLocaleString('es-AR')}</p>
                </div>
              </div>

              {/* Cost details */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Estructura Financiera</h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Costo de Compra (Costo Proveedor):</span>
                    <span className="font-semibold text-slate-800">${costResale.toLocaleString('es-AR')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Margen de Ganancia Promedio:</span>
                    <span className="font-semibold text-slate-800">
                      {revenueResale > 0 ? ((profitResale / revenueResale) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-800 border-t pt-1.5 mt-2">
                    <span>Ganancia Bruta:</span>
                    <span>${profitResale.toLocaleString('es-AR')}</span>
                  </div>
                </div>
              </div>

              {/* Status details */}
              <div className="flex justify-between text-xs text-slate-500 border-t pt-3">
                <span>Efectivo Cobrado: ${paidResale.toLocaleString('es-AR')}</span>
                <span>Pendiente: ${pendingResale.toLocaleString('es-AR')}</span>
              </div>
            </div>
          </div>

          {/* Business Insights (Top Products / Top Clients) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Products Cards */}
            <div className="card p-6 border border-slate-200/80 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 border-b pb-2">
                <Award size={16} className="text-blue-500" />
                Auditoría de Productos
              </h3>
              
              <div className="space-y-3.5">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <p className="text-slate-400">Más Vendido (Volumen)</p>
                    <p className="font-bold text-slate-800 mt-0.5">{topSoldProduct?.name || '—'}</p>
                  </div>
                  <span className="badge-blue text-[10px]">{topSoldProduct?.quantity || 0} unidades</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <div>
                    <p className="text-slate-400">Menos Vendido</p>
                    <p className="font-bold text-slate-800 mt-0.5">{leastSoldProduct?.name || '—'}</p>
                  </div>
                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">
                    {leastSoldProduct?.quantity || 0} unidades
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <div>
                    <p className="text-slate-400">Mayor Ganancia Generada</p>
                    <p className="font-bold text-slate-800 mt-0.5">{topProfitProduct?.name || '—'}</p>
                  </div>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold">
                    +${topProfitProduct?.profit.toLocaleString('es-AR') || 0}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <div>
                    <p className="text-slate-400">Mayor Margen Rentabilidad</p>
                    <p className="font-bold text-slate-800 mt-0.5">{topMarginProduct?.name || '—'}</p>
                  </div>
                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded text-[10px] font-bold">
                    {topMarginProduct?.margin.toFixed(1) || 0}%
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <div>
                    <p className="text-slate-400">Menor Margen Rentabilidad</p>
                    <p className="font-bold text-slate-800 mt-0.5">{leastMarginProduct?.name || '—'}</p>
                  </div>
                  <span className="bg-red-50 text-red-700 border border-red-100 px-2 py-0.5 rounded text-[10px] font-bold">
                    {leastMarginProduct?.margin.toFixed(1) || 0}%
                  </span>
                </div>
              </div>
            </div>

            {/* Top Clients Cards */}
            <div className="card p-6 border border-slate-200/80 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 border-b pb-2">
                <ShieldCheck size={16} className="text-emerald-500" />
                Auditoría de Clientes
              </h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <p className="text-slate-400">Cliente con Mayor Compra</p>
                    <p className="font-bold text-slate-800 mt-0.5">{topClient?.name || '—'}</p>
                  </div>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded text-[11px] font-bold">
                    ${topClient?.purchased.toLocaleString('es-AR') || 0}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <div>
                    <p className="text-slate-400">Cliente con Mayor Deuda Activa</p>
                    <p className="font-bold text-red-600 mt-0.5">{topDebtClient?.name || '—'}</p>
                  </div>
                  <span className="bg-red-50 text-red-700 border border-red-100 px-2.5 py-1 rounded text-[11px] font-bold">
                    ${topDebtClient?.debt.toLocaleString('es-AR') || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
