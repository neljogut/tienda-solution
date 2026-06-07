import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import type { Order } from '../types/order';
import type { Product } from '../types/product';
import { 
  DollarSign, ShoppingCart, TrendingUp, AlertCircle, Package, 
  Users, Clock, CheckCircle, Truck, ArrowRight, Plus,
  BarChart3, Wallet, XCircle, Flame, Loader2
} from 'lucide-react';
import { fetchDollarRate } from '../services/dollarService';
import type { ExchangeRateData, PricingSettingsResale } from '../types/settings';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateData | null>(null);
  const [resaleSettings, setResaleSettings] = useState<PricingSettingsResale | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch exchange rate once on mount to keep it fresh
    fetchDollarRate().catch(console.error);

    let loadedCount = 0;
    const checkLoading = () => {
      loadedCount++;
      if (loadedCount >= 3) setLoading(false);
    };

    // Listen to exchange rate in real-time
    const rateUnsub = onSnapshot(doc(db, 'settings', 'exchangeRate'), (snap) => {
      if (snap.exists()) {
        setExchangeRate(snap.data() as ExchangeRateData);
      }
    });

    // Listen to resale pricing settings (for highlightOrderAboveArs threshold)
    const resaleUnsub = onSnapshot(doc(db, 'settings', 'pricingResale'), (snap) => {
      if (snap.exists()) {
        setResaleSettings(snap.data() as PricingSettingsResale);
      }
    });

    // Listen to orders
    const ordersUnsub = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const o: Order[] = [];
      snapshot.forEach((doc) => o.push({ id: doc.id, ...doc.data() } as Order));
      setOrders(o);
      checkLoading();
    });

    // Listen to products
    const prodsUnsub = onSnapshot(collection(db, 'products'), (snapshot) => {
      const p: Product[] = [];
      snapshot.forEach((doc) => p.push({ id: doc.id, ...doc.data() } as Product));
      setProducts(p);
      checkLoading();
    });

    // Initial load timer (fallback)
    const t = setTimeout(() => { setLoading(false); checkLoading(); }, 3000);

    return () => { 
      rateUnsub(); 
      ordersUnsub(); 
      prodsUnsub(); 
      resaleUnsub();
      clearTimeout(t);
    };
  }, []);

  // ─── Use LOCAL time for date filtering (not UTC) ───
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // ─── Exclude cancelled orders from financial calculations ───
  const activeOrders = orders.filter(o => o.orderStatus !== 'cancelled');

  const todayOrders = activeOrders.filter(o => o.date?.startsWith(today));
  const monthOrders = activeOrders.filter(o => o.date?.startsWith(thisMonth));

  const salesToday = todayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const salesMonth = monthOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const totalPending = activeOrders.reduce((sum, o) => sum + (o.pendingAmount || 0), 0);

  // Order status counts (all orders, including cancelled for the status breakdown)
  const pendingOrders = orders.filter(o => o.orderStatus === 'pending').length;
  const processingOrders = orders.filter(o => o.orderStatus === 'processing').length;
  const finishedOrders = orders.filter(o => o.orderStatus === 'finished').length;
  const deliveredOrders = orders.filter(o => o.orderStatus === 'delivered').length;
  const cancelledOrders = orders.filter(o => o.orderStatus === 'cancelled').length;

  // Top products — keychains count as 1 per order line (sell in bulk), rest count by qty
  const productSalesMap = new Map<string, { name: string; qty: number; revenue: number }>();
  activeOrders.forEach(order => {
    order.items?.forEach(item => {
      const existing = productSalesMap.get(item.productId) || { name: item.name, qty: 0, revenue: 0 };
      const prod = products.find(p => p.id === item.productId);
      const isKeychain = prod && prod.type === '3d' && (prod as any).isKeychain;
      existing.qty += isKeychain ? 1 : item.quantity;
      existing.revenue += item.unitPrice * item.quantity;
      productSalesMap.set(item.productId, existing);
    });
  });
  const topProducts = [...productSalesMap.entries()]
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 5);

  // Low stock alerts
  const lowStockProducts = products.filter(p => (p.stock || 0) <= 3 && p.isActive);

  // ─── Highlighted / Big purchases (this month, above threshold) ───
  const highlightThreshold = resaleSettings?.wholesaleMinimumOrderArs || 0;
  const highlightedOrders = highlightThreshold > 0
    ? monthOrders
        .filter(o => (o.totalAmount || 0) >= highlightThreshold)
        .sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0))
        .slice(0, 5)
    : [];

  // Quick actions
  const quickActions = [
    { label: 'Nuevo Pedido', icon: Plus, path: '/orders/new', color: 'from-blue-500 to-indigo-600' },
    { label: 'Agregar Producto', icon: Package, path: '/admin/products/new', color: 'from-emerald-500 to-green-600' },
    { label: 'Agregar Cliente', icon: Users, path: '/clients', color: 'from-violet-500 to-purple-600' },
    { label: 'Ver Balance', icon: BarChart3, path: '/balance', color: 'from-amber-500 to-orange-600' },
  ];

  const recentOrders = [...orders].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 animate-fadeIn">
        <Loader2 size={40} className="text-blue-500 animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Cargando dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Resumen general del negocio</p>
        </div>
        {exchangeRate && (
          <div className="badge-blue flex items-center gap-2 text-sm">
            <DollarSign size={14} />
            USD: ${exchangeRate.currentUsdToArs.toLocaleString('es-AR')}
            <span className="text-[10px] opacity-70">({exchangeRate.provider})</span>
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Ventas del Día" value={`$${salesToday.toLocaleString('es-AR')}`} icon={DollarSign} color="emerald" />
        <StatCard title="Ventas del Mes" value={`$${salesMonth.toLocaleString('es-AR')}`} icon={TrendingUp} color="blue" />
        <StatCard title="Pendiente de Cobro" value={`$${totalPending.toLocaleString('es-AR')}`} icon={Wallet} color="amber" />
        <StatCard title="Total Pedidos" value={activeOrders.length.toString()} icon={ShoppingCart} color="violet" />
      </div>

      {/* Order Status Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <MiniStat label="Pendientes" value={pendingOrders} icon={Clock} className="text-amber-600 bg-amber-50" />
        <MiniStat label="En Proceso" value={processingOrders} icon={Package} className="text-blue-600 bg-blue-50" />
        <MiniStat label="Terminados" value={finishedOrders} icon={CheckCircle} className="text-emerald-600 bg-emerald-50" />
        <MiniStat label="Entregados" value={deliveredOrders} icon={Truck} className="text-purple-600 bg-purple-50" />
        <MiniStat label="Cancelados" value={cancelledOrders} icon={XCircle} className="text-red-600 bg-red-50" />
      </div>

      {/* Highlighted Purchases */}
      {highlightedOrders.length > 0 && (
        <div className="card p-5 border-l-4 border-l-orange-400 bg-gradient-to-r from-orange-50/50 to-amber-50/30">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-md">
              <Flame size={16} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Compras Destacadas</h3>
              <p className="text-[11px] text-slate-400">
                Pedidos del mes que superan ${highlightThreshold.toLocaleString('es-AR')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {highlightedOrders.map(order => (
              <div key={order.id} className="flex items-center gap-3 p-3 rounded-xl bg-white border border-orange-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  #{order.orderNumber}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{order.customerName}</p>
                  <p className="text-[11px] text-slate-400">
                    {new Date(order.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
                <span className="text-sm font-extrabold text-orange-600">
                  ${(order.totalAmount || 0).toLocaleString('es-AR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="card p-5">
          <h3 className="font-bold text-slate-800 mb-4">Accesos Rápidos</h3>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button 
                  key={action.path}
                  onClick={() => navigate(action.path)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 hover:border-slate-200 transition-all group"
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform`}>
                    <Icon size={20} />
                  </div>
                  <span className="text-xs font-semibold text-slate-600">{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Top Products */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">Top Productos</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Más Vendidos</span>
          </div>
          {topProducts.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Sin ventas registradas aún</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map(([id, data], i) => (
                <div key={id} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{data.name}</p>
                    <p className="text-[11px] text-slate-400">{data.qty} vendidos</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600">${data.revenue.toLocaleString('es-AR')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">Últimos Pedidos</h3>
            <button onClick={() => navigate('/orders')} className="text-xs text-blue-600 font-semibold flex items-center gap-1 hover:text-blue-700">
              Ver todos <ArrowRight size={12} />
            </button>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Sin pedidos aún</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map(order => (
                <div key={order.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-700">#{order.orderNumber}</p>
                    <p className="text-[11px] text-slate-400">{order.customerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-800">${(order.totalAmount || 0).toLocaleString('es-AR')}</p>
                    <OrderStatusBadge status={order.orderStatus} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Low Stock Alerts */}
      {lowStockProducts.length > 0 && (
        <div className="card p-5 border-l-4 border-l-amber-400">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={18} className="text-amber-500" />
            <h3 className="font-bold text-slate-800">Alertas de Stock Bajo</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {lowStockProducts.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-amber-50 border border-amber-100">
                <span className={`text-sm font-bold ${p.stock === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                  {p.stock} uds
                </span>
                <span className="text-sm text-slate-700 truncate">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color }: { title: string; value: string; icon: any; color: string }) => {
  const colorMap: Record<string, string> = {
    emerald: 'from-emerald-500 to-green-600 shadow-emerald-500/20',
    blue: 'from-blue-500 to-indigo-600 shadow-blue-500/20',
    amber: 'from-amber-500 to-orange-500 shadow-amber-500/20',
    violet: 'from-violet-500 to-purple-600 shadow-violet-500/20',
  };
  
  return (
    <div className="stat-card">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorMap[color]} flex items-center justify-center text-white shadow-lg flex-shrink-0`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-sm text-slate-500 font-medium">{title}</p>
        <h4 className="text-xl font-bold text-slate-800">{value}</h4>
      </div>
    </div>
  );
};

const MiniStat = ({ label, value, icon: Icon, className }: { label: string; value: number; icon: any; className: string }) => (
  <div className="card p-3 flex items-center gap-3">
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${className}`}>
      <Icon size={16} />
    </div>
    <div>
      <p className="text-lg font-bold text-slate-800">{value}</p>
      <p className="text-[11px] text-slate-400 font-medium">{label}</p>
    </div>
  </div>
);

const OrderStatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pendiente', className: 'badge-yellow' },
    processing: { label: 'En Proceso', className: 'badge-blue' },
    finished: { label: 'Terminado', className: 'badge-green' },
    delivered: { label: 'Entregado', className: 'badge-purple' },
    cancelled: { label: 'Cancelado', className: 'badge-red' },
  };
  const c = config[status] || config.pending;
  return <span className={`badge text-[10px] ${c.className}`}>{c.label}</span>;
};
