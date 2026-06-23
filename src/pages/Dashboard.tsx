import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import type { Order } from '../types/order';
import type { Product } from '../types/product';
import type { Filament, InventoryMovement } from '../types/inventory';
import { 
  DollarSign, ShoppingCart, TrendingUp, AlertCircle, Package, 
  Users, Clock, CheckCircle, Truck, Plus,
  BarChart3, Wallet, XCircle, Flame, Loader2, Palette,
  ShoppingBag
} from 'lucide-react';
import { fetchDollarRate } from '../services/dollarService';
import type { ExchangeRateData, PricingSettingsResale } from '../types/settings';
import { unifyClientsAndOrders } from '../utils/unifyClients';
import { useAuth } from '../context/AuthContext';
import type { UserData } from '../types/user';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { userData } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<UserData[]>([]);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateData | null>(null);
  const [resaleSettings, setResaleSettings] = useState<PricingSettingsResale | null>(null);
  const [filaments, setFilaments] = useState<Filament[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [filamentLimit, setFilamentLimit] = useState<number | 'all'>(5);
  const [product3DLimit, setProduct3DLimit] = useState<number | 'all'>(5);
  const [productResaleLimit, setProductResaleLimit] = useState<number | 'all'>(5);
  const [collaboratorLimit, setCollaboratorLimit] = useState<number | 'all'>(5);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Run database self-healing client unification
    unifyClientsAndOrders().catch(console.error);

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

    // Listen to employees if owner
    let employeesUnsub = () => {};
    if (userData?.role === 'owner') {
      const q = query(collection(db, 'users'), where('role', '==', 'employee'));
      employeesUnsub = onSnapshot(q, (snap) => {
        const list: UserData[] = [];
        snap.forEach((d) => {
          list.push({ uid: d.id, ...d.data() } as UserData);
        });
        setEmployees(list);
      });
    }

    // Listen to inventory (filaments) for owner
    let inventoryUnsub = () => {};
    let movementsUnsub = () => {};
    if (userData?.role === 'owner') {
      const invQ = query(collection(db, 'inventory'), where('type', '==', 'filament'));
      inventoryUnsub = onSnapshot(invQ, (snap) => {
        const fils: Filament[] = [];
        snap.forEach((d) => fils.push({ id: d.id, ...d.data() } as Filament));
        setFilaments(fils);
      });
      movementsUnsub = onSnapshot(collection(db, 'inventory_movements'), (snap) => {
        const movs: InventoryMovement[] = [];
        snap.forEach((d) => movs.push({ id: d.id, ...d.data() } as InventoryMovement));
        setMovements(movs);
      });
    }

    // Initial load timer (fallback)
    const t = setTimeout(() => { setLoading(false); checkLoading(); }, 3000);

    return () => { 
      rateUnsub(); 
      ordersUnsub(); 
      prodsUnsub(); 
      resaleUnsub();
      employeesUnsub();
      inventoryUnsub();
      movementsUnsub();
      clearTimeout(t);
    };
  }, [userData]);

  // ─── Use LOCAL time for date filtering (not UTC) ───
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // ─── Filter orders by employee if not owner ───
  const userOrders = useMemo(() => {
    if (userData?.role === 'employee') {
      return orders.filter(o => o.commissionEmployeeId === userData.uid);
    }
    return orders;
  }, [orders, userData]);

  // ─── Exclude cancelled orders from financial calculations ───
  const activeOrders = useMemo(() => {
    return userOrders.filter(o => o.orderStatus !== 'cancelled');
  }, [userOrders]);

  const todayOrders = useMemo(() => {
    return activeOrders.filter(o => o.date?.startsWith(today));
  }, [activeOrders, today]);

  const monthOrders = useMemo(() => {
    return activeOrders.filter(o => o.date?.startsWith(thisMonth));
  }, [activeOrders, thisMonth]);

  const salesToday = useMemo(() => todayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0), [todayOrders]);
  const salesMonth = useMemo(() => monthOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0), [monthOrders]);
  const totalPending = useMemo(() => activeOrders.reduce((sum, o) => sum + (o.pendingAmount || 0), 0), [activeOrders]);
  const profitMonth = useMemo(() => {
    return monthOrders.reduce((sum, o) => {
      const orderProfit = o.totalProfit || 0;
      const commission = o.commissionAmount || 0;
      return sum + (orderProfit - commission);
    }, 0);
  }, [monthOrders]);

  // Order status counts (all orders, including cancelled for the status breakdown)
  const pendingOrders = useMemo(() => userOrders.filter(o => o.orderStatus === 'pending').length, [userOrders]);
  const processingOrders = useMemo(() => userOrders.filter(o => o.orderStatus === 'processing').length, [userOrders]);
  const finishedOrders = useMemo(() => userOrders.filter(o => o.orderStatus === 'finished').length, [userOrders]);
  const deliveredOrders = useMemo(() => userOrders.filter(o => o.orderStatus === 'delivered').length, [userOrders]);
  const cancelledOrders = useMemo(() => userOrders.filter(o => o.orderStatus === 'cancelled').length, [userOrders]);

  // Commission debt calculations (owner: total debt with employees, employee: their own pending commissions)
  const { availableCommissions, waitingCommissions } = useMemo(() => {
    let available = 0;
    let waiting = 0;

    orders.forEach(o => {
      if (o.orderStatus === 'cancelled' || o.orderStatus === 'draft') return;
      
      const matchUser = userData?.role === 'owner' || o.commissionEmployeeId === userData?.uid;
      
      if (o.commissionEmployeeId && o.commissionPaidStatus !== 'paid' && matchUser) {
        const amt = o.commissionAmount || 0;
        if (o.paymentStatus === 'paid') {
          available += amt;
        } else {
          waiting += amt;
        }
      }
    });

    return { availableCommissions: available, waitingCommissions: waiting };
  }, [orders, userData]);

  // Collaborators statistics (only for owner)
  const collaboratorsStats = useMemo(() => {
    if (userData?.role !== 'owner') return [];
    
    return employees.map(emp => {
      let salesAmount = 0;
      let salesCount = 0;
      let availableComm = 0;
      let waitingComm = 0;

      orders.forEach(o => {
        if (o.orderStatus === 'cancelled' || o.orderStatus === 'draft') return;
        
        if (o.commissionEmployeeId === emp.uid) {
          if (o.date?.startsWith(thisMonth)) {
            salesAmount += o.totalAmount || 0;
            salesCount += 1;
          }
          
          if (o.commissionPaidStatus !== 'paid') {
            const amt = o.commissionAmount || 0;
            if (o.paymentStatus === 'paid') {
              availableComm += amt;
            } else {
              waitingComm += amt;
            }
          }
        }
      });

      return {
        uid: emp.uid,
        name: emp.displayName || emp.email,
        salesAmount,
        salesCount,
        availableComm,
        waitingComm
      };
    });
  }, [employees, orders, thisMonth, userData]);

  const sortedCollaborators = useMemo(() => {
    return collaboratorsStats
      .filter(stat => stat.salesAmount > 0)
      .sort((a, b) => b.salesAmount - a.salesAmount);
  }, [collaboratorsStats]);

  const visibleCollaborators = useMemo(() => {
    if (collaboratorLimit === 'all') return sortedCollaborators;
    return sortedCollaborators.slice(0, collaboratorLimit);
  }, [sortedCollaborators, collaboratorLimit]);

  // Top 3D Products
  const product3DRanking = useMemo(() => {
    const productSalesMap = new Map<string, { name: string; qty: number; revenue: number }>();
    activeOrders.forEach(order => {
      order.items?.forEach(item => {
        const prod = products.find(p => p.id === item.productId);
        if (!prod || prod.type !== '3d') return;
        const existing = productSalesMap.get(item.productId) || { name: item.name, qty: 0, revenue: 0 };
        const isKeychain = (prod as any).isKeychain;
        existing.qty += isKeychain ? 1 : item.quantity;
        existing.revenue += item.unitPrice * item.quantity;
        productSalesMap.set(item.productId, existing);
      });
    });
    return [...productSalesMap.entries()].sort((a, b) => b[1].qty - a[1].qty);
  }, [activeOrders, products]);

  const visible3DProducts = useMemo(() => {
    if (product3DLimit === 'all') return product3DRanking;
    return product3DRanking.slice(0, product3DLimit);
  }, [product3DRanking, product3DLimit]);

  // Top Resale Products
  const productResaleRanking = useMemo(() => {
    const productSalesMap = new Map<string, { name: string; qty: number; revenue: number }>();
    activeOrders.forEach(order => {
      order.items?.forEach(item => {
        const prod = products.find(p => p.id === item.productId);
        if (!prod || prod.type !== 'resale') return;
        const existing = productSalesMap.get(item.productId) || { name: item.name, qty: 0, revenue: 0 };
        existing.qty += item.quantity;
        existing.revenue += item.unitPrice * item.quantity;
        productSalesMap.set(item.productId, existing);
      });
    });
    return [...productSalesMap.entries()].sort((a, b) => b[1].qty - a[1].qty);
  }, [activeOrders, products]);

  const visibleResaleProducts = useMemo(() => {
    if (productResaleLimit === 'all') return productResaleRanking;
    return productResaleRanking.slice(0, productResaleLimit);
  }, [productResaleRanking, productResaleLimit]);

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

  // ─── Filament consumption ranking (owner only) ───
  const filamentRanking = useMemo(() => {
    if (userData?.role !== 'owner' || filaments.length === 0) return [];

    // Build a map of filament id -> { material, color, hexColor }
    const filamentMap = new Map<string, { material: string; color: string; hexColor: string }>();
    filaments.forEach(f => {
      filamentMap.set(f.id, { material: f.material, color: f.color, hexColor: f.hexColor });
    });

    // Aggregate consumption by material+color key
    const consumptionMap = new Map<string, { material: string; color: string; hexColor: string; grams: number }>();

    movements.forEach(mov => {
      // Process grouped movements with lines
      if (mov.lines && mov.lines.length > 0) {
        mov.lines.forEach(line => {
          if (line.itemType === 'filament' && (line.lineType === 'consumption' || line.lineType === 'out_sale')) {
            const info = filamentMap.get(line.itemId);
            if (!info) return;
            const key = `${info.material.toLowerCase()}_${info.color.toLowerCase()}`;
            const existing = consumptionMap.get(key) || { ...info, grams: 0 };
            existing.grams += Math.abs(line.modifiedQuantity);
            consumptionMap.set(key, existing);
          }
        });
      } else if (mov.itemType === 'filament' && mov.itemId && (mov.movementType === 'consumption' || mov.movementType === 'out_sale')) {
        // Legacy single-item movement
        const info = filamentMap.get(mov.itemId);
        if (!info) return;
        const key = `${info.material.toLowerCase()}_${info.color.toLowerCase()}`;
        const existing = consumptionMap.get(key) || { ...info, grams: 0 };
        existing.grams += Math.abs(mov.modifiedQuantity || 0);
        consumptionMap.set(key, existing);
      }
    });

    // Sort by consumption descending, filter out zero
    const sorted = [...consumptionMap.values()]
      .filter(entry => entry.grams > 0)
      .sort((a, b) => b.grams - a.grams);

    return sorted;
  }, [userData, filaments, movements]);

  const visibleFilaments = useMemo(() => {
    if (filamentLimit === 'all') return filamentRanking;
    return filamentRanking.slice(0, filamentLimit);
  }, [filamentRanking, filamentLimit]);

  // Quick actions
  const quickActions = [
    { label: 'Nuevo Pedido', icon: Plus, path: '/orders/new', color: 'from-blue-500 to-indigo-600' },
    { label: 'Agregar Producto', icon: Package, path: '/admin/products/new', color: 'from-emerald-500 to-green-600' },
    { label: 'Agregar Cliente', icon: Users, path: '/clients', color: 'from-violet-500 to-purple-600' },
    { label: 'Ver Balance', icon: BarChart3, path: '/balance', color: 'from-amber-500 to-orange-600' },
  ];



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
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${userData?.role === 'owner' ? 'xl:grid-cols-4' : 'xl:grid-cols-3'} gap-4`}>
        <StatCard title="Ventas del Día" value={`$${salesToday.toLocaleString('es-AR')}`} icon={DollarSign} color="emerald" />
        <StatCard title="Ventas del Mes" value={`$${salesMonth.toLocaleString('es-AR')}`} icon={TrendingUp} color="blue" />
        <StatCard title="Pendiente de Cobro" value={`$${totalPending.toLocaleString('es-AR')}`} icon={Wallet} color="amber" />
        <StatCard title="Total Pedidos" value={activeOrders.length.toString()} icon={ShoppingCart} color="violet" />
        <StatCard 
          title={userData?.role === 'owner' ? "Comisiones A Pagar" : "Mis Comisiones Disponibles"} 
          value={`$${availableCommissions.toLocaleString('es-AR')}`} 
          icon={CheckCircle} 
          color="sky" 
        />
        <StatCard 
          title={userData?.role === 'owner' ? "Comisiones En Espera" : "Mis Comisiones en Espera"} 
          value={`$${waitingCommissions.toLocaleString('es-AR')}`} 
          icon={Clock} 
          color="indigo" 
        />
        {userData?.role === 'owner' && (
          <StatCard title="Ganancia del Mes" value={`$${profitMonth.toLocaleString('es-AR')}`} icon={TrendingUp} color="emerald" />
        )}
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

      {/* Quick Actions */}
      <div className="card p-5">
        <h3 className="font-bold text-slate-800 mb-4">Accesos Rápidos</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

      {/* Collaborators Performance (Owner only) */}
      {userData?.role === 'owner' && sortedCollaborators.length > 0 && (
        <div className="card p-5 border-l-4 border-l-violet-400 bg-gradient-to-r from-violet-50/30 to-purple-50/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                <Users size={16} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Rendimiento de Colaboradores</h3>
                <p className="text-[11px] text-slate-400">Ventas y comisiones acumuladas del mes actual</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
              {([5, 10, 25, 50, 'all'] as const).map((opt) => (
                <button
                  key={String(opt)}
                  onClick={() => setCollaboratorLimit(opt)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    collaboratorLimit === opt
                      ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {opt === 'all' ? 'Todos' : `Top ${opt}`}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {visibleCollaborators.map((entry, i) => (
              <div key={entry.uid} className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                  i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {i + 1}
                </span>

                {/* Avatar / Iniciales */}
                <div className="w-10 h-10 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                  {entry.name.slice(0, 2).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{entry.name}</p>
                  <p className="text-[10px] text-slate-400">
                    {entry.salesCount} pedidos | Comisiones: <span className="text-emerald-600 font-bold">${entry.availableComm.toLocaleString('es-AR')}</span> cobrado, <span className="text-amber-600 font-bold">${entry.waitingComm.toLocaleString('es-AR')}</span> a cobrar
                  </p>
                </div>
                <span className="text-sm font-bold text-violet-600 whitespace-nowrap">
                  ${entry.salesAmount.toLocaleString('es-AR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Productos 3D */}
      {visible3DProducts.length > 0 && (
        <div className="card p-5 border-l-4 border-l-emerald-400 bg-gradient-to-r from-emerald-50/30 to-green-50/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white shadow-md">
                <Package size={16} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Top Productos 3D</h3>
                <p className="text-[11px] text-slate-400">Productos de impresión 3D más vendidos</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
              {([5, 10, 25, 50, 'all'] as const).map((opt) => (
                <button
                  key={String(opt)}
                  onClick={() => setProduct3DLimit(opt)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    product3DLimit === opt
                      ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {opt === 'all' ? 'Todos' : `Top ${opt}`}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {visible3DProducts.map(([id, data], i) => {
              const prod = products.find(p => p.id === id);
              return (
                <div key={id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {i + 1}
                  </span>
                  
                  {/* Imagen del Producto */}
                  <div className="w-10 h-10 rounded bg-slate-50 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {prod?.mainImage ? (
                      <img
                        src={prod.mainImage}
                        alt={data.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Package size={16} className="text-slate-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{data.name}</p>
                    <p className="text-[11px] text-slate-400">{data.qty} vendidos</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 whitespace-nowrap">
                    ${data.revenue.toLocaleString('es-AR')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Productos de Reventa */}
      {visibleResaleProducts.length > 0 && (
        <div className="card p-5 border-l-4 border-l-blue-400 bg-gradient-to-r from-blue-50/30 to-indigo-50/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                <ShoppingBag size={16} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Top Productos de Reventa</h3>
                <p className="text-[11px] text-slate-400">Productos de reventa / comunes más vendidos</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
              {([5, 10, 25, 50, 'all'] as const).map((opt) => (
                <button
                  key={String(opt)}
                  onClick={() => setProductResaleLimit(opt)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    productResaleLimit === opt
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {opt === 'all' ? 'Todos' : `Top ${opt}`}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {visibleResaleProducts.map(([id, data], i) => {
              const prod = products.find(p => p.id === id);
              return (
                <div key={id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {i + 1}
                  </span>
                  
                  {/* Imagen del Producto */}
                  <div className="w-10 h-10 rounded bg-slate-50 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {prod?.mainImage ? (
                      <img
                        src={prod.mainImage}
                        alt={data.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Package size={16} className="text-slate-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{data.name}</p>
                    <p className="text-[11px] text-slate-400">{data.qty} vendidos</p>
                  </div>
                  <span className="text-sm font-bold text-blue-600 whitespace-nowrap">
                    ${data.revenue.toLocaleString('es-AR')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filament Usage Ranking (Owner only) */}
      {userData?.role === 'owner' && filamentRanking.length > 0 && (
        <div className="card p-5 border-l-4 border-l-violet-400 bg-gradient-to-r from-violet-50/30 to-purple-50/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                <Palette size={16} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Filamentos Más Utilizados</h3>
                <p className="text-[11px] text-slate-400">Consumo total acumulado en impresión 3D</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
              {([5, 10, 25, 50, 'all'] as const).map((opt) => (
                <button
                  key={String(opt)}
                  onClick={() => setFilamentLimit(opt)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    filamentLimit === opt
                      ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {opt === 'all' ? 'Todos' : `Top ${opt}`}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {visibleFilaments.map((entry, i) => (
              <div key={`${entry.material}_${entry.color}`} className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                  i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {i + 1}
                </span>
                <div
                  className="w-5 h-5 rounded-full flex-shrink-0 border border-slate-200 shadow-inner"
                  style={{ backgroundColor: entry.hexColor || '#ccc' }}
                  title={entry.color}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{entry.material} {entry.color}</p>
                </div>
                <span className="text-sm font-bold text-violet-600 whitespace-nowrap">
                  {formatWeight(entry.grams)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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

const formatWeight = (grams: number): string => {
  const rounded = Math.round(grams);
  if (rounded >= 1000) {
    const kg = Math.floor(rounded / 1000);
    const g = rounded % 1000;
    return g > 0 ? `${kg} kg ${g} g` : `${kg} kg`;
  }
  return `${rounded} g`;
};

const StatCard = ({ title, value, icon: Icon, color }: { title: string; value: string; icon: any; color: string }) => {
  const colorMap: Record<string, string> = {
    emerald: 'from-emerald-500 to-green-600 shadow-emerald-500/20',
    blue: 'from-blue-500 to-indigo-600 shadow-blue-500/20',
    amber: 'from-amber-500 to-orange-500 shadow-amber-500/20',
    violet: 'from-violet-500 to-purple-600 shadow-violet-500/20',
    sky: 'from-sky-500 to-blue-600 shadow-sky-500/20',
    indigo: 'from-indigo-500 to-violet-600 shadow-indigo-500/20',
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


