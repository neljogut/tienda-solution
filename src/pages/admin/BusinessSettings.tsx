import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, firebaseConfig, app, getFunctionsRegion } from '../../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { BusinessSettings, PaymentSettings } from '../../types/settings';
import { defaultPaymentSettings, getDefaultBusinessSettings, defaultResale, defaultDeposit } from '../../constants/defaults';
import { recalculateAllProductsInFirestore } from '../../services/pricingService';
import { NumericInput } from '../../components/NumericInput';
import {
  Building2, Save, Image, X, Phone, Mail, MapPin, Landmark, Clipboard, Link, MessageSquare,
  CreditCard, Loader2, CheckCircle, AlertCircle, RefreshCw, Palette, Eye, LayoutDashboard,
  ChevronUp, ChevronDown, Percent, Shield, TrendingUp, DollarSign, Users, Settings
} from 'lucide-react';

const defaultBusinessSettings: BusinessSettings = getDefaultBusinessSettings();

export const BusinessSettingsPage: React.FC = () => {
  const [formData, setFormData] = useState<BusinessSettings>(defaultBusinessSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(defaultPaymentSettings);
  const [mpPublicKey, setMpPublicKey] = useState('');
  const [mpAccessToken, setMpAccessToken] = useState('');
  const [mpEnabled, setMpEnabled] = useState(false);
  const [savingMp, setSavingMp] = useState(false);
  const [testingMp, setTestingMp] = useState(false);
  const [mpTestResult, setMpTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [mpSuccessMsg, setMpSuccessMsg] = useState(false);

  // New Pricing/Deposit settings states
  const [settingsResale, setSettingsResale] = useState<any>({ ...defaultResale, employeeCommissionPercent: 10 });
  const [depositSettings, setDepositSettings] = useState<any>(defaultDeposit);

  // Collapsible sections states
  const [collapsed, setCollapsed] = useState({
    info: false,
    bank: true,
    mp: true,
    resale: true,
    deposit: true,
    commission: true,
    visual: true,
  });

  const toggleCollapse = (section: keyof typeof collapsed) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleExpandAll = () => {
    setCollapsed({
      info: false,
      bank: false,
      mp: false,
      resale: false,
      deposit: false,
      commission: false,
      visual: false,
    });
  };

  const handleCollapseAll = () => {
    setCollapsed({
      info: true,
      bank: true,
      mp: true,
      resale: true,
      deposit: true,
      commission: true,
      visual: true,
    });
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [businessSnap, paymentsSnap, resaleSnap, depositSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'business')),
          getDoc(doc(db, 'settings', 'payments')),
          getDoc(doc(db, 'settings', 'pricingResale')),
          getDoc(doc(db, 'settings', 'deposit')),
        ]);
        if (businessSnap.exists()) {
          const data = businessSnap.data() as BusinessSettings;
          setFormData(data);
          if (data.logoUrl) setLogoPreview(data.logoUrl);
        }
        if (paymentsSnap.exists()) {
          const payData = paymentsSnap.data() as PaymentSettings;
          setPaymentSettings({ ...defaultPaymentSettings, ...payData } as PaymentSettings);
          setMpPublicKey(payData.mercadopago?.publicKey || '');
          setMpEnabled(payData.mercadopago?.enabled || false);
        }
        if (resaleSnap.exists()) {
          setSettingsResale((prev: any) => ({ ...prev, ...resaleSnap.data() }));
        }
        if (depositSnap.exists()) {
          setDepositSettings(depositSnap.data());
        }
      } catch (err) {
        console.error('Error loading business settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new window.Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 150;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/png', 0.8);
        setLogoPreview(dataUrl);
        setFormData(prev => ({ ...prev, logoUrl: dataUrl }));
      };
    };
  };

    const handleSaveMpCredentials = async () => {
      if (!mpPublicKey.trim()) {
        alert('La Public Key es requerida.');
        return;
      }
      setSavingMp(true);
      setMpSuccessMsg(false);
      try {
        const functions = getFunctions(app, getFunctionsRegion());
        const saveFn = httpsCallable<{ accessToken: string; publicKey: string; enabled: boolean }, { ok: boolean }>(
          functions,
          'saveMercadoPagoCredentials'
        );
        await saveFn({
          accessToken: mpAccessToken,
          publicKey: mpPublicKey.trim(),
          enabled: mpEnabled,
        });

        const paymentsToSave = {
          ...paymentSettings,
          mercadopago: {
            ...paymentSettings.mercadopago,
            enabled: mpEnabled,
            publicKey: mpPublicKey.trim(),
          },
        };
        await setDoc(doc(db, 'settings', 'payments'), paymentsToSave);
        setPaymentSettings(paymentsToSave);

        setMpSuccessMsg(true);
        setTimeout(() => setMpSuccessMsg(false), 4000);
      } catch (err) {
        console.error('Error saving MP credentials:', err);
        alert('Error al guardar credenciales: ' + (err instanceof Error ? err.message : 'Error desconocido'));
      } finally {
        setSavingMp(false);
      }
    };

    const handleTestMpConnection = async () => {
      setTestingMp(true);
      setMpTestResult(null);
      try {
        const functions = getFunctions(app, getFunctionsRegion());
        const testFn = httpsCallable<void, { ok: boolean; message: string }>(
          functions,
          'testMercadoPagoConnection'
        );
        const res = await testFn();
        setMpTestResult({ ok: res.data.ok, message: res.data.message });
      } catch (err) {
        console.error('Error testing MP connection:', err);
        setMpTestResult({
          ok: false,
          message: 'Error al conectar: ' + (err instanceof Error ? err.message : 'Error desconocido'),
        });
      } finally {
        setTestingMp(false);
      }
    };

    const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setSuccessMsg(false);
      try {
        const cleanResale = { ...settingsResale };
        Object.keys(cleanResale).forEach(k => {
          if ((cleanResale as any)[k] === '') (cleanResale as any)[k] = 0;
        });

        const cleanDeposit = { ...depositSettings };
        Object.keys(cleanDeposit).forEach(k => {
          if ((cleanDeposit as any)[k] === '') (cleanDeposit as any)[k] = 0;
        });

        const paymentsToSave: PaymentSettings = {
          ...paymentSettings,
          mercadopago: {
            ...paymentSettings.mercadopago,
            enabled: mpEnabled,
            publicKey: mpPublicKey.trim(),
            commissionPercent: paymentSettings.mercadopago?.commissionPercent ?? 0,
          },
        };

        await Promise.all([
          setDoc(doc(db, 'settings', 'business'), formData),
          setDoc(doc(db, 'settings', 'payments'), paymentsToSave),
          setDoc(doc(db, 'settings', 'pricingResale'), cleanResale),
          setDoc(doc(db, 'settings', 'deposit'), cleanDeposit),
        ]);

        // Recalcular precios de todos los productos en caliente en Firestore
        await recalculateAllProductsInFirestore();

        setSuccessMsg(true);
        setTimeout(() => setSuccessMsg(false), 4000);
      } catch (err) {
        console.error('Error saving business settings:', err);
        alert('Error al guardar la configuración.');
      } finally {
        setSaving(false);
      }
    };

    const updateResale = (field: string, value: number | boolean) =>
      setSettingsResale((prev: any) => ({ ...prev, [field]: value }));

    const updateDeposit = (field: string, value: number | string | boolean) =>
      setDepositSettings((prev: any) => ({ ...prev, [field]: value }));

const SectionCard: React.FC<{
  title: string;
  subtitle?: string;
  icon: React.ComponentType<any>;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, icon: Icon, isOpen, onToggle, children }) => {
  return (
    <div className="card border border-slate-200/80 shadow-sm overflow-hidden transition-all duration-300">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between text-left bg-slate-50/50 hover:bg-slate-50 transition-colors border-b border-slate-100"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl text-white bg-gradient-to-br from-indigo-500 to-blue-600 shadow-md">
            <Icon size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">{title}</h3>
            {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="text-slate-400">
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {isOpen && (
        <div className="p-5 space-y-5 animate-fadeIn">
          {children}
        </div>
      )}
    </div>
  );
};

const FieldCard: React.FC<{
  label: string;
  icon: React.ReactNode;
  value: number | '';
  onChange: (v: any) => void;
  suffix?: string;
  step?: number;
}> = ({ label, icon, value, onChange, suffix, step = 1 }) => (
  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 hover:border-blue-200 hover:shadow-sm transition-all group">
    <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase mb-2">
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

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500">Cargando configuración general...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Building2 size={26} className="text-blue-600" />
            Configuración del Negocio
          </h1>
          <p className="page-subtitle">
            Edita los datos públicos, fiscales, de contacto y de precios de tu negocio en un solo lugar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExpandAll}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-[10px] transition-colors"
          >
            Expandir Todo
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-[10px] transition-colors"
          >
            Contraer Todo
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
        {/* Left column: API configurations */}
        <div className="space-y-6">
          {/* Hosting de Imágenes (ImgBB) */}
          <div className="card p-5 border border-slate-200/80 shadow-sm space-y-4 animate-fadeIn">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 border-b pb-2">
              <Image size={16} className="text-blue-500" />
              Hosting de Imágenes (ImgBB)
            </h3>
            <div className="space-y-3">
              <div>
                <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  ImgBB API Key
                </label>
                <input 
                  type="password" 
                  placeholder="Ingrese su API Key de ImgBB"
                  className="input w-full mt-1.5"
                  value={formData.imgbbApiKey || ''}
                  onChange={e => setFormData({ ...formData, imgbbApiKey: e.target.value })}
                />
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Esta clave se usa para subir las imágenes del catálogo a ImgBB de forma automática (evitando lentitud en la carga y el almacenamiento en base64). Podés conseguir una clave gratuita en <a href="https://api.imgbb.com/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">api.imgbb.com</a>.
              </p>
            </div>
          </div>

          {/* Asistente de IA (Chatbot) */}
          <div className="card p-5 border border-slate-200/80 shadow-sm space-y-4 animate-fadeIn">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 border-b pb-2">
              <MessageSquare size={16} className="text-blue-500" />
              Asistente de IA (Chatbot)
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <label className="text-xs font-bold text-slate-600">Habilitar Asistente de IA</label>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                    Muestra un asistente virtual flotante en el catálogo para guiar a los clientes, buscar productos y responder consultas.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={formData.enableChatbot ?? true}
                    onChange={e => setFormData({ ...formData, enableChatbot: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {(formData.enableChatbot ?? true) && (
                <div className="border-t pt-3 space-y-3">
                  <div>
                    <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                      Google Gemini API Key
                    </label>
                    <input 
                      type="password" 
                      placeholder="Ingrese su API Key de Google Gemini"
                      className="input w-full mt-1.5"
                      value={formData.geminiApiKey || ''}
                      onChange={e => setFormData({ ...formData, geminiApiKey: e.target.value })}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Clave de Google Gemini (modelo gemini-2.5-flash). Si se configura, el bot responderá de forma conversacional inteligente usando IA. Si se deja vacía, el bot funcionará con un motor de reglas y palabras clave local gratuito. Podés conseguir una clave gratis en <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Google AI Studio</a>.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Public & private business fields (Collapsible sections) */}
        <div className="lg:col-span-2 space-y-6">
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl font-semibold animate-fadeIn flex items-center gap-2">
              <CheckCircle size={14} /> ¡Configuración guardada exitosamente!
            </div>
          )}

          {/* Section 1: Información de la Empresa */}
          <SectionCard
            title="Información de la Empresa"
            subtitle="Datos de contacto, redes sociales, fiscales y ubicación de tu negocio"
            icon={Building2}
            isOpen={!collapsed.info}
            onToggle={() => toggleCollapse('info')}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Business Name */}
              <div>
                <label className="input-label font-bold text-slate-500 uppercase">Nombre Comercial</label>
                <input 
                  required
                  type="text" 
                  className="input w-full mt-1.5 font-bold"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              {/* Owner Name */}
              <div>
                <label className="input-label font-bold text-slate-500 uppercase">Propietario / Dueño</label>
                <input 
                  required
                  type="text" 
                  className="input w-full mt-1.5"
                  value={formData.ownerName}
                  onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Phone */}
              <div>
                <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <Phone size={12} className="text-slate-400" /> Teléfono
                </label>
                <input 
                  required
                  type="text" 
                  className="input w-full mt-1.5"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              {/* Email */}
              <div>
                <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <Mail size={12} className="text-slate-400" /> Correo Electrónico
                </label>
                <input 
                  required
                  type="email" 
                  className="input w-full mt-1.5"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Address */}
              <div className="sm:col-span-2">
                <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <MapPin size={12} className="text-slate-400" /> Dirección de calle
                </label>
                <input 
                  required
                  type="text" 
                  className="input w-full mt-1.5"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              {/* City */}
              <div>
                <label className="input-label font-bold text-slate-500 uppercase">Ciudad / Cód. Postal</label>
                <input 
                  required
                  type="text" 
                  className="input w-full mt-1.5"
                  value={formData.city}
                  onChange={e => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Province */}
              <div>
                <label className="input-label font-bold text-slate-500 uppercase">Provincia / Región</label>
                <input 
                  required
                  type="text" 
                  className="input w-full mt-1.5"
                  value={formData.province}
                  onChange={e => setFormData({ ...formData, province: e.target.value })}
                />
              </div>

              {/* CUIT */}
              <div>
                <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <Landmark size={12} className="text-slate-400" /> CUIT (Identificación Fiscal)
                </label>
                <input 
                  type="text" 
                  className="input w-full mt-1.5"
                  placeholder="Ej: 20-33445566-7"
                  value={formData.cuit || ''}
                  onChange={e => setFormData({ ...formData, cuit: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Instagram */}
              <div>
                <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span> Instagram (Usuario)
                </label>
                <input 
                  type="text" 
                  className="input w-full mt-1.5"
                  placeholder="Ej: dualgi3d"
                  value={formData.instagram || ''}
                  onChange={e => setFormData({ ...formData, instagram: e.target.value })}
                />
              </div>

              {/* TikTok */}
              <div>
                <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-900"></span> TikTok (Usuario)
                </label>
                <input 
                  type="text" 
                  className="input w-full mt-1.5"
                  placeholder="Ej: dualgi3d"
                  value={formData.tiktok || ''}
                  onChange={e => setFormData({ ...formData, tiktok: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* WhatsApp */}
              <div>
                <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> WhatsApp (Número con código de país)
                </label>
                <input 
                  type="text" 
                  className="input w-full mt-1.5"
                  placeholder="Ej: 5491112345678 (sin el + ni espacios)"
                  value={formData.whatsapp || ''}
                  onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
                />
              </div>

              {/* Social handle (Web/Legacy fallback) */}
              <div>
                <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <Link size={12} className="text-slate-400" /> Redes Sociales (General / Web)
                </label>
                <input 
                  type="text" 
                  className="input w-full mt-1.5"
                  placeholder="Ej: @dualgi3d o enlace web"
                  value={formData.socialMedia || ''}
                  onChange={e => setFormData({ ...formData, socialMedia: e.target.value })}
                />
              </div>
            </div>
          </SectionCard>

          {/* Section 2: Pagos por Transferencia Bancaria */}
          <SectionCard
            title="Pagos por Transferencia Bancaria"
            subtitle="Cuentas bancarias de tu negocio, CBU, Alias y detalles para checkout"
            icon={Landmark}
            isOpen={!collapsed.bank}
            onToggle={() => toggleCollapse('bank')}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="input-label">Alias</label>
                <input
                  className="input w-full"
                  placeholder="Ej: dualgi.3d"
                  value={paymentSettings.bankTransfer.alias}
                  onChange={(e) =>
                    setPaymentSettings((p) => ({
                      ...p,
                      bankTransfer: { ...p.bankTransfer, alias: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className="input-label">CBU</label>
                <input
                  className="input w-full font-mono"
                  placeholder="22 dígitos"
                  value={paymentSettings.bankTransfer.cbu}
                  onChange={(e) =>
                    setPaymentSettings((p) => ({
                      ...p,
                      bankTransfer: { ...p.bankTransfer, cbu: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className="input-label">Titular</label>
                <input
                  className="input w-full"
                  value={paymentSettings.bankTransfer.holderName}
                  onChange={(e) =>
                    setPaymentSettings((p) => ({
                      ...p,
                      bankTransfer: { ...p.bankTransfer, holderName: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className="input-label">Banco</label>
                <input
                  className="input w-full"
                  value={paymentSettings.bankTransfer.bankName || ''}
                  onChange={(e) =>
                    setPaymentSettings((p) => ({
                      ...p,
                      bankTransfer: { ...p.bankTransfer, bankName: e.target.value },
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="input-label">Nota para transferencias (checkout)</label>
              <input
                className="input w-full font-semibold"
                value={paymentSettings.bankTransfer.note || ''}
                onChange={(e) =>
                  setPaymentSettings((p) => ({
                    ...p,
                    bankTransfer: { ...p.bankTransfer, note: e.target.value },
                  }))
                }
              />
            </div>
          </SectionCard>

          {/* Section 3: Mercado Pago (Pagos Online) */}
          <SectionCard
            title="Mercado Pago (Pagos Online)"
            subtitle="Credenciales de API de Mercado Pago, recargos y estado del servicio"
            icon={CreditCard}
            isOpen={!collapsed.mp}
            onToggle={() => toggleCollapse('mp')}
          >
            {mpSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl font-semibold animate-fadeIn flex items-center gap-2">
                <CheckCircle size={14} /> ¡Credenciales de Mercado Pago guardadas correctamente!
              </div>
            )}

            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setMpEnabled(!mpEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  mpEnabled ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    mpEnabled ? 'translate-x-6' : ''
                  }`}
                />
              </button>
              <span className="text-xs font-bold text-slate-700">
                {mpEnabled ? 'Mercado Pago activado en checkout' : 'Mercado Pago desactivado en checkout'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="input-label">Public Key</label>
                <input
                  className="input w-full font-mono"
                  placeholder="APP_USR-..."
                  value={mpPublicKey}
                  onChange={(e) => setMpPublicKey(e.target.value)}
                />
              </div>
              <div>
                <label className="input-label">Access Token</label>
                <input
                  type="password"
                  className="input w-full font-mono"
                  placeholder={paymentSettings.mercadopago?.enabled ? '••••••••••••••••••••••••' : 'APP_USR-...'}
                  value={mpAccessToken}
                  onChange={(e) => setMpAccessToken(e.target.value)}
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Solo ingrésalo si deseas actualizarlo (se guarda de forma privada).
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSaveMpCredentials}
                disabled={savingMp}
                className="btn-secondary text-[10px] font-bold py-2 px-4 rounded-xl flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer inline-block"
              >
                {savingMp ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Guardar Credenciales MP
              </button>
              <button
                type="button"
                onClick={handleTestMpConnection}
                disabled={testingMp}
                className="btn-secondary text-[10px] font-bold py-2 px-4 rounded-xl flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer inline-block"
              >
                {testingMp ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Probar Conexión
              </button>
            </div>

            {mpTestResult && (
              <div className={`p-3 rounded-xl border flex items-start gap-2 text-[10px] leading-relaxed font-medium ${
                mpTestResult.ok
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                  : 'bg-red-50 border-red-100 text-red-700'
              }`}>
                {mpTestResult.ok ? <CheckCircle size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
                <span>{mpTestResult.message}</span>
              </div>
            )}

            <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100/50 space-y-2 text-xs">
              <h4 className="font-bold text-slate-800 text-[10px] uppercase tracking-wider">URL del Webhook para Mercado Pago:</h4>
              <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                <span className="font-mono text-[9px] text-slate-600 break-all select-all flex-grow">
                  https://{getFunctionsRegion()}-{firebaseConfig.projectId}.cloudfunctions.net/mercadoPagoWebhook
                </span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Registrá esta URL en tu panel de Mercado Pago Developers bajo la sección de Webhooks, seleccionando el evento de tipo <strong>payment</strong>.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-150">
              <div>
                <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <Percent size={12} className="text-slate-400" /> Comisión que cobra Mercado Pago
                </label>
                <NumericInput
                  allowDecimals={true}
                  className="w-full border border-slate-200 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 text-slate-800 font-semibold text-sm mt-1.5"
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
                />
                <p className="text-[10px] text-slate-400 mt-1">Este porcentaje de recargo se cobrará al cliente en el checkout.</p>
              </div>
              <div className="flex items-center p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                <span className="text-[10px] text-slate-500 leading-normal">
                  Esta comisión se sumará automáticamente al subtotal que debe abonar el cliente final en el checkout, cobrándole el recargo correspondiente para cubrir los costos de procesamiento del pago.
                </span>
              </div>
            </div>
          </SectionCard>

          {/* Section 4: Configuración de Reventa */}
          <SectionCard
            title="Configuración de Reventa"
            subtitle="Habilita la venta mayorista y define el monto de pedido mínimo en pesos"
            icon={TrendingUp}
            isOpen={!collapsed.resale}
            onToggle={() => toggleCollapse('resale')}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FieldCard
                label="Pedido Mínimo Mayorista (ARS)"
                icon={<DollarSign size={16} />}
                value={settingsResale.wholesaleMinimumOrderArs}
                onChange={(v) => updateResale('wholesaleMinimumOrderArs', v)}
                suffix="ARS"
              />
              <div className="flex items-center p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                <span className="text-[10px] text-slate-500 leading-normal">
                  Este es el monto mínimo requerido en el total del carrito para que un pedido califique bajo la modalidad mayorista si se cumplen las condiciones. El margen de ganancia ahora se gestiona directamente en la ficha de cada producto individual.
                </span>
              </div>
            </div>
            {/* Toggle wholesale */}
            <div className="mt-4 flex items-center gap-3 p-4 bg-violet-50 rounded-xl border border-violet-100">
              <button
                type="button"
                onClick={() => updateResale('enableWholesale', !settingsResale.enableWholesale)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settingsResale.enableWholesale ? 'bg-violet-500' : 'bg-slate-300'
                }`}
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
          </SectionCard>

          {/* Section 5: Configuración de Seña / Depósito */}
          <SectionCard
            title="Configuración de Seña / Depósito"
            subtitle="Porcentaje obligatorio de seña y políticas para clientes registrados"
            icon={Shield}
            isOpen={!collapsed.deposit}
            onToggle={() => toggleCollapse('deposit')}
          >
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
                    type="button"
                    onClick={() => updateDeposit('trustedClientBypassDeposit', !depositSettings.trustedClientBypassDeposit)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      depositSettings.trustedClientBypassDeposit ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
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
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1.5">Nota Informativa</label>
                  <textarea
                    rows={2}
                    className="w-full border border-slate-200 rounded-xl p-3 bg-white focus:ring-2 focus:ring-amber-400 focus:border-amber-400 text-xs text-slate-700 resize-none font-semibold"
                    value={depositSettings.note || ''}
                    onChange={(e) => updateDeposit('note', e.target.value)}
                    placeholder="Ej: Los clientes de confianza pueden omitir la seña."
                  />
                </div>
              </div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-700 flex items-start gap-2">
              <Settings size={14} className="mt-0.5 flex-shrink-0" />
              <span>La seña se calcula como el {depositSettings.requiredDepositPercent}% del total del pedido. {depositSettings.trustedClientBypassDeposit ? 'Los clientes de confianza pueden ser exceptuados automáticamente (seña obligatoria = $0).' : 'La seña es obligatoria para todos los clientes sin excepción.'}</span>
            </div>
          </SectionCard>

          {/* Section 6: Comisiones de Colaboradores */}
          <SectionCard
            title="Comisiones de Colaboradores"
            subtitle="Porcentaje base de comisiones sobre ganancias de ventas"
            icon={Users}
            isOpen={!collapsed.commission}
            onToggle={() => toggleCollapse('commission')}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FieldCard
                label="Porcentaje de Comisión sobre la Ganancia Real"
                icon={<Percent size={16} />}
                value={settingsResale.employeeCommissionPercent ?? 10}
                onChange={(v) => updateResale('employeeCommissionPercent', v === '' ? 0 : Number(v))}
                suffix="%"
              />
              <div className="flex items-center gap-3 p-4 bg-purple-50/50 rounded-xl border border-purple-100">
                <span className="text-[10px] text-slate-500 leading-normal">
                  Esta comisión se calcula sobre la ganancia real de cada pedido (monto del pedido menos el costo de compra total del mismo) para los clientes asignados al colaborador. El pago se efectiviza únicamente cuando el pedido se encuentra completamente pagado.
                </span>
              </div>
            </div>
          </SectionCard>

          {/* Section 7: Configuración Visual de la Página */}
          <SectionCard
            title="Configuración Visual de la Página"
            subtitle="Textos, logos de la empresa, títulos y apariencia del catálogo"
            icon={Palette}
            isOpen={!collapsed.visual}
            onToggle={() => toggleCollapse('visual')}
          >
            {/* Logo de la Empresa */}
            <div className="space-y-2">
              <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <Image size={12} className="text-slate-400" /> Logo de la Empresa
              </label>
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                {logoPreview ? (
                  <div className="relative group">
                    <img 
                      src={logoPreview} 
                      alt="Logo" 
                      className="max-h-20 object-contain rounded-xl border border-slate-200 p-2 bg-white"
                    />
                    <button 
                      type="button" 
                      onClick={() => { setLogoPreview(null); setFormData(prev => ({ ...prev, logoUrl: undefined })); }}
                      className="absolute -top-2 -right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors shadow-md"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ) : (
                  <div className="py-3 px-4 text-slate-400 text-center sm:text-left flex items-center gap-3">
                    <Building2 size={32} className="text-slate-300" />
                    <div>
                      <p className="font-bold text-[10px]">Sin Logo Cargado</p>
                      <p className="text-[9px] text-slate-400">Se usará texto en los PDFs.</p>
                    </div>
                  </div>
                )}

                <input 
                  type="file" 
                  id="logoInput"
                  accept="image/*" 
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <label 
                  htmlFor="logoInput"
                  className="btn-secondary px-4 py-2 text-[10px] rounded-xl font-bold border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer inline-block shrink-0"
                >
                  Cargar Logo PNG
                </label>
              </div>
              <p className="text-[10px] text-slate-400">
                Se recomienda un logo con fondo transparente. Se usará en cabeceras de reportes y presupuestos.
              </p>
            </div>

            {/* Título de Pestaña (Navegador) */}
            <div>
              <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <Eye size={12} className="text-slate-400" /> Título de Pestaña (Navegador)
              </label>
              <input
                type="text"
                className="input w-full mt-1.5"
                placeholder="Ej: SOLUTION CATÁLOGO"
                value={formData.browserTabTitle || ''}
                onChange={e => setFormData({ ...formData, browserTabTitle: e.target.value })}
              />
              <p className="text-[10px] text-slate-400 mt-1">Aparece en la pestaña del navegador.</p>
            </div>

            {/* Página Principal por Defecto */}
            <div>
              <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <LayoutDashboard size={12} className="text-slate-400" /> Página Principal por Defecto
              </label>
              <select 
                className="input w-full mt-1.5"
                value={formData.defaultLandingPage || 'catalog'}
                onChange={e => setFormData({ ...formData, defaultLandingPage: e.target.value as any })}
              >
                <option value="catalog">Catálogo (Público)</option>
                <option value="orders">Pedidos (Gestión)</option>
              </select>
              <p className="text-[10px] text-slate-400 mt-1">La pantalla con la que inicia la app al ingresar como dueño o administrador.</p>
            </div>

            {/* Texto descriptivo del hero/banner */}
            <div>
              <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <Eye size={12} className="text-slate-400" /> Descripción/subtítulo del banner
              </label>
              <input
                type="text"
                className="input w-full mt-1.5"
                placeholder="Ej: Tu tienda de impresión 3D y tecnología"
                value={(formData as any).catalogHeroText || ''}
                onChange={e => setFormData({ ...formData, catalogHeroText: e.target.value } as any)}
              />
              <p className="text-[10px] text-slate-400 mt-1">Texto descriptivo debajo del título en el banner del catálogo.</p>
            </div>

            {/* Descripción de Pie de Página (Footer) */}
            <div>
              <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <Eye size={12} className="text-slate-400" /> Descripción de Pie de Página (Footer)
              </label>
              <input
                type="text"
                className="input w-full mt-1.5"
                placeholder="Ej: Impresión 3D y Modelado Digital"
                value={formData.description || ''}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
              <p className="text-[10px] text-slate-400 mt-1">Texto descriptivo que aparece en el pie de página (footer) de la web.</p>
            </div>

            {/* Saturación de imágenes sin stock */}
            <div>
              <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <Palette size={12} className="text-slate-400" /> Saturación de imágenes sin stock
              </label>
              <div className="flex items-center gap-4 mt-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  className="flex-1 accent-violet-500"
                  value={(formData as any).outOfStockSaturate ?? 20}
                  onChange={e => setFormData({ ...formData, outOfStockSaturate: Number(e.target.value) } as any)}
                />
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg border border-slate-200 bg-gradient-to-br from-blue-400 via-red-400 to-yellow-400 flex-shrink-0"
                    style={{ filter: `saturate(${(formData as any).outOfStockSaturate ?? 20}%)`, opacity: 0.6 }}
                  />
                  <span className="text-sm font-bold text-slate-700 w-10 text-right">
                    {(formData as any).outOfStockSaturate ?? 20}%
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Controla cuánto color conservan las imágenes de productos sin stock (0% = gris total · 100% = color completo).
              </p>
            </div>
          </SectionCard>

          <div className="flex justify-end pt-4 border-t">
            <button 
              type="submit" 
              disabled={saving}
              className="btn-primary flex items-center gap-2"
            >
              <Save size={18} />
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
