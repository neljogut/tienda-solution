import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, firebaseConfig, app, getFunctionsRegion } from '../../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { BusinessSettings, PaymentSettings } from '../../types/settings';
import { defaultPaymentSettings, getDefaultBusinessSettings } from '../../constants/defaults';
import {
  Building2, Save, Image, X, Phone, Mail, MapPin, Landmark, Clipboard, Link,
  CreditCard, Loader2, CheckCircle, AlertCircle, RefreshCw, Calendar,
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

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [businessSnap, paymentsSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'business')),
          getDoc(doc(db, 'settings', 'payments')),
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
        const paymentsToSave: PaymentSettings = {
          ...paymentSettings,
          mercadopago: {
            ...paymentSettings.mercadopago,
            enabled: mpEnabled,
            publicKey: mpPublicKey.trim(),
          },
        };
        await Promise.all([
          setDoc(doc(db, 'settings', 'business'), formData),
          setDoc(doc(db, 'settings', 'payments'), paymentsToSave),
        ]);
        setSuccessMsg(true);
        setTimeout(() => setSuccessMsg(false), 4000);
      } catch (err) {
        console.error('Error saving business settings:', err);
        alert('Error al guardar la configuración.');
      } finally {
        setSaving(false);
      }
    };

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
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Building2 size={26} className="text-blue-600" />
            Configuración del Negocio
          </h1>
          <p className="page-subtitle">
            Edita los datos públicos, fiscales y de contacto de tu negocio para usar en presupuestos y comprobantes.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
        {/* Left column: Logo upload */}
        <div className="space-y-6">
          <div className="card p-5 border border-slate-200/80 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 border-b pb-2">
              <Image size={16} className="text-blue-500" />
              Logo de la Empresa
            </h3>
            
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
              {logoPreview ? (
                <div className="relative group">
                  <img 
                    src={logoPreview} 
                    alt="Logo" 
                    className="max-h-24 object-contain rounded-xl border border-slate-200 p-2 bg-white"
                  />
                  <button 
                    type="button" 
                    onClick={() => { setLogoPreview(null); setFormData(prev => ({ ...prev, logoUrl: undefined })); }}
                    className="absolute -top-2 -right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors shadow-md"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="py-6 text-slate-400">
                  <Building2 size={48} className="mx-auto text-slate-300 mb-2" />
                  <p className="font-bold">Sin Logo Cargado</p>
                  <p className="text-[10px] mt-0.5">Se usará texto en los PDFs.</p>
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
                className="btn-secondary px-4 py-2 mt-4 text-[10px] rounded-xl font-bold border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer inline-block"
              >
                Cargar Logo PNG
              </label>
            </div>
            
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Carga preferentemente un logo con fondo transparente. Se redimensiona automáticamente para caber en las cabeceras de tus reportes financieros y facturas.
            </p>
          </div>

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

          {/* Fecha de Entrega Estimada */}
          <div className="card p-5 border border-slate-200/80 shadow-sm space-y-4 animate-fadeIn">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 border-b pb-2">
              <Calendar size={16} className="text-blue-500" />
              Fecha de Entrega Estimada
            </h3>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-600">Mostrar fecha al cliente</label>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                  Permite mostrar al cliente la fecha estimada de entrega (calculada por la cola de impresión) en Checkout y Pedido Compartido.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={formData.showEstimatedDeliveryDateToClient !== false}
                  onChange={e => setFormData({ ...formData, showEstimatedDeliveryDateToClient: e.target.checked })}
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Right column: Public & private business fields */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6 border border-slate-200/80 shadow-sm space-y-5">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 border-b pb-2">
              <Clipboard size={16} className="text-blue-500" />
              Información de la Empresa
            </h3>

            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl font-semibold animate-fadeIn flex items-center gap-2">
                <Landmark size={14} /> ¡Configuración guardada exitosamente!
              </div>
            )}

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

              {/* City / Province */}
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
              {/* Description */}
              <div>
                <label className="input-label font-bold text-slate-500 uppercase">Descripción de Cabecera</label>
                <input 
                  type="text" 
                  className="input w-full mt-1.5"
                  placeholder="Ej: Impresión 3D y Modelado Digital"
                  value={formData.description || ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            {/* Pagos y transferencias */}
            <div className="pt-6 border-t border-slate-200 space-y-5">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <CreditCard size={18} className="text-blue-600" />
                Pagos y transferencias
              </h2>

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
                  className="input w-full"
                  value={paymentSettings.bankTransfer.note || ''}
                  onChange={(e) =>
                    setPaymentSettings((p) => ({
                      ...p,
                      bankTransfer: { ...p.bankTransfer, note: e.target.value },
                    }))
                  }
                />
              </div>

              <div className="pt-6 border-t border-slate-200 space-y-4">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <CreditCard size={16} className="text-blue-500" />
                  Mercado Pago (Pagos Online)
                </h3>

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
              </div>
            </div>

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
        </div>
      </form>
    </div>
  );
};
