import React, { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { fetchDollarRate, setManualRate } from '../../services/dollarService';
import { calculate3DPrice } from '../../services/pricing';
import { recalculateAllProductsInFirestore } from '../../services/pricingService';
import { NumericInput } from '../../components/NumericInput';
import { formatWeightGrams } from '../../utils/weightGrams';
import { formatPrintTime } from '../../utils/printTime';
import type { PricingSettings3D, PricingSettingsResale, ExchangeRateData, DepositSettings } from '../../types/settings';
import {
  Settings, DollarSign, Printer, Calculator, Percent,
  RefreshCw, Shield, Save, CheckCircle, AlertTriangle,
  Clock, TrendingUp, Package, Zap, Wrench, Scale,
} from 'lucide-react';

import { default3D, defaultResale, defaultDeposit } from '../../constants/defaults';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const freshnessColor = (lastUpdate: string | undefined) => {
  if (!lastUpdate) return 'red';
  const diff = Date.now() - new Date(lastUpdate).getTime();
  if (diff < 24 * 60 * 60 * 1000) return 'green';
  if (diff < 48 * 60 * 60 * 1000) return 'yellow';
  return 'red';
};

const freshnessLabel: Record<string, string> = {
  green: 'Actualizado',
  yellow: 'Desactualizado',
  red: 'Sin datos',
};

const freshnessClasses: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  yellow: 'bg-amber-100 text-amber-700 border-amber-300',
  red: 'bg-red-100 text-red-700 border-red-300',
};

const dotClasses: Record<string, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
};

// ─── Component ───────────────────────────────────────────────────────────────

export const PricingSettings: React.FC = () => {
  // State
  const [settings3D, setSettings3D] = useState<PricingSettings3D>(default3D);
  const [settingsResale, setSettingsResale] = useState<PricingSettingsResale>(defaultResale);
  const [depositSettings, setDepositSettings] = useState<DepositSettings>(defaultDeposit);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateData | null>(null);

  const [saving, setSaving] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshingRate, setRefreshingRate] = useState(false);
  const [manualRateInput, setManualRateInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // Preview calculator
  const [previewWeight, setPreviewWeight] = useState(50);
  const [previewTime, setPreviewTime] = useState(60);

  // ─── Subscribe to Firestore ────────────────────────────────────────────────

  useEffect(() => {
    const unsubs = [
      onSnapshot(doc(db, 'settings', 'pricing3d'), (snap) => {
        if (snap.exists()) setSettings3D({ ...default3D, ...snap.data() } as PricingSettings3D);
      }),
      onSnapshot(doc(db, 'settings', 'pricingResale'), (snap) => {
        if (snap.exists()) setSettingsResale({ ...defaultResale, ...snap.data() } as PricingSettingsResale);
      }),
      onSnapshot(doc(db, 'settings', 'deposit'), (snap) => {
        if (snap.exists()) setDepositSettings({ ...defaultDeposit, ...snap.data() } as DepositSettings);
      }),
      onSnapshot(doc(db, 'settings', 'exchangeRate'), (snap) => {
        if (snap.exists()) setExchangeRate(snap.data() as ExchangeRateData);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // ─── Toast ─────────────────────────────────────────────────────────────────

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ─── Save all settings ────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      const clean3D = { ...settings3D };
      Object.keys(clean3D).forEach(k => {
        if ((clean3D as any)[k] === '') (clean3D as any)[k] = 0;
      });

      const cleanResale = { ...settingsResale };
      Object.keys(cleanResale).forEach(k => {
        if ((cleanResale as any)[k] === '') (cleanResale as any)[k] = 0;
      });

      const cleanDeposit = { ...depositSettings };
      Object.keys(cleanDeposit).forEach(k => {
        if ((cleanDeposit as any)[k] === '') (cleanDeposit as any)[k] = 0;
      });

      await Promise.all([
        setDoc(doc(db, 'settings', 'pricing3d'), clean3D),
        setDoc(doc(db, 'settings', 'pricingResale'), cleanResale),
        setDoc(doc(db, 'settings', 'deposit'), cleanDeposit),
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

  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    try {
      const response = await fetch('/api/save-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings3D,
          settingsResale,
          depositSettings
        })
      });
      if (response.ok) {
        showToast('Valores establecidos como predeterminados del código');
      } else {
        showToast('Error al guardar predeterminados locales');
      }
    } catch (e) {
      console.error(e);
      showToast('Error de red al intentar guardar predeterminados');
    } finally {
      setSavingDefaults(false);
    }
  };

  // ─── Exchange rate actions ─────────────────────────────────────────────────

  const handleRefreshRate = async () => {
    setRefreshingRate(true);
    try {
      const data = await fetchDollarRate();
      setExchangeRate(data);
      showToast('Cotización actualizada y precios recalculados');
    } catch {
      showToast('Error al obtener cotización. Usá el modo manual.');
      setShowManualInput(true);
    } finally {
      setRefreshingRate(false);
    }
  };

  const handleSetManualRate = async () => {
    const val = parseFloat(manualRateInput);
    if (isNaN(val) || val <= 0) return;
    try {
      const data = await setManualRate(val);
      setExchangeRate(data);
      setManualRateInput('');
      setShowManualInput(false);
      showToast('Cotización manual guardada y precios actualizados');
    } catch {
      showToast('Error al guardar cotización manual');
    }
  };

  // ─── Preview calculation ───────────────────────────────────────────────────

  const currentRate = exchangeRate?.currentUsdToArs ?? 1000;

  const preview = calculate3DPrice(
    { weightGrams: previewWeight, printTimeMinutes: previewTime, isKeychain: false },
    settings3D,
    currentRate
  );

  // ─── Field helpers ─────────────────────────────────────────────────────────

  const update3D = (field: keyof PricingSettings3D, value: number) =>
    setSettings3D((prev) => ({ ...prev, [field]: value }));

  const updateResale = (field: keyof PricingSettingsResale, value: number | boolean) =>
    setSettingsResale((prev) => ({ ...prev, [field]: value }));

  const updateDeposit = (field: keyof DepositSettings, value: number | string | boolean) =>
    setDepositSettings((prev) => ({ ...prev, [field]: value }));

  // ─── Freshness ─────────────────────────────────────────────────────────────

  const freshness = freshnessColor(exchangeRate?.lastUpdate);

  // ─── Render ────────────────────────────────────────────────────────────────

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
            <p className="text-sm text-slate-500">Ajustá los parámetros de cálculo para todos tus productos</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSaveDefaults}
            disabled={savingDefaults}
            className="flex items-center gap-2 px-5 py-2.5 border-2 border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl font-semibold transition-all disabled:opacity-60"
          >
            {savingDefaults ? <RefreshCw size={18} className="animate-spin" /> : <Settings size={18} />}
            Fijar Predeterminados del Código
          </button>
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

      {/* ─── 1. Exchange Rate ───────────────────────────────────────────── */}
      <section className="bg-white/80 backdrop-blur border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-slate-200 flex items-center gap-3">
          <DollarSign size={22} className="text-emerald-600" />
          <h2 className="text-lg font-bold text-slate-800">Tipo de Cambio USD → ARS</h2>
          <span className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${freshnessClasses[freshness]}`}>
            <span className={`w-2 h-2 rounded-full ${dotClasses[freshness]}`} />
            {freshnessLabel[freshness]}
          </span>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Current rate */}
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Cotización Actual</p>
              <p className="text-3xl font-bold text-slate-800">
                ${exchangeRate?.currentUsdToArs?.toLocaleString('es-AR') ?? '—'}
              </p>
              <p className="text-xs text-slate-400 mt-1">ARS por 1 USD</p>
            </div>
            {/* Last update */}
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Última Actualización</p>
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Clock size={14} className="text-slate-400" />
                {exchangeRate?.lastUpdate
                  ? new Date(exchangeRate.lastUpdate).toLocaleString('es-AR')
                  : 'Nunca'}
              </p>
              <p className="text-xs text-slate-400 mt-1">Proveedor: {exchangeRate?.provider ?? 'N/A'}</p>
            </div>
            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleRefreshRate}
                disabled={refreshingRate}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-60"
              >
                <RefreshCw size={16} className={refreshingRate ? 'animate-spin' : ''} />
                Actualizar desde API
              </button>
              <button
                onClick={() => setShowManualInput(!showManualInput)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-slate-200 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition-colors text-sm"
              >
                Ingresar Manualmente
              </button>
            </div>
          </div>

          {/* Manual rate input */}
          {showManualInput && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-amber-800 mb-1">
                  <AlertTriangle size={14} className="inline mr-1" />
                  Cotización manual (ARS por 1 USD)
                </label>
                <NumericInput
                  allowDecimals
                  placeholder="Ej: 1250"
                  className="w-full border border-amber-300 bg-white rounded-lg p-2.5 focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                  value={manualRateInput === '' ? '' : Number(manualRateInput)}
                  onChange={(val) => setManualRateInput(val === '' ? '' : val.toString())}
                />
              </div>
              <button
                onClick={handleSetManualRate}
                className="px-5 py-2.5 bg-amber-500 text-white rounded-lg font-semibold hover:bg-amber-600 transition-colors"
              >
                Guardar
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ─── 2. 3D Printing Configuration ───────────────────────────────── */}
      <section className="bg-white/80 backdrop-blur border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-200 flex items-center gap-3">
          <Printer size={22} className="text-blue-600" />
          <h2 className="text-lg font-bold text-slate-800">Configuración de Impresión 3D</h2>
        </div>
        <div className="p-6 space-y-8">
          {/* Costos de producción */}
          <div>
            <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Package size={16} className="text-blue-400" />
              Costos de Producción
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <FieldCard
                label="Precio Filamento (USD/Kg)"
                icon={<DollarSign size={16} />}
                value={settings3D.filamentPriceUsdKg}
                onChange={(v) => update3D('filamentPriceUsdKg', v)}
                suffix="USD"
                step={0.5}
              />
              <FieldCard
                label="Precio KWh (ARS)"
                icon={<Zap size={16} />}
                value={settings3D.kwhPriceArs}
                onChange={(v) => update3D('kwhPriceArs', v)}
                suffix="ARS"
              />
              <FieldCard
                label="Consumo Impresora (Watts)"
                icon={<Zap size={16} />}
                value={settings3D.printerWatts}
                onChange={(v) => update3D('printerWatts', v)}
                suffix="W"
              />
              <FieldCard
                label="Vida útil Impresora (Horas)"
                icon={<Clock size={16} />}
                value={settings3D.printerLifespanHours}
                onChange={(v) => update3D('printerLifespanHours', v)}
                suffix="hs"
              />
              <FieldCard
                label="Costo Estimado Repuestos (ARS)"
                icon={<Wrench size={16} />}
                value={settings3D.estimatedSparesCostArs}
                onChange={(v) => update3D('estimatedSparesCostArs', v)}
                suffix="ARS"
              />
              <FieldCard
                label="Margen de Error"
                icon={<AlertTriangle size={16} />}
                value={settings3D.errorMarginPercent}
                onChange={(v) => update3D('errorMarginPercent', v)}
                suffix="%"
              />
            </div>
          </div>

          {/* Multiplicadores y precios minoristas */}
          <div>
            <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-indigo-400" />
              Multiplicadores Minoristas
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FieldCard
                label="Multiplicador Minorista (Normal)"
                icon={<TrendingUp size={16} />}
                value={settings3D.multiplierRetailNormal}
                onChange={(v) => update3D('multiplierRetailNormal', v)}
                suffix="x"
                step={0.1}
              />
              <FieldCard
                label="Multiplicador Minorista (Llaveros)"
                icon={<TrendingUp size={16} />}
                value={settings3D.multiplierRetailKeychain}
                onChange={(v) => update3D('multiplierRetailKeychain', v)}
                suffix="x"
                step={0.1}
              />
            </div>
          </div>

          {/* Mayorista */}
          <div>
            <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Scale size={16} className="text-violet-400" />
              Descuentos Mayoristas
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FieldCard
                label="Descuento Mayorista (Normal)"
                icon={<Percent size={16} />}
                value={settings3D.wholesaleDiscountPercentNormal}
                onChange={(v) => update3D('wholesaleDiscountPercentNormal', v)}
                suffix="%"
              />
              <FieldCard
                label="Descuento Mayorista (Llaveros)"
                icon={<Percent size={16} />}
                value={settings3D.wholesaleDiscountPercentKeychain}
                onChange={(v) => update3D('wholesaleDiscountPercentKeychain', v)}
                suffix="%"
              />
              <FieldCard
                label="Umbral Mayorista Gramos (Normal)"
                icon={<Scale size={16} />}
                value={settings3D.wholesaleThresholdGramsNormal}
                onChange={(v) => update3D('wholesaleThresholdGramsNormal', v)}
                suffix="g"
              />
              <FieldCard
                label="Umbral Mayorista Gramos (Llaveros)"
                icon={<Scale size={16} />}
                value={settings3D.wholesaleThresholdGramsKeychain}
                onChange={(v) => update3D('wholesaleThresholdGramsKeychain', v)}
                suffix="g"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── 3. Resale Configuration ────────────────────────────────────── */}
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

      {/* ─── 4. Deposit / Signal ─────────────────────────────────────────── */}
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
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>La seña se calcula como el {depositSettings.requiredDepositPercent}% del total del pedido. {depositSettings.trustedClientBypassDeposit ? 'Los clientes de confianza pueden ser exceptuados automáticamente (seña obligatoria = $0).' : 'La seña es obligatoria para todos los clientes sin excepción.'}</span>
          </div>
        </div>
      </section>

      {/* ─── 5. Live Preview Calculator ──────────────────────────────────── */}
      <section className="bg-white/80 backdrop-blur border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-cyan-50 to-sky-50 border-b border-slate-200 flex items-center gap-3">
          <Calculator size={22} className="text-cyan-600" />
          <h2 className="text-lg font-bold text-slate-800">Calculadora de Vista Previa</h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-500 mb-6">
            Ajustá peso y tiempo para ver cómo quedarían los precios con la configuración actual.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Sliders */}
            <div className="space-y-6">
              {/* Weight slider */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-slate-700">Peso del producto</label>
                  <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-lg">
                    {formatWeightGrams(previewWeight)}
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={500}
                  step={5}
                  value={previewWeight}
                  onChange={(e) => setPreviewWeight(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>5g</span>
                  <span>500g</span>
                </div>
              </div>
              {/* Time slider */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-slate-700">Tiempo de impresión</label>
                  <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-lg">
                    {formatPrintTime(previewTime)}
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={600}
                  step={5}
                  value={previewTime}
                  onChange={(e) => setPreviewTime(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>{formatPrintTime(5)}</span>
                  <span>{formatPrintTime(600)}</span>
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-slate-200 p-6 flex flex-col justify-center gap-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Costo de producción</span>
                <span className="text-lg font-semibold text-slate-700">${preview.cost.toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Precio mayorista</span>
                <span className="text-lg font-semibold text-blue-600">${preview.wholesalePrice.toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                <span className="text-sm font-medium text-slate-700">Precio minorista</span>
                <span className="text-2xl font-bold text-emerald-600">${preview.retailPrice.toLocaleString('es-AR')}</span>
              </div>
              <p className="text-xs text-slate-400 text-center mt-1">
                Cotización usada: ${ currentRate.toLocaleString('es-AR') } ARS/USD
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Toast ────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-[fadeIn_0.3s_ease] flex items-center gap-2 bg-slate-800 text-white px-5 py-3 rounded-xl shadow-2xl">
          <CheckCircle size={18} className="text-emerald-400" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </div>
  );
};

// ─── FieldCard sub-component ─────────────────────────────────────────────────

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
