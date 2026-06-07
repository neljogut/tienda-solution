import React, { useState } from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag, Loader2 } from 'lucide-react';
import { useCartStore } from '../store/cartStore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, doc, writeBatch, getDoc, getCountFromServer } from 'firebase/firestore';

export const CartDrawer: React.FC = () => {
  const { isDrawerOpen, closeDrawer, items, getTotalPrice, removeItem, updateQuantity, clearCart } = useCartStore();
  const { currentUser, userData } = useAuth();
  const [loading, setLoading] = useState(false);

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
                    <p className="text-sm font-medium text-blue-600">${item.price.toLocaleString('es-AR')}</p>
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
