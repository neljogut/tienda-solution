import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Product } from '../types/product';
import { useCartStore } from '../store/cartStore';
import { useAuth } from '../context/AuthContext';
import { usePricingData } from '../hooks/usePricingData';
import { formatWeightGrams } from '../utils/weightGrams';
import { formatPrintTime } from '../utils/printTime';
import { getProductImages } from '../utils/productImages';
import { ArrowLeft, Loader2, ShoppingCart, Box, Zap, Wrench, Share2, Copy, Check as CheckIcon } from 'lucide-react';

export const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
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
  
  const { addItem } = useCartStore();
  const { userData, hasPermission } = useAuth();
  const [quantity, setQuantity] = useState(1);
  
  const isAdminView = userData?.role === 'owner' || hasPermission('viewManualPrices');
  const isOwner = userData?.role === 'owner';
  const { getRetailPrice } = usePricingData();

  const price = product ? getRetailPrice(product) : 0;
  const isOutOfStock = product ? (product.stock !== undefined && product.stock <= 0) : false;

  const wholesalePrice = React.useMemo(() => {
    if (!product) return 0;
    if (product.priceTiers && product.priceTiers.length > 0) {
      return Math.min(...product.priceTiers.map(t => t.unitPrice));
    }
    return product.calculatedWholesalePrice || Math.ceil(price * 0.8);
  }, [product, price]);

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

  const handleAddToCart = () => {
    if (isOutOfStock) return;
    addItem({
      productId: product.id,
      name: product.name,
      type: product.type,
      price: price,
      basePrice: price,
      priceTiers: product.priceTiers,
      weightGrams: (product as any).weightGrams,
      categoryId: product.categoryId,
      category: product.category,
      isKeychain: (product as any).isKeychain,
      imageUrl: product.mainImage,
      quantity: quantity,
      maxStock: product.stock !== undefined ? product.stock : 999,
      variantGroup: product.variantGroup
    });
  };
  
  const allImages = getProductImages(product);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Volver</span>
        </button>

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
        </div>

        {/* Detalles del Producto */}
        <div className="flex flex-col">
          <div className="mb-2">
            <span className="text-xs font-bold tracking-wider text-blue-600 uppercase bg-blue-50 px-2 py-1 rounded-md">
              {product.category}
            </span>
            {isAdminView && product.useManualPrice && (
              <span className="ml-2 text-xs font-bold tracking-wider text-amber-600 uppercase bg-amber-50 px-2 py-1 rounded-md">
                Precio Manual
              </span>
            )}
          </div>
          
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">{product.name}</h1>
          
          <div className="flex flex-col mb-6">
            <span className="text-3xl font-extrabold text-slate-900 leading-tight">
              ${price.toLocaleString('es-AR')}
            </span>
            {wholesalePrice < price && (
              <span className="text-xs sm:text-sm font-bold text-purple-600 bg-purple-50 border border-purple-100 rounded-lg px-2.5 py-1 mt-1.5 w-fit leading-none">
                Precio Mayorista: ${wholesalePrice.toLocaleString('es-AR')}
              </span>
            )}
          </div>

          <div className="prose prose-slate max-w-none mb-8">
            <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{product.description}</p>
          </div>

          {/* Especificaciones según tipo */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            {product.type === '3d' ? (
              <>
                <SpecItem icon={Box} label="Peso" value={formatWeightGrams(product.weightGrams)} />
                <SpecItem icon={Zap} label="Tiempo aprox." value={formatPrintTime(product.printTimeMinutes)} />
                <SpecItem icon={Wrench} label="Tipo" value={product.isKeychain ? 'Llavero' : 'Figura / Pieza'} />
              </>
            ) : (
              <>
                <SpecItem icon={Box} label="Stock" value={`${product.stock || 0} unid.`} />
                <SpecItem icon={Wrench} label="Tipo" value="Artículo Vario" />
              </>
            )}
          </div>

          <div className="mt-auto pt-6 border-t border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700 font-medium">Cantidad:</span>
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

            <button 
              type="button"
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              className="w-full btn-primary py-4 text-lg flex items-center justify-center gap-2 shadow-xl shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShoppingCart size={24} />
              {isOutOfStock ? 'Sin Stock' : 'Agregar al Pedido'}
            </button>
            <p className="text-center text-xs text-slate-500">
              Para compras mayoristas, podés aumentar las unidades al confirmar tu pedido.
            </p>
          </div>
        </div>
      </div>

      {isAdminView && (
        <div className="mt-12 p-6 bg-slate-800 rounded-2xl text-white">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <LockIcon /> Detalles Internos (Solo Administrador)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {isOwner && (
              <>
                <div>
                  <p className="text-slate-400 text-sm">Costo Calculado</p>
                  <p className="text-xl font-bold">${product.calculatedCost?.toLocaleString('es-AR')}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Ganancia Estimada</p>
                  <p className="text-xl font-bold text-emerald-400">${(price - (product.calculatedCost || 0)).toLocaleString('es-AR')}</p>
                </div>
              </>
            )}
            <div>
              <p className="text-slate-400 text-sm">Precio Mayorista (Auto)</p>
              <p className="text-xl font-bold text-blue-400">${product.calculatedWholesalePrice?.toLocaleString('es-AR')}</p>
            </div>
          </div>
        </div>
      )}
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
