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
import { ArrowLeft, Loader2, ShoppingCart, Box, Zap, Wrench } from 'lucide-react';

export const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string>('');
  
  const { addItem, openDrawer } = useCartStore();
  const { userData, hasPermission } = useAuth();
  const [quantity, setQuantity] = useState(1);
  
  const isAdminView = userData?.role === 'owner' || hasPermission('viewManualPrices');
  const { getRetailPrice } = usePricingData();

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

  const price = getRetailPrice(product);
  const isOutOfStock = product.stock !== undefined && product.stock <= 0;

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
      category: product.category,
      isKeychain: (product as any).isKeychain,
      imageUrl: product.mainImage,
      quantity: quantity,
      maxStock: product.stock !== undefined ? product.stock : 999
    });
    openDrawer();
  };
  
  const allImages = getProductImages(product);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft size={20} />
        <span>Volver</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Galería de Imágenes */}
        <div className="space-y-4">
          <div className="aspect-square bg-slate-100 rounded-2xl overflow-hidden border border-slate-200">
            {selectedImage ? (
              <img src={selectedImage} alt={product.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
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
          
          <div className="text-3xl font-extrabold text-slate-900 mb-6">
            ${price.toLocaleString('es-AR')}
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
            <div>
              <p className="text-slate-400 text-sm">Costo Calculado</p>
              <p className="text-xl font-bold">${product.calculatedCost?.toLocaleString('es-AR')}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Ganancia Estimada</p>
              <p className="text-xl font-bold text-emerald-400">${(price - (product.calculatedCost || 0)).toLocaleString('es-AR')}</p>
            </div>
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
