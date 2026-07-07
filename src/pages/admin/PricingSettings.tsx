import React, { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { recalculateAllProductsInFirestore } from '../../services/pricingService';
import { NumericInput } from '../../components/NumericInput';
import type { PricingSettingsResale, DepositSettings, PaymentSettings } from '../../types/settings';
import {
  Settings, Percent, Shield, Save, CheckCircle,
  TrendingUp, DollarSign, RefreshCw,
} from 'lucide-react';

import { defaultResale, defaultDeposit, defaultPaymentSettings } from '../../constants/defaults';

// Extend local PricingSettingsResale for UI if not in type file, but here we can just cast or use any
interface UIResaleSettings extends PricingSettingsResale {
  employeeCommissionPercent?: number;
}

export const PricingSettings: React.FC = () => {
  // State
  const [settingsResale, setSettingsResale] = useState<UIResaleSettings>({ ...defaultResale, employeeCommissionPercent: 10 });
  const [depositSettings, setDepositSettings] = useState<DepositSettings>(defaultDeposit);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(defaultPaymentSettings);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Load settings
  useEffect(() => {
    const unsubs = [
      onSnapshot(doc(db, 'settings', 'pricingResale'), (snap) => {
        if (snap.exists()) {
          setSettingsResale((prev) => ({ ...prev, ...snap.data() }));
        }
      }),
      onSnapshot(doc(db, 'settings', 'deposit'), (snap) => {
        if (snap.exists()) setDepositSettings(snap.data() as DepositSettings);
      }),
      onSnapshot(doc(db, 'settings', 'payments'), (snap) => {
        if (snap.exists()) setPaymentSettings({ ...defaultPaymentSettings, ...snap.data() } as PaymentSettings);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // Toast
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Save all settings
  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanResale = { ...settingsResale };
      Object.keys(cleanResale).forEach(k => {
        if ((cleanResale as any)[k] === '') (cleanResale as any)[k] = 0;
      });

      const cleanDeposit = { ...depositSettings };
      Object.keys(cleanDeposit).forEach(k => {
        if ((cleanDeposit as any)[k] === '') (cleanDeposit as any)[k] = 0;
      });

      await Promise.all([
        setDoc(doc(db, 'settings', 'pricingResale'), cleanResale),
        setDoc(doc(db, 'settings', 'deposit'), cleanDeposit),
        setDoc(doc(db, 'settings', 'payments'), paymentSettings),
      ]);

      // Recalcular precios de todos los productos en caliente en Firestore
      await recalculateAllProductsInFirestore();

      showToast('Configuración guardada y precios actualizados exitosamente');
    } catch (err) {
      console.error('Error saving settings:', err);
      showToast('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const updateResale = (field: keyof UIResaleSettings, value: number | boolean) =>
    setSettingsResale((prev) => ({ ...prev, [field]: value }));

  const updateDeposit = (field: keyof DepositSettings, value: number | string | boolean) =>
    setDepositSettings((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl text-white shadow-lg shadow-indigo-200">
            <Settings size={26} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Configuración de Precios</h1>
            <p className="text-sm text-slate-500">Ajustá los parámetros de cálculo para todos tus productos de reventa</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-xl font-semibold shadow-lg shadow-indigo-200 hover:shadow-xl hover:from-indigo-600 hover:to-blue-700 transition-all disabled:opacity-60"
          >
            {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
            Guardar Todo
          </button>
        </div>
      </div>

      {/* ─── 1. Resale Configuration ────────────────────────────────────── */}
      <section className="bg-white/80 backdrop-blur border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-violet-50 to-purple-50 border-b border-slate-200 flex items-center gap-3">
          <Percent size={22} className="text-violet-600" />
          <h2 className="text-lg font-bold text-slate-800">Configuración de Reventa</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <FieldCard
              label="Margen de Ganancia"
              icon={<TrendingUp size={16} />}
              value={settingsResale.profitMarginPercent}
              onChange={(v) => updateResale('profitMarginPercent', v)}
              suffix="%"
            />
            <FieldCard
              label="Descuento Mayorista"
              icon={<Percent size={16} />}
              value={settingsResale.wholesaleDiscountPercent}
              onChange={(v) => updateResale('wholesaleDiscountPercent', v)}
              suffix="%"
            />
            <FieldCard
              label="Pedido Mínimo Mayorista (ARS)"
              icon={<DollarSign size={16} />}
              value={settingsResale.wholesaleMinimumOrderArs}
              onChange={(v) => updateResale('wholesaleMinimumOrderArs', v)}
              suffix="ARS"
            />
          </div>
          {/* Toggle wholesale */}
          <div className="mt-6 flex items-center gap-3 p-4 bg-violet-50 rounded-xl border border-violet-100">
            <button
              onClick={() => updateResale('enableWholesale', !settingsResale.enableWholesale)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settingsResale.enableWholesale ? 'bg-violet-500' : 'bg-slate-300'
              }`}
              type="button"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settingsResale.enableWholesale ? 'translate-x-6' : ''
                }`}
              />
            </button>
            <span className="text-sm font-medium text-slate-700">
              {settingsResale.enableWholesale ? 'Venta mayorista habilitada' : 'Venta mayorista deshabilitada'}
            </span>
          </div>
        </div>
      </section>

      {/* ─── 2. Deposit / Signal ─────────────────────────────────────────── */}
      <section className="bg-white/80 backdrop-blur border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-slate-200 flex items-center gap-3">
          <Shield size={22} className="text-amber-600" />
          <h2 className="text-lg font-bold text-slate-800">Configuración de Seña / Depósito</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FieldCard
              label="Porcentaje de Seña Requerida"
              icon={<Percent size={16} />}
              value={depositSettings.requiredDepositPercent}
              onChange={(v) => updateDeposit('requiredDepositPercent', v)}
              suffix="%"
            />
            <div className="flex flex-col justify-between">
              <div className="flex items-center gap-3 p-4 bg-amber-50/50 rounded-xl border border-amber-100 mb-3">
                <button
                  onClick={() => updateDeposit('trustedClientBypassDeposit', !depositSettings.trustedClientBypassDeposit)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    depositSettings.trustedClientBypassDeposit ? 'bg-amber-500' : 'bg-slate-300'
                  }`}
                  type="button"
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      depositSettings.trustedClientBypassDeposit ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
                <span className="text-sm font-medium text-slate-700">
                  Permitir omitir seña a clientes de confianza
                </span>
              </div>
              <div className="flex flex-col">
                <label className="text-sm font-medium text-slate-600 mb-1.5">Nota Informativa</label>
                <textarea
                  rows={2}
                  className="w-full border border-slate-200 rounded-xl p-3 bg-white focus:ring-2 focus:ring-amber-400 focus:border-amber-400 text-sm text-slate-700 resize-none"
                  value={depositSettings.note || ''}
                  onChange={(e) => updateDeposit('note', e.target.value)}
                  placeholder="Ej: Los clientes de confianza pueden omitir la seña."
                />
              </div>
            </div>
          </div>
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
            <Settings size={14} className="mt-0.5 flex-shrink-0" />
            <span>La seña se calcula como el {depositSettings.requiredDepositPercent}% del total del pedido. {depositSettings.trustedClientBypassDeposit ? 'Los clientes de confianza pueden ser exceptuados automáticamente (seña obligatoria = $0).' : 'La seña es obligatoria para todos los clientes sin excepción.'}</span>
          </div>
        </div>
      </section>
      
      {/* ─── 3. Mercado Pago Commission ─────────────────────────────────── */}
      <section className="bg-white/80 backdrop-blur border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-200 flex items-center gap-3">
          <Percent size={22} className="text-blue-600" />
          <h2 className="text-lg font-bold text-slate-800">Comisión de Mercado Pago</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FieldCard
              label="Comisión que cobra Mercado Pago"
              icon={<Percent size={16} />}
              value={paymentSettings.mercadopago?.commissionPercent ?? 0}
              onChange={(v) => {
                setPaymentSettings(prev => ({
                  ...prev,
                  mercadopago: {
                    ...prev.mercadopago,
                    commissionPercent: v === '' ? 0 : Number(v)
                  }
                }));
              }}
              suffix="%"
            />
            <div className="flex items-center gap-3 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
              <span className="text-xs font-semibold text-slate-600 leading-relaxed">
                Esta comisión se sumará automáticamente al subtotal que debe abonar el cliente final en el checkout, cobrándole el recargo correspondiente para cubrir los costos de procesamiento del pago.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 4. Collaborator Commission ─────────────────────────────────── */}
      <section className="bg-white/80 backdrop-blur border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-fadeIn">
        <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-slate-200 flex items-center gap-3">
          <Percent size={22} className="text-purple-600" />
          <h2 className="text-lg font-bold text-slate-800">Comisiones de Colaboradores</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FieldCard
              label="Porcentaje de Comisión sobre la Ganancia Real"
              icon={<Percent size={16} />}
              value={settingsResale.employeeCommissionPercent ?? 10}
              onChange={(v) => updateResale('employeeCommissionPercent', v === '' ? 0 : Number(v))}
              suffix="%"
            />
            <div className="flex items-center gap-3 p-4 bg-purple-50/50 rounded-xl border border-purple-100">
              <span className="text-xs font-semibold text-slate-600 leading-relaxed">
                Esta comisión se calcula sobre la ganancia real de cada pedido (monto del pedido menos el costo de compra total del mismo) para los clientes asignados al colaborador. El pago se efectiviza únicamente cuando el pedido se encuentra completamente pagado.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-[fadeIn_0.3s_ease] flex items-center gap-2 bg-slate-800 text-white px-5 py-3 rounded-xl shadow-2xl">
          <CheckCircle size={18} className="text-emerald-400" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </div>
  );
};

interface FieldCardProps {
  label: string;
  icon: React.ReactNode;
  value: number | '';
  onChange: (v: any) => void;
  suffix?: string;
  step?: number;
}

const FieldCard: React.FC<FieldCardProps> = ({ label, icon, value, onChange, suffix, step = 1 }) => (
  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 hover:border-blue-200 hover:shadow-sm transition-all group">
    <label className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-2">
      <span className="text-slate-400 group-hover:text-blue-500 transition-colors">{icon}</span>
      {label}
    </label>
    <div className="relative">
      <NumericInput
        allowDecimals={step < 1 || suffix === 'USD' || suffix === 'x' || suffix === '%'}
        className="w-full border border-slate-200 rounded-lg p-2.5 pr-12 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 text-slate-800 font-semibold text-sm"
        value={value}
        onChange={onChange}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
          {suffix}
        </span>
      )}
    </div>
  </div>
);

export default PricingSettings;
