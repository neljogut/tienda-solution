import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot, writeBatch, doc } from 'firebase/firestore';
import type { UserData } from '../../types/user';
import type { Order } from '../../types/order';
import { 
  User, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  Search,
  CheckSquare,
  Square,
  TrendingUp,
  Award,
  AlertCircle
} from 'lucide-react';

export const Liquidations: React.FC = () => {
  const [employees, setEmployees] = useState<UserData[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'paid' | 'waiting'>('all');
  
  // Selection state for liquidation
  const [selectedOrderIds, setSelectedOrderIds] = useState<Record<string, boolean>>({});
  const [liquidating, setLiquidating] = useState(false);

  // Load collaborators list
  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'employee'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: UserData[] = [];
      snap.forEach((d) => {
        list.push({ uid: d.id, ...d.data() } as UserData);
      });
      setEmployees(list);
    }, (err) => {
      console.error("Error loading employees for liquidations:", err);
    });
    return () => unsubscribe();
  }, []);

  // Load orders for selected employee
  useEffect(() => {
    if (!selectedEmpId) {
      setOrders([]);
      setSelectedOrderIds({});
      return;
    }

    setOrdersLoading(true);
    const q = query(
      collection(db, 'orders'),
      where('commissionEmployeeId', '==', selectedEmpId)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list: Order[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Order);
      });
      // Sort by date desc
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setOrders(list);
      setOrdersLoading(false);
    }, (err) => {
      console.error("Error loading employee orders:", err);
      setOrdersLoading(false);
    });

    return () => unsubscribe();
  }, [selectedEmpId]);

  // Reset selection when employee or filters change
  useEffect(() => {
    setSelectedOrderIds({});
  }, [selectedEmpId, statusFilter]);

  // Stats calculation
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

  // Selected collaborator details
  const activeEmployee = useMemo(() => {
    return employees.find(e => e.uid === selectedEmpId) || null;
  }, [selectedEmpId, employees]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.orderStatus === 'draft') return false;

      // Text search
      const customerMatch = (o.customerName || '').toLowerCase().includes(searchTerm.toLowerCase());
      const orderNumMatch = String(o.orderNumber).includes(searchTerm);
      const textMatch = customerMatch || orderNumMatch;

      if (!textMatch) return false;

      // Commission status filter
      if (statusFilter === 'all') return true;
      if (statusFilter === 'paid') return o.commissionPaidStatus === 'paid';
      if (statusFilter === 'available') return o.commissionPaidStatus === 'pending' && o.paymentStatus === 'paid';
      if (statusFilter === 'waiting') return o.commissionPaidStatus === 'pending' && o.paymentStatus !== 'paid';

      return true;
    });
  }, [orders, searchTerm, statusFilter]);

  // Selectable orders for bulk liquidation
  const selectableOrders = useMemo(() => {
    return filteredOrders.filter(o => o.commissionPaidStatus === 'pending' && o.paymentStatus === 'paid');
  }, [filteredOrders]);

  const allSelected = useMemo(() => {
    if (selectableOrders.length === 0) return false;
    return selectableOrders.every(o => !!selectedOrderIds[o.id]);
  }, [selectableOrders, selectedOrderIds]);

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedOrderIds({});
    } else {
      const next: Record<string, boolean> = {};
      selectableOrders.forEach(o => {
        next[o.id] = true;
      });
      setSelectedOrderIds(next);
    }
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const selectedCount = useMemo(() => {
    return Object.values(selectedOrderIds).filter(Boolean).length;
  }, [selectedOrderIds]);

  const selectedTotalAmount = useMemo(() => {
    return selectableOrders
      .filter(o => !!selectedOrderIds[o.id])
      .reduce((sum, o) => sum + (o.commissionAmount || 0), 0);
  }, [selectableOrders, selectedOrderIds]);

  const handleLiquidateSelected = async () => {
    const idsToLiquidate = Object.keys(selectedOrderIds).filter(id => selectedOrderIds[id]);
    if (idsToLiquidate.length === 0) return;

    if (!window.confirm(`¿Estás seguro de liquidar y marcar como pagadas ${idsToLiquidate.length} comisiones por un total de $${selectedTotalAmount.toLocaleString('es-AR')}?`)) {
      return;
    }

    setLiquidating(true);
    try {
      const batch = writeBatch(db);
      idsToLiquidate.forEach(id => {
        batch.update(doc(db, 'orders', id), {
          commissionPaidStatus: 'paid'
        });
      });
      await batch.commit();
      setSelectedOrderIds({});
      alert('Comisiones liquidadas con éxito.');
    } catch (err) {
      console.error("Error liquidating commissions:", err);
      alert('Hubo un error al liquidar las comisiones.');
    } finally {
      setLiquidating(false);
    }
  };

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
          Disponible
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded text-[10px] font-semibold">
        <Clock size={10} /> Pedido Impago
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-fadeIn">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Liquidaciones de Colaboradores</h1>
        <p className="text-slate-500 text-sm">Gestiona y efectiviza el pago de comisiones pendientes a tus colaboradores.</p>
      </div>

      {/* Collaborator Selector */}
      <div className="card p-6 flex flex-col md:flex-row md:items-center gap-4 bg-white border border-slate-200 shadow-sm rounded-2xl">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Seleccionar Colaborador</label>
          <div className="relative">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              className="input pl-9 text-xs w-full bg-slate-50 hover:bg-slate-100 focus:bg-white transition-colors"
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
            >
              <option value="">-- Selecciona un empleado para ver su balance --</option>
              {employees.map((emp) => (
                <option key={emp.uid} value={emp.uid}>
                  {emp.displayName || emp.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeEmployee && (
          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl px-4 py-3 flex items-center gap-3">
            <Award className="text-indigo-600" size={24} />
            <div>
              <div className="text-xs font-bold text-indigo-900 leading-tight">
                {activeEmployee.displayName || 'Colaborador'}
              </div>
              <div className="text-[10px] text-indigo-600 font-semibold mt-0.5">
                {activeEmployee.email}
              </div>
            </div>
          </div>
        )}
      </div>

      {!selectedEmpId ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl p-6 text-center">
          <User className="text-slate-300 mb-3" size={48} strokeWidth={1.5} />
          <h3 className="text-slate-700 font-bold text-sm">Sin Selección</h3>
          <p className="text-slate-400 text-xs mt-1 max-w-xs">
            Selecciona un colaborador en la lista de arriba para gestionar sus saldos y liquidaciones de comisiones.
          </p>
        </div>
      ) : ordersLoading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Disponible para Liquidar */}
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-2xl p-5 shadow-lg shadow-indigo-500/15 border border-indigo-400/20 relative overflow-hidden">
              <div className="absolute right-2 -bottom-2 text-indigo-400/20 pointer-events-none">
                <DollarSign size={96} strokeWidth={1} />
              </div>
              <p className="text-xs font-bold text-indigo-100 uppercase tracking-wider">Disponible para Liquidar</p>
              <h3 className="text-2xl font-black mt-2 tracking-tight">{formatCurrency(stats.available)}</h3>
              <p className="text-[10px] text-indigo-200 mt-2">Pedidos de clientes pagados, listos para liquidar.</p>
            </div>

            {/* Liquidado / Pagado */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 relative overflow-hidden">
              <div className="absolute right-2 -bottom-2 text-emerald-50 pointer-events-none">
                <CheckCircle2 size={96} strokeWidth={1} className="text-emerald-500/10" />
              </div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ya Liquidado</p>
              <h3 className="text-2xl font-black text-slate-800 mt-2 tracking-tight">{formatCurrency(stats.liquidated)}</h3>
              <p className="text-[10px] text-slate-500 mt-2">Comisiones ya abonadas al colaborador.</p>
            </div>

            {/* En Espera */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 relative overflow-hidden">
              <div className="absolute right-2 -bottom-2 text-amber-50 pointer-events-none">
                <Clock size={96} strokeWidth={1} className="text-amber-500/10" />
              </div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">En Espera de Pago Cliente</p>
              <h3 className="text-2xl font-black text-slate-800 mt-2 tracking-tight">{formatCurrency(stats.waiting)}</h3>
              <p className="text-[10px] text-slate-500 mt-2">Pedidos de clientes impagos o señados parcialmente.</p>
            </div>

            {/* Ventas Totales */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 relative overflow-hidden">
              <div className="absolute right-2 -bottom-2 text-slate-50 pointer-events-none">
                <TrendingUp size={96} strokeWidth={1} className="text-slate-500/5" />
              </div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ventas Colaborador</p>
              <h3 className="text-2xl font-black text-slate-800 mt-2 tracking-tight">{formatCurrency(stats.totalSales)}</h3>
              <p className="text-[10px] text-slate-500 mt-2">Monto total facturado por este colaborador.</p>
            </div>
          </div>

          {/* Bulk Liquidation Bar (Only visible if selectedCount > 0) */}
          {selectedCount > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between bg-indigo-50 border border-indigo-200 rounded-2xl p-4 shadow-sm gap-3 animate-fadeIn">
              <div className="flex items-center gap-2 text-xs text-indigo-900 font-semibold">
                <AlertCircle className="text-indigo-600 flex-shrink-0" size={18} />
                <span>
                  Seleccionaste <strong className="text-indigo-700">{selectedCount}</strong> comisiones para liquidar por un total de <strong>{formatCurrency(selectedTotalAmount)}</strong>.
                </span>
              </div>
              <button
                onClick={handleLiquidateSelected}
                disabled={liquidating}
                className="w-full sm:w-auto px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition-all shadow-md shadow-indigo-600/15 disabled:opacity-50"
              >
                {liquidating ? 'Liquidando...' : 'Marcar Seleccionadas como Pagadas'}
              </button>
            </div>
          )}

          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
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
                Ya Liquidado
              </button>
              <button
                onClick={() => setStatusFilter('waiting')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  statusFilter === 'waiting' 
                    ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/10' 
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Pedido Impago
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
                    {statusFilter === 'available' && (
                      <th className="p-4 w-12 text-center">
                        <button onClick={toggleSelectAll} className="text-slate-400 hover:text-indigo-600">
                          {allSelected ? <CheckSquare size={18} className="text-indigo-600" /> : <Square size={18} />}
                        </button>
                      </th>
                    )}
                    <th className="p-4">Pedido</th>
                    <th className="p-4">Fecha</th>
                    <th className="p-4">Cliente</th>
                    <th className="p-4 text-right">Total Pedido</th>
                    <th className="p-4 text-right">Ganancia Real</th>
                    <th className="p-4 text-right">Comisión</th>
                    <th className="p-4 text-center">Estado Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs font-semibold">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={statusFilter === 'available' ? 8 : 7} className="p-8 text-center text-slate-400 font-normal">
                        No se encontraron registros de comisiones.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((o) => {
                      const profit = o.totalProfit ?? (o.totalAmount - (o.totalCost ?? 0));
                      const isSelectable = o.commissionPaidStatus === 'pending' && o.paymentStatus === 'paid';
                      const isChecked = !!selectedOrderIds[o.id];
                      return (
                        <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                          {statusFilter === 'available' && (
                            <td className="p-4 text-center">
                              {isSelectable ? (
                                <button onClick={() => toggleSelectOrder(o.id)} className="text-slate-400 hover:text-indigo-600">
                                  {isChecked ? <CheckSquare size={18} className="text-indigo-600" /> : <Square size={18} />}
                                </button>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          )}
                          <td className="p-4 font-bold text-slate-800">
                            #{String(o.orderNumber).padStart(5, '0')}
                          </td>
                          <td className="p-4 text-slate-500 font-normal">
                            {new Date(o.date).toLocaleDateString('es-AR')}
                          </td>
                          <td className="p-4 text-slate-800 text-xs">
                            {o.customerName}
                          </td>
                          <td className="p-4 text-right font-normal">
                            {formatCurrency(o.totalAmount)}
                          </td>
                          <td className="p-4 text-right text-slate-500 font-normal">
                            {formatCurrency(profit)}
                          </td>
                          <td className="p-4 text-right text-indigo-600 font-bold">
                            <div className="flex flex-col items-end">
                              <span>{formatCurrency(o.commissionAmount || 0)}</span>
                              <span className="text-[9px] text-slate-400 font-normal">{o.commissionPercent ?? 10}%</span>
                            </div>
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
                  const profit = o.totalProfit ?? (o.totalAmount - (o.totalCost ?? 0));
                  const isSelectable = o.commissionPaidStatus === 'pending' && o.paymentStatus === 'paid';
                  const isChecked = !!selectedOrderIds[o.id];
                  return (
                    <div key={o.id} className="p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          {statusFilter === 'available' && isSelectable && (
                            <button onClick={() => toggleSelectOrder(o.id)} className="text-slate-400 hover:text-indigo-600 mr-1">
                              {isChecked ? <CheckSquare size={18} className="text-indigo-600" /> : <Square size={18} />}
                            </button>
                          )}
                          <span className="font-bold text-slate-800">
                            Pedido #{String(o.orderNumber).padStart(5, '0')}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {new Date(o.date).toLocaleDateString('es-AR')}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="text-slate-800 font-bold text-xs">{o.customerName}</div>
                        <div className="flex justify-between text-xs font-normal text-slate-500">
                          <span>Total: {formatCurrency(o.totalAmount)}</span>
                          <span>Ganancia: {formatCurrency(profit)}</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Comisión ({o.commissionPercent ?? 10}%)</span>
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
        </>
      )}
    </div>
  );
};
