import React, { useEffect, useMemo, useState } from 'react';
import type { Product } from '../types/product';
import { useCartStore } from '../store/cartStore';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Eye } from 'lucide-react';
import { formatPrintTime } from '../utils/printTime';
import { getProductImages } from '../utils/productImages';

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
  
  const priceToDisplay = getRetailPrice
    ? getRetailPrice(product)
    : (product.useManualPrice ? product.manualRetailPrice : product.calculatedRetailPrice);
  const costToDisplay = getCost
    ? getCost(product)
    : (product.calculatedCost ?? 0);
  const isOutOfStock = product.stock !== undefined && product.stock <= 0;
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
      maxStock: product.stock !== undefined ? product.stock : 999
    });
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
            <span className="text-base sm:text-xl font-bold text-slate-900">
              ${priceToDisplay?.toLocaleString('es-AR') || '0'}
            </span>
            {product.stock !== undefined && product.stock > 0 && (
              <p className="text-[9px] sm:text-[11px] text-slate-400 mt-0.5">{product.stock} disponibles</p>
            )}
          </div>
          {!isOutOfStock && (
            <button
              onClick={handleAddToCart}
              className="p-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-md shadow-blue-500/20 flex-shrink-0"
              title="Añadir al carrito"
            >
              <ShoppingCart size={15} />
            </button>
          )}
        </div>

        {/* Admin cost info */}
        {isAdminView && (
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-500">
            <div>Costo: ${costToDisplay.toLocaleString('es-AR')}</div>
            <div className="text-right text-emerald-600 font-semibold">
              Ganancia: ${((priceToDisplay || 0) - costToDisplay).toLocaleString('es-AR')}
            </div>
            {product.type === '3d' && (
              <div className="col-span-2">Tiempo: {formatPrintTime(product.printTimeMinutes)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
