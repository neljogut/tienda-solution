import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { CheckCircle2, Clock, XCircle, MessageSquare, Loader2 } from 'lucide-react';
import { db } from '../../firebase';
import type { Order } from '../../types/order';
import type { BusinessSettings } from '../../types/settings';
import { finalizeCheckoutWithWhatsApp, finalizeBalancePaymentWithWhatsApp } from '../../services/checkoutFinalize';
import { useAuth } from '../../context/AuthContext';

export const PaymentResult: React.FC = () => {
  const { userData } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const status = searchParams.get('status') || 'pending';
  const orderId = searchParams.get('orderId');
  const intentId = searchParams.get('intent');
  const amount = Number(searchParams.get('amount') || 0);
  const balanceMode = searchParams.get('mode') === 'balance';

  const [order, setOrder] = useState<Order | null>(null);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getDoc(doc(db, 'settings', 'business')).then((snap) => {
      if (snap.exists()) setBusiness(snap.data() as BusinessSettings);
    });
  }, []);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(doc(db, 'orders', orderId), (snap) => {
      if (snap.exists()) {
        setOrder({ id: snap.id, ...snap.data() } as Order);
      }
      setLoading(false);
    });
    return unsub;
  }, [orderId]);

  const statusConfig: Record<string, { icon: React.ReactNode; title: string; desc: string; color: string }> = {
    success: {
      icon: <CheckCircle2 size={48} className="text-emerald-500" />,
      title: '¡Pedido confirmado!',
      desc: amount === 0
        ? 'Tu pedido fue registrado. Te contactamos por WhatsApp.'
        : 'Tu pedido fue registrado correctamente.',
      color: 'text-emerald-700',
    },
    pending: {
      icon: <Clock size={48} className="text-amber-500" />,
      title: 'Pago pendiente',
      desc: 'Tu pago está en proceso de confirmación.',
      color: 'text-amber-700',
    },
    failure: {
      icon: <XCircle size={48} className="text-red-500" />,
      title: 'Pago no completado',
      desc: 'El pago no se realizó. Podés intentar de nuevo.',
      color: 'text-red-700',
    },
    transfer: {
      icon: <Clock size={48} className="text-blue-500" />,
      title: 'Transferencia registrada',
      desc: 'Recordá enviar el comprobante por WhatsApp para que registremos el pago.',
      color: 'text-blue-700',
    },
  };
  const config = statusConfig[status] || statusConfig.pending;

  if (loading && orderId) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto text-center space-y-6 pb-12 animate-fadeIn pt-8">
      <div className="card p-8 border border-slate-200/80">
        <div className="flex justify-center mb-4">{config.icon}</div>
        <h1 className={`text-2xl font-bold ${config.color}`}>{config.title}</h1>
        <p className="text-slate-500 mt-2">{config.desc}</p>

        {order && (
          <div className="mt-6 p-4 bg-slate-50 rounded-xl text-left text-sm space-y-1">
            <p><span className="text-slate-400">Pedido:</span> <strong>#{String(order.orderNumber).padStart(5, '0')}</strong></p>
            <p><span className="text-slate-400">Total:</span> ${order.totalAmount.toLocaleString('es-AR')}</p>
            <p><span className="text-slate-400">Abonado:</span> ${order.paidAmount.toLocaleString('es-AR')}</p>
            <p><span className="text-slate-400">Pendiente:</span> ${order.pendingAmount.toLocaleString('es-AR')}</p>
          </div>
        )}

        {balanceMode && amount > 0 && (
          <p className="mt-4 text-sm text-slate-600">
            Monto informado: <strong>${amount.toLocaleString('es-AR')}</strong>
          </p>
        )}

        {status === 'transfer' && (
          <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
            Enviá el comprobante de la transferencia por WhatsApp para que el pago quede registrado en tus movimientos.
          </p>
        )}

        <div className="flex flex-col gap-3 mt-6">
          {business?.whatsapp && (status === 'transfer' || (status === 'success' && order)) && (
            <button
              onClick={() => {
                const whatsappWin = window.open('about:blank', '_blank');
                if (balanceMode) {
                  finalizeBalancePaymentWithWhatsApp({
                    customerName: userData?.displayName || 'Cliente',
                    amount,
                    method: 'transfer',
                  }, { preOpenedWindow: whatsappWin });
                } else if (order) {
                  finalizeCheckoutWithWhatsApp({
                    order,
                    amountPaid: amount || order.paidAmount,
                    method: status === 'transfer' ? 'transfer' : 'none',
                  }, { preOpenedWindow: whatsappWin });
                }
              }}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <MessageSquare size={18} />
              Contactar por WhatsApp
            </button>
          )}
          <button onClick={() => navigate('/my-orders')} className="btn-secondary">
            Ver mis pedidos
          </button>
          <button onClick={() => navigate('/catalog')} className="text-sm text-slate-500 hover:text-slate-700">
            Volver al catálogo
          </button>
        </div>
      </div>

      {intentId && status === 'pending' && (
        <p className="text-xs text-slate-400">Ref: {intentId}</p>
      )}
    </div>
  );
};
