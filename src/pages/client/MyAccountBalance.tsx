import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { 
  CreditCard, Receipt, CheckCircle,
  ArrowDownLeft, AlertCircle, Calendar, MessageSquare
} from 'lucide-react';
import type { Order } from '../../types/order';
import type { Client } from '../../types/client';

export const MyAccountBalance: React.FC = () => {
  const { currentUser, userData } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;

    let unsubClient: (() => void) | null = null;
    let unsubOrders: (() => void) | null = null;
    let unsubPayments: (() => void) | null = null;

    const setupListeners = async () => {
      let resolvedCustomerId = userData?.customerId || '';

      // 1. Resolve client.id if not present in userData
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

      if (!resolvedCustomerId) {
        setLoading(false);
        return;
      }

      // 2. Listen to Client Profile
      unsubClient = onSnapshot(doc(db, 'clients', resolvedCustomerId), (snap) => {
        if (snap.exists()) {
          setClient({ id: snap.id, ...snap.data() } as Client);
        }
      });

      // 3. Listen to Client's non-cancelled Orders
      const qOrders = query(
        collection(db, 'orders'),
        where('customerId', '==', resolvedCustomerId)
      );
      unsubOrders = onSnapshot(qOrders, (snap) => {
        const list: Order[] = [];
        snap.forEach(d => {
          const o = { id: d.id, ...d.data() } as Order;
          if (o.orderStatus !== 'cancelled') {
            list.push(o);
          }
        });
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setOrders(list);
        setLoading(false);
      });

      // 4. Listen to Client's account payments (cash_movements)
      const qPayments = query(
        collection(db, 'cash_movements'),
        where('customerId', '==', resolvedCustomerId)
      );
      unsubPayments = onSnapshot(qPayments, (snap) => {
        const list: any[] = [];
        snap.forEach(d => {
          list.push({ id: d.id, ...d.data() });
        });
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setPayments(list);
      });
    };

    setupListeners();

    return () => {
      if (unsubClient) unsubClient();
      if (unsubOrders) unsubOrders();
      if (unsubPayments) unsubPayments();
    };
  }, [currentUser, userData]);

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'Efectivo';
      case 'transfer': return 'Transferencia';
      case 'mercadopago': return 'MercadoPago';
      case 'card': return 'Tarjeta';
      default: return 'Otro';
    }
  };

  const getOrderStatusConfig = (status: Order['orderStatus']) => {
    switch (status) {
      case 'pending': return { text: 'Pendiente', color: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'processing': return { text: 'En proceso', color: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'finished': return { text: 'Terminado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'delivered': return { text: 'Entregado', color: 'bg-purple-50 text-purple-700 border-purple-200' };
      default: return { text: status, color: 'bg-slate-50 text-slate-700 border-slate-200' };
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium">Cargando estado de cuenta...</p>
      </div>
    );
  }

  const pendingOrders = orders.filter(o => o.paymentStatus !== 'paid');

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-fadeIn">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <CreditCard size={26} className="text-blue-600" />
            Mi Cuenta Corriente
          </h1>
          <p className="page-subtitle">
            Revisa tu balance general, tus pedidos con saldo pendiente e historial de pagos registrados.
          </p>
        </div>
      </div>

      {/* Profile & Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Client Profile Card */}
        <div className="card p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-base shadow-inner">
                {client?.firstName?.[0] || ''}{client?.lastName?.[0] || ''}
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                  {client?.firstName} {client?.lastName}
                </h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">{client?.email}</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Clasificación:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  client?.isWholesale 
                    ? 'bg-purple-50 text-purple-700 border border-purple-100' 
                    : client?.isTrusted 
                      ? 'bg-amber-50 text-amber-700 border border-amber-100'
                      : 'bg-blue-50 text-blue-700 border border-blue-100'
                }`}>
                  {client?.isWholesale ? 'Mayorista' : client?.isTrusted ? 'Confianza' : 'Minorista'}
                </span>
              </div>
              {client?.phone && (
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Teléfono:</span>
                  <span className="text-slate-700 font-medium">{client.phone}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-4 pt-3 border-t border-slate-50 text-[10px] text-slate-400 font-medium flex items-center gap-1">
            <AlertCircle size={12} className="text-blue-500" />
            Si ves alguna inconsistencia, contacta al administrador.
          </div>
        </div>

        {/* Total Purchased Card */}
        <div className="card p-5 border border-slate-200/80 shadow-sm flex flex-col justify-center">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Total comprado</p>
          <p className="text-3xl font-extrabold text-emerald-600 mt-1">${(client?.totalPurchased ?? 0).toLocaleString('es-AR')}</p>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">Suma de todos tus pedidos no cancelados.</p>
        </div>

        {/* Total Owed Card */}
        <div className="card p-5 border-t-4 border-t-amber-500 border border-slate-200/80 shadow-sm flex flex-col justify-center">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Saldo Adeudado</p>
          <p className="text-3xl font-extrabold text-amber-600 mt-1">${(client?.totalOwed ?? 0).toLocaleString('es-AR')}</p>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">Suma de saldos pendientes de tus pedidos.</p>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Pending Orders */}
        <div className="lg:col-span-7 space-y-4">
          <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
            <Receipt size={18} className="text-slate-500" />
            Pedidos con Saldo Pendiente ({pendingOrders.length})
          </h2>

          <div className="space-y-4">
            {pendingOrders.length === 0 ? (
              <div className="card p-8 text-center text-slate-400 flex flex-col items-center justify-center">
                <CheckCircle size={36} className="text-emerald-500 mb-2" />
                <p className="font-semibold text-sm">¡Estás al día!</p>
                <p className="text-xs mt-1">No tienes pedidos pendientes de pago en tu cuenta corriente.</p>
              </div>
            ) : (
              pendingOrders.map(order => {
                const status = getOrderStatusConfig(order.orderStatus);
                return (
                  <div key={order.id} className="card p-5 border border-slate-200/80 shadow-sm hover:border-blue-200 transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-sm">Pedido #{String(order.orderNumber).padStart(5, '0')}</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${status.color}`}>
                            {status.text}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(order.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      
                      <div className="text-right">
                        <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-100 font-bold px-2 py-0.5 rounded-full">
                          Adeuda: ${order.pendingAmount.toLocaleString('es-AR')}
                        </span>
                      </div>
                    </div>

                    {/* Items breakdown */}
                    <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-100 space-y-1.5 text-xs text-slate-700">
                      {order.items.map((it: any, idx: number) => (
                        <div key={idx} className="flex justify-between">
                          <span className="font-medium line-clamp-1">{it.name} <span className="text-slate-400 font-normal">x{it.quantity}</span></span>
                          <span className="font-semibold text-slate-600">${(it.unitPrice * it.quantity).toLocaleString('es-AR')}</span>
                        </div>
                      ))}
                    </div>

                    {/* Order Financial Summary */}
                    <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-xs font-semibold text-slate-500">
                      <span>Total: ${order.totalAmount.toLocaleString('es-AR')}</span>
                      <span className="text-emerald-600">Abonado: ${order.paidAmount.toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Payment History */}
        <div className="lg:col-span-5 space-y-4">
          <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
            <ArrowDownLeft size={18} className="text-slate-500" />
            Historial de Pagos ({payments.length})
          </h2>

          <div className="space-y-3">
            {payments.length === 0 ? (
              <div className="card p-6 text-center text-slate-400 text-xs">
                No hay pagos registrados a tu cuenta corriente aún.
              </div>
            ) : (
              payments.map(pay => (
                <div key={pay.id} className="card p-4 border border-slate-200/80 shadow-sm flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
                    <ArrowDownLeft size={16} />
                  </div>
                  <div className="flex-1 text-xs">
                    <div className="flex justify-between font-bold text-slate-800">
                      <span>Pago Recibido</span>
                      <span className="text-emerald-600 text-sm">${pay.amount.toLocaleString('es-AR')}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span className="flex items-center gap-1 font-medium">
                        <Calendar size={10} />
                        {new Date(pay.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="font-semibold uppercase tracking-wider">{getPaymentMethodLabel(pay.paymentMethod)}</span>
                    </div>
                    {pay.observation && (
                      <p className="mt-2 p-1.5 bg-slate-50 border border-slate-100 rounded text-slate-500 italic text-[10px] flex items-start gap-1">
                        <MessageSquare size={10} className="mt-0.5 text-slate-400 flex-shrink-0" />
                        <span>{pay.observation}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
