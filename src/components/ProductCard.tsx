import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Product } from '../types/product';
import { useCartStore } from '../store/cartStore';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Eye, Share2, Copy, Check as CheckIcon } from 'lucide-react';
import { formatPrintTime } from '../utils/printTime';
import { getProductImages } from '../utils/productImages';
import { useAuth } from '../context/AuthContext';

interface ProductCardProps {
  product: Product;
  isAdminView?: boolean;
  getRetailPrice?: (product: Product) => number;
  getCost?: (product: Product) => number;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isAdminView = false,
  getRetailPrice,
  getCost,
}) => {
  const navigate = useNavigate();
  const { addItem } = useCartStore();
  const { userData } = useAuth();
  const isOwner = userData?.role === 'owner';
  
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
  const images = useMemo(() => getProductImages(product), [product]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
  }, [product.id]);

  useEffect(() => {
    if (images.length <= 1 || isPaused) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [images.length, isPaused, product.id]);

  const displayImage = images[activeIndex] ?? product.mainImage;

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
      className="card group cursor-pointer flex flex-col h-full overflow-hidden animate-fadeIn"
      onClick={() => navigate(`/catalog/${product.id}`)}
    >
      {/* Image */}
      <div
        className="aspect-[4/3] bg-slate-100 relative overflow-hidden flex-shrink-0"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {displayImage ? (
          <img
            key={displayImage}
            src={displayImage}
            alt={product.name}
            className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110 animate-fadeIn"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-300">
            <ShoppingCart size={40} />
          </div>
        )}

        {images.length > 1 && (
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
        )}
        
        {/* Overlay on hover (Desktop only) */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 hidden md:block" />

        {/* Top badges */}
        <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 z-10">
          <span className={`badge text-[8px] sm:text-[10px] px-1 py-0.5 sm:px-2 sm:py-0.5 ${product.type === '3d' ? 'badge-blue' : 'badge-green'}`}>
            <span className="hidden sm:inline">{product.type === '3d' ? 'Impresión 3D' : 'Artículos Varios'}</span>
            <span className="inline sm:hidden">{product.type === '3d' ? '3D' : 'Varios'}</span>
          </span>
          {isAdminView && product.useManualPrice && (
            <span className="badge badge-yellow text-[8px] sm:text-[10px] px-1 py-0.5 sm:px-2 sm:py-0.5">Manual</span>
          )}
        </div>

        {/* Stock badge */}
        {isOutOfStock && (
          <div className={`absolute top-2 z-20 ${images.length > 1 ? 'left-2' : 'right-2'}`}>
            <span className="badge badge-red text-[10px]">Sin Stock</span>
          </div>
        )}

        {/* Bottom action on hover (Desktop only) */}
        <div className="absolute bottom-2 left-2 right-2 opacity-0 md:group-hover:opacity-100 translate-y-2 md:group-hover:translate-y-0 transition-all duration-300 hidden md:flex gap-2">
          <button 
            className="flex-1 py-2 rounded-xl bg-white/90 backdrop-blur-sm text-slate-800 text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-white transition-colors shadow-lg"
            onClick={(e) => { e.stopPropagation(); navigate(`/catalog/${product.id}`); }}
          >
            <Eye size={14} /> Ver
          </button>
          {!isOutOfStock && (
            <button 
              onClick={handleAddToCart}
              className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30"
            >
              <ShoppingCart size={14} /> Comprar
            </button>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="p-3 sm:p-4 flex flex-col flex-1">
        <p className="text-[9px] sm:text-[11px] text-blue-600 font-bold uppercase tracking-wider mb-1">{product.category}</p>
        <h3 className="font-semibold text-slate-800 line-clamp-2 leading-snug mb-2 flex-1 text-xs sm:text-base">{product.name}</h3>
        
        <div className="flex items-center justify-between gap-2 mt-auto">
          <div>
            <div className="flex flex-col">
              <span className="text-base sm:text-xl font-bold text-slate-900 leading-tight">
                ${priceToDisplay?.toLocaleString('es-AR') || '0'}
              </span>
              {wholesalePrice < priceToDisplay && (
                <span className="text-[9px] sm:text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-100 rounded px-1.5 py-0.5 mt-1 w-fit leading-none">
                  Mayorista: ${wholesalePrice.toLocaleString('es-AR')}
                </span>
              )}
            </div>
            {product.stock !== undefined && product.stock > 0 && (
              <p className="text-[9px] sm:text-[11px] text-slate-400 mt-1">{product.stock} disponibles</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 relative">
            {/* Share button */}
            <button
              ref={shareButtonRef}
              onClick={handleShare}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
              title="Compartir producto"
            >
              <Share2 size={15} />
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

            {/* Add to cart */}
            {!isOutOfStock && (
              <button
                onClick={handleAddToCart}
                className="p-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-md shadow-blue-500/20"
                title="Añadir al carrito"
              >
                <ShoppingCart size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Admin cost info */}
        {isAdminView && (isOwner || product.type === '3d') && (
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-500">
            {isOwner && (
              <>
                <div>Costo: ${costToDisplay.toLocaleString('es-AR')}</div>
                <div className="text-right text-emerald-600 font-semibold">
                  Ganancia: ${((priceToDisplay || 0) - costToDisplay).toLocaleString('es-AR')}
                </div>
              </>
            )}
            {product.type === '3d' && (
              <div className="col-span-2 mt-0.5">Tiempo: {formatPrintTime(product.printTimeMinutes)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
