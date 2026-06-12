import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { 
  ShoppingCart, Package, Clock, Truck, CheckCircle2, XCircle, 
  ChevronDown, ChevronUp, Tag
} from 'lucide-react';
import type { Order } from '../../types/order';

export const MyOrders: React.FC = () => {
  const { currentUser, userData } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!currentUser) return;

    let unsubscribe: (() => void) | null = null;

    const fetchAndListen = async () => {
      let resolvedCustomerId = userData?.customerId || '';
      
      if (!resolvedCustomerId) {
        try {
          const { query, where, getDocs, collection } = await import('firebase/firestore');
          const clientQuery = query(collection(db, 'clients'), where('userId', '==', currentUser.uid));
          const clientSnap = await getDocs(clientQuery);
          if (!clientSnap.empty) {
            resolvedCustomerId = clientSnap.docs[0].id;
          } else {
            const emailQuery = query(collection(db, 'clients'), where('email', '==', currentUser.email));
            const emailSnap = await getDocs(emailQuery);
            if (!emailSnap.empty) {
              resolvedCustomerId = emailSnap.docs[0].id;
            }
          }
        } catch (e) {
          console.error("Error resolving customerId:", e);
        }
      }

      const q = query(
        collection(db, 'orders'),
        where('customerId', '==', resolvedCustomerId || currentUser.uid)
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedOrders: Order[] = [];
        snapshot.forEach((doc) => {
          const o = { id: doc.id, ...doc.data() } as Order;
          if (o.orderStatus !== 'draft') {
            fetchedOrders.push(o);
          }
        });
        fetchedOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setOrders(fetchedOrders);
        setLoading(false);
      });
    };

    fetchAndListen();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentUser, userData]);

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || orders.length === 0) return;

    setExpandedOrders((prev) => ({ ...prev, [openId]: true }));
    const timer = setTimeout(() => {
      document.getElementById(`my-order-row-${openId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);

    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });

    return () => clearTimeout(timer);
  }, [searchParams, orders, setSearchParams]);

  const toggleExpand = (orderId: string) => {
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const getStatusBadge = (status: Order['orderStatus']) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded text-[10px] font-bold">
            <Clock size={11} /> Pendiente
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded text-[10px] font-bold">
            <Clock size={11} /> En Proceso
          </span>
        );
      case 'finished':
        return (
          <span className="inline-flex items-center gap-1.5 text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded text-[10px] font-bold">
            <CheckCircle2 size={11} /> Terminado
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1.5 text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold">
            <Truck size={11} /> Entregado
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded text-[10px] font-bold">
            <XCircle size={11} /> Cancelado
          </span>
        );
      default:
        return null;
    }
  };

  const getPaymentBadge = (status: Order['paymentStatus']) => {
    switch (status) {
      case 'unpaid':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-100">
            Sin abonar
          </span>
        );
      case 'partial':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100">
            Señado
          </span>
        );
      case 'paid':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
            Pagado
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
          <ShoppingCart className="text-blue-600" size={26} />
          Mis Pedidos
        </h1>
        <p className="text-slate-500 text-sm">Historial completo de tus compras e impresiones.</p>
      </div>

      {/* Orders List */}
      <div className="card overflow-hidden border border-slate-200/80 shadow-sm">
        {orders.length === 0 ? (
          <div className="p-16 text-center text-slate-400">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 mx-auto">
              <ShoppingCart size={32} className="text-blue-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">No tienes pedidos aún</h3>
            <p className="text-slate-500 mt-1 max-w-sm mx-auto">
              Cuando realices una compra en nuestro catálogo o solicites un pedido, aparecerá en esta sección.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                  <tr>
                    <th className="p-4 w-10"></th>
                    <th className="p-4">Nº Pedido</th>
                    <th className="p-4">Fecha</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4">Pago</th>
                    <th className="p-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {orders.map(order => {
                    const isExpanded = !!expandedOrders[order.id];
                    return (
                      <React.Fragment key={order.id}>
                        <tr
                          id={`my-order-row-${order.id}`}
                          className="hover:bg-slate-50/40 transition-colors cursor-pointer"
                          onClick={() => toggleExpand(order.id)}
                        >
                          <td className="p-4 text-center">
                            {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                          </td>
                          <td className="p-4 font-bold text-slate-800">
                            #{String(order.orderNumber).padStart(5, '0')}
                          </td>
                          <td className="p-4 text-slate-500">
                            {new Date(order.date).toLocaleDateString('es-AR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="p-4">{getStatusBadge(order.orderStatus)}</td>
                          <td className="p-4">
                            <div>
                              {getPaymentBadge(order.paymentStatus)}
                              {order.paymentStatus === 'partial' && (
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  <p>${order.paidAmount.toLocaleString('es-AR')} abonado</p>
                                  <p className="font-semibold text-amber-700">Resta: ${(order.pendingAmount ?? (order.totalAmount - order.paidAmount)).toLocaleString('es-AR')}</p>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-4 font-black text-slate-800 text-right">
                            ${order.totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 1 })}
                          </td>
                        </tr>

                        {/* Collapsed Items details */}
                        {isExpanded && (
                          <tr className="bg-slate-50/50">
                            <td colSpan={6} className="p-6 border-t border-b border-slate-100">
                              <div className="space-y-4 max-w-4xl">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                  <Package size={14} className="text-slate-400" />
                                  Detalle del Pedido
                                </h4>
                                <div className="divide-y divide-slate-100 bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm">
                                  {order.items.map((item, idx) => (
                                    <div key={idx} className="p-4 flex items-center justify-between gap-4">
                                      <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-100 flex-shrink-0 flex">
                                          {item.imageUrl ? (
                                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover m-auto" />
                                          ) : (
                                            <Package size={22} className="text-slate-400 m-auto" />
                                          )}
                                        </div>
                                        <div>
                                          <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                                          <p className="text-xs text-slate-400 mt-0.5">Precio Unitario: ${item.unitPrice.toLocaleString('es-AR')}</p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="font-semibold text-slate-600">Cant: {item.quantity}</p>
                                        <p className="font-bold text-slate-800 text-sm mt-0.5">${(item.unitPrice * item.quantity).toLocaleString('es-AR')}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                
                                {order.observationsPublic && (
                                  <div className="bg-blue-50/50 border border-blue-100/50 rounded-xl p-3 flex gap-2 text-slate-600 text-xs">
                                    <Tag size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                      <p className="font-bold text-slate-700 mb-0.5">Nota pública del pedido:</p>
                                      <p className="italic">{order.observationsPublic}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="block md:hidden divide-y divide-slate-100 text-xs">
              {orders.map(order => {
                const isExpanded = !!expandedOrders[order.id];
                return (
                  <div key={order.id} id={`my-order-row-${order.id}`} className="p-4 space-y-3">
                    {/* Row 1: Header */}
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-800 text-sm">
                        #{String(order.orderNumber).padStart(5, '0')}
                      </span>
                      <span className="text-slate-500">
                        {new Date(order.date).toLocaleDateString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </span>
                    </div>

                    {/* Row 2: Badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {getStatusBadge(order.orderStatus)}
                      {getPaymentBadge(order.paymentStatus)}
                    </div>

                    {/* Row 3: Partial Payment detail */}
                    {order.paymentStatus === 'partial' && (
                      <div className="bg-amber-50/50 border border-amber-100/50 rounded-lg p-2 text-slate-600 space-y-0.5">
                        <div className="flex justify-between">
                          <span>Abonado:</span>
                          <span className="font-medium">${order.paidAmount.toLocaleString('es-AR')}</span>
                        </div>
                        <div className="flex justify-between text-amber-700 font-bold">
                          <span>Resta:</span>
                          <span>${(order.pendingAmount ?? (order.totalAmount - order.paidAmount)).toLocaleString('es-AR')}</span>
                        </div>
                      </div>
                    )}

                    {/* Row 4: Total & Accordion Toggle */}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Total</span>
                        <span className="font-black text-slate-800 text-sm">
                          ${order.totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 1 })}
                        </span>
                      </div>
                      <button
                        onClick={() => toggleExpand(order.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-semibold transition-colors"
                      >
                        Ver Detalle {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>

                    {/* Collapsed Items for mobile */}
                    {isExpanded && (
                      <div className="space-y-3 mt-3 pt-3 border-t border-slate-100 bg-slate-50/50 p-3 rounded-xl">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Productos:</h4>
                        <div className="space-y-2">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center gap-2 bg-white p-2 rounded-lg border border-slate-200/60">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-8 h-8 bg-slate-100 rounded overflow-hidden flex-shrink-0 flex">
                                  {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover m-auto" />
                                  ) : (
                                    <Package size={16} className="text-slate-400 m-auto" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-800 text-xs truncate">{item.name}</p>
                                  <p className="text-[10px] text-slate-400">{item.quantity} x ${item.unitPrice.toLocaleString('es-AR')}</p>
                                </div>
                              </div>
                              <span className="font-bold text-slate-800 whitespace-nowrap">${(item.unitPrice * item.quantity).toLocaleString('es-AR')}</span>
                            </div>
                          ))}
                        </div>
                        {order.observationsPublic && (
                          <div className="text-[11px] text-slate-500 italic border-l-2 border-blue-400 pl-2 mt-2">
                            {order.observationsPublic}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
