import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, addDoc, collection, getDocs, query } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Product } from '../../types/product';
import type { Category } from '../../types/category';
import type { PricingSettings3D, PricingSettingsResale, ExchangeRateData } from '../../types/settings';
import {
  calculate3DCost,
  calculate3DRetailPrice,
  calculate3DWholesalePrice,
  calculateResaleRetailPrice,
  calculateResaleWholesalePrice
} from '../../services/pricingService';
import { ArrowLeft, Upload, Loader2, Calculator, Plus, Trash2 } from 'lucide-react';

export const ProductForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!isNew);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [settings3d, setSettings3d] = useState<PricingSettings3D | null>(null);
  const [settingsResale, setSettingsResale] = useState<PricingSettingsResale | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(1000);

  const [formData, setFormData] = useState<any>({
    type: '3d',
    name: '',
    categoryId: '',
    category: '',
    description: '',
    isActive: true,
    useManualPrice: false,
    manualRetailPrice: 0,
    weightGrams: 0,
    printTimeMinutes: 0,
    isKeychain: false,
    purchaseCost: 0,
    stock: 0,
    priceTiers: [],
  });

  const [calculated, setCalculated] = useState({
    cost: 0,
    retail: 0,
    wholesale: 0,
  });

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Fetch categories
        const catSnap = await getDocs(query(collection(db, 'categories')));
        setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));

        // Fetch settings
        const s3dSnap = await getDoc(doc(db, 'settings/pricing3d'));
        if (s3dSnap.exists()) setSettings3d(s3dSnap.data() as PricingSettings3D);
        
        const sResaleSnap = await getDoc(doc(db, 'settings/pricingResale'));
        if (sResaleSnap.exists()) setSettingsResale(sResaleSnap.data() as PricingSettingsResale);
        
        const xrSnap = await getDoc(doc(db, 'settings/exchangeRate'));
        if (xrSnap.exists()) {
          const data = xrSnap.data() as ExchangeRateData;
          setExchangeRate(data.currentUsdToArs);
        }

        if (!isNew && id) {
          const docSnap = await getDoc(doc(db, 'products', id));
          if (docSnap.exists()) {
            const data = docSnap.data() as Product;
            setFormData(data);
            setImagePreview(data.mainImage || '');
          }
        }
      } catch (err) {
        console.error('Error fetching initial data:', err);
      } finally {
        setFetching(false);
      }
    };
    loadInitialData();
  }, [id, isNew]);

  const flatCategories = useMemo(() => {
    const map = new Map<string | null, Category[]>();
    for (const cat of categories) {
      const key = cat.parentId ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(cat);
    }
    for (const [, children] of map) {
      children.sort((a, b) => a.order - b.order);
    }
    
    const flatten = (parentId: string | null, depth: number): { id: string; label: string }[] => {
      const result: { id: string; label: string }[] = [];
      const children = map.get(parentId) ?? [];
      for (const cat of children) {
        result.push({ id: cat.id, label: '─'.repeat(depth) + (depth > 0 ? ' ' : '') + cat.name });
        result.push(...flatten(cat.id, depth + 1));
      }
      return result;
    };
    return flatten(null, 0);
  }, [categories]);

  useEffect(() => {
    if (formData.type === '3d') {
      if (!settings3d) return;
      const rateData = { currentUsdToArs: exchangeRate, lastUpdate: '', provider: '' };
      const cost = calculate3DCost(formData, settings3d, rateData);
      const retail = calculate3DRetailPrice(formData, settings3d, rateData);
      const wholesale = calculate3DWholesalePrice(formData, settings3d, rateData);
      setCalculated({ cost, retail, wholesale });
    } else if (formData.type === 'resale') {
      if (!settingsResale) return;
      const cost = formData.purchaseCost || 0;
      const retail = calculateResaleRetailPrice(cost, settingsResale);
      const wholesale = calculateResaleWholesalePrice(cost, settingsResale);
      setCalculated({ cost, retail, wholesale });
    }
  }, [formData.weightGrams, formData.printTimeMinutes, formData.isKeychain, formData.purchaseCost, formData.type, settings3d, settingsResale, exchangeRate]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const compressAndConvertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
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
          
          // Comprimir a JPEG al 70% de calidad para ocupar muy poco espacio
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let mainImageUrl = formData.mainImage || '';

      if (imageFile) {
        // La mejor solución: Comprimir la imagen y guardarla en Base64 directo en la base de datos
        // Evita bloqueos de red, CORS, y servidores externos de terceros.
        mainImageUrl = await compressAndConvertToBase64(imageFile);
      }

      const productToSave = {
        ...formData,
        mainImage: mainImageUrl,
        calculatedCost: calculated.cost,
        calculatedRetailPrice: calculated.retail,
        calculatedWholesalePrice: calculated.wholesale,
      };

      if (isNew) {
        await addDoc(collection(db, 'products'), productToSave);
      } else if (id) {
        await setDoc(doc(db, 'products', id), productToSave, { merge: true });
      }
      navigate('/admin/products');
    } catch (error) {
      console.error("Error al guardar:", error);
      alert("Hubo un error al guardar el producto.");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-500" size={30} /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{isNew ? 'Nuevo Producto' : 'Editar Producto'}</h1>
        </div>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda: Datos principales */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6 space-y-4">
            <h3 className="font-semibold text-lg text-slate-800 border-b pb-2">Información Básica</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Producto</label>
                <select 
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                  disabled={!isNew}
                >
                  <option value="3d">Impresión 3D</option>
                  <option value="resale">Reventa</option>
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
                <select
                  required
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 text-sm"
                  value={formData.categoryId || ''}
                  onChange={e => {
                    const catId = e.target.value;
                    const catName = categories.find(c => c.id === catId)?.name || '';
                    setFormData({ ...formData, categoryId: catId, category: catName });
                  }}
                >
                  <option value="">Seleccionar Categoría</option>
                  {flatCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
              <input 
                type="text" required
                className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
              <textarea 
                rows={4}
                className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" id="isActive"
                checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <label htmlFor="isActive" className="text-sm text-slate-700">Producto Activo (visible en catálogo)</label>
            </div>
          </div>

          <div className="card p-6 space-y-4 bg-blue-50/50 border-blue-100">
            <h3 className="font-semibold text-lg text-slate-800 border-b border-blue-200 pb-2 flex items-center gap-2">
              <Calculator size={20} className="text-blue-500"/>
              Cálculo de Precios
            </h3>

            {formData.type === '3d' ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Peso (Gramos)</label>
                  <input 
                    type="number" min="0" required
                    className="w-full border border-slate-300 rounded-lg p-2"
                    value={formData.weightGrams || ''} onChange={e => setFormData({...formData, weightGrams: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tiempo (Minutos)</label>
                  <input 
                    type="number" min="0" required
                    className="w-full border border-slate-300 rounded-lg p-2"
                    value={formData.printTimeMinutes || ''} onChange={e => setFormData({...formData, printTimeMinutes: Number(e.target.value)})}
                  />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input 
                    type="checkbox" id="isKeychain"
                    checked={formData.isKeychain || false} onChange={e => setFormData({...formData, isKeychain: e.target.checked})}
                    className="w-4 h-4"
                  />
                  <label htmlFor="isKeychain" className="text-sm text-slate-700">Es un Llavero (aplica multiplicador especial)</label>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Costo de Compra ($)</label>
                  <input 
                    type="number" min="0" required
                    className="w-full border border-slate-300 rounded-lg p-2"
                    value={formData.purchaseCost || ''} onChange={e => setFormData({...formData, purchaseCost: Number(e.target.value)})}
                  />
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stock Disponible</label>
                <input 
                  type="number" min="0" required
                  className="w-full border border-blue-300 bg-blue-50 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 font-semibold"
                  value={formData.stock === undefined ? 0 : formData.stock} onChange={e => setFormData({...formData, stock: Number(e.target.value)})}
                />
                <p className="text-xs text-slate-500 mt-1">El stock controla si los clientes pueden añadirlo al carrito.</p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Costo Calculado:</span>
                <span className="font-semibold">${calculated.cost.toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Precio Mayorista sugerido:</span>
                <span className="font-semibold text-blue-600">${calculated.wholesale.toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between items-center text-lg border-t pt-2 mt-1">
                <span className="text-slate-700 font-medium">Precio Minorista (Venta):</span>
                <span className="font-bold text-emerald-600">${calculated.retail.toLocaleString('es-AR')}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-blue-200">
              <div className="flex items-center gap-2 mb-3">
                <input 
                  type="checkbox" id="useManualPrice"
                  checked={formData.useManualPrice} onChange={e => setFormData({...formData, useManualPrice: e.target.checked})}
                  className="w-4 h-4 text-amber-500 rounded"
                />
                <label htmlFor="useManualPrice" className="text-sm font-bold text-amber-700">Usar Precio Manual (sobrescribe el cálculo)</label>
              </div>
              
              {formData.useManualPrice && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Precio Manual Minorista ($)</label>
                  <input 
                    type="number" min="0" required={formData.useManualPrice}
                    className="w-full border border-amber-300 bg-amber-50 rounded-lg p-2 focus:ring-2 focus:ring-amber-500"
                    value={formData.manualRetailPrice || ''} onChange={e => setFormData({...formData, manualRetailPrice: Number(e.target.value)})}
                  />
                  <p className="text-xs text-amber-600 mt-1">El precio mayorista se calculará en base a este precio manual.</p>
                </div>
              )}
            </div>
          </div>

          {/* Tramos de precio (Price Tiers) */}
          <div className="card p-6 space-y-4">
              <h3 className="font-semibold text-lg text-slate-800 border-b pb-2 flex items-center justify-between">
                <span>Tramos de Precios (Precios por Cantidad)</span>
                <button
                  type="button"
                  onClick={() => {
                    const tiers = formData.priceTiers || [];
                    const lastTier = tiers[tiers.length - 1];
                    const nextMin = lastTier ? lastTier.maxQty + 1 : 2;
                    setFormData({
                      ...formData,
                      priceTiers: [...tiers, { minQty: nextMin, maxQty: nextMin + 9, unitPrice: formData.useManualPrice ? formData.manualRetailPrice : calculated.retail }]
                    });
                  }}
                  className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1"
                >
                  <Plus size={14} /> Agregar Tramo
                </button>
              </h3>
              
              <div className="space-y-3">
                {(!formData.priceTiers || formData.priceTiers.length === 0) &&
                  <p className="text-sm text-slate-400 text-center py-4">No hay tramos de precios definidos para este producto. Se venderá al precio base.</p>
                }
                
                {formData.priceTiers?.map((tier: any, index: number) => (
                  <div key={index} className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">Min Cantidad</label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={tier.minQty}
                          onChange={e => {
                            const newTiers = [...formData.priceTiers];
                            newTiers[index].minQty = Number(e.target.value);
                            setFormData({ ...formData, priceTiers: newTiers });
                          }}
                          className="w-full border border-slate-300 rounded-md p-1 text-sm text-center"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">Max Cantidad</label>
                        <input
                          type="number"
                          min={tier.minQty}
                          required
                          value={tier.maxQty}
                          onChange={e => {
                            const newTiers = [...formData.priceTiers];
                            newTiers[index].maxQty = Number(e.target.value);
                            setFormData({ ...formData, priceTiers: newTiers });
                          }}
                          className="w-full border border-slate-300 rounded-md p-1 text-sm text-center"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">Precio Unitario ($)</label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={tier.unitPrice}
                          onChange={e => {
                            const newTiers = [...formData.priceTiers];
                            newTiers[index].unitPrice = Number(e.target.value);
                            setFormData({ ...formData, priceTiers: newTiers });
                          }}
                          className="w-full border border-slate-300 rounded-md p-1 text-sm text-right font-semibold text-emerald-600"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newTiers = formData.priceTiers.filter((_: any, i: number) => i !== index);
                        setFormData({ ...formData, priceTiers: newTiers });
                      }}
                      className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg self-end"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

        {/* Columna Derecha: Imagen y Guardar */}
        <div className="space-y-6">
          <div className="card p-6 flex flex-col items-center">
            <h3 className="font-semibold text-lg text-slate-800 w-full border-b pb-2 mb-4">Imagen Principal</h3>
            
            <div className="w-full aspect-square bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl overflow-hidden mb-4 relative group flex items-center justify-center">
              {imagePreview ? (
                <img src={imagePreview} className="w-full h-full object-cover" alt="Preview" />
              ) : (
                <div className="text-slate-400 flex flex-col items-center">
                  <Upload size={32} className="mb-2" />
                  <span className="text-sm">Sin imagen</span>
                </div>
              )}
              
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <label className="cursor-pointer bg-white text-slate-800 px-4 py-2 rounded-lg font-medium text-sm shadow-lg hover:bg-slate-50 transition-colors">
                  Cambiar Imagen
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
              </div>
            </div>
            <p className="text-xs text-slate-500 text-center mb-6">Formatos: JPG, PNG, GIF, MP4 (max 5MB).</p>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full btn-primary py-3 text-lg flex justify-center items-center gap-2"
            >
              {loading && <Loader2 className="animate-spin" size={20} />}
              {isNew ? 'Crear Producto' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
