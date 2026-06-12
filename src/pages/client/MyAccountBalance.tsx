import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  CreditCard, Receipt, CheckCircle,
  ArrowDownLeft, AlertCircle, Calendar, MessageSquare, Wallet, Clock
} from 'lucide-react';
import { NumericInput } from '../../components/NumericInput';
import { resolveCustomerId } from '../../services/clientResolver';
import type { Order } from '../../types/order';
import type { Client } from '../../types/client';
import type { PaymentDeclaration } from '../../types/payment';

export const MyAccountBalance: React.FC = () => {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [pendingDeclarations, setPendingDeclarations] = useState<PaymentDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [customPayAmount, setCustomPayAmount] = useState<number | ''>('');

  useEffect(() => {
    if (!currentUser) return;

    let unsubClient: (() => void) | null = null;
    let unsubOrders: (() => void) | null = null;
    let unsubPayments: (() => void) | null = null;
    let unsubDeclarations: (() => void) | null = null;

    const setupListeners = async () => {
      const resolvedCustomerId = await resolveCustomerId(currentUser, userData);
      setCustomerId(resolvedCustomerId);

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
          if (o.orderStatus !== 'cancelled' && o.orderStatus !== 'draft') {
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
        setPayments(list);
      });

      // 5. Pagos declarados pendientes de confirmación
      const qDeclarations = query(
        collection(db, 'payment_declarations'),
        where('createdBy', '==', currentUser.uid)
      );
      unsubDeclarations = onSnapshot(qDeclarations, (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as PaymentDeclaration))
          .filter((d) => d.status === 'declared');
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setPendingDeclarations(list);
      });
    };

    setupListeners();

    return () => {
      if (unsubClient) unsubClient();
      if (unsubOrders) unsubOrders();
      if (unsubPayments) unsubPayments();
      if (unsubDeclarations) unsubDeclarations();
    };
  }, [currentUser, userData]);

  const mergedPayments = React.useMemo(() => {
    const list = [...payments];
    orders.forEach(o => {
      if (o.paidAmount && o.paidAmount > 0) {
        const hasDirectMovement = list.some(m => m.orderId === o.id);
        if (!hasDirectMovement) {
          list.push({
            id: `virtual_${o.id}`,
            date: o.date,
            amount: o.paidAmount,
            paymentMethod: o.paymentMethod || 'transfer',
            observation: `Seña / Pago de Pedido #${String(o.orderNumber).padStart(5, '0')}`
          });
        }
      }
    });
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [payments, orders]);

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
  const totalOwed = orders
    .filter(o => o.orderStatus !== 'cancelled')
    .reduce((sum, o) => sum + (o.pendingAmount || 0), 0);

  const goToPay = (amount: number) => {
    if (amount <= 0 || !customerId) return;
    navigate(`/checkout?mode=balance&amount=${amount}&customerId=${customerId}`);
  };

  const pendingDeclaredTotal = pendingDeclarations.reduce((sum, d) => sum + d.amount, 0);

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

      {pendingDeclarations.length > 0 && (
        <div className="card border border-blue-200/80 bg-blue-50/50 p-4 sm:p-5 space-y-2">
          <div className="flex items-center gap-2 text-blue-800">
            <Clock size={18} />
            <h2 className="font-bold text-sm sm:text-base">Pagos informados — pendientes de confirmación</h2>
          </div>
          {pendingDeclarations.map((decl) => (
            <p key={decl.id} className="text-sm text-slate-700">
              Informaste un pago de <strong>${decl.amount.toLocaleString('es-AR')}</strong>
              {decl.type === 'order_transfer' && decl.orderNumber
                ? ` (Pedido #${String(decl.orderNumber).padStart(5, '0')})`
                : ' en tu cuenta corriente'}
              {' '}el {new Date(decl.createdAt).toLocaleString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}. El negocio lo confirmará cuando revise tu comprobante en WhatsApp.
            </p>
          ))}
          {pendingDeclarations.length > 1 && (
            <p className="text-xs text-slate-500 pt-1">
              Total informado pendiente: ${pendingDeclaredTotal.toLocaleString('es-AR')} (aún no aplicado a tu saldo).
            </p>
          )}
        </div>
      )}

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
          <p className="text-3xl font-extrabold text-emerald-600 mt-1">
            ${orders
              .filter(o => o.orderStatus !== 'cancelled')
              .reduce((sum, o) => sum + (o.totalAmount || 0), 0)
              .toLocaleString('es-AR')}
          </p>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">Suma de todos tus pedidos no cancelados.</p>
        </div>

        {/* Total Owed Card */}
        <div className="card p-5 border-t-4 border-t-amber-500 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Saldo Adeudado</p>
            <p className="text-3xl font-extrabold text-amber-600 mt-1">
              ${totalOwed.toLocaleString('es-AR')}
            </p>
            <p className="text-[10px] text-slate-400 mt-2 font-medium">Suma de saldos pendientes de tus pedidos.</p>
          </div>
          {totalOwed > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
              <button
                onClick={() => goToPay(totalOwed)}
                className="btn-primary w-full text-sm flex items-center justify-center gap-2"
              >
                <Wallet size={16} />
                Pagar todo (${totalOwed.toLocaleString('es-AR')})
              </button>
              <div className="flex gap-2">
                <NumericInput
                  className="input flex-1 !py-2 text-sm"
                  value={customPayAmount}
                  allowDecimals
                  onChange={setCustomPayAmount}
                  placeholder="Monto personalizado"
                />
                <button
                  onClick={() => {
                    const amt = customPayAmount === '' ? 0 : Number(customPayAmount);
                    if (amt > 0 && amt <= totalOwed) goToPay(amt);
                    else alert(`Ingresá un monto entre $1 y $${totalOwed.toLocaleString('es-AR')}`);
                  }}
                  className="btn-secondary text-sm px-4"
                >
                  Pagar
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                Pagás por transferencia y enviás el comprobante por WhatsApp. El pago se aplica del pedido más antiguo al más reciente.
              </p>
            </div>
          )}
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
            Historial de Pagos ({mergedPayments.length})
          </h2>

          <div className="space-y-3">
            {mergedPayments.length === 0 ? (
              <div className="card p-6 text-center text-slate-400 text-xs">
                No hay pagos registrados a tu cuenta corriente aún.
              </div>
            ) : (
              mergedPayments.map(pay => (
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
