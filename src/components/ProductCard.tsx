import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Product } from '../types/product';
import { useCartStore } from '../store/cartStore';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Share2, Copy, Check as CheckIcon, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';

import { getProductImages } from '../utils/productImages';
import { useAuth } from '../context/AuthContext';
import { useBusinessSettings } from '../hooks/useBusinessSettings';


interface ProductCardProps {
  product: Product;
  isAdminView?: boolean;
  getRetailPrice?: (product: Product) => number;
  getCost?: (product: Product) => number;
  salesCount?: number;
  onCardClick?: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isAdminView = false,
  getRetailPrice,
  getCost,
  salesCount,
  onCardClick,
}) => {
  const navigate = useNavigate();
  const { addItem, openDrawer, items } = useCartStore();
  const { userData } = useAuth();
  const isOwner = userData?.role === 'owner';
  const cartQty = items.find(item => item.productId === product.id)?.quantity || 0;
  const { outOfStockSaturate: saturate } = useBusinessSettings();
  const outOfStockSaturate = saturate ?? 20;

  
  const priceToDisplay = getRetailPrice
    ? getRetailPrice(product)
    : (product.useManualPrice ? product.manualRetailPrice : product.calculatedRetailPrice);
  const costToDisplay = getCost
    ? getCost(product)
    : (product.calculatedCost ?? 0);
  const isOutOfStock = product.stock !== undefined && product.stock <= 0;
  const wholesalePrice = useMemo(() => {
    if (product.priceTiers && product.priceTiers.length > 0) {
      return Math.min(...product.priceTiers.map(t => t.unitPrice));
    }
    return product.calculatedWholesalePrice || Math.ceil(priceToDisplay * 0.8);
  }, [product.priceTiers, product.calculatedWholesalePrice, priceToDisplay]);
  const displayCategory = useMemo(() => {
    if (!product.category) return 'Sin categoría';
    const parts = product.category.split(' › ');
    return parts[parts.length - 1];
  }, [product.category]);

  const images = useMemo(() => getProductImages(product), [product]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});

  const cardRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    }, { threshold: 0.1 });

    observer.observe(el);
    return () => {
      observer.unobserve(el);
    };
  }, []);

  const handleImageLoad = (url: string) => {
    setLoadedImages((prev) => ({ ...prev, [url]: true }));
  };

  useEffect(() => {
    setActiveIndex(0);
    setLoadedImages({});
  }, [product.id]);

  useEffect(() => {
    if (images.length <= 1 || isPaused || !isVisible) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [images.length, isPaused, isVisible]);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock) return;
    
    addItem({
      productId: product.id,
      name: product.name,
      type: product.type,
      price: priceToDisplay,
      basePrice: priceToDisplay,
      priceTiers: product.priceTiers,
      weightGrams: (product as any).weightGrams,
      categoryId: product.categoryId,
      category: product.category,
      isKeychain: (product as any).isKeychain,
      imageUrl: product.mainImage,
      maxStock: product.stock !== undefined ? product.stock : 999,
      variantGroup: product.variantGroup
    });
    openDrawer();
  };

  // Share functionality
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showShareMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node) &&
        shareButtonRef.current && !shareButtonRef.current.contains(e.target as Node)
      ) {
        setShowShareMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showShareMenu]);

  const productUrl = `${window.location.origin}/catalog/${product.id}`;

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowShareMenu(prev => !prev);
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(productUrl);
      setCopiedLink(true);
      setTimeout(() => { setCopiedLink(false); setShowShareMenu(false); }, 1500);
    } catch {
      setShowShareMenu(false);
    }
  };

  const handleShareWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const text = encodeURIComponent(`Mirá este producto: ${product.name}\n${productUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
    setShowShareMenu(false);
  };

  const handleShareNative = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.share({ title: product.name, url: productUrl }).catch(() => {});
    setShowShareMenu(false);
  };

  return (
    <div 
      ref={cardRef}
      className="card group cursor-pointer flex flex-col h-full overflow-hidden animate-fadeIn"
      onClick={(e) => {
        if (onCardClick) {
          e.preventDefault();
          onCardClick(product);
        } else {
          navigate(`/catalog/${product.id}`);
        }
      }}
    >
      {/* Image */}
      <div
        className="aspect-[4/3] bg-slate-100 relative overflow-hidden flex-shrink-0"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {images.length > 0 ? (
          <>
            {/* Pulsing Skeleton Background while active image is loading */}
            {!loadedImages[images[activeIndex]] && (
              <div className="absolute inset-0 bg-slate-200 animate-pulse flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
              </div>
            )}
            <div className="absolute inset-0 w-full h-full">
              {images.map((imgUrl, idx) => {
                const shouldRender = idx === activeIndex || idx === 0 || loadedImages[imgUrl];
                if (!shouldRender) return null;
                return (
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
                    className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ease-in-out group-hover:scale-110 ${
                      idx === activeIndex && loadedImages[imgUrl] ? (isOutOfStock ? 'opacity-70 z-10' : 'opacity-100 z-10') : 'opacity-0 z-0'
                    }`}
                    style={isOutOfStock ? { filter: `saturate(${outOfStockSaturate}%)` } : undefined}
                    loading={idx === 0 ? "eager" : "lazy"}
                  />
                );
              })}
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-300">
            <ShoppingCart size={40} />
          </div>
        )}

        {images.length > 1 && (
          <>
            {/* Left navigation arrow */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setActiveIndex((prev) => (prev - 1 + images.length) % images.length);
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-30 w-7 h-7 rounded-full bg-black/45 backdrop-blur-sm text-white flex items-center justify-center transition-all duration-200 opacity-70 md:opacity-0 md:group-hover:opacity-100 hover:bg-black/70 active:scale-95 shadow-md border border-white/10"
              title="Imagen anterior"
            >
              <ChevronLeft size={16} />
            </button>

            {/* Right navigation arrow */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setActiveIndex((prev) => (prev + 1) % images.length);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-30 w-7 h-7 rounded-full bg-black/45 backdrop-blur-sm text-white flex items-center justify-center transition-all duration-200 opacity-70 md:opacity-0 md:group-hover:opacity-100 hover:bg-black/70 active:scale-95 shadow-md border border-white/10"
              title="Siguiente imagen"
            >
              <ChevronRight size={16} />
            </button>

            <div
              className="absolute top-2 right-2 flex gap-1 z-20 bg-black/40 backdrop-blur-sm rounded-full px-1.5 py-1"
              onClick={(e) => e.stopPropagation()}
            >
              {images.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Imagen ${idx + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveIndex(idx);
                  }}
                  className={`w-2 h-2 rounded-full transition-all ${
                    idx === activeIndex
                      ? 'bg-white scale-110'
                      : 'bg-white/40 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>
          </>
        )}
        
        {/* Cart button pinned at center-bottom of image — always visible for both clients and admins */}
        {!isOutOfStock && (
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-30">
            <button
              type="button"
              onClick={handleAddToCart}
              className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-blue-500/40 transition-all duration-200"
              title="Añadir al carrito"
            >
              <ShoppingCart size={16} className="sm:w-[18px] sm:h-[18px]" />
              {cartQty > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black min-w-[16px] h-[16px] rounded-full flex items-center justify-center shadow">
                  {cartQty}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Top badges (Sales and Stock) */}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1.5 z-30 pointer-events-none">
          {/* Sales badge (visible for all) */}
          {salesCount !== undefined && salesCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-slate-600/90 backdrop-blur-sm text-white text-[9px] sm:text-[10px] font-bold shadow-sm">
              {salesCount} vendidos
            </span>
          )}

          {/* Stock badge */}
          {isOutOfStock ? (
            <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[9px] sm:text-[10px] font-bold shadow">
              Sin Stock
            </span>
          ) : product.stock !== undefined ? (
            <span className={`px-2 py-0.5 rounded-full text-white text-[9px] sm:text-[10px] font-bold shadow ${
              product.stock <= 3 ? 'bg-orange-500' :
              product.stock <= 9 ? 'bg-amber-500' :
              'bg-emerald-500'
            }`}>
              {product.stock <= 3 ? `¡Últimas ${product.stock}!` : `${product.stock} disp.`}
            </span>
          ) : null}
        </div>
      </div>
      
      <div className="p-2.5 sm:p-4 flex flex-col flex-1">
        <p className="text-[9px] sm:text-[11px] text-blue-600 font-bold uppercase tracking-wider mb-1 text-center">{displayCategory}</p>
        <h3 className="font-bold text-slate-900 line-clamp-2 leading-snug mb-2 flex-1 text-sm sm:text-lg text-center tracking-tight">{product.name}</h3>
        
        <div className="relative flex flex-col items-center mt-auto w-full pt-1">
          {/* Centered Price */}
          <span className="text-lg sm:text-2xl font-black text-blue-600 leading-tight mb-1 sm:mb-2">
            ${priceToDisplay?.toLocaleString('es-AR') || '0'}
          </span>
          
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1.5 z-10">
            {/* Edit button (Admins only) */}
            {isAdminView && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  navigate(`/admin/products/${product.id}`);
                }}
                className="p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-blue-600 transition-colors animate-fadeIn"
                title="Editar producto"
              >
                <Pencil size={14} className="sm:w-[15px] sm:h-[15px]" />
              </button>
            )}

            {/* Share button */}
            <button
              ref={shareButtonRef}
              onClick={handleShare}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
              title="Compartir producto"
            >
              <Share2 size={14} className="sm:w-[15px] sm:h-[15px]" />
            </button>

            {/* Share popover */}
            {showShareMenu && (
              <div
                ref={shareMenuRef}
                className="absolute bottom-full right-0 mb-2 z-50 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 flex flex-col gap-1 min-w-[170px] animate-fadeIn"
                onClick={e => e.stopPropagation()}
              >
                {/* WhatsApp */}
                <button
                  onClick={handleShareWhatsApp}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-green-50 text-slate-700 hover:text-green-700 transition-colors text-sm font-medium w-full text-left"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </button>

                {/* Copy link */}
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-blue-50 text-slate-700 hover:text-blue-700 transition-colors text-sm font-medium w-full text-left"
                >
                  {copiedLink ? <CheckIcon size={16} className="text-green-500" /> : <Copy size={16} />}
                  {copiedLink ? '¡Copiado!' : 'Copiar link'}
                </button>

                {/* Native share (if supported) */}
                {typeof navigator.share === 'function' && (
                  <button
                    onClick={handleShareNative}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-700 transition-colors text-sm font-medium w-full text-left"
                  >
                    <Share2 size={16} />
                    Más opciones
                  </button>
                )}
              </div>
            )}


          </div>
        </div>


      </div>
    </div>
  );
};
