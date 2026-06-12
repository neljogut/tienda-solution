import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { useCartStore } from '../store/cartStore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
interface QuantityInputProps {
  productId: string;
  quantity: number;
  maxStock: number;
  updateQuantity: (id: string, qty: number) => void;
}

const QuantityInput: React.FC<QuantityInputProps> = ({ productId, quantity, maxStock, updateQuantity }) => {
  const [localVal, setLocalVal] = useState<string>(quantity.toString());

  useEffect(() => {
    setLocalVal(quantity.toString());
  }, [quantity]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setLocalVal(text);

    const parsed = parseInt(text, 10);
    if (!isNaN(parsed) && parsed > 0) {
      const clamped = Math.min(parsed, maxStock);
      updateQuantity(productId, clamped);
    }
  };

  const handleBlur = () => {
    const parsed = parseInt(localVal, 10);
    if (isNaN(parsed) || parsed < 1) {
      updateQuantity(productId, 1);
      setLocalVal("1");
    } else {
      const clamped = Math.min(parsed, maxStock);
      updateQuantity(productId, clamped);
      setLocalVal(clamped.toString());
    }
  };

  return (
    <input 
      type="number"
      min="1"
      max={maxStock}
      value={localVal}
      onChange={handleChange}
      onBlur={handleBlur}
      className="w-12 text-center text-sm font-semibold bg-transparent border-none focus:outline-none focus:ring-0 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-slate-800"
    />
  );
};

export const CartDrawer: React.FC = () => {
  const { isDrawerOpen, closeDrawer, items, getTotalPrice, removeItem, updateQuantity } = useCartStore();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [pricingSettings, setPricingSettings] = useState<any>(null);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const unsub = onSnapshot(doc(db, 'settings', 'pricing3d'), (snap) => {
      if (snap.exists()) {
        setPricingSettings(snap.data());
      }
    });
    return unsub;
  }, [isDrawerOpen]);

  if (!isDrawerOpen) return null;

  const handleCheckout = () => {
    if (!currentUser) {
      alert('Debes iniciar sesión para comprar.');
      return;
    }
    if (items.length === 0) return;
    closeDrawer();
    navigate('/checkout');
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 transition-opacity animate-fadeIn"
        onClick={closeDrawer}
      ></div>
      
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col animate-slideInRight">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <ShoppingBag className="text-blue-600" size={24} />
            <h2 className="text-xl font-bold text-slate-800">Tu Carrito</h2>
          </div>
          <button 
            onClick={closeDrawer}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {(() => {
            if (items.length === 0) return null;

            // Calculate weights for progress
            let weightNormal = 0;
            let weightKeychain = 0;
            items.forEach(item => {
              // If it has price tiers, it does not count towards threshold weights
              if (item.resolvedPriceTiers && item.resolvedPriceTiers.length > 0) return;
              
              if (item.type === '3d') {
                const w = (item.weightGrams || 0) * item.quantity;
                if (item.isKeychain) {
                  weightKeychain += w;
                } else {
                  weightNormal += w;
                }
              }
            });

            const thresholdNormal = pricingSettings?.wholesaleThresholdGramsNormal ?? 1000;
            const thresholdKeychain = pricingSettings?.wholesaleThresholdGramsKeychain ?? 600;
            
            const discountPercentNormal = pricingSettings?.wholesaleDiscountPercentNormal ?? 15;
            const discountPercentKeychain = pricingSettings?.wholesaleDiscountPercentKeychain ?? 10;

            const has3DNormal = items.some(i => i.type === '3d' && !i.isKeychain && (!i.resolvedPriceTiers || i.resolvedPriceTiers.length === 0));
            const has3DKeychain = items.some(i => i.type === '3d' && i.isKeychain && (!i.resolvedPriceTiers || i.resolvedPriceTiers.length === 0));

            if (!has3DNormal && !has3DKeychain) return null;

            return (
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-3 mb-2 animate-fadeIn">
                <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Descuentos por peso (Impresión 3D)</h3>
                
                {has3DNormal && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-slate-700">
                      <span>Impresión 3D Normal: {weightNormal}g / {thresholdNormal}g</span>
                      <span className="font-bold text-blue-600">-{discountPercentNormal}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${weightNormal >= thresholdNormal ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(100, (weightNormal / thresholdNormal) * 100)}%` }}
                      ></div>
                    </div>
                    {weightNormal >= thresholdNormal ? (
                      <p className="text-[10px] font-bold text-emerald-600">¡Precio mayorista ACTIVADO para 3D normal!</p>
                    ) : (
                      <p className="text-[10px] text-slate-500">Agregá {thresholdNormal - weightNormal}g más para activar descuento del {discountPercentNormal}%</p>
                    )}
                  </div>
                )}

                {has3DKeychain && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-slate-700">
                      <span>Llaveros 3D: {weightKeychain}g / {thresholdKeychain}g</span>
                      <span className="font-bold text-blue-600">-{discountPercentKeychain}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${weightKeychain >= thresholdKeychain ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(100, (weightKeychain / thresholdKeychain) * 100)}%` }}
                      ></div>
                    </div>
                    {weightKeychain >= thresholdKeychain ? (
                      <p className="text-[10px] font-bold text-emerald-600">¡Precio mayorista ACTIVADO para Llaveros!</p>
                    ) : (
                      <p className="text-[10px] text-slate-500">Agregá {thresholdKeychain - weightKeychain}g más para activar descuento del {discountPercentKeychain}%</p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
              <ShoppingBag size={48} className="opacity-20" />
              <p>Tu carrito está vacío</p>
            </div>
          ) : (
            items.map(item => (
              <div key={item.productId} className="flex gap-4 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                <div className="w-20 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">Sin Foto</div>
                  )}
                </div>
                
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-800 line-clamp-1">{item.name}</h4>
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-medium text-blue-600">${(item.price || 0).toLocaleString('es-AR')}</p>
                      {item.price < item.basePrice && (
                        <p className="text-xs text-slate-400 line-through">${(item.basePrice || 0).toLocaleString('es-AR')}</p>
                      )}
                    </div>

                    {/* Price tier next discount hint */}
                    {item.resolvedPriceTiers && item.resolvedPriceTiers.length > 0 && (() => {
                      const sortedTiers = [...item.resolvedPriceTiers].sort((a, b) => a.minQty - b.minQty);
                      const nextTier = sortedTiers.find(t => t.minQty > item.quantity);
                      const currentTier = sortedTiers.find(t => item.quantity >= t.minQty && item.quantity <= t.maxQty);
                      const lastTier = sortedTiers[sortedTiers.length - 1];
                      const activeTier = currentTier || (item.quantity > lastTier?.maxQty ? lastTier : null);

                      return (
                        <div className="mt-1 space-y-0.5">
                          {activeTier && activeTier.unitPrice < item.basePrice && (
                            <div className="text-[10px] text-emerald-600 font-bold">
                              ¡Descuento por tramo activo!
                            </div>
                          )}
                          {nextTier ? (
                            <p className="text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100 inline-block font-medium">
                              Llevá {nextTier.minQty - item.quantity} más para pagar ${(nextTier.unitPrice || 0).toLocaleString('es-AR')} c/u
                            </p>
                          ) : (
                            <p className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 inline-block font-medium">
                              ¡Alcanzaste el descuento máximo por tramos!
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1">
                      <button 
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        className="p-1 text-slate-500 hover:bg-slate-200 rounded"
                        disabled={item.quantity <= 1}
                      >
                        <Minus size={14} />
                      </button>
                      <QuantityInput 
                        productId={item.productId}
                        quantity={item.quantity}
                        maxStock={item.maxStock}
                        updateQuantity={updateQuantity}
                      />
                      <button 
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        className="p-1 text-slate-500 hover:bg-slate-200 rounded"
                        disabled={item.quantity >= item.maxStock}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    
                    <button 
                      onClick={() => removeItem(item.productId)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50">
          <div className="flex justify-between items-center mb-4">
            <span className="text-slate-600 font-medium">Total a pagar:</span>
            <span className="text-2xl font-bold text-emerald-600">
              ${(getTotalPrice() || 0).toLocaleString('es-AR')}
            </span>
          </div>
          
          <button 
            onClick={handleCheckout}
            disabled={items.length === 0}
            className="w-full btn-primary py-3 flex justify-center items-center gap-2 text-lg disabled:opacity-50"
          >
            Finalizar Compra
          </button>
        </div>
      </div>
    </>
  );
};
