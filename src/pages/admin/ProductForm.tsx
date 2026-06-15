import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, setDoc, addDoc, collection, getDocs, query, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Product, FilamentLine, SupplyLine } from '../../types/product';
import type { Filament, Supply } from '../../types/inventory';
import type { Category } from '../../types/category';
import type { VariantGroup } from '../../types/variantGroup';
import { SearchableVariantGroupSelect } from '../../components/SearchableVariantGroupSelect';
import { SearchableCategorySelect } from '../../components/SearchableCategorySelect';
import { useAuth } from '../../context/AuthContext';

import type { PricingSettings3D, PricingSettingsResale, ExchangeRateData } from '../../types/settings';
import {
  calculate3DCost,
  calculate3DRetailPrice,
  calculate3DWholesalePrice,
  calculateResaleRetailPrice,
  calculateResaleWholesalePrice,
  roundPriceUp100
} from '../../services/pricingService';
import { ArrowLeft, Upload, Loader2, Calculator, Plus, Trash2, Star, Package, Palette, Check, Crop } from 'lucide-react';
import { getProductImages } from '../../utils/productImages';
import { NumericInput } from '../../components/NumericInput';
import { uploadImageToImgBB } from '../../services/imageUploadService';
import { WeightKgGramsInput } from '../../components/WeightKgGramsInput';
import { TimeHoursMinutesInput } from '../../components/TimeHoursMinutesInput';
import { formatWeightGrams } from '../../utils/weightGrams';

// Helper to get color preview styles for filaments
function getFilamentColorStyle(colorName: string): React.CSSProperties {
  const name = colorName.toLowerCase().trim();
  
  if (name.includes('arcoiris') || name.includes('rainbow') || name.includes('arcoris') || name.includes('multicolor')) {
    return { background: 'linear-gradient(135deg, #ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6)' };
  }
  if (name.includes('oro') || name.includes('dorado') || name.includes('gold')) {
    return { background: 'linear-gradient(135deg, #f5c453, #c58d20)' };
  }
  if (name.includes('plata') || name.includes('plateado') || name.includes('silver')) {
    return { background: 'linear-gradient(135deg, #e2e8f0, #94a3b8)' };
  }
  if (name.includes('cobre') || name.includes('copper')) {
    return { background: 'linear-gradient(135deg, #f97316, #b45309)' };
  }
  if (name.includes('bronce') || name.includes('bronze')) {
    return { background: 'linear-gradient(135deg, #ca8a04, #854d0e)' };
  }
  if (name.includes('transparente') || name.includes('clear')) {
    return { 
      background: 'repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 4px, #ffffff 4px, #ffffff 8px)',
      border: '1px solid #cbd5e1'
    };
  }

  const colorMap: Record<string, string> = {
    negro: '#1e293b',
    black: '#1e293b',
    blanco: '#f8fafc',
    white: '#f8fafc',
    rojo: '#ef4444',
    red: '#ef4444',
    azul: '#3b82f6',
    blue: '#3b82f6',
    verde: '#10b981',
    green: '#10b981',
    amarillo: '#f59e0b',
    yellow: '#f59e0b',
    gris: '#64748b',
    gray: '#64748b',
    naranja: '#f97316',
    orange: '#f97316',
    rosa: '#ec4899',
    pink: '#ec4899',
    violeta: '#8b5cf6',
    purpura: '#8b5cf6',
    purple: '#8b5cf6',
    fucsia: '#d946ef',
    celeste: '#60a5fa',
    turquesa: '#14b8a6',
    teal: '#14b8a6'
  };

  for (const [key, hex] of Object.entries(colorMap)) {
    if (name.includes(key)) {
      const border = hex === '#f8fafc' ? '1px solid #cbd5e1' : 'none';
      return { backgroundColor: hex, border };
    }
  }

  return { background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' };
}

const ChevronDownIcon = () => (
  <svg className="w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);


// Searchable Supply Select Component
const SearchableSupplySelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  supplies: Supply[];
  placeholder?: string;
}> = ({
  value,
  onChange,
  supplies,
  placeholder = 'Buscar insumo...'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const selectedSupply = supplies.find(s => s.id === value);
  const displayValue = selectedSupply ? selectedSupply.name : '';

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return supplies;
    return supplies.filter(s => 
      s.name.toLowerCase().includes(term) ||
      (s.category && s.category.toLowerCase().includes(term))
    );
  }, [supplies, search]);

  const handleFocus = () => {
    setIsOpen(true);
    setSearch('');
  };

  useEffect(() => {
    if (!isOpen) return;
    const clickOutside = () => setIsOpen(false);
    document.addEventListener('click', clickOutside);
    return () => document.removeEventListener('click', clickOutside);
  }, [isOpen]);

  return (
    <div className="relative w-full" onClick={e => e.stopPropagation()}>
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          value={isOpen ? search : displayValue}
          onChange={e => setSearch(e.target.value)}
          onFocus={handleFocus}
          className="w-full border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-ellipsis truncate transition-all duration-200"
        />
        <div className="absolute left-3 top-3 text-slate-400">
          <Package size={16} />
        </div>
        <div className="absolute right-2.5 top-3 text-slate-400 pointer-events-none">
          <ChevronDownIcon />
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-xl shadow-2xl z-50 py-1.5 text-xs ring-1 ring-black/5 scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="text-slate-400 py-6 text-center flex flex-col items-center gap-1">
              <Package size={20} className="opacity-40" />
              <span>No se encontraron insumos</span>
            </div>
          ) : (
            filtered.map(s => {
              const isSelected = s.id === value;
              
              const isLowStock = s.currentStock <= (s.minStock || 0);
              let stockBadgeClass = 'badge-green';
              if (s.currentStock === 0) {
                stockBadgeClass = 'badge-red';
              } else if (isLowStock) {
                stockBadgeClass = 'badge-yellow';
              }

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onChange(s.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 transition-colors flex items-center justify-between gap-2 border-b border-slate-50 last:border-0 ${
                    isSelected 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-slate-800 truncate">{s.name}</span>
                    <span className={`text-[10px] truncate ${isSelected ? 'text-blue-500 font-medium' : 'text-slate-400'}`}>
                      Categoría: {s.category || 'Sin categoría'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`badge ${stockBadgeClass} text-[9px] px-1.5 py-0.5`}>
                      Stock: {s.currentStock} {s.unitOfMeasure || 'u.'}
                    </span>
                    {isSelected && <Check size={14} className="text-blue-600" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

// Searchable Filament Select Component
const SearchableFilamentSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  filaments: Filament[];
  placeholder?: string;
}> = ({
  value,
  onChange,
  filaments,
  placeholder = 'Buscar filamento...'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const selectedFilament = filaments.find(f => f.id === value);
  const displayValue = selectedFilament 
    ? `${selectedFilament.brand} · ${selectedFilament.material} · ${selectedFilament.color}`
    : '';

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return filaments;
    return filaments.filter(f => 
      f.brand.toLowerCase().includes(term) ||
      f.material.toLowerCase().includes(term) ||
      f.color.toLowerCase().includes(term)
    );
  }, [filaments, search]);

  const handleFocus = () => {
    setIsOpen(true);
    setSearch('');
  };

  useEffect(() => {
    if (!isOpen) return;
    const clickOutside = () => setIsOpen(false);
    document.addEventListener('click', clickOutside);
    return () => document.removeEventListener('click', clickOutside);
  }, [isOpen]);

  return (
    <div className="relative w-full" onClick={e => e.stopPropagation()}>
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          value={isOpen ? search : displayValue}
          onChange={e => setSearch(e.target.value)}
          onFocus={handleFocus}
          className="w-full border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-ellipsis truncate transition-all duration-200"
        />
        <div className="absolute left-3 top-3 text-slate-400">
          <Palette size={16} />
        </div>
        <div className="absolute right-2.5 top-3 text-slate-400 pointer-events-none">
          <ChevronDownIcon />
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-xl shadow-2xl z-50 py-1.5 text-xs ring-1 ring-black/5 scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="text-slate-400 py-6 text-center flex flex-col items-center gap-1">
              <Palette size={20} className="opacity-40" />
              <span>No se encontraron filamentos</span>
            </div>
          ) : (
            filtered.map(f => {
              const isSelected = f.id === value;
              const colorStyle = getFilamentColorStyle(f.color);
              
              let stockBadgeClass = 'badge-green';
              if (f.availableWeightGrams < 50) {
                stockBadgeClass = 'badge-red';
              } else if (f.availableWeightGrams < 200) {
                stockBadgeClass = 'badge-yellow';
              }

              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onChange(f.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 transition-colors flex items-center justify-between gap-2 border-b border-slate-50 last:border-0 ${
                    isSelected 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div 
                      className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm border border-black/10" 
                      style={colorStyle}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-slate-800 truncate">{f.brand} · {f.color}</span>
                      <span className={`text-[10px] truncate ${isSelected ? 'text-blue-500 font-medium' : 'text-slate-400'}`}>
                        {f.material}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`badge ${stockBadgeClass} text-[9px] px-1.5 py-0.5`}>
                      {f.availableWeightGrams}g
                    </span>
                    {isSelected && <Check size={14} className="text-blue-600" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

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
  const [filaments, setFilaments] = useState<Filament[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [settings3d, setSettings3d] = useState<PricingSettings3D | null>(null);
  const [settingsResale, setSettingsResale] = useState<PricingSettingsResale | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(1000);
  const [variantGroups, setVariantGroups] = useState<VariantGroup[]>([]);

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
        // Fetch inventory and business settings
        const [invSnap, businessSnap] = await Promise.all([
          getDocs(query(collection(db, 'inventory'))),
          getDoc(doc(db, 'settings', 'business')),
        ]);

        if (businessSnap.exists()) {
          const bizData = businessSnap.data();
          if (bizData && bizData.categorySortMode) {
            setCategorySortMode(bizData.categorySortMode);
          }
        }
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

  // Automatically sync product weight with total filament weight when filaments are assigned
  useEffect(() => {
    if (formData.type === '3d' && (formData.filamentLines?.length ?? 0) > 0) {
      setFormData((prev: any) => {
        if (prev.weightGrams === totalFilamentGrams) return prev;
        return { ...prev, weightGrams: totalFilamentGrams };
      });
    }
  }, [totalFilamentGrams, formData.type, formData.filamentLines?.length]);

  useEffect(() => {
    if (formData.type === '3d') {
      if (!settings3d) return;
      const rateData = { currentUsdToArs: exchangeRate, lastUpdate: '', provider: '' };
      const cost = calculate3DCost(formData, settings3d, rateData, inventoryMap);
      const retail = calculate3DRetailPrice(formData, settings3d, rateData, inventoryMap);
      let wholesale = calculate3DWholesalePrice(formData, settings3d, rateData, inventoryMap);
      
      if (formData.useManualPrice && formData.manualRetailPrice) {
        const discountPercent = formData.isKeychain
          ? settings3d.wholesaleDiscountPercentKeychain
          : settings3d.wholesaleDiscountPercentNormal;
        wholesale = roundPriceUp100(formData.manualRetailPrice * (1 - discountPercent / 100));
      }
      
      setCalculated({ cost, retail, wholesale });
    } else if (formData.type === 'resale') {
      if (!settingsResale) return;
      const cost = formData.purchaseCost || 0;
      const retail = calculateResaleRetailPrice(cost, settingsResale);
      let wholesale = calculateResaleWholesalePrice(cost, settingsResale);
      
      if (formData.useManualPrice && formData.manualRetailPrice) {
        wholesale = roundPriceUp100(formData.manualRetailPrice * (1 - (settingsResale.wholesaleDiscountPercent || 0) / 100));
      }
      
      setCalculated({ cost, retail, wholesale });
    }
  }, [formData.weightGrams, formData.printTimeMinutes, formData.isKeychain, formData.purchaseCost, formData.type, formData.filamentLines, formData.supplyIds, formData.useManualPrice, formData.manualRetailPrice, settings3d, settingsResale, exchangeRate, inventoryMap]);

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
        productToSave.filamentLines = (productToSave.filamentLines ?? []).filter(
          (l: FilamentLine) => l.supplyId && l.grams > 0
        );
        productToSave.supplyIds = (productToSave.supplyIds ?? []).filter(
          (l: SupplyLine) => l.supplyId && l.quantity > 0
        );
        productToSave.filamentIds = productToSave.filamentLines.map((l: FilamentLine) => l.supplyId);
      }

      // Sanitize fields
      if (productToSave.variantGroup) {
        productToSave.variantGroup = productToSave.variantGroup.trim();
      } else {
        productToSave.variantGroup = '';
      }
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
                  <option value="resale">Artículos Varios</option>
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1">
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

             {formData.type === '3d' ? (
              <div className="grid grid-cols-2 gap-4">
                <WeightKgGramsInput
                  label="Peso del producto"
                  required
                  valueGrams={formData.weightGrams}
                  onChangeGrams={val => setFormData({ ...formData, weightGrams: val })}
                  disabled={(formData.filamentLines?.length ?? 0) > 0}
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
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
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
                        <SearchableFilamentSelect
                          value={line.supplyId}
                          onChange={(val) => {
                            const next = [...formData.filamentLines];
                            next[idx] = { ...next[idx], supplyId: val };
                            setFormData({ ...formData, filamentLines: next });
                          }}
                          filaments={filaments}
                        />
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
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
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
                        <SearchableSupplySelect
                          value={line.supplyId}
                          onChange={(val) => {
                            const next = [...formData.supplyIds];
                            next[idx] = { ...next[idx], supplyId: val };
                            setFormData({ ...formData, supplyIds: next });
                          }}
                          supplies={supplies}
                        />
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
