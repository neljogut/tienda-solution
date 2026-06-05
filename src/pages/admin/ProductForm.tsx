import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, addDoc, collection, getDocs, query } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Product, FilamentLine, SupplyLine } from '../../types/product';
import type { Filament, Supply } from '../../types/inventory';
import type { Category } from '../../types/category';
import { flattenCategoriesForSelect } from '../../utils/categories';
import type { PricingSettings3D, PricingSettingsResale, ExchangeRateData } from '../../types/settings';
import {
  calculate3DCost,
  calculate3DRetailPrice,
  calculate3DWholesalePrice,
  calculateResaleRetailPrice,
  calculateResaleWholesalePrice
} from '../../services/pricingService';
import { ArrowLeft, Upload, Loader2, Calculator, Plus, Trash2, Star } from 'lucide-react';
import { getProductImages } from '../../utils/productImages';
import { NumericInput } from '../../components/NumericInput';
import { WeightKgGramsInput } from '../../components/WeightKgGramsInput';
import { TimeHoursMinutesInput } from '../../components/TimeHoursMinutesInput';
import { formatWeightGrams } from '../../utils/weightGrams';

interface ImageEntry {
  url: string;
  file?: File;
}

export const ProductForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!isNew);
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [mainImageUrl, setMainImageUrl] = useState<string>('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [filaments, setFilaments] = useState<Filament[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
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
    filamentLines: [] as FilamentLine[],
    supplyIds: [] as SupplyLine[],
    filamentIds: [] as string[],
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
        const [catSnap, invSnap] = await Promise.all([
          getDocs(query(collection(db, 'categories'))),
          getDocs(query(collection(db, 'inventory'))),
        ]);
        setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
        const fils: Filament[] = [];
        const sups: Supply[] = [];
        invSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.type === 'filament') fils.push({ id: d.id, ...data } as Filament);
          if (data.type === 'supply') sups.push({ id: d.id, ...data } as Supply);
        });
        setFilaments(fils);
        setSupplies(sups);

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
            const normalized = { ...data } as any;
            if (data.type === '3d') {
              if (!normalized.filamentLines?.length && normalized.filamentIds?.length) {
                const perFil = (normalized.weightGrams || 0) / normalized.filamentIds.length;
                normalized.filamentLines = normalized.filamentIds.map((id: string) => ({
                  supplyId: id,
                  grams: perFil,
                }));
              }
              normalized.filamentLines = normalized.filamentLines ?? [];
              normalized.supplyIds = normalized.supplyIds ?? [];
            }
            setFormData(normalized);
            const existingImages = getProductImages(data).map((url) => ({ url }));
            setImages(existingImages);
            setMainImageUrl(data.mainImage || existingImages[0]?.url || '');
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

  const flatCategories = useMemo(
    () => flattenCategoriesForSelect(categories),
    [categories]
  );

  const resolveCategoryLabel = (catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return '';
    if (!cat.parentId) return cat.name;
    const parent = categories.find((c) => c.id === cat.parentId);
    return parent ? `${parent.name} › ${cat.name}` : cat.name;
  };

  const inventoryMap = useMemo(() => {
    const map = new Map<string, { type?: string; priceUsdKg?: number; unitCostArs?: number }>();
    filaments.forEach((f) => map.set(f.id, { type: 'filament', priceUsdKg: f.priceUsdKg }));
    supplies.forEach((s) => map.set(s.id, { type: 'supply', unitCostArs: s.unitCostArs }));
    return map;
  }, [filaments, supplies]);

  const totalFilamentGrams = useMemo(
    () =>
      (formData.filamentLines ?? []).reduce(
        (sum: number, line: FilamentLine) => sum + (Number(line.grams) || 0),
        0
      ),
    [formData.filamentLines]
  );

  useEffect(() => {
    if (formData.type === '3d') {
      if (!settings3d) return;
      const rateData = { currentUsdToArs: exchangeRate, lastUpdate: '', provider: '' };
      const cost = calculate3DCost(formData, settings3d, rateData, inventoryMap);
      const retail = calculate3DRetailPrice(formData, settings3d, rateData, inventoryMap);
      const wholesale = calculate3DWholesalePrice(formData, settings3d, rateData, inventoryMap);
      setCalculated({ cost, retail, wholesale });
    } else if (formData.type === 'resale') {
      if (!settingsResale) return;
      const cost = formData.purchaseCost || 0;
      const retail = calculateResaleRetailPrice(cost, settingsResale);
      const wholesale = calculateResaleWholesalePrice(cost, settingsResale);
      setCalculated({ cost, retail, wholesale });
    }
  }, [formData.weightGrams, formData.printTimeMinutes, formData.isKeychain, formData.purchaseCost, formData.type, formData.filamentLines, formData.supplyIds, settings3d, settingsResale, exchangeRate, inventoryMap]);

  const handleImagesAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const newEntries: ImageEntry[] = files.map((file) => ({
      url: URL.createObjectURL(file),
      file,
    }));

    setImages((prev) => [...prev, ...newEntries]);
    if (!mainImageUrl && newEntries[0]) {
      setMainImageUrl(newEntries[0].url);
    }
    e.target.value = '';
  };

  const handleRemoveImage = (url: string) => {
    setImages((prev) => {
      const entry = prev.find((img) => img.url === url);
      if (entry?.file) URL.revokeObjectURL(entry.url);
      const next = prev.filter((img) => img.url !== url);
      if (mainImageUrl === url) {
        setMainImageUrl(next[0]?.url ?? '');
      }
      return next;
    });
  };

  const handleSetMainImage = (url: string) => {
    setMainImageUrl(url);
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
      const resolvedUrls: string[] = [];
      for (const img of images) {
        if (img.file) {
          resolvedUrls.push(await compressAndConvertToBase64(img.file));
        } else {
          resolvedUrls.push(img.url);
        }
      }

      const mainIndex = images.findIndex((img) => img.url === mainImageUrl);
      const safeMainIndex = mainIndex >= 0 ? mainIndex : 0;
      const resolvedMain = resolvedUrls[safeMainIndex] ?? '';
      const resolvedGallery = resolvedUrls.filter((_, idx) => idx !== safeMainIndex);

      const productToSave: any = {
        ...formData,
        mainImage: resolvedMain,
        gallery: resolvedGallery,
        calculatedCost: calculated.cost,
        calculatedRetailPrice: calculated.retail,
        calculatedWholesalePrice: calculated.wholesale,
      };

      if (productToSave.type === '3d') {
        productToSave.filamentLines = (productToSave.filamentLines ?? []).filter(
          (l: FilamentLine) => l.supplyId && l.grams > 0
        );
        productToSave.supplyIds = (productToSave.supplyIds ?? []).filter(
          (l: SupplyLine) => l.supplyId && l.quantity > 0
        );
        productToSave.filamentIds = productToSave.filamentLines.map((l: FilamentLine) => l.supplyId);
      }

      // Sanitize fields
      if (productToSave.weightGrams === '') productToSave.weightGrams = 0;
      if (productToSave.printTimeMinutes === '') productToSave.printTimeMinutes = 0;
      if (productToSave.purchaseCost === '') productToSave.purchaseCost = 0;
      if (productToSave.stock === '') productToSave.stock = 0;
      if (productToSave.manualRetailPrice === '') productToSave.manualRetailPrice = 0;

      // Sanitize priceTiers
      if (productToSave.priceTiers) {
        productToSave.priceTiers = productToSave.priceTiers.map((t: any) => ({
          minQty: t.minQty === '' ? 1 : Number(t.minQty),
          maxQty: t.maxQty === '' ? 1 : Number(t.maxQty),
          unitPrice: t.unitPrice === '' ? 0 : Number(t.unitPrice)
        }));
      }

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
                    setFormData({
                      ...formData,
                      categoryId: catId,
                      category: resolveCategoryLabel(catId),
                    });
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
                <WeightKgGramsInput
                  label="Peso del producto"
                  required
                  valueGrams={formData.weightGrams}
                  onChangeGrams={val => setFormData({ ...formData, weightGrams: val })}
                  className="[&_label]:block [&_label]:text-sm [&_label]:font-medium [&_label]:text-slate-700 [&_label]:mb-1 [&_label]:normal-case"
                />
                <TimeHoursMinutesInput
                  label="Tiempo de impresión"
                  required
                  valueMinutes={formData.printTimeMinutes}
                  onChangeMinutes={val => setFormData({ ...formData, printTimeMinutes: val })}
                  className="[&_label]:block [&_label]:text-sm [&_label]:font-medium [&_label]:text-slate-700 [&_label]:mb-1 [&_label]:normal-case [&_.input]:border [&_.input]:border-slate-300 [&_.input]:rounded-lg [&_.input]:p-2"
                />
                <div className="col-span-2 flex items-center gap-2">
                  <input 
                    type="checkbox" id="isKeychain"
                    checked={formData.isKeychain || false} onChange={e => setFormData({...formData, isKeychain: e.target.checked})}
                    className="w-4 h-4"
                  />
                  <label htmlFor="isKeychain" className="text-sm text-slate-700">Es un Llavero (aplica multiplicador especial)</label>
                </div>

                <div className="col-span-2 space-y-3 pt-2 border-t border-blue-200">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">Filamentos asociados</label>
                    <button
                      type="button"
                      className="btn-secondary !py-1 !px-2 text-xs flex items-center gap-1"
                      onClick={() => setFormData({
                        ...formData,
                        filamentLines: [...(formData.filamentLines || []), { supplyId: '', grams: 0 }],
                      })}
                    >
                      <Plus size={12} /> Agregar
                    </button>
                  </div>
                  {(formData.filamentLines?.length ?? 0) === 0 && (
                    <p className="text-xs text-slate-500">Sin filamentos vinculados. Se estima costo por peso total.</p>
                  )}
                  {formData.filamentLines?.map((line: FilamentLine, idx: number) => (
                    <div key={idx} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <select
                          className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                          value={line.supplyId}
                          onChange={(e) => {
                            const next = [...formData.filamentLines];
                            next[idx] = { ...next[idx], supplyId: e.target.value };
                            setFormData({ ...formData, filamentLines: next });
                          }}
                        >
                          <option value="">Seleccionar filamento...</option>
                          {filaments.map((f) => (
                            <option key={f.id} value={f.id}>{f.brand} · {f.material} · {f.color}</option>
                          ))}
                        </select>
                      </div>
                      <WeightKgGramsInput
                        compact
                        valueGrams={line.grams}
                        onChangeGrams={(val) => {
                          const next = [...formData.filamentLines];
                          next[idx] = { ...next[idx], grams: val === '' ? 0 : Number(val) };
                          setFormData({ ...formData, filamentLines: next });
                        }}
                        className="pb-0.5"
                      />
                      <button
                        type="button"
                        className="text-red-500 p-2"
                        onClick={() => setFormData({
                          ...formData,
                          filamentLines: formData.filamentLines.filter((_: FilamentLine, i: number) => i !== idx),
                        })}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {(formData.filamentLines?.length ?? 0) > 0 && (
                    <div className="flex justify-end items-center gap-2 text-sm pt-1">
                      <span className="text-slate-500">Total filamento utilizado:</span>
                      <span className="font-semibold text-slate-800">{formatWeightGrams(totalFilamentGrams)}</span>
                    </div>
                  )}
                </div>

                <div className="col-span-2 space-y-3 pt-2 border-t border-blue-200">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">Insumos asociados</label>
                    <button
                      type="button"
                      className="btn-secondary !py-1 !px-2 text-xs flex items-center gap-1"
                      onClick={() => setFormData({
                        ...formData,
                        supplyIds: [...(formData.supplyIds || []), { supplyId: '', quantity: 1 }],
                      })}
                    >
                      <Plus size={12} /> Agregar
                    </button>
                  </div>
                  {(formData.supplyIds?.length ?? 0) === 0 && (
                    <p className="text-xs text-slate-500">Sin insumos vinculados (tapas, luces, etc.).</p>
                  )}
                  {formData.supplyIds?.map((line: SupplyLine, idx: number) => (
                    <div key={idx} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <select
                          className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                          value={line.supplyId}
                          onChange={(e) => {
                            const next = [...formData.supplyIds];
                            next[idx] = { ...next[idx], supplyId: e.target.value };
                            setFormData({ ...formData, supplyIds: next });
                          }}
                        >
                          <option value="">Seleccionar insumo...</option>
                          {supplies.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-20">
                        <NumericInput
                          className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                          value={line.quantity}
                          onChange={(val) => {
                            const next = [...formData.supplyIds];
                            next[idx] = { ...next[idx], quantity: val === '' ? 1 : Number(val) };
                            setFormData({ ...formData, supplyIds: next });
                          }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 pb-2">u.</span>
                      <button
                        type="button"
                        className="text-red-500 p-2"
                        onClick={() => setFormData({
                          ...formData,
                          supplyIds: formData.supplyIds.filter((_: SupplyLine, i: number) => i !== idx),
                        })}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Costo de Compra ($)</label>
                  <NumericInput 
                    allowDecimals
                    required
                    className="w-full border border-slate-300 rounded-lg p-2"
                    value={formData.purchaseCost} 
                    onChange={val => setFormData({...formData, purchaseCost: val})}
                  />
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stock Disponible</label>
                <NumericInput 
                  required
                  className="w-full border border-blue-300 bg-blue-50 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 font-semibold"
                  value={formData.stock} 
                  onChange={val => setFormData({...formData, stock: val})}
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
                  <NumericInput 
                    required={formData.useManualPrice}
                    className="w-full border border-amber-300 bg-amber-50 rounded-lg p-2 focus:ring-2 focus:ring-amber-500"
                    value={formData.manualRetailPrice} 
                    onChange={val => setFormData({...formData, manualRetailPrice: val})}
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
                        <NumericInput
                          required
                          value={tier.minQty}
                          onChange={val => {
                            const newTiers = [...formData.priceTiers];
                            newTiers[index].minQty = val;
                            setFormData({ ...formData, priceTiers: newTiers });
                          }}
                          className="w-full border border-slate-300 rounded-md p-1 text-sm text-center"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">Max Cantidad</label>
                        <NumericInput
                          required
                          value={tier.maxQty}
                          onChange={val => {
                            const newTiers = [...formData.priceTiers];
                            newTiers[index].maxQty = val;
                            setFormData({ ...formData, priceTiers: newTiers });
                          }}
                          className="w-full border border-slate-300 rounded-md p-1 text-sm text-center"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">Precio Unitario ($)</label>
                        <NumericInput
                          required
                          value={tier.unitPrice}
                          onChange={val => {
                            const newTiers = [...formData.priceTiers];
                            newTiers[index].unitPrice = val;
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
            <div className="w-full flex items-center justify-between border-b pb-2 mb-4">
              <h3 className="font-semibold text-lg text-slate-800">Imágenes del producto</h3>
              <label className="cursor-pointer btn-secondary !py-1 !px-2 text-xs flex items-center gap-1">
                <Plus size={12} /> Agregar
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImagesAdd}
                />
              </label>
            </div>

            <div className="w-full aspect-square bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl overflow-hidden mb-4 relative flex items-center justify-center">
              {mainImageUrl ? (
                <img src={mainImageUrl} className="w-full h-full object-cover" alt="Imagen principal" />
              ) : (
                <label className="text-slate-400 flex flex-col items-center cursor-pointer hover:text-slate-600 transition-colors">
                  <Upload size={32} className="mb-2" />
                  <span className="text-sm">Agregar imágenes</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImagesAdd}
                  />
                </label>
              )}
              {mainImageUrl && (
                <span className="absolute top-2 left-2 badge badge-blue text-[10px] flex items-center gap-1">
                  <Star size={10} className="fill-current" /> Principal
                </span>
              )}
            </div>

            {images.length > 0 && (
              <div className="w-full grid grid-cols-3 gap-2 mb-4">
                {images.map((img) => {
                  const isMain = img.url === mainImageUrl;
                  return (
                    <div
                      key={img.url}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                        isMain ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'
                      }`}
                    >
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 flex bg-black/60">
                        <button
                          type="button"
                          title="Marcar como principal"
                          onClick={() => handleSetMainImage(img.url)}
                          className={`flex-1 py-1 flex items-center justify-center ${
                            isMain ? 'text-yellow-300' : 'text-white hover:text-yellow-200'
                          }`}
                        >
                          <Star size={12} className={isMain ? 'fill-current' : ''} />
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          onClick={() => handleRemoveImage(img.url)}
                          className="flex-1 py-1 flex items-center justify-center text-white hover:text-red-300"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-slate-500 text-center mb-6">
              Podés seleccionar varias a la vez. Tocá la estrella para elegir la imagen principal.
            </p>

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
