import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import type { Order } from '../../types/order';
import { 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  ArrowRightCircle,
  Search
} from 'lucide-react';

export const MyBalance: React.FC = () => {
  const { userData } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'paid' | 'waiting'>('all');

  useEffect(() => {
    if (!userData?.uid) return;

    const q = query(
      collection(db, 'orders'),
      where('commissionEmployeeId', '==', userData.uid)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list: Order[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Order);
      });
      // Sort by date desc
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setOrders(list);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching collaborator orders:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userData]);

  // Calculations
  const stats = useMemo(() => {
    let available = 0;
    let liquidated = 0;
    let waiting = 0;
    let totalSales = 0;

    orders.forEach((o) => {
      if (o.orderStatus === 'draft' || o.orderStatus === 'cancelled') return;
      
      const amt = o.commissionAmount || 0;
      totalSales += o.totalAmount;

      if (o.commissionPaidStatus === 'paid') {
        liquidated += amt;
      } else if (o.paymentStatus === 'paid') {
        available += amt;
      } else {
        waiting += amt;
      }
    });

    return { available, liquidated, waiting, totalSales };
  }, [orders]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.orderStatus === 'draft') return false;

      // Filter by text search
      const customerMatch = (o.customerName || '').toLowerCase().includes(searchTerm.toLowerCase());
      const orderNumMatch = String(o.orderNumber).includes(searchTerm);
      const textMatch = customerMatch || orderNumMatch;

      if (!textMatch) return false;

      // Filter by commission status
      if (statusFilter === 'all') return true;
      if (statusFilter === 'paid') return o.commissionPaidStatus === 'paid';
      if (statusFilter === 'available') return o.commissionPaidStatus === 'pending' && o.paymentStatus === 'paid';
      if (statusFilter === 'waiting') return o.commissionPaidStatus === 'pending' && o.paymentStatus !== 'paid';
      
      return true;
    });
  }, [orders, searchTerm, statusFilter]);

  const formatCurrency = (val: number) => {
    return `$${val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getCommissionBadge = (order: Order) => {
    if (order.commissionPaidStatus === 'paid') {
      return (
        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded text-[10px] font-semibold">
          <CheckCircle2 size={10} /> Liquidado
        </span>
      );
    }
    if (order.paymentStatus === 'paid') {
      return (
        <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded text-[10px] font-semibold">
          <ArrowRightCircle size={10} /> Disponible
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded text-[10px] font-semibold">
        <Clock size={10} /> En espera de pago
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-fadeIn">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Mi Balance</h1>
        <p className="text-slate-500 text-sm">Monitorea tus comisiones y el estado de los pagos de tus clientes.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Disponible para Liquidar */}
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-2xl p-5 shadow-lg shadow-indigo-500/15 border border-indigo-400/20 relative overflow-hidden">
          <div className="absolute right-2 -bottom-2 text-indigo-400/20 pointer-events-none">
            <DollarSign size={96} strokeWidth={1} />
          </div>
          <p className="text-xs font-bold text-indigo-100 uppercase tracking-wider">Disponible para Cobrar</p>
          <h3 className="text-2xl font-black mt-2 tracking-tight">{formatCurrency(stats.available)}</h3>
          <p className="text-[10px] text-indigo-200 mt-2">Pedidos cobrados pendientes de liquidar.</p>
        </div>

        {/* Liquidado / Cobrado */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="absolute right-2 -bottom-2 text-emerald-50 pointer-events-none">
            <CheckCircle2 size={96} strokeWidth={1} className="text-emerald-500/10" />
          </div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cobrado / Liquidado</p>
          <h3 className="text-2xl font-black text-slate-800 mt-2 tracking-tight">{formatCurrency(stats.liquidated)}</h3>
          <p className="text-[10px] text-slate-500 mt-2">Comisiones ya pagadas por el Owner.</p>
        </div>

        {/* En Espera */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="absolute right-2 -bottom-2 text-amber-50 pointer-events-none">
            <Clock size={96} strokeWidth={1} className="text-amber-500/10" />
          </div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">En Espera (Pedido Impago)</p>
          <h3 className="text-2xl font-black text-slate-800 mt-2 tracking-tight">{formatCurrency(stats.waiting)}</h3>
          <p className="text-[10px] text-slate-500 mt-2">Clientes que aún no completaron el pago.</p>
        </div>

        {/* Ventas Totales */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="absolute right-2 -bottom-2 text-slate-50 pointer-events-none">
            <TrendingUp size={96} strokeWidth={1} className="text-slate-500/5" />
          </div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total de Ventas</p>
          <h3 className="text-2xl font-black text-slate-800 mt-2 tracking-tight">{formatCurrency(stats.totalSales)}</h3>
          <p className="text-[10px] text-slate-500 mt-2">Monto total facturado a tus clientes.</p>
        </div>
      </div>

      {/* Filter Options */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            className="input pl-9 pr-4 py-2 text-xs w-full bg-slate-50 hover:bg-slate-100 focus:bg-white border-slate-200 transition-colors"
            placeholder="Buscar por cliente o nro pedido..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              statusFilter === 'all' 
                ? 'bg-slate-800 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setStatusFilter('available')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              statusFilter === 'available' 
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/10' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Disponible
          </button>
          <button
            onClick={() => setStatusFilter('paid')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              statusFilter === 'paid' 
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/10' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Liquidado
          </button>
          <button
            onClick={() => setStatusFilter('waiting')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              statusFilter === 'waiting' 
                ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/10' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            En Espera
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold tracking-wider">
                <th className="p-4">Pedido</th>
                <th className="p-4">Fecha</th>
                <th className="p-4">Cliente</th>
                <th className="p-4 text-right">Total Pedido</th>
                <th className="p-4 text-right">Porcentaje</th>
                <th className="p-4 text-right">Tu Comisión</th>
                <th className="p-4 text-center">Estado Comisión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-xs font-semibold">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-normal">
                    No se encontraron registros de comisiones.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => {
                  return (
                    <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-bold text-slate-800">
                        #{String(o.orderNumber).padStart(5, '0')}
                      </td>
                      <td className="p-4 text-slate-500 font-normal">
                        {new Date(o.date).toLocaleDateString('es-AR')}
                      </td>
                      <td className="p-4 text-slate-800">
                        {o.customerName}
                      </td>
                      <td className="p-4 text-right">
                        {formatCurrency(o.totalAmount)}
                      </td>
                      <td className="p-4 text-right text-slate-400 font-normal">
                        {o.commissionPercent ?? 10}%
                      </td>
                      <td className="p-4 text-right text-indigo-600 font-bold text-sm">
                        {formatCurrency(o.commissionAmount || 0)}
                      </td>
                      <td className="p-4 text-center">
                        {getCommissionBadge(o)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              No se encontraron registros de comisiones.
            </div>
          ) : (
            filteredOrders.map((o) => {
              return (
                <div key={o.id} className="p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800">
                      Pedido #{String(o.orderNumber).padStart(5, '0')}
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      {new Date(o.date).toLocaleDateString('es-AR')}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="text-slate-800 font-bold text-sm">{o.customerName}</div>
                    <div className="text-xs font-normal text-slate-500">
                      <span>Total Pedido: {formatCurrency(o.totalAmount)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Tu Comisión ({o.commissionPercent ?? 10}%)</span>
                      <span className="text-sm font-bold text-indigo-600">
                        {formatCurrency(o.commissionAmount || 0)}
                      </span>
                    </div>
                    <div>
                      {getCommissionBadge(o)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
