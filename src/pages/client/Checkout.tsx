import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import {
  ShoppingBag, Landmark, Loader2, Copy, Check,
  Shield, AlertCircle, ArrowLeft, CreditCard, Calendar,
} from 'lucide-react';
import { createMPPaymentIntent, createMPPreference } from '../../services/mercadoPagoService';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useCartStore } from '../../store/cartStore';
import type { Client } from '../../types/client';
import type { DepositSettings, PaymentSettings, BusinessSettings } from '../../types/settings';
import { defaultDeposit, defaultPaymentSettings, getDefaultBusinessSettings } from '../../constants/defaults';
import { NumericInput } from '../../components/NumericInput';
import { estimateDeliveryTime, type EstimationResult } from '../../utils/deliveryEstimator';
import { copyToClipboard } from '../../utils/copyToClipboard';
import { createCatalogOrderClient } from '../../services/catalogOrderService';
import { finalizeCheckoutWithWhatsApp, finalizeBalancePaymentWithWhatsApp } from '../../services/checkoutFinalize';
import {
  declareBalancePayment,
  declareOrderTransferPayment,
  notifyStaffPaymentDeclarationOnce,
} from '../../services/paymentDeclarationService';
import { resolveCustomerId } from '../../services/clientResolver';
import type { Order } from '../../types/order';

type PayMode = 'catalog' | 'balance';
type AmountChoice = 'deposit' | 'total' | 'custom' | 'later';

export const Checkout: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = (searchParams.get('mode') as PayMode) || 'catalog';
  const presetAmount = searchParams.get('amount');
  const presetCustomerId = searchParams.get('customerId') || '';

  const { currentUser, userData } = useAuth();
  const { items, getTotalPrice, clearCart } = useCartStore();

  const [client, setClient] = useState<Client | null>(null);
  const [depositSettings, setDepositSettings] = useState<DepositSettings>(defaultDeposit);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(defaultPaymentSettings);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [amountChoice, setAmountChoice] = useState<AmountChoice>('deposit');
  const [depositAmount, setDepositAmount] = useState<number | ''>('');
  const [customAmount, setCustomAmount] = useState<number | ''>('');
  const [transferStep, setTransferStep] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [confirmedPayAmount, setConfirmedPayAmount] = useState(0);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'mercadopago'>('transfer');
  const [deliveryEstimation, setDeliveryEstimation] = useState<EstimationResult | null>(null);
  const checkoutInProgressRef = useRef(false);

  const cartTotal = getTotalPrice();
  const balanceAmount = presetAmount ? Number(presetAmount) : (client?.totalOwed || 0);
  const totalDue = mode === 'balance' ? balanceAmount : cartTotal;

  const isTrusted = client?.isTrusted ?? false;
  const bypassDeposit = isTrusted && (depositSettings.trustedClientBypassDeposit ?? true);
  const requiredDepositPercent = depositSettings.requiredDepositPercent || 30;
  const minDeposit = bypassDeposit ? 0 : Math.ceil(totalDue * (requiredDepositPercent / 100));

  const rawDepositAmount = depositAmount === '' ? minDeposit : Number(depositAmount);
  const depositBelowMin =
    !bypassDeposit && amountChoice === 'deposit' && minDeposit < totalDue && rawDepositAmount < minDeposit;
  const depositAboveMax =
    amountChoice === 'deposit' && minDeposit < totalDue && rawDepositAmount > totalDue;

  const payAmount = useMemo(() => {
    if (mode === 'balance') return totalDue;
    if (amountChoice === 'later') return 0;
    if (amountChoice === 'total') return totalDue;
    if (amountChoice === 'deposit') {
      if (minDeposit >= totalDue) return totalDue;
      return depositAmount === '' ? minDeposit : Number(depositAmount);
    }
    if (amountChoice === 'custom') return customAmount === '' ? 0 : Number(customAmount);
    return 0;
  }, [mode, amountChoice, customAmount, totalDue, minDeposit, depositAmount]);

  const transferConfigured =
    !!paymentSettings.bankTransfer?.alias?.trim() || !!paymentSettings.bankTransfer?.cbu?.trim();

  const mpCommissionPercent = paymentSettings.mercadopago?.commissionPercent || 0;
  const mpCommissionAmount = payAmount * (mpCommissionPercent / 100);
  const totalWithCommission = payAmount + mpCommissionAmount;

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    if (mode === 'catalog' && items.length === 0 && !transferStep && !checkoutInProgressRef.current) {
      navigate('/catalog');
      return;
    }

    const load = async () => {
      try {
        const customerId = await resolveCustomerId(currentUser, userData, presetCustomerId);
        if (customerId) {
          const clientSnap = await getDoc(doc(db, 'clients', customerId));
          if (clientSnap.exists()) {
            setClient({ id: clientSnap.id, ...clientSnap.data() } as Client);
          }
        }

        const [depositSnap, paymentsSnap, businessSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'deposit')),
          getDoc(doc(db, 'settings', 'payments')),
          getDoc(doc(db, 'settings', 'business')),
        ]);
        if (depositSnap.exists()) setDepositSettings(depositSnap.data() as DepositSettings);
        if (paymentsSnap.exists()) {
          setPaymentSettings({ ...defaultPaymentSettings, ...paymentsSnap.data() } as PaymentSettings);
        }
        if (businessSnap.exists()) {
          setBusinessSettings(businessSnap.data() as BusinessSettings);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser, userData, mode, items.length, navigate, transferStep, presetCustomerId]);

  useEffect(() => {
    if (mode === 'balance' || transferStep || checkoutInProgressRef.current) return;
    if (bypassDeposit) {
      setAmountChoice('later');
    } else if (minDeposit >= totalDue) {
      setAmountChoice('total');
    } else {
      setAmountChoice('deposit');
    }
  }, [bypassDeposit, minDeposit, totalDue, mode, transferStep]);

  useEffect(() => {
    if (mode === 'catalog' && items.length > 0) {
      estimateDeliveryTime(
        items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          type: item.type,
        }))
      )
        .then((res) => {
          setDeliveryEstimation(res);
        })
        .catch((err) => {
          console.error('Error estimating delivery time:', err);
        });
    } else {
      setDeliveryEstimation(null);
    }
  }, [items, mode]);

  const handleDepositBlur = () => {
    if (depositAmount === '' || minDeposit >= totalDue) return;
    const val = Number(depositAmount);
    if (val < minDeposit) setDepositAmount(minDeposit);
    else if (val > totalDue) setDepositAmount(totalDue);
  };

  const handleCopy = async (field: string, value: string) => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const validateAmount = (): boolean => {
    if (mode === 'balance') {
      if (payAmount <= 0 || payAmount > (client?.totalOwed || 0)) {
        alert('Monto inválido para tu deuda.');
        return false;
      }
      return true;
    }
    if (payAmount < 0 || payAmount > totalDue) {
      alert('El monto no puede superar el total del pedido.');
      return false;
    }
    if (!bypassDeposit && amountChoice === 'deposit' && minDeposit < totalDue) {
      const raw = depositAmount === '' ? minDeposit : Number(depositAmount);
      if (raw < minDeposit) {
        alert(`La seña mínima es $${minDeposit.toLocaleString('es-AR')} (${requiredDepositPercent}% del total).`);
        return false;
      }
      if (raw > totalDue) {
        alert('El monto no puede superar el total del pedido.');
        return false;
      }
    }
    if (bypassDeposit && amountChoice === 'custom' && (customAmount === '' || Number(customAmount) <= 0)) {
      alert('Ingresá el monto que querés abonar ahora.');
      return false;
    }
    if (payAmount > 0 && paymentMethod === 'transfer' && !transferConfigured) {
      alert('Los datos bancarios aún no están configurados. Contactá al negocio.');
      return false;
    }
    return true;
  };

  const handleConfirm = async () => {
    if (!client || !currentUser || !validateAmount()) return;
    setProcessing(true);

    try {
      if (mode === 'catalog') {
        const result = await createCatalogOrderClient(
          items,
          userData?.displayName || 'Cliente',
          currentUser,
          userData
        );

        const orderSnap = await getDoc(doc(db, 'orders', result.orderId));
        const orderData = orderSnap.exists()
          ? ({ id: orderSnap.id, ...orderSnap.data() } as Order)
          : null;

        if (!orderData) throw new Error('No se pudo cargar el pedido.');

        if (payAmount === 0) {
          clearCart();
          await finalizeCheckoutWithWhatsApp({ order: orderData, amountPaid: 0, method: 'none' });
          navigate(`/payment/result?status=success&orderId=${result.orderId}&amount=0`);
          return;
        }

        if (paymentMethod === 'mercadopago') {
          // 1. Update order in Firestore with Mercado Pago method
          await updateDoc(doc(db, 'orders', result.orderId), {
            paymentMethod: 'mercadopago',
            observationsInternal:
              (orderData.observationsInternal || '') +
              `\n[Checkout] Pago iniciado vía Mercado Pago por $${totalWithCommission.toLocaleString('es-AR')} (Neto: $${payAmount.toLocaleString('es-AR')}).`,
          });

          // 2. Create Payment Intent (passing the net amount, functions will calculate the commission)
          const intentResult = await createMPPaymentIntent({
            type: 'catalog',
            customerId: client.id,
            amount: payAmount,
            method: 'mercadopago',
            orderId: result.orderId,
          });

          // 3. Create MP Preference
          const prefResult = await createMPPreference({
            paymentIntentId: intentResult.paymentIntentId,
            title: `Pedido #${String(result.orderNumber).padStart(5, '0')} - ${businessSettings?.name || getDefaultBusinessSettings().name}`,
          });

          clearCart();
          window.open(prefResult.initPoint, '_blank');
          navigate(`/payment/result?status=pending&intent=${intentResult.paymentIntentId}`);
          return;
        }

        // Transfer method (existing logic)
        await updateDoc(doc(db, 'orders', result.orderId), {
          paymentMethod: 'transfer',
          observationsInternal:
            (orderData.observationsInternal || '') +
            `\n[Checkout] Cliente declaró transferencia de $${payAmount.toLocaleString('es-AR')}. Pendiente comprobante.`,
        });

        const updatedSnap = await getDoc(doc(db, 'orders', result.orderId));
        const finalOrder = updatedSnap.exists()
          ? ({ id: updatedSnap.id, ...updatedSnap.data() } as Order)
          : orderData;

        checkoutInProgressRef.current = true;
        setConfirmedPayAmount(payAmount);
        setCreatedOrder(finalOrder);
        setTransferStep(true);
        clearCart();
        return;
      }

      // Debt balance payment
      if (paymentMethod === 'mercadopago') {
        const intentResult = await createMPPaymentIntent({
          type: 'balance',
          customerId: client.id,
          amount: payAmount,
          method: 'mercadopago',
          orderId: null,
        });

        const prefResult = await createMPPreference({
          paymentIntentId: intentResult.paymentIntentId,
          title: `Pago Saldo Cuenta Corriente - ${businessSettings?.name || getDefaultBusinessSettings().name}`,
        });

        window.open(prefResult.initPoint, '_blank');
        navigate(`/payment/result?status=pending&intent=${intentResult.paymentIntentId}&mode=balance`);
        return;
      }

      if (!transferConfigured) {
        alert('Los datos bancarios aún no están configurados.');
        return;
      }
      setConfirmedPayAmount(payAmount);
      setTransferStep(true);
    } catch (err) {
      console.error(err);
      alert('No se pudo procesar el checkout. Intentá de nuevo.');
    } finally {
      setProcessing(false);
    }
  };

  const handleTransferDone = async () => {
    if (whatsappLoading || !currentUser) return;
    setWhatsappLoading(true);

    const amount = confirmedPayAmount;
    const whatsappWin = window.open('about:blank', '_blank');

    try {
      const customerId = await resolveCustomerId(currentUser, userData, presetCustomerId || client?.id);
      if (!customerId) {
        whatsappWin?.close();
        alert('No se pudo vincular tu cuenta de cliente. Contactá al administrador.');
        return;
      }

      const customerName =
        userData?.displayName ||
        (client ? `${client.firstName} ${client.lastName}`.trim() : '') ||
        'Cliente';

      if (mode === 'catalog' && createdOrder) {
        const opened = await finalizeCheckoutWithWhatsApp({
          order: createdOrder,
          amountPaid: amount,
          method: 'transfer',
        }, { preOpenedWindow: whatsappWin });

        if (!opened) {
          alert('No se pudo abrir WhatsApp. Verificá que el negocio tenga el número configurado en Datos del negocio.');
          return;
        }

        if (amount > 0) {
          try {
            const declarationId = await declareOrderTransferPayment({
              orderId: createdOrder.id,
              orderNumber: createdOrder.orderNumber,
              customerId: createdOrder.customerId || customerId,
              customerName: createdOrder.customerName || customerName,
              amount,
              createdBy: currentUser.uid,
            });
            await notifyStaffPaymentDeclarationOnce({
              declarationId,
              customerId: createdOrder.customerId || customerId,
              customerName: createdOrder.customerName || customerName,
              amount,
              method: 'transfer',
              orderId: createdOrder.id,
              orderNumber: createdOrder.orderNumber,
            });
          } catch (declareErr) {
            console.error(declareErr);
            alert('Se abrió WhatsApp pero no se pudo registrar el aviso de pago. Contactá al negocio para confirmar tu transferencia.');
            return;
          }
        }

        setTimeout(() => {
          navigate(`/payment/result?status=transfer&orderId=${createdOrder.id}&amount=${amount}`);
        }, 400);
      } else if (mode === 'balance') {
        if (amount <= 0) {
          whatsappWin?.close();
          alert('El monto a pagar debe ser mayor a cero.');
          return;
        }

        const opened = await finalizeBalancePaymentWithWhatsApp({
          customerName,
          amount,
          method: 'transfer',
        }, { preOpenedWindow: whatsappWin });

        if (!opened) {
          alert('No se pudo abrir WhatsApp. Verificá que el negocio tenga el número configurado en Datos del negocio.');
          return;
        }

        try {
          const declarationId = await declareBalancePayment({
            customerId,
            customerName,
            amount,
            method: 'transfer',
            createdBy: currentUser.uid,
          });
          await notifyStaffPaymentDeclarationOnce({
            declarationId,
            customerId,
            customerName,
            amount,
            method: 'transfer',
          });
        } catch (declareErr) {
          console.error(declareErr);
          alert('Se abrió WhatsApp pero no se pudo registrar el aviso de pago. Contactá al negocio para confirmar tu transferencia.');
          return;
        }

        setTimeout(() => {
          navigate(`/payment/result?status=transfer&mode=balance&amount=${amount}`);
        }, 400);
      }
    } catch (err) {
      console.error(err);
      whatsappWin?.close();
      alert('No se pudo completar el proceso. Intentá de nuevo.');
    } finally {
      setWhatsappLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <Loader2 className="animate-spin mb-3" size={32} />
        <p>Preparando checkout...</p>
      </div>
    );
  }

  if (transferStep) {
    const bt = paymentSettings.bankTransfer;
    return (
      <div className="max-w-lg mx-auto space-y-6 pb-12 animate-fadeIn">
        <div className="card p-6 border border-slate-200/80">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Landmark size={22} className="text-emerald-600" />
            Datos para transferir
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Transferí <strong className="text-slate-800">${confirmedPayAmount.toLocaleString('es-AR')}</strong> y luego avisá por WhatsApp con el comprobante.
          </p>

          <div className="mt-6 space-y-4">
            {bt.holderName && (
              <CopyField label="Titular" value={bt.holderName} fieldKey="holder" copied={copiedField} onCopy={handleCopy} />
            )}
            {bt.bankName && (
              <CopyField label="Banco" value={bt.bankName} fieldKey="bank" copied={copiedField} onCopy={handleCopy} />
            )}
            {bt.alias && (
              <CopyField label="Alias" value={bt.alias} fieldKey="alias" copied={copiedField} onCopy={handleCopy} />
            )}
            {bt.cbu && (
              <CopyField label="CBU" value={bt.cbu} fieldKey="cbu" copied={copiedField} onCopy={handleCopy} />
            )}
          </div>

          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3 mt-4">
            {bt.note || 'Enviá el comprobante por WhatsApp para que registremos el pago en tus movimientos.'}
          </p>

          <button
            onClick={handleTransferDone}
            disabled={whatsappLoading}
            className="btn-primary w-full mt-6 flex items-center justify-center gap-2"
          >
            {whatsappLoading ? <Loader2 size={18} className="animate-spin" /> : null}
            Ya transferí — avisar por WhatsApp
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12 animate-fadeIn">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={16} /> Volver
      </button>

      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <ShoppingBag size={26} className="text-blue-600" />
          {mode === 'balance' ? 'Pagar saldo' : 'Checkout'}
        </h1>
        <p className="page-subtitle">
          {mode === 'balance'
            ? 'Aboná tu deuda por transferencia bancaria.'
            : 'Elegí cuánto abonar. El pago es por transferencia y confirmación por WhatsApp.'}
        </p>
      </div>

      <div className="card p-5 border border-slate-200/80">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Resumen</h2>
        {mode === 'catalog' ? (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.productId} className="flex justify-between text-sm">
                <span className="text-slate-700">{item.name} × {item.quantity}</span>
                <span className="font-semibold">${(item.price * item.quantity).toLocaleString('es-AR')}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">Pago de cuenta corriente</p>
        )}
        <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-100">
          <span className="font-bold text-slate-800">Total</span>
          <span className="text-2xl font-black text-slate-900">${totalDue.toLocaleString('es-AR')}</span>
        </div>
        {isTrusted && mode === 'catalog' && (
          <div className="flex items-center gap-2 mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <Shield size={14} />
            Tenés cuenta de confianza: podés confirmar el pedido sin abonar ahora.
          </div>
        )}
      </div>

      {mode === 'catalog' && businessSettings?.showEstimatedDeliveryDateToClient !== false && deliveryEstimation?.estimatedDate && (
        <div className="card p-5 border border-slate-200/80 shadow-sm bg-blue-50/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100/70 text-blue-600 rounded-lg mt-0.5">
              <Calendar size={18} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Fecha de Entrega Estimada</h3>
              <p className="text-lg font-black text-blue-600 mt-0.5">
                {deliveryEstimation.estimatedDate.toLocaleDateString('es-AR', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <p className="text-[10px] text-slate-400 mt-1 leading-normal font-medium">
                (sujeta a tiempos de fabricación, armado y calidad)
              </p>
            </div>
          </div>
        </div>
      )}

      {mode === 'catalog' && (
        <div className="card p-5 border border-slate-200/80 space-y-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">¿Cómo preferís abonar?</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {bypassDeposit
                ? 'Elegí si querés señar, abonar el total o avanzar sin pago por ahora.'
                : 'Podés señar desde el monto mínimo o abonar el total del pedido.'}
            </p>
          </div>

          {/* Cliente de confianza */}
          {bypassDeposit && (
            <>
              <PaymentChoice
                name="amount"
                checked={amountChoice === 'later'}
                onSelect={() => setAmountChoice('later')}
                title="Avanzar sin abonar ahora"
                description="Confirmamos tu pedido y el saldo queda pendiente en tu cuenta."
                amountLabel="Sin pago inicial"
              />
              <PaymentChoice
                name="amount"
                checked={amountChoice === 'total'}
                onSelect={() => setAmountChoice('total')}
                title="Abonar el total ahora"
                description="Transferís el monto completo y el pedido queda saldado."
                amountLabel={`$${totalDue.toLocaleString('es-AR')}`}
              />
              <PaymentChoice
                name="amount"
                checked={amountChoice === 'custom'}
                onSelect={() => setAmountChoice('custom')}
                title="Abonar un monto parcial"
                description="Indicá cuánto querés transferir ahora (hasta el total del pedido)."
                amountLabel={amountChoice === 'custom' && customAmount !== '' ? `$${Number(customAmount).toLocaleString('es-AR')}` : 'A definir'}
              >
                {amountChoice === 'custom' && (
                  <NumericInput
                    className="input mt-3"
                    value={customAmount}
                    allowDecimals
                    onChange={setCustomAmount}
                  />
                )}
              </PaymentChoice>
            </>
          )}

          {/* Cliente estándar (no confianza) */}
          {!bypassDeposit && (
            <>
              {minDeposit < totalDue && (
                <PaymentChoice
                  name="amount"
                  checked={amountChoice === 'deposit'}
                  onSelect={() => {
                    setAmountChoice('deposit');
                    if (depositAmount === '') setDepositAmount(minDeposit);
                  }}
                  title="Señar el pedido"
                  description={`Mínimo ${requiredDepositPercent}% ($${minDeposit.toLocaleString('es-AR')}). Podés abonar más si lo preferís.`}
                  amountLabel={`$${rawDepositAmount.toLocaleString('es-AR')}`}
                >
                  {amountChoice === 'deposit' && (
                    <div className="mt-3">
                      <label className="text-[11px] font-medium text-slate-500 block mb-1">
                        Monto de la seña
                      </label>
                      <NumericInput
                        className={`input ${depositBelowMin || depositAboveMax ? 'border-red-400 ring-1 ring-red-200' : ''}`}
                        value={depositAmount === '' ? minDeposit : depositAmount}
                        allowDecimals
                        onChange={(val) => setDepositAmount(val)}
                        onBlur={handleDepositBlur}
                      />
                      {depositBelowMin ? (
                        <p className="text-[10px] text-red-600 mt-1.5">
                          La seña mínima es ${minDeposit.toLocaleString('es-AR')} ({requiredDepositPercent}% del total).
                        </p>
                      ) : depositAboveMax ? (
                        <p className="text-[10px] text-red-600 mt-1.5">
                          El monto no puede superar ${totalDue.toLocaleString('es-AR')}.
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-400 mt-1.5">
                          Entre ${minDeposit.toLocaleString('es-AR')} y ${totalDue.toLocaleString('es-AR')}
                        </p>
                      )}
                    </div>
                  )}
                </PaymentChoice>
              )}
              <PaymentChoice
                name="amount"
                checked={amountChoice === 'total'}
                onSelect={() => setAmountChoice('total')}
                title="Abonar el total ahora"
                description="Transferís el monto completo del pedido en un solo pago."
                amountLabel={`$${totalDue.toLocaleString('es-AR')}`}
              />
            </>
          )}
        </div>
      )}

      {payAmount > 0 && (
        <div className="card p-5 border border-slate-200/80 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Seleccioná el método de pago</h2>
            <p className="text-xs text-slate-500 mt-0.5">Elegí cómo preferís realizar tu pago.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Transfer Option */}
            <label
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                paymentMethod === 'transfer' ? 'border-blue-500 bg-blue-50/40' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                checked={paymentMethod === 'transfer'}
                onChange={() => setPaymentMethod('transfer')}
                className="mt-1"
              />
              <div>
                <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Landmark size={14} className="text-slate-600" />
                  Transferencia
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Alias/CBU. Confirmación manual por WhatsApp.
                </p>
              </div>
            </label>

            {/* Mercado Pago Option */}
            {paymentSettings.mercadopago?.enabled && (
              <label
                className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                  paymentMethod === 'mercadopago' ? 'border-blue-500 bg-blue-50/40' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={paymentMethod === 'mercadopago'}
                  onChange={() => setPaymentMethod('mercadopago')}
                  className="mt-1"
                />
                <div>
                  <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <CreditCard size={14} className="text-blue-600" />
                    Mercado Pago
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Tarjetas, dinero en cuenta. Aprobación inmediata.
                  </p>
                </div>
              </label>
            )}
          </div>

          {/* Transfer Info */}
          {paymentMethod === 'transfer' && (
            <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100/50 text-[11px] text-slate-600 leading-relaxed">
              <p className="font-bold text-slate-700">Pago por transferencia bancaria:</p>
              <p className="mt-0.5">Te mostramos los datos bancarios en el siguiente paso. Debes enviar el comprobante por WhatsApp para acreditarlo.</p>
              {!transferConfigured && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg mt-2">
                  <AlertCircle size={14} /> Los datos bancarios aún no están configurados en el negocio.
                </div>
              )}
            </div>
          )}

          {/* Mercado Pago Info / Fee Breakdown */}
          {paymentMethod === 'mercadopago' && (
            <div className="p-4 bg-blue-50/30 rounded-xl border border-blue-100 space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-600 pb-2 border-b border-blue-100/50">
                <span className="font-medium">Monto a abonar (Neto):</span>
                <span className="font-bold text-slate-800">${payAmount.toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-600 pb-2 border-b border-blue-100/50">
                <span className="font-medium">Costo de procesamiento (Mercado Pago {mpCommissionPercent}%):</span>
                <span className="font-bold text-slate-800">${mpCommissionAmount.toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between items-center text-sm font-bold text-blue-800">
                <span>Total a pagar online:</span>
                <span className="text-base">${totalWithCommission.toLocaleString('es-AR')}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card p-5 bg-slate-50 border border-slate-200/80">
        <div className="flex justify-between items-center mb-4">
          <span className="text-slate-600 font-medium">Vas a abonar</span>
          <span className="text-2xl font-black text-blue-600">
            ${(paymentMethod === 'mercadopago' ? totalWithCommission : payAmount).toLocaleString('es-AR')}
          </span>
        </div>
        <button
          onClick={handleConfirm}
          disabled={
            processing ||
            (payAmount > 0 && paymentMethod === 'transfer' && !transferConfigured) ||
            depositBelowMin ||
            depositAboveMax
          }
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {processing ? <Loader2 size={18} className="animate-spin" /> : null}
          {payAmount === 0
            ? 'Confirmar pedido sin abono'
            : paymentMethod === 'mercadopago'
              ? 'Pagar con Mercado Pago'
              : 'Continuar con transferencia'}
        </button>
      </div>
    </div>
  );
};

function PaymentChoice({
  name,
  checked,
  onSelect,
  title,
  description,
  amountLabel,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  amountLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
        checked ? 'border-blue-500 bg-blue-50/40' : 'border-slate-200 hover:bg-slate-50'
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="mt-1"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold text-slate-800">{title}</p>
          <span className="text-sm font-bold text-blue-600 shrink-0">{amountLabel}</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">{description}</p>
        {children}
      </div>
    </label>
  );
}

function CopyField({
  label, value, fieldKey, copied, onCopy,
}: {
  label: string;
  value: string;
  fieldKey: string;
  copied: string | null;
  onCopy: (field: string, value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
      <div>
        <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
        <p className="font-mono font-semibold text-slate-800">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => onCopy(fieldKey, value)}
        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-colors"
        title={`Copiar ${label}`}
      >
        {copied === fieldKey ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
      </button>
    </div>
  );
}
