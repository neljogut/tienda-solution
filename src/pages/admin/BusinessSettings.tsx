import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { BusinessSettings } from '../../types/settings';
import { Building2, Save, Image, X, Phone, Mail, MapPin, Landmark, Clipboard, Link } from 'lucide-react';

const defaultBusinessSettings: BusinessSettings = {
  name: 'Dualgi 3D',
  ownerName: 'Maxi',
  phone: '+54 9 11 1234-5678',
  email: 'contacto@dualgi3d.com',
  address: 'Calle Falsa 123',
  city: 'Buenos Aires',
  province: 'CABA',
  cuit: '20-12345678-9',
  socialMedia: '@dualgi3d',
  description: 'Materializando tus ideas en 3D'
};

export const BusinessSettingsPage: React.FC = () => {
  const [formData, setFormData] = useState<BusinessSettings>(defaultBusinessSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'business'));
        if (snap.exists()) {
          const data = snap.data() as BusinessSettings;
          setFormData(data);
          if (data.logoUrl) {
            setLogoPreview(data.logoUrl);
          }
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(false);
    try {
      await setDoc(doc(db, 'settings', 'business'), formData);
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
              {/* Social handle */}
              <div>
                <label className="input-label font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <Link size={12} className="text-slate-400" /> Redes Sociales (Instagram/Web)
                </label>
                <input 
                  type="text" 
                  className="input w-full mt-1.5"
                  placeholder="Ej: @dualgi3d"
                  value={formData.socialMedia || ''}
                  onChange={e => setFormData({ ...formData, socialMedia: e.target.value })}
                />
              </div>

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
