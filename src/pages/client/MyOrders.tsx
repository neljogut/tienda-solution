import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { ShoppingCart, Package, Clock, CheckCircle, XCircle } from 'lucide-react';
import type { Order } from '../../types/order';

export const MyOrders: React.FC = () => {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;

    // Use onSnapshot to get real-time updates for this user's orders
    const q = query(
      collection(db, 'orders'),
      where('customerId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders: Order[] = [];
      snapshot.forEach((doc) => {
        fetchedOrders.push({ id: doc.id, ...doc.data() } as Order);
      });
      // Sort in memory because querying by multiple fields needs composite index in Firestore
      fetchedOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setOrders(fetchedOrders);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const getStatusConfig = (status: Order['orderStatus']) => {
    switch (status) {
      case 'pending': return { icon: Clock, color: 'text-amber-600 bg-amber-50 border-amber-200', text: 'Pendiente' };
      case 'processing': return { icon: Package, color: 'text-blue-600 bg-blue-50 border-blue-200', text: 'En Proceso' };
      case 'finished': return { icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50 border-emerald-200', text: 'Terminado' };
      case 'delivered': return { icon: CheckCircle, color: 'text-purple-600 bg-purple-50 border-purple-200', text: 'Entregado' };
      case 'cancelled': return { icon: XCircle, color: 'text-red-600 bg-red-50 border-red-200', text: 'Cancelado' };
      default: return { icon: Clock, color: 'text-slate-600 bg-slate-50', text: status };
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Mis Pedidos</h1>
          <p className="text-slate-500">Historial de tus compras e impresiones.</p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="card p-10 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
            <ShoppingCart size={32} className="text-blue-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-800">No tienes pedidos aún</h3>
          <p className="text-slate-500 mt-2 max-w-md">
            Cuando realices una compra en nuestro catálogo o solicites una impresión 3D, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
            const status = getStatusConfig(order.orderStatus);
            const StatusIcon = status.icon;
            
            return (
              <div key={order.id} className="card p-6 border-l-4" style={{ borderLeftColor: status.color.split(' ')[0].replace('text-', '') }}>
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-slate-800">Pedido #{order.orderNumber}</h3>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 border ${status.color}`}>
                        <StatusIcon size={12} />
                        {status.text}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">
                      Realizado el: {new Date(order.date).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit' })}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-sm text-slate-500 mb-1">Total</p>
                    <p className="text-xl font-bold text-emerald-600">${order.totalAmount.toLocaleString('es-AR')}</p>
                  </div>
                </div>
                
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">Productos:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <div className="w-10 h-10 bg-slate-200 rounded overflow-hidden flex-shrink-0">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package size={20} className="m-auto mt-2 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 text-sm line-clamp-1">{item.name}</p>
                          <p className="text-xs text-slate-500">{item.quantity} unid. x ${item.unitPrice.toLocaleString('es-AR')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
