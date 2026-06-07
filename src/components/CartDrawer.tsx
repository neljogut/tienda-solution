import React, { useState, useEffect } from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag, Loader2 } from 'lucide-react';
import { useCartStore } from '../store/cartStore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, doc, writeBatch, getDoc, getCountFromServer, onSnapshot } from 'firebase/firestore';

export const CartDrawer: React.FC = () => {
  const { isDrawerOpen, closeDrawer, items, getTotalPrice, removeItem, updateQuantity, clearCart } = useCartStore();
  const { currentUser, userData } = useAuth();
  const [loading, setLoading] = useState(false);
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

  const handleCheckout = async () => {
    if (!currentUser || !userData) {
      alert("Debes iniciar sesión para comprar.");
      return;
    }
    
    if (items.length === 0) return;

    setLoading(true);
    try {
      // Fetch settings and rate to correctly set order details
      const [, exchangeRateSnap] = await Promise.all([
        getDoc(doc(db, 'settings', 'pricing3d')),
        getDoc(doc(db, 'settings', 'exchangeRate'))
      ]);
      const exchangeRate = exchangeRateSnap.exists() ? exchangeRateSnap.data().currentUsdToArs : 1000;

      // Sequential order number
      const coll = collection(db, 'orders');
      const countSnapshot = await getCountFromServer(coll);
      const orderNumber = countSnapshot.data().count + 1;

      // Map cart items into full order items, resolving cost and profit snap
      const orderItems = await Promise.all(items.map(async (item) => {
        const prodSnap = await getDoc(doc(db, 'products', item.productId));
        const product = prodSnap.exists() ? prodSnap.data() : null;
        const unitCost = product ? (product.calculatedCost || 0) : 0;
        return {
          productId: item.productId,
          name: item.name,
          type: item.type,
          quantity: item.quantity,
          unitPrice: item.price,
          appliedWholesale: false,
          unitCost: unitCost,
          unitProfit: item.price - unitCost,
          imageUrl: item.imageUrl || '',
          isManualPrice: product ? (product.useManualPrice || false) : false
        };
      }));

      const totalCost = orderItems.reduce((sum, item) => sum + (item.unitCost * item.quantity), 0);
      const totalAmount = getTotalPrice();

      // Create new Order
      const newOrder = {
        orderNumber,
        customerId: currentUser.uid,
        customerName: userData.displayName || 'Cliente',
        date: new Date().toISOString(),
        items: orderItems,
        totalAmount,
        paidAmount: 0,
        pendingAmount: totalAmount,
        paymentStatus: 'unpaid',
        orderStatus: 'pending',
        observationsPublic: 'Pedido creado desde el carrito web.',
        observationsInternal: 'Creado desde el carrito web del cliente.',
        exchangeRateUsdUsed: exchangeRate,
        exchangeRateDate: new Date().toISOString(),
        totalCost,
        totalProfit: totalAmount - totalCost,
      };

      const orderRef = await addDoc(collection(db, 'orders'), newOrder);
      const orderId = orderRef.id;
      
      // Update stocks and materials
      const batch = writeBatch(db);
      const saleLines: any[] = [];

      for (const item of orderItems) {
        const prodRef = doc(db, 'products', item.productId);
        const prodSnap = await getDoc(prodRef);
        if (prodSnap.exists()) {
          const product = prodSnap.data();
          const prevStock = product.stock || 0;
          const newStock = Math.max(0, prevStock - item.quantity);
          batch.update(prodRef, { stock: newStock });

          saleLines.push({
            itemId: item.productId,
            itemType: 'product',
            lineType: 'out_sale',
            previousQuantity: prevStock,
            modifiedQuantity: -item.quantity,
            finalQuantity: newStock,
          });

          // Deduct 3D materials
          if (product.type === '3d') {
            const filamentLines = product.filamentLines?.length
              ? product.filamentLines
              : (product.filamentIds ?? []).map((filamentId: string) => ({
                  supplyId: filamentId,
                  grams: (product.weightGrams * item.quantity) / Math.max(1, product.filamentIds.length),
                }));

            for (const line of filamentLines) {
              const filamentId = line.supplyId;
              const weightToDeduct = (line.grams || 0) * item.quantity;
              if (!filamentId || weightToDeduct <= 0) continue;

              const filRef = doc(db, 'inventory', filamentId);
              const filSnap = await getDoc(filRef);
              if (filSnap.exists()) {
                const filData = filSnap.data();
                const prevWeight = filData.availableWeightGrams || 0;
                const newWeight = Math.max(0, prevWeight - weightToDeduct);

                batch.update(filRef, { availableWeightGrams: newWeight });

                saleLines.push({
                  itemId: filamentId,
                  itemType: 'filament',
                  lineType: 'consumption',
                  previousQuantity: prevWeight,
                  modifiedQuantity: -weightToDeduct,
                  finalQuantity: newWeight,
                });
              }
            }

            if (product.supplyIds && product.supplyIds.length > 0) {
              for (const supplyObj of product.supplyIds) {
                const supplyId = supplyObj.supplyId;
                const qtyNeeded = supplyObj.quantity * item.quantity;

                const supRef = doc(db, 'inventory', supplyId);
                const supSnap = await getDoc(supRef);
                if (supSnap.exists()) {
                  const supData = supSnap.data();
                  const prevQty = supData.currentStock || 0;
                  const newQty = Math.max(0, prevQty - qtyNeeded);

                  batch.update(supRef, { currentStock: newQty });

                  saleLines.push({
                    itemId: supplyId,
                    itemType: 'supply',
                    lineType: 'consumption',
                    previousQuantity: prevQty,
                    modifiedQuantity: -qtyNeeded,
                    finalQuantity: newQty,
                  });
                }
              }
            }
          }
        }
      }

      await batch.commit();

      if (saleLines.length > 0) {
        await addDoc(collection(db, 'inventory_movements'), {
          date: new Date().toISOString(),
          movementType: 'sale',
          reason: `Venta · Pedido #${orderNumber} (Carrito)`,
          userId: currentUser.uid,
          orderId,
          lines: saleLines,
        });
      }

      clearCart();
      closeDrawer();
      alert(`¡Pedido #${newOrder.orderNumber} creado con éxito! Nos contactaremos pronto.`);
    } catch (error) {
      console.error("Error creating order:", error);
      alert("Ocurrió un error al procesar el pedido.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 transition-opacity"
        onClick={closeDrawer}
      ></div>
      
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300">
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
              if (item.priceTiers && item.priceTiers.length > 0) return;
              
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

            const has3DNormal = items.some(i => i.type === '3d' && !i.isKeychain && (!i.priceTiers || i.priceTiers.length === 0));
            const has3DKeychain = items.some(i => i.type === '3d' && i.isKeychain && (!i.priceTiers || i.priceTiers.length === 0));

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
                      <p className="text-sm font-medium text-blue-600">${item.price.toLocaleString('es-AR')}</p>
                      {item.price < item.basePrice && (
                        <p className="text-xs text-slate-400 line-through">${item.basePrice.toLocaleString('es-AR')}</p>
                      )}
                    </div>

                    {/* Price tier next discount hint */}
                    {item.priceTiers && item.priceTiers.length > 0 && (() => {
                      const sortedTiers = [...item.priceTiers].sort((a, b) => a.minQty - b.minQty);
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
                              Llevá {nextTier.minQty - item.quantity} más para pagar ${nextTier.unitPrice.toLocaleString('es-AR')} c/u
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
                      <span className="text-sm font-medium w-4 text-center">{item.quantity}</span>
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
              ${getTotalPrice().toLocaleString('es-AR')}
            </span>
          </div>
          
          <button 
            onClick={handleCheckout}
            disabled={items.length === 0 || loading}
            className="w-full btn-primary py-3 flex justify-center items-center gap-2 text-lg disabled:opacity-50"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : 'Finalizar Compra'}
          </button>
        </div>
      </div>
    </>
  );
};
