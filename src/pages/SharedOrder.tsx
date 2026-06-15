import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Order, OrderItem } from '../types/order';
import type { PaymentSettings, BusinessSettings } from '../types/settings';
import { defaultPaymentSettings } from '../constants/defaults';
import { copyToClipboard } from '../utils/copyToClipboard';
import { createMPPreference, createMPPaymentIntent } from '../services/mercadoPagoService';
import { finalizeSharedOrder } from '../services/sharedOrderService';
import { ShoppingBag, Landmark, CheckCircle2, Copy, Check, ArrowRight, Loader2, Package, AlertCircle } from 'lucide-react';

type Step = 'summary' | 'transfer' | 'done';
type PayMode = 'later' | 'transfer' | 'mercadopago';

export const SharedOrder: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(defaultPaymentSettings);
  const [businessWhatsapp, setBusinessWhatsapp] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('summary');
  const [payMode, setPayMode] = useState<PayMode>('later');
  const [processing, setProcessing] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError('ID de pedido inválido.');
      setLoading(false);
      return;
    }

    const loadOrder = async () => {
      try {
        const [orderSnap, paymentsSnap, businessSnap] = await Promise.all([
          getDoc(doc(db, 'orders', orderId)),
          getDoc(doc(db, 'settings', 'payments')),
          getDoc(doc(db, 'settings', 'business')),
        ]);

        if (!orderSnap.exists()) {
          setError('No se encontró el pedido.');
          return;
        }

        const orderData = { id: orderSnap.id, ...orderSnap.data() } as Order;
        if (orderData.orderStatus !== 'draft') {
          setError(
            orderData.orderStatus === 'cancelled'
              ? 'Este pedido fue cancelado.'
              : 'Este pedido ya fue procesado. ¡Gracias!'
          );
          return;
        }

        setOrder(orderData);
        if (paymentsSnap.exists()) {
          setPaymentSettings({ ...defaultPaymentSettings, ...paymentsSnap.data() } as PaymentSettings);
        }
        if (businessSnap.exists()) {
          const biz = businessSnap.data() as BusinessSettings;
          if (biz.whatsapp) setBusinessWhatsapp(biz.whatsapp.replace(/\D/g, ''));
        }
      } catch (err) {
        console.error(err);
        setError('Ocurrió un error al cargar el pedido.');
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
  }, [orderId]);

  const handleCopy = async (field: string, value: string) => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const finalizeOrder = async (mode: PayMode) => {
    if (!order || !orderId) return;
    setProcessing(true);
    try {
      const result = await finalizeSharedOrder({ orderId, paymentMethod: mode });

      setOrder(prev => prev ? { ...prev, orderStatus: 'pending', orderNumber: result.orderNumber } : prev);

      if (mode === 'transfer') {
        setStep('transfer');
      } else {
        setStep('done');
      }
    } catch (err) {
      console.error(err);
      alert('Ocurrió un error al procesar el pedido. Intentá de nuevo.');
    } finally {
      setProcessing(false);
    }
  };

  const handleMercadoPago = async () => {
    if (!order || !orderId) return;
    setProcessing(true);
    try {
      const finalizeResult = await finalizeSharedOrder({ orderId, paymentMethod: 'mercadopago' });
      const orderNumber = finalizeResult.orderNumber;

      setOrder(prev => prev ? { ...prev, orderStatus: 'pending', orderNumber } : prev);

      const intentResult = await createMPPaymentIntent({
        type: 'catalog',
        customerId: order.customerId,
        amount: order.totalAmount,
        method: 'mercadopago',
        orderId,
      });
      const prefResult = await createMPPreference({
        paymentIntentId: intentResult.paymentIntentId,
        title: `Pedido #${orderNumber} - Dualgi 3D`,
      });
      window.open(prefResult.initPoint, '_blank');
      setStep('done');
    } catch (err) {
      console.error(err);
      alert('No se pudo iniciar el pago con Mercado Pago.');
    } finally {
      setProcessing(false);
    }
  };

  const transferConfigured =
    !!paymentSettings.bankTransfer?.alias?.trim() ||
    !!paymentSettings.bankTransfer?.cbu?.trim();

  const mpEnabled = !!paymentSettings.mercadopago?.enabled;

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 size={32} className="animate-spin text-blue-500" />
          <p className="text-sm">Cargando pedido...</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <AlertCircle size={32} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Pedido no disponible</h2>
          <p className="text-slate-500 text-sm">{error || 'Este pedido no existe o ya fue procesado.'}</p>
          <a href="/catalog" className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors">
            Ir al catálogo
          </a>
        </div>
      </div>
    );
  }

  // ── Transfer step ──
  if (step === 'transfer') {
    const alias = paymentSettings.bankTransfer?.alias;
    const cbu = paymentSettings.bankTransfer?.cbu;
    const recipient = paymentSettings.bankTransfer?.holderName;
    const bank = paymentSettings.bankTransfer?.bankName;
    const whatsappNumber = businessWhatsapp;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50"><Landmark size={22} className="text-blue-600" /></div>
            <div>
              <h2 className="font-bold text-slate-900 text-lg">Datos para transferir</h2>
              <p className="text-slate-500 text-sm">Total: <strong className="text-slate-800">${order.totalAmount.toLocaleString('es-AR')}</strong></p>
            </div>
          </div>
          <div className="space-y-3">
            {alias && (
              <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                <div>
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Alias</p>
                  <p className="font-bold text-slate-800">{alias}</p>
                </div>
                <button onClick={() => handleCopy('alias', alias)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                  {copiedField === 'alias' ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                </button>
              </div>
            )}
            {cbu && (
              <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                <div>
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">CBU</p>
                  <p className="font-bold text-slate-800 text-sm break-all">{cbu}</p>
                </div>
                <button onClick={() => handleCopy('cbu', cbu)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                  {copiedField === 'cbu' ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                </button>
              </div>
            )}
            {recipient && (
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Titular</p>
                <p className="font-bold text-slate-800">{recipient}</p>
                {bank && <p className="text-xs text-slate-500 mt-0.5">{bank}</p>}
              </div>
            )}
          </div>
          {whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola! Realicé la transferencia por el Pedido #${order.orderNumber || ''} por $${order.totalAmount.toLocaleString('es-AR')}. Adjunto el comprobante.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-semibold transition-colors shadow-md shadow-green-500/20 text-sm"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Enviar comprobante por WhatsApp
            </a>
          )}
          <p className="text-center text-xs text-slate-400">
            Tu pedido #{order.orderNumber} quedó registrado. Avisanos cuando hayas transferido.
          </p>
        </div>
      </div>
    );
  }

  // ── Done step ──
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto">
            <CheckCircle2 size={36} className="text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">¡Pedido confirmado!</h2>
          <p className="text-slate-500 text-sm">
            Tu pedido #{order.orderNumber} por <strong className="text-slate-700">${order.totalAmount.toLocaleString('es-AR')}</strong> fue registrado correctamente.
            El negocio se pondrá en contacto para coordinar el pago.
          </p>
          <a href="/catalog" className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors">
            Ver catálogo
          </a>
        </div>
      </div>
    );
  }

  // ── Summary (main) ──
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-5">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto shadow-lg shadow-blue-500/30 mb-3">
            <ShoppingBag size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Tu pedido</h1>
          <p className="text-slate-500 text-sm">Preparado para <strong className="text-slate-700">{order.customerName}</strong></p>
        </div>

        {/* Products */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50 flex items-center gap-2">
            <Package size={16} className="text-slate-400" />
            <span className="font-semibold text-slate-700 text-sm">Productos del pedido</span>
          </div>
          <div className="divide-y divide-slate-50">
            {order.items.map((item: OrderItem, idx: number) => (
              <div key={idx} className="flex items-center gap-3 px-4 py-3">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0 bg-slate-100" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Package size={18} className="text-slate-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm line-clamp-1">{item.name}</p>
                  <p className="text-xs text-slate-400">x{item.quantity} · ${item.unitPrice.toLocaleString('es-AR')} c/u</p>
                </div>
                <p className="font-bold text-slate-800 text-sm flex-shrink-0">${(item.unitPrice * item.quantity).toLocaleString('es-AR')}</p>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="font-bold text-slate-700">Total</span>
            <span className="text-xl font-bold text-blue-600">${order.totalAmount.toLocaleString('es-AR')}</span>
          </div>
        </div>

        {/* Observations */}
        {order.observationsPublic && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-800">
            <strong>Nota:</strong> {order.observationsPublic}
          </div>
        )}

        {/* Payment mode selector */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3">
          <h2 className="font-bold text-slate-800">¿Cómo querés pagar?</h2>

          {/* Later */}
          <button onClick={() => setPayMode('later')} className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${payMode === 'later' ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}>
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${payMode === 'later' ? 'border-blue-500' : 'border-slate-300'}`}>
              {payMode === 'later' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-sm">Pagar después / coordinar</p>
              <p className="text-xs text-slate-400">El negocio se pondrá en contacto</p>
            </div>
          </button>

          {/* Transfer */}
          {transferConfigured && (
            <button onClick={() => setPayMode('transfer')} className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${payMode === 'transfer' ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${payMode === 'transfer' ? 'border-blue-500' : 'border-slate-300'}`}>
                {payMode === 'transfer' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">Transferencia bancaria</p>
                <p className="text-xs text-slate-400">CBU / Alias</p>
              </div>
            </button>
          )}

          {/* MercadoPago */}
          {mpEnabled && (
            <button onClick={() => setPayMode('mercadopago')} className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${payMode === 'mercadopago' ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${payMode === 'mercadopago' ? 'border-blue-500' : 'border-slate-300'}`}>
                {payMode === 'mercadopago' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">MercadoPago</p>
                <p className="text-xs text-slate-400">Pago online seguro</p>
              </div>
            </button>
          )}
        </div>

        {/* Confirm */}
        <button
          onClick={() => payMode === 'mercadopago' ? handleMercadoPago() : finalizeOrder(payMode)}
          disabled={processing}
          className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? (
            <><Loader2 size={18} className="animate-spin" /> Procesando...</>
          ) : (
            <>{payMode === 'later' ? 'Confirmar pedido' : payMode === 'transfer' ? 'Ver datos de transferencia' : 'Pagar con MercadoPago'} <ArrowRight size={18} /></>
          )}
        </button>

        <p className="text-center text-xs text-slate-400 pb-4">
          Al confirmar aceptás que el pedido se procesará según los términos del negocio.
        </p>
      </div>
    </div>
  );
};
