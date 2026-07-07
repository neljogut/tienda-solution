import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, setDoc, addDoc, collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Product } from '../../types/product';
import type { Category } from '../../types/category';
import type { VariantGroup } from '../../types/variantGroup';
import { SearchableVariantGroupSelect } from '../../components/SearchableVariantGroupSelect';
import { SearchableCategorySelect } from '../../components/SearchableCategorySelect';
import { useAuth } from '../../context/AuthContext';

import type { PricingSettingsResale } from '../../types/settings';
import {
  calculateResaleRetailPrice,
  calculateResaleWholesalePrice,
  roundPriceUp100
} from '../../services/pricingService';
import { ArrowLeft, Upload, Loader2, Calculator, Plus, Trash2, Star, Crop, Barcode, Wand2 } from 'lucide-react';
import { getProductImages } from '../../utils/productImages';
import { NumericInput } from '../../components/NumericInput';
import { uploadImageToImgBB } from '../../services/imageUploadService';

interface ImageEntry {
  url: string;
  file?: File;
}

export const ProductForm: React.FC = () => {
  const { userData } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const duplicateId = searchParams.get('duplicateId');
  const isNew = !id;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!!id || !!duplicateId);
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [mainImageUrl, setMainImageUrl] = useState<string>('');
  
  // Cropping State
  const [croppingUrl, setCroppingUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySortMode, setCategorySortMode] = useState<'manual' | 'alphabetical'>('manual');
  const [settingsResale, setSettingsResale] = useState<PricingSettingsResale | null>(null);
  const [variantGroups, setVariantGroups] = useState<VariantGroup[]>([]);

  const [formData, setFormData] = useState<any>({
    type: 'resale',
    name: '',
    categoryId: '',
    category: '',
    description: '',
    isActive: true,
    useManualPrice: false,
    manualRetailPrice: 0,
    profitMarginPercent: 30,
    purchaseCost: 0,
    stock: 0,
    barcode: '',
    priceTiers: [],
    variantGroup: '',
  });

  const [calculated, setCalculated] = useState({
    cost: 0,
    retail: 0,
    wholesale: 0,
  });

  const [isCustomTiers, setIsCustomTiers] = useState(false);

  const inheritedTiers = useMemo(() => {
    // 1. Try to inherit from variantGroup
    if (formData.variantGroup && variantGroups.length > 0) {
      const group = variantGroups.find(
        g => g.id === formData.variantGroup || g.name.toLowerCase() === formData.variantGroup?.trim().toLowerCase()
      );
      if (group && group.priceTiers && group.priceTiers.length > 0) {
        return {
          sourceType: 'group',
          sourceName: group.name,
          priceTiers: group.priceTiers
        };
      }
    }

    return null;
  }, [formData.variantGroup, variantGroups]);

  useEffect(() => {
    const q = query(collection(db, 'categories'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cats: Category[] = [];
      snapshot.forEach((d) => {
        cats.push({ id: d.id, ...d.data() } as Category);
      });
      setCategories(cats);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'variantGroups'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const groups: VariantGroup[] = [];
      snapshot.forEach((d) => {
        groups.push({ id: d.id, ...d.data() } as VariantGroup);
      });
      setVariantGroups(groups);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const businessSnap = await getDoc(doc(db, 'settings', 'business'));
        if (businessSnap.exists()) {
          const bizData = businessSnap.data();
          if (bizData && bizData.categorySortMode) {
            setCategorySortMode(bizData.categorySortMode);
          }
        }

        const sResaleSnap = await getDoc(doc(db, 'settings/pricingResale'));
        if (sResaleSnap.exists()) setSettingsResale(sResaleSnap.data() as PricingSettingsResale);
        
        const targetId = id || duplicateId;
        if (targetId) {
          const docSnap = await getDoc(doc(db, 'products', targetId));
          if (docSnap.exists()) {
            const data = docSnap.data() as Product;
            const normalized = { variantGroup: '', ...data } as any;
            if (duplicateId) {
              normalized.name = `${data.name} (Copia)`;
              normalized.stock = 0;
              delete normalized.id;
            }
            setFormData(normalized);
            setIsCustomTiers(!!data.priceTiers && data.priceTiers.length > 0);
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
  }, [id, duplicateId, isNew]);

  const resolveCategoryLabel = (catId: string) => {
    const path: string[] = [];
    let currentId: string | null | undefined = catId;
    while (currentId) {
      const cat = categories.find((c) => c.id === currentId);
      if (cat) {
        path.unshift(cat.name);
        currentId = cat.parentId;
      } else {
        currentId = undefined;
      }
    }
    return path.join(' › ');
  };

  useEffect(() => {
    if (!settingsResale) return;
    const cost = formData.purchaseCost || 0;
    const retail = calculateResaleRetailPrice(cost, settingsResale, formData.profitMarginPercent);
    let wholesale = calculateResaleWholesalePrice(cost, settingsResale, formData.profitMarginPercent);
    
    if (formData.useManualPrice && formData.manualRetailPrice) {
      wholesale = roundPriceUp100(formData.manualRetailPrice * 0.8);
    }
    
    setCalculated({ cost, retail, wholesale });
  }, [formData.purchaseCost, formData.useManualPrice, formData.manualRetailPrice, formData.profitMarginPercent, settingsResale]);

  const handleStartCrop = (url: string) => {
    setCroppingUrl(url);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offsetX, y: e.clientY - offsetY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    setOffsetX(e.clientX - dragStart.x);
    setOffsetY(e.clientY - dragStart.y);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    setIsDragging(true);
    setDragStart({ x: touch.clientX - offsetX, y: touch.clientY - offsetY });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    if (!touch) return;
    setOffsetX(touch.clientX - dragStart.x);
    setOffsetY(touch.clientY - dragStart.y);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleApplyCrop = () => {
    if (!croppingUrl) return;
    const highResCanvas = document.createElement('canvas');
    highResCanvas.width = 800;
    highResCanvas.height = 600;
    const ctx = highResCanvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = croppingUrl;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.clearRect(0, 0, 800, 600);

      const scale = 2.0;

      const canvasRatio = 800 / 600;
      const imgRatio = img.width / img.height;

      let drawWidth, drawHeight;
      if (imgRatio > canvasRatio) {
        drawHeight = 600;
        drawWidth = 600 * imgRatio;
      } else {
        drawWidth = 800;
        drawHeight = 800 / imgRatio;
      }

      const w = drawWidth * zoom;
      const h = drawHeight * zoom;

      const x = (800 - w) / 2 + (offsetX * scale);
      const y = (600 - h) / 2 + (offsetY * scale);

      ctx.drawImage(img, x, y, w, h);

      highResCanvas.toBlob((blob) => {
        if (!blob) return;

        const fileName = `cropped_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        const newUrl = URL.createObjectURL(file);

        setImages((prev) =>
          prev.map((entry) => {
            if (entry.url === croppingUrl) {
              if (entry.file) {
                URL.revokeObjectURL(entry.url);
              }
              return { url: newUrl, file };
            }
            return entry;
          })
        );

        if (mainImageUrl === croppingUrl) {
          setMainImageUrl(newUrl);
        }

        setCroppingUrl(null);
      }, 'image/jpeg', 0.92);
    };
  };

  useEffect(() => {
    if (!croppingUrl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = croppingUrl;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const canvasRatio = canvas.width / canvas.height;
      const imgRatio = img.width / img.height;

      let drawWidth, drawHeight;
      if (imgRatio > canvasRatio) {
        drawHeight = canvas.height;
        drawWidth = canvas.height * imgRatio;
      } else {
        drawWidth = canvas.width;
        drawHeight = canvas.width / imgRatio;
      }

      const w = drawWidth * zoom;
      const h = drawHeight * zoom;

      const x = (canvas.width - w) / 2 + offsetX;
      const y = (canvas.height - h) / 2 + offsetY;

      ctx.drawImage(img, x, y, w, h);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      
      ctx.beginPath();
      ctx.moveTo(canvas.width / 3, 0);
      ctx.lineTo(canvas.width / 3, canvas.height);
      ctx.moveTo((canvas.width * 2) / 3, 0);
      ctx.lineTo((canvas.width * 2) / 3, canvas.height);
      ctx.moveTo(0, canvas.height / 3);
      ctx.lineTo(canvas.width, canvas.height / 3);
      ctx.moveTo(0, (canvas.height * 2) / 3);
      ctx.lineTo(canvas.width, (canvas.height * 2) / 3);
      ctx.stroke();
      ctx.setLineDash([]);
    };
  }, [croppingUrl, zoom, offsetX, offsetY]);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate profit margin limit for each tier
      const cost = calculated.cost || 0;
      const minPriceLimit = cost * 1.10;
      const tiers = formData.priceTiers || [];
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const unitPrice = Number(tier.unitPrice) || 0;
        if (unitPrice < minPriceLimit - 0.01) {
          alert(`Error: El precio unitario del Tramo ${i + 1} ($${unitPrice}) es menor al costo de fabricación más el 10% de ganancia mínima ($${Math.ceil(minPriceLimit)}). Modifique el precio para cumplir con la ganancia mínima.`);
          setLoading(false);
          return;
        }
      }

      const resolvedUrls: string[] = [];
      for (const img of images) {
        if (img.file) {
          resolvedUrls.push(await uploadImageToImgBB(img.file));
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
        delete productToSave.purchaseCost;
      } else {
        delete productToSave.filamentLines;
        delete productToSave.supplyIds;
        delete productToSave.filamentIds;
        delete productToSave.weightGrams;
        delete productToSave.printTimeMinutes;
        delete productToSave.isKeychain;
      }

      // Sanitize fields
      if (productToSave.variantGroup) {
        productToSave.variantGroup = productToSave.variantGroup.trim();
      } else {
        productToSave.variantGroup = '';
      }
      if (productToSave.purchaseCost === '') productToSave.purchaseCost = 0;
      if (productToSave.stock === '') productToSave.stock = 0;
      if (productToSave.manualRetailPrice === '') productToSave.manualRetailPrice = 0;
      if (productToSave.profitMarginPercent === '') productToSave.profitMarginPercent = 30;

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
        await setDoc(doc(db, 'products', id), productToSave);
      }
      navigate('/admin/products');
    } catch (error) {
      console.error("Error al guardar:", error);
      alert(error instanceof Error ? error.message : "Hubo un error al guardar el producto.");
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
            
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
                <SearchableCategorySelect
                  required
                  categories={categories}
                  categorySortMode={categorySortMode}
                  value={formData.categoryId || ''}
                  onChange={catId => {
                    setFormData({
                      ...formData,
                      categoryId: catId,
                      category: resolveCategoryLabel(catId),
                    });
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                <input 
                  type="text" required
                  className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div className="sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Grupo de Tramos (opcional)</label>
                <SearchableVariantGroupSelect
                  variantGroups={variantGroups}
                  value={formData.variantGroup || ''}
                  onChange={val => setFormData({ ...formData, variantGroup: val })}
                  canManage={userData?.role === 'owner'}
                />
              </div>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Costo de Compra ($)</label>
                <NumericInput 
                  allowDecimals
                  required
                  className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                  value={formData.purchaseCost} 
                  onChange={val => setFormData({...formData, purchaseCost: val})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stock Disponible</label>
                <NumericInput 
                  required
                  className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                  value={formData.stock} 
                  onChange={val => setFormData({...formData, stock: val})}
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1.5">
                <Barcode size={16} className="text-slate-500"/>
                Código de Barras / SKU (Opcional)
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="text"
                  placeholder="Ej: 7791234567890"
                  className="flex-1 border border-slate-300 rounded-lg p-2"
                  value={formData.barcode || ''}
                  onChange={e => setFormData({...formData, barcode: e.target.value})}
                />
                <button
                  type="button"
                  title="Generar código automático"
                  onClick={() => {
                    const uniqueCode = '200' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
                    setFormData({...formData, barcode: uniqueCode});
                  }}
                  className="p-2 border border-slate-300 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1"
                >
                  <Wand2 size={18} />
                </button>
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
              
              {!formData.useManualPrice && (
                <div className="mb-3 animate-fadeIn">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Margen de Ganancia (%)</label>
                  <NumericInput 
                    className="w-full border border-blue-300 bg-blue-50/50 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 font-semibold text-sm"
                    value={formData.profitMarginPercent ?? 30} 
                    onChange={val => setFormData({...formData, profitMarginPercent: val === '' ? 0 : Number(val)})}
                  />
                  <p className="text-xs text-slate-500 mt-1">El precio minorista se calculará aplicando este margen sobre el costo de compra.</p>
                </div>
              )}

              {formData.useManualPrice && (
                <div className="animate-fadeIn">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Precio Manual Minorista ($)</label>
                  <NumericInput 
                    required={formData.useManualPrice}
                    className="w-full border border-amber-300 bg-amber-50 rounded-lg p-2 focus:ring-2 focus:ring-amber-500 text-sm font-semibold"
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
                {isCustomTiers && (
                  <button
                    type="button"
                    onClick={() => {
                      const tiers = formData.priceTiers || [];
                      const lastTier = tiers[tiers.length - 1];
                      const nextMin = lastTier ? lastTier.maxQty + 1 : 2;
                      
                      const basePrice = formData.useManualPrice ? (formData.manualRetailPrice || 0) : calculated.retail;
                      const discountPercent = (tiers.length + 1) * 5;
                      const rawSuggested = basePrice * (1 - discountPercent / 100);
                      const minPriceLimit = (calculated.cost || 0) * 1.10;
                      const suggestedPrice = Math.max(rawSuggested, minPriceLimit);
                      const unitPrice = roundPriceUp100(suggestedPrice);

                      setFormData({
                        ...formData,
                        priceTiers: [...tiers, { minQty: nextMin, maxQty: nextMin + 9, unitPrice }]
                      });
                    }}
                    className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1"
                  >
                    <Plus size={14} /> Agregar Tramo
                  </button>
                )}
              </h3>
              
              {!isCustomTiers ? (
                // Inherited view
                <div className="space-y-3">
                  {inheritedTiers ? (
                    <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                        <span className="text-xs font-bold text-emerald-800">
                          {inheritedTiers.sourceType === 'group' ? (
                            <>Heredando tramos del grupo: <span className="underline">{inheritedTiers.sourceName}</span></>
                          ) : (
                            <>Heredando tramos de la categoría: <span className="underline">{inheritedTiers.sourceName}</span></>
                          )}
                        </span>
                        {inheritedTiers.sourceType === 'group' ? (
                          <span className="text-[10px] text-slate-400 font-semibold italic">
                            Administrado en el Grupo de Tramos
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomTiers(true);
                              // Initialize with copy of inherited tiers
                              setFormData({
                                ...formData,
                                priceTiers: inheritedTiers.priceTiers.map((t: any) => ({ ...t }))
                              });
                            }}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline text-left"
                          >
                            Personalizar tramos para este producto
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {inheritedTiers.priceTiers.map((tier: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center bg-white px-3 py-2 rounded-lg border border-emerald-100 text-xs font-semibold text-slate-700">
                            <span>De {tier.minQty} a {tier.maxQty} unidades:</span>
                            <span className="text-emerald-600">${tier.unitPrice.toLocaleString('es-AR')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-2">
                      <p className="text-xs text-slate-500">
                        Este producto no tiene tramos de precios personalizados y no hereda de ningún grupo o categoría. Se venderá siempre al precio minorista base.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomTiers(true);
                          setFormData({ ...formData, priceTiers: [] });
                        }}
                        className="btn-secondary text-xs !py-1.5 !px-3 font-bold"
                      >
                        Configurar tramos personalizados
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                // Editable custom view
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-amber-50 border border-amber-100 text-amber-800 p-3 rounded-xl text-xs">
                    <span className="font-bold">
                      Configuración personalizada activa (sobrescribe los tramos heredados).
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('¿Estás seguro de que deseas restablecer los tramos? Se perderán los tramos personalizados de este producto y volverá a heredar de la categoría/grupo.')) {
                          setIsCustomTiers(false);
                          setFormData({ ...formData, priceTiers: [] });
                        }
                      }}
                      className="font-bold text-blue-600 hover:underline text-left"
                    >
                      Restablecer y usar tramos de categoría
                    </button>
                  </div>
                  
                  {(!formData.priceTiers || formData.priceTiers.length === 0) && (
                    <p className="text-sm text-slate-400 text-center py-4">
                      No hay tramos personalizados agregados. Hacía clic en "Agregar tramo" para definir precios por volumen.
                    </p>
                  )}
                  
                  {formData.priceTiers?.map((tier: any, index: number) => (
                    <div key={index} className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
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
              )}
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
                <>
                  <span className="absolute top-2 left-2 badge badge-blue text-[10px] flex items-center gap-1">
                    <Star size={10} className="fill-current" /> Principal
                  </span>
                  <button
                    type="button"
                    onClick={() => handleStartCrop(mainImageUrl)}
                    className="absolute bottom-2 right-2 btn-secondary !py-1 !px-2 text-xs flex items-center gap-1 shadow-md z-10 animate-fadeIn"
                  >
                    <Crop size={12} /> Adaptar
                  </button>
                </>
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
                          title="Recortar / Adaptar"
                          onClick={() => handleStartCrop(img.url)}
                          className="flex-1 py-1 flex items-center justify-center text-white hover:text-blue-300 border-x border-white/10"
                        >
                          <Crop size={12} />
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

      {/* Manual Cropping Modal */}
      {croppingUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-lg text-slate-800">Recortar / Adaptar Imagen</h3>
              <button
                type="button"
                onClick={() => setCroppingUrl(null)}
                className="text-slate-400 hover:text-slate-600 font-semibold"
              >
                Cerrar
              </button>
            </div>

            <div className="flex flex-col items-center">
              <p className="text-xs text-slate-500 mb-3 text-center">
                Arrastrá la imagen en el recuadro para moverla, y usá el control de zoom para adaptarla al tamaño de catálogo (4:3).
              </p>
              
              <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-900 shadow-inner">
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={300}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  className="cursor-move max-w-full block"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-500 font-medium">
                  <span>Zoom / Escala</span>
                  <span>{zoom.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="4.0"
                  step="0.02"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setOffsetX(0);
                    setOffsetY(0);
                  }}
                  className="btn-secondary !py-2 !px-4 text-sm"
                >
                  Restablecer
                </button>
                <button
                  type="button"
                  onClick={handleApplyCrop}
                  className="btn-primary !py-2 !px-4 text-sm"
                >
                  Aplicar Recorte
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
