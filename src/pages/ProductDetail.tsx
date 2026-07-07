import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { Product } from '../types/product';
import type { Category } from '../types/category';
import type { VariantGroup } from '../types/variantGroup';
import { resolveInheritedPriceTiers } from '../services/pricingService';
import { useCartStore } from '../store/cartStore';
import { useAuth } from '../context/AuthContext';
import { usePricingData } from '../hooks/usePricingData';
import { getProductImages } from '../utils/productImages';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { ArrowLeft, Loader2, ShoppingCart, Box, Share2, Copy, Check as CheckIcon, ChevronRight, ChevronLeft, Info, Plus, ArrowRight } from 'lucide-react';

interface ProductDetailProps {
  productId?: string;
  onClose?: () => void;
  isModal?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  productsList?: any[];
  onSelectProduct?: (productId: string) => void;
}

export const ProductDetail: React.FC<ProductDetailProps> = ({ 
  productId, 
  onClose, 
  isModal = false, 
  onPrev, 
  onNext,
  productsList,
  onSelectProduct
}) => {
  const { id: paramId } = useParams<{ id: string }>();
  const id = productId || paramId;
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const productUrl = `${window.location.origin}/catalog/${id}`;

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(productUrl);
      setCopiedLink(true);
      setTimeout(() => {
        setCopiedLink(false);
        setShowShareMenu(false);
      }, 1500);
    } catch {
      setShowShareMenu(false);
    }
  };

  const handleShareWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product) return;
    const text = encodeURIComponent(`Mirá este producto: ${product.name}\n${productUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
    setShowShareMenu(false);
  };

  const handleShareNative = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product) return;
    navigator.share({ title: product.name, url: productUrl }).catch(() => {});
    setShowShareMenu(false);
  };

  const handleImageLoad = (url: string) => {
    setLoadedImages((prev) => ({ ...prev, [url]: true }));
  };
  
  const { items, addItem, openDrawer } = useCartStore();
  const cartItem = items.find(item => item.productId === product?.id);
  const cartQty = cartItem ? cartItem.quantity : 0;
  const { userData, hasPermission } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const activeThumbRef = useRef<HTMLButtonElement | null>(null);
  const visualSettings = useBusinessSettings();
  const outOfStockSaturate = visualSettings.outOfStockSaturate ?? 20;

  useEffect(() => {
    if (activeThumbRef.current) {
      activeThumbRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [product?.id]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [variantGroups, setVariantGroups] = useState<VariantGroup[]>([]);

  const isAdminView = userData?.role === 'owner' || hasPermission('viewManualPrices');
  const isOwner = userData?.role === 'owner';
  const { getRetailPrice, settingsResale } = usePricingData();

  // Load categories for breadcrumb
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'categories'), (snap) => {
      const cats: Category[] = [];
      snap.forEach(d => cats.push({ id: d.id, ...d.data() } as Category));
      setCategories(cats);
    });
    return unsub;
  }, []);

  // Load variant groups for inherited price tiers
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'variantGroups'), (snap) => {
      const groups: VariantGroup[] = [];
      snap.forEach(d => groups.push({ id: d.id, ...d.data() } as VariantGroup));
      setVariantGroups(groups);
    });
    return unsub;
  }, []);

  const displayCategory = useMemo(() => {
    if (!product?.category) return '';
    const normalized = product.category.replace(/\s*[›-]\s*/g, ' - ');
    const parts = normalized.split(' - ').map(s => s.trim());
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
    }
    return parts[parts.length - 1] || product.category;
  }, [product?.category]);

  const discountGroupName = useMemo(() => {
    if (product?.variantGroup && product.variantGroup.trim()) {
      const groupObj = variantGroups.find(g => g && (g.id.toLowerCase() === product.variantGroup!.trim().toLowerCase() || g.name.toLowerCase() === product.variantGroup!.trim().toLowerCase()));
      const rawName = groupObj ? groupObj.name : product.variantGroup.trim();
      const segments = rawName.split(' - ').map(s => s.trim());
      if (segments.length >= 2) {
        return `${segments[segments.length - 2]} ${segments[segments.length - 1]}`;
      }
      return rawName;
    }
    return displayCategory;
  }, [product, displayCategory, variantGroups]);

  const price = product ? getRetailPrice(product) : 0;
  const isOutOfStock = product ? (product.stock !== undefined && product.stock <= 0) : false;

  const resolvedPriceTiers = useMemo(() => {
    if (!product) return undefined;
    return resolveInheritedPriceTiers(product.priceTiers, product.categoryId, categories, product.variantGroup, variantGroups);
  }, [product, categories, variantGroups]);

  // Resolve price based on current quantity using resolvedPriceTiers
  const effectivePrice = useMemo(() => {
    if (!product) return 0;
    if (resolvedPriceTiers && resolvedPriceTiers.length > 0) {
      const sorted = [...resolvedPriceTiers].sort((a, b) => b.minQty - a.minQty);
      const tier = sorted.find(t => quantity >= t.minQty);
      if (tier) return tier.unitPrice;
    }
    return price;
  }, [product, quantity, price, resolvedPriceTiers]);

  const activeTier = useMemo(() => {
    if (!resolvedPriceTiers?.length) return null;
    const sorted = [...resolvedPriceTiers].sort((a, b) => b.minQty - a.minQty);
    return sorted.find(t => quantity >= t.minQty) || null;
  }, [resolvedPriceTiers, quantity]);

  // Build breadcrumb from categoryId
  const categoryBreadcrumb = useMemo(() => {
    if (!product?.categoryId || categories.length === 0) return [];
    const crumbs: Category[] = [];
    let current = categories.find(c => c.id === product.categoryId);
    while (current) {
      crumbs.unshift(current);
      const parentId = current.parentId;
      current = parentId ? categories.find(c => c.id === parentId) : undefined;
    }
    return crumbs;
  }, [product, categories]);

  const wholesalePrice = React.useMemo(() => {
    if (!product) return 0;
    if (product.priceTiers && product.priceTiers.length > 0) {
      return Math.min(...product.priceTiers.map(t => t.unitPrice));
    }
    return product.calculatedWholesalePrice || Math.ceil(price * 0.8);
  }, [product, price]);

  const { rawRetailProfit, rawWholesaleProfit, netRetailProfit, netWholesaleProfit, effectiveCommPercent } = React.useMemo(() => {
    const commPercent = settingsResale?.employeeCommissionPercent ?? 10;
    const effComm = commPercent;
    const cost = product?.calculatedCost || 0;
    const rawRetail = price - cost;
    const rawWholesale = wholesalePrice - cost;
    return {
      rawRetailProfit: rawRetail,
      rawWholesaleProfit: rawWholesale,
      netRetailProfit: rawRetail * (1 - effComm / 100),
      netWholesaleProfit: rawWholesale * (1 - effComm / 100),
      effectiveCommPercent: effComm
    };
  }, [product, price, wholesalePrice, settingsResale]);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, 'products', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as Product;
          setProduct(data);
          setSelectedImage(data.mainImage);
          setLoadedImages({});
          setQuantity(1); // Reset quantity when product changes
        } else {
          console.error("No such product!");
        }
      } catch (error) {
        console.error("Error fetching product:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id]);

  // Keyboard navigation
  useEffect(() => {
    if (!isModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && onPrev) {
        onPrev();
      } else if (e.key === 'ArrowRight' && onNext) {
        onNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModal, onPrev, onNext]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 size={40} className="animate-spin text-blue-500 mb-4" />
        <p className="text-slate-500">Cargando detalles...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-slate-800">Producto no encontrado</h2>
        <button onClick={() => navigate('/catalog')} className="mt-4 text-blue-600 hover:underline">Volver al catálogo</button>
      </div>
    );
  }

  const handleOnlyAddToCart = () => {
    if (isOutOfStock) return;
    // Extra safety: ensure selected quantity doesn't exceed available stock
    const stock = product.stock !== undefined ? product.stock : 999;
    const safeQty = Math.min(quantity, stock);
    if (safeQty <= 0) return;
    addItem({
      productId: product.id,
      name: product.name,
      type: product.type,
      price: effectivePrice,
      basePrice: price,
      priceTiers: resolvedPriceTiers,
      weightGrams: (product as any).weightGrams,
      categoryId: product.categoryId,
      category: product.category,
      isKeychain: (product as any).isKeychain,
      imageUrl: product.mainImage,
      quantity: safeQty,
      maxStock: stock,
      variantGroup: product.variantGroup
    });
  };

  const handleGoToCart = () => {
    if (onClose) {
      onClose();
    }
    openDrawer();
  };
  
  const allImages = getProductImages(product);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => onClose ? onClose() : navigate(-1)}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft size={20} />
            <span>Volver</span>
          </button>
        </div>

        {/* Share button */}
        <div className="relative">
          <button
            onClick={() => setShowShareMenu(!showShareMenu)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors text-sm font-semibold"
            title="Compartir producto"
          >
            <Share2 size={16} />
            <span className="hidden sm:inline">Compartir</span>
          </button>

          {showShareMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowShareMenu(false)} 
              />
              <div className="absolute top-full right-0 mt-2 z-50 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 flex flex-col gap-1 min-w-[170px] animate-fadeIn">
                {/* WhatsApp */}
                <button
                  onClick={handleShareWhatsApp}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-green-50 text-slate-700 hover:text-green-700 transition-colors text-sm font-medium w-full text-left"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="#25D366" className="flex-shrink-0">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </button>

                {/* Copy link */}
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-blue-50 text-slate-700 hover:text-blue-700 transition-colors text-sm font-medium w-full text-left"
                >
                  {copiedLink ? <CheckIcon size={16} className="text-green-500 flex-shrink-0" /> : <Copy size={16} className="flex-shrink-0" />}
                  <span className="truncate">{copiedLink ? '¡Copiado!' : 'Copiar link'}</span>
                </button>

                {/* Native share */}
                {typeof navigator.share === 'function' && (
                  <button
                    onClick={handleShareNative}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-700 transition-colors text-sm font-medium w-full text-left"
                  >
                    <Share2 size={16} className="flex-shrink-0" />
                    <span className="truncate">Más opciones</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Galería de Imágenes */}
        <div className="space-y-4">
          <div className="aspect-square bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 relative">
            {selectedImage ? (
              <>
                {/* Pulsing Skeleton Background while loading */}
                {!loadedImages[selectedImage] && (
                  <div className="absolute inset-0 bg-slate-200 animate-pulse flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                  </div>
                )}
                {allImages.map((imgUrl, idx) => (
                  <img
                    key={imgUrl}
                    src={imgUrl}
                    alt={`${product.name} - ${idx}`}
                    onLoad={() => handleImageLoad(imgUrl)}
                    ref={(el) => {
                      if (el && el.complete && !loadedImages[imgUrl]) {
                        setTimeout(() => {
                          setLoadedImages((prev) => {
                            if (prev[imgUrl]) return prev;
                            return { ...prev, [imgUrl]: true };
                          });
                        }, 0);
                      }
                    }}
                    className={`absolute inset-0 w-full h-full object-contain transition-all duration-700 ease-in-out ${
                      selectedImage === imgUrl && loadedImages[imgUrl] ? 'opacity-100 z-10' : 'opacity-0 z-0'
                    }`}
                    referrerPolicy="no-referrer"
                  />
                ))}
                {isModal && onPrev && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onPrev(); }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-slate-900 flex items-center justify-center shadow-lg active:scale-95 transition-all border border-slate-200/50"
                    title="Producto anterior"
                  >
                    <ChevronLeft size={22} className="stroke-[2.5]" />
                  </button>
                )}
                {isModal && onNext && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onNext(); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-slate-900 flex items-center justify-center shadow-lg active:scale-95 transition-all border border-slate-200/50"
                    title="Siguiente producto"
                  >
                    <ChevronRight size={22} className="stroke-[2.5]" />
                  </button>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">Sin Imagen</div>
            )}
          </div>
          
          {allImages.length > 1 && (
            <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
              {allImages.map((img, idx) => (
                <button 
                  key={idx}
                  onClick={() => setSelectedImage(img)}
                  className={`w-20 h-20 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-colors ${selectedImage === img ? 'border-blue-500' : 'border-transparent hover:border-slate-300'}`}
                >
                  <img src={img} alt={`Thumb ${idx}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Carrusel de otros productos de catálogo (solo imágenes) */}
          {isModal && productsList && productsList.length > 1 && (
            <div className="pt-4 space-y-2 border-t border-slate-100/80">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-0.5">Explorar Catálogo</p>
              <div className="flex gap-2 overflow-x-auto pb-1 scroll-smooth no-scrollbar select-none">
                {productsList.map((p) => {
                  const isActive = p.id === product.id;
                  const isProdOutOfStock = p.stock !== undefined && p.stock <= 0;
                  return (
                    <button
                      key={p.id}
                      ref={isActive ? activeThumbRef : null}
                      onClick={() => onSelectProduct && onSelectProduct(p.id)}
                      className={`w-11 h-11 rounded-xl border-2 transition-all flex-shrink-0 overflow-hidden bg-white flex items-center justify-center ${
                        isActive 
                          ? 'border-blue-600 bg-blue-50/10 shadow-xs scale-105' 
                          : 'border-slate-200 hover:border-slate-300'
                      } ${isProdOutOfStock ? 'opacity-50' : ''}`}
                      style={isProdOutOfStock ? { filter: `saturate(${outOfStockSaturate}%)` } : undefined}
                      title={p.name}
                    >
                      <img src={p.mainImage} alt={p.name} className="w-full h-full object-contain p-0.5" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Detalles del Producto */}
        <div className="flex flex-col">
          {/* Clickable breadcrumb category */}
          <div className="mb-2 flex items-center flex-wrap gap-1">
            {categoryBreadcrumb.length > 0 ? (
              categoryBreadcrumb.map((cat, idx) => (
                <React.Fragment key={cat.id}>
                  <button
                    onClick={() => {
                      navigate(`/catalog/category/${cat.id}`);
                      if (onClose) onClose();
                    }}
                    className="text-xs font-bold tracking-wider text-blue-600 uppercase hover:text-blue-800 hover:underline transition-colors"
                  >
                    {cat.name}
                  </button>
                  {idx < categoryBreadcrumb.length - 1 && (
                    <ChevronRight size={12} className="text-slate-400 flex-shrink-0" />
                  )}
                </React.Fragment>
              ))
            ) : (
              <span className="text-xs font-bold tracking-wider text-blue-600 uppercase bg-blue-50 px-2 py-1 rounded-md">
                {product.category}
              </span>
            )}
            {isAdminView && product.useManualPrice && (
              <span className="ml-1 text-xs font-bold tracking-wider text-amber-600 uppercase bg-amber-50 px-2 py-1 rounded-md">
                Precio Manual
              </span>
            )}
          </div>
          
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-2">{product.name}</h1>
          
          {/* Stock Display Badge */}
          <div className="flex items-center gap-3 mb-6">
            {isOutOfStock ? (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black bg-rose-50 text-rose-700 border border-rose-100 uppercase tracking-wide">
                <Box size={14} className="stroke-[3]" />
                Sin Stock
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wide">
                <Box size={14} className="stroke-[3]" />
                {product.stock} unidades disponibles
              </span>
            )}
          </div>
          
          {product.description && product.description.trim() && (
            <div className="prose prose-slate max-w-none mb-8">
              <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{product.description}</p>
            </div>
          )}

          <div className="mt-auto pt-6 border-t border-slate-200 space-y-5">
            {/* Tramos como Packs / Selector */}
            {resolvedPriceTiers && resolvedPriceTiers.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3 bg-blue-50/50 border border-blue-100/70 rounded-2xl p-4 text-blue-800 text-xs leading-relaxed mb-2 shadow-xs animate-fadeIn">
                  <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">¡Combiná y ahorrá!</span> Llevando distintos colores o artículos de <span className="font-bold text-blue-900">{discountGroupName || product.category}</span> en tu pedido, sumás unidades para alcanzar estos descuentos.
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Opciones de Compra</p>
                </div>
                
                {/* Opción base: 1 Unidad */}
                <div 
                  onClick={() => !isOutOfStock && setQuantity(1)}
                  className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col gap-3 ${
                    quantity < (resolvedPriceTiers.sort((a,b) => a.minQty - b.minQty)[0]?.minQty || 2) && !isOutOfStock
                      ? 'bg-blue-50/40 border-blue-600 shadow-sm'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  } ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        quantity < (resolvedPriceTiers.sort((a,b) => a.minQty - b.minQty)[0]?.minQty || 2) ? 'border-blue-600' : 'border-slate-300'
                      }`}>
                        {quantity < (resolvedPriceTiers.sort((a,b) => a.minQty - b.minQty)[0]?.minQty || 2) && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-sm">
                          Llevá {quantity < (resolvedPriceTiers.sort((a,b) => a.minQty - b.minQty)[0]?.minQty || 2) ? quantity : 1} unidad{quantity < (resolvedPriceTiers.sort((a,b) => a.minQty - b.minQty)[0]?.minQty || 2) && quantity > 1 ? 'es' : ''}
                        </p>
                        <p className="text-slate-400 text-xs mt-0.5">Precio unitario estándar</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-extrabold text-slate-900 text-base">
                        ${(price * (quantity < (resolvedPriceTiers.sort((a,b) => a.minQty - b.minQty)[0]?.minQty || 2) ? quantity : 1)).toLocaleString('es-AR')}
                      </p>
                    </div>
                  </div>
                  
                  {/* Selector de cantidad si está seleccionado */}
                  {quantity < (resolvedPriceTiers.sort((a,b) => a.minQty - b.minQty)[0]?.minQty || 2) && (
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-1" onClick={e => e.stopPropagation()}>
                      <span className="text-xs text-slate-500 font-semibold">Ajustar cantidad:</span>
                      <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                        <button
                          type="button"
                          onClick={() => setQuantity(q => Math.max(1, q - 1))}
                          className="px-2.5 py-1 hover:bg-slate-50 font-bold transition-colors text-slate-500 disabled:opacity-30 text-xs"
                          disabled={quantity <= 1}
                        >
                          -
                        </button>
                        <span className="px-3 py-1 text-xs font-bold min-w-[30px] text-center text-slate-800">{quantity}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const firstTierMin = resolvedPriceTiers.sort((a,b) => a.minQty - b.minQty)[0]?.minQty || 2;
                            const maxLimit = Math.min(firstTierMin - 1, product.stock !== undefined ? product.stock : 999);
                            setQuantity(q => Math.min(maxLimit, q + 1));
                          }}
                          className="px-2.5 py-1 hover:bg-slate-50 font-bold transition-colors text-slate-500 disabled:opacity-30 text-xs"
                          disabled={
                            isOutOfStock || 
                            quantity >= Math.min(
                              (resolvedPriceTiers.sort((a,b) => a.minQty - b.minQty)[0]?.minQty || 2) - 1,
                              product.stock !== undefined ? product.stock : 999
                            )
                          }
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Opciones de los Tramos */}
                {[...resolvedPriceTiers].sort((a, b) => a.minQty - b.minQty).map((tier, idx) => {
                  const sortedTiers = [...resolvedPriceTiers].sort((a, b) => b.minQty - a.minQty);
                  const activeT = sortedTiers.find(t => quantity >= t.minQty);
                  const isThisTierActive = activeT?.minQty === tier.minQty;
                  
                  const isPackUnavailable = product.stock !== undefined && product.stock < tier.minQty;
                  
                  const activeQty = isThisTierActive ? quantity : tier.minQty;
                  const totalPrice = tier.unitPrice * activeQty;
                  const originalTotal = price * activeQty;
                  const discountPct = Math.round(((price - tier.unitPrice) / price) * 100);
                  
                  return (
                    <div
                      key={idx}
                      onClick={() => !isOutOfStock && !isPackUnavailable && setQuantity(tier.minQty)}
                      className={`relative p-4 rounded-2xl border-2 transition-all flex flex-col gap-3 ${
                        isPackUnavailable
                          ? 'bg-slate-50 border-slate-200 opacity-40 cursor-not-allowed pointer-events-none'
                          : isThisTierActive && quantity > 1 && !isOutOfStock
                            ? 'bg-blue-50/40 border-blue-600 shadow-sm cursor-pointer'
                            : 'bg-white border-slate-200 hover:border-slate-300 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            isPackUnavailable ? 'border-slate-200 bg-slate-100' : isThisTierActive && quantity > 1 ? 'border-blue-600' : 'border-slate-300'
                          }`}>
                            {isThisTierActive && quantity > 1 && !isPackUnavailable && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 text-sm">
                              Pack x{activeQty} unidades
                            </p>
                            {isPackUnavailable ? (
                              <p className="text-red-500 font-bold text-xs mt-0.5">
                                Stock insuficiente (máx. {product.stock})
                              </p>
                            ) : discountPct > 0 ? (
                              <p className="text-emerald-600 font-bold text-xs mt-0.5">
                                Ahorrás {discountPct}%
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-right">
                          {discountPct > 0 && !isPackUnavailable && (
                            <p className="text-[10px] text-slate-400 line-through">
                              ${originalTotal.toLocaleString('es-AR')}
                            </p>
                          )}
                          <p className="font-extrabold text-slate-900 text-base">
                            ${totalPrice.toLocaleString('es-AR')}
                          </p>
                        </div>
                      </div>

                      {/* Si está activo, mostramos el selector de cantidad adentro para refinar */}
                      {isThisTierActive && quantity > 1 && !isPackUnavailable && (
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-1" onClick={e => e.stopPropagation()}>
                          <span className="text-xs text-slate-500 font-semibold">Ajustar cantidad del pack:</span>
                          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                            <button
                              type="button"
                              onClick={() => setQuantity(q => Math.max(tier.minQty, q - 1))}
                              className="px-2.5 py-1 hover:bg-slate-50 font-bold transition-colors text-slate-500 disabled:opacity-30 text-xs"
                              disabled={quantity <= tier.minQty}
                            >
                              -
                            </button>
                            <span className="px-3 py-1 text-xs font-bold min-w-[30px] text-center text-slate-800">{quantity}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const nextTier = [...resolvedPriceTiers].sort((a,b) => a.minQty - b.minQty).find(t => t.minQty > tier.minQty);
                                const maxAllowed = nextTier ? nextTier.minQty - 1 : (product.stock !== undefined ? product.stock : 999);
                                setQuantity(q => Math.min(maxAllowed, q + 1));
                              }}
                              className="px-2.5 py-1 hover:bg-slate-50 font-bold transition-colors text-slate-500 disabled:opacity-30 text-xs"
                              disabled={isOutOfStock || quantity >= (product.stock ?? 999)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              // Selector normal si no hay tramos
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-700">Cantidad:</span>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
                  <button 
                    type="button"
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="px-3 py-1.5 hover:bg-slate-100 font-bold transition-colors text-slate-500 disabled:opacity-30"
                    disabled={isOutOfStock}
                  >
                    -
                  </button>
                  <span className="px-4 py-1.5 text-sm font-bold min-w-[40px] text-center text-slate-800">{quantity}</span>
                  <button 
                    type="button"
                    onClick={() => setQuantity(q => Math.min(product.stock !== undefined ? product.stock : 999, q + 1))}
                    className="px-3 py-1.5 hover:bg-slate-100 font-bold transition-colors text-slate-500 disabled:opacity-30"
                    disabled={isOutOfStock || quantity >= (product.stock ?? 999)}
                  >
                    +
                  </button>
                </div>
                {product.stock !== undefined && (
                  <span className="text-xs text-slate-500">({product.stock} disponibles)</span>
                )}
              </div>
            )}
            {/* Espaciador para evitar solapamiento con el footer pegajoso */}
            <div className="h-16" />
          </div>

          {/* Sticky Bottom Actions Bar */}
          <div className={
            isModal 
              ? "sticky bottom-0 bg-white border-t border-slate-100/80 z-30 -mx-6 px-6 -mb-6 pb-6 md:-mx-8 md:px-8 md:-mb-8 md:pb-8 pt-4 mt-3 flex flex-row gap-2 w-full" 
              : "pt-6 border-t border-slate-200 mt-6 flex flex-row gap-2 w-full max-w-md mx-auto"
          }>
            {/* Botón 1: Agregar al pedido */}
            <button 
              type="button"
              onClick={handleOnlyAddToCart}
              disabled={isOutOfStock}
              className={`relative flex-1 py-4 px-4 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 text-white shadow-lg active:scale-[0.98] transition-all duration-200 disabled:cursor-not-allowed ${
                isOutOfStock 
                  ? 'bg-slate-200 text-slate-400 shadow-none' 
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
              }`}
            >
              {/* Badge contador */}
              {cartQty > 0 && !isOutOfStock && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-black min-w-[20px] h-[20px] rounded-full flex items-center justify-center shadow-md z-10">
                  {cartQty}
                </span>
              )}
              {/* Ícono compuesto: + y carrito */}
              <div className="flex items-center gap-1">
                <Plus size={15} className="stroke-[3]" />
                <ShoppingCart size={19} className="stroke-[2.5]" />
              </div>
              <span className="text-xs font-semibold tracking-wide leading-tight text-center">
                {isOutOfStock ? 'Sin stock' : 'Agregar al pedido'}
              </span>
            </button>

            {/* Botón 2: Ir al pedido */}
            <button
              type="button"
              onClick={handleGoToCart}
              className={`relative flex-1 py-4 px-4 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 border-2 active:scale-[0.98] transition-all duration-150 ${
                items.length > 0
                  ? 'border-blue-600 text-blue-700 hover:bg-blue-50 cursor-pointer'
                  : 'border-slate-200 text-slate-300 cursor-not-allowed'
              }`}
              disabled={items.length === 0}
            >
              {/* Ícono compuesto: flecha + carrito */}
              <div className="flex items-center gap-1">
                <ShoppingCart size={19} className="stroke-[2.5]" />
                <ArrowRight size={15} className="stroke-[3]" />
              </div>
              <span className="text-xs font-semibold tracking-wide leading-tight text-center">
                {items.length > 0
                  ? `Ir al pedido · ${items.reduce((sum, i) => sum + i.quantity, 0)} u.`
                  : 'Ir al pedido'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SpecItem = ({ icon: Icon, label, value }: any) => (
  <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
    <div className="p-2 bg-white rounded-lg shadow-sm text-slate-400">
      <Icon size={20} />
    </div>
    <div>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="font-semibold text-slate-800">{value}</p>
    </div>
  </div>
);

const LockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
