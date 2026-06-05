import React, { useState } from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag, Loader2 } from 'lucide-react';
import { useCartStore } from '../store/cartStore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, doc, increment, writeBatch } from 'firebase/firestore';

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
      // Create new Order
      const newOrder = {
        orderNumber: Date.now(), // simple sequential
        customerId: currentUser.uid,
        customerName: userData.displayName || 'Cliente',
        date: new Date().toISOString(),
        items: items.map(item => ({
          productId: item.productId,
          name: item.name,
          type: item.type,
          quantity: item.quantity,
          unitPrice: item.price,
          appliedWholesale: false,
          unitCost: 0, // Should be fetched properly in a real backend
          unitProfit: 0,
          imageUrl: item.imageUrl,
          isManualPrice: false
        })),
        totalAmount: getTotalPrice(),
        paidAmount: 0,
        pendingAmount: getTotalPrice(),
        paymentStatus: 'unpaid',
        orderStatus: 'pending',
        observationsPublic: 'Pedido creado desde el carrito web.',
        observationsInternal: '',
        exchangeRateUsdUsed: 1000,
        exchangeRateDate: new Date().toISOString(),
        totalCost: 0,
        totalProfit: 0,
      };

      await addDoc(collection(db, 'orders'), newOrder);
      
      // Update stock
      const batch = writeBatch(db);
      items.forEach(item => {
        const prodRef = doc(db, 'products', item.productId);
        batch.update(prodRef, {
          stock: increment(-item.quantity)
        });
      });
      await batch.commit();

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
