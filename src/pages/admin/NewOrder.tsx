import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, addDoc, getCountFromServer, doc, getDoc, updateDoc, writeBatch, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Product } from '../../types/product';
import type { OrderItem, Order } from '../../types/order';
import type { Client } from '../../types/client';
import type { ExchangeRateData, DepositSettings } from '../../types/settings';
import type { CashSession, PaymentMethod } from '../../types/cash';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Plus, Trash2, ShoppingCart, User, CreditCard, AlertCircle, Sparkles, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getTierPrice } from '../../services/pricingService';

export const NewOrder: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [observationsPublic, setObservationsPublic] = useState('');
  const [observationsInternal, setObservationsInternal] = useState('');
  const [loading, setLoading] = useState(false);

  // Settings & Exchange Rate
  const [depositSettings, setDepositSettings] = useState<DepositSettings | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(1000);
  
  // Daily Cash active session
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);

  const { userData } = useAuth();
  const navigate = useNavigate();

  // Load products, clients, settings, active cash session
  useEffect(() => {
    const fetchInitialData = async () => {
      // 1. Products
      const prodSnap = await getDocs(query(collection(db, 'products')));
      setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));

      // 2. Clients
      const clientSnap = await getDocs(query(collection(db, 'clients')));
      setClients(clientSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));

      // 3. Deposit & exchange rate settings
      const depSnap = await getDoc(doc(db, 'settings/deposit'));
      if (depSnap.exists()) setDepositSettings(depSnap.data() as DepositSettings);

      const xrSnap = await getDoc(doc(db, 'settings/exchangeRate'));
      if (xrSnap.exists()) setExchangeRate((xrSnap.data() as ExchangeRateData).currentUsdToArs);
    };
    
    fetchInitialData();

    // 4. Live active cash session listener
    const qSession = query(collection(db, 'cash_sessions'), where('status', '==', 'open'));
    const unsubSession = onSnapshot(qSession, (snap) => {
      if (!snap.empty) {
        setActiveSession({ id: snap.docs[0].id, ...snap.docs[0].data() } as CashSession);
      } else {
        setActiveSession(null);
      }
    });

    return () => unsubSession();
  }, []);

  // Filter products by name
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  // Active client details
  const activeClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId) || null;
  }, [selectedClientId, clients]);

  // Compute unit price for a product based on current selected client and cart quantity
  const calculateItemPrice = (product: Product, quantity: number, client: Client | null) => {
    const clientType = client ? client.clientType : 'normal';
    
    // 1. If wholesale client, use product calculated wholesale price
    if (clientType === 'wholesale') {
      return product.calculatedWholesalePrice || (product.useManualPrice ? product.manualRetailPrice : product.calculatedRetailPrice);
    }
    
    // 2. Otherwise (normal/trusted), apply tier pricing if available
    const basePrice = product.useManualPrice ? product.manualRetailPrice : product.calculatedRetailPrice;
    return getTierPrice(quantity, basePrice, product.priceTiers);
  };

  // Recalculate cart item prices whenever the client or items change
  const recalculateCart = (items: OrderItem[], client: Client | null) => {
    return items.map(item => {
      const product = products.find(p => p.id === item.productId);
      if (!product) return item;
      const unitPrice = calculateItemPrice(product, item.quantity, client);
      return {
        ...item,
        unitPrice,
        unitProfit: unitPrice - (product.calculatedCost || 0),
        appliedWholesale: client?.clientType === 'wholesale' || !!(product.priceTiers && product.priceTiers.length > 0 && unitPrice < (product.useManualPrice ? product.manualRetailPrice : product.calculatedRetailPrice))
      };
    });
  };

  // Trigger cart updates when selected client changes
  useEffect(() => {
    if (cartItems.length > 0) {
      setCartItems(prev => recalculateCart(prev, activeClient));
    }
  }, [selectedClientId, products]);

  // Add item to cart
  const addToCart = (product: Product) => {
    const existing = cartItems.find(item => item.productId === product.id);
    const currentQty = existing ? existing.quantity : 0;
    
    if (currentQty >= product.stock) {
      alert(`No se puede agregar más. Stock disponible: ${product.stock}`);
      return;
    }

    setCartItems(prev => {
      const isExisting = prev.find(item => item.productId === product.id);
      let updatedList;
      
      if (isExisting) {
        updatedList = prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      } else {
        const initialPrice = calculateItemPrice(product, 1, activeClient);
        updatedList = [...prev, {
          productId: product.id,
          name: product.name,
          type: product.type,
          quantity: 1,
          unitPrice: initialPrice,
          appliedWholesale: activeClient?.clientType === 'wholesale',
          unitCost: product.calculatedCost || 0,
          unitProfit: initialPrice - (product.calculatedCost || 0),
          imageUrl: product.mainImage,
          isManualPrice: product.useManualPrice
        }];
      }
      return recalculateCart(updatedList, activeClient);
    });
  };

  // Update item quantity
  const updateQuantity = (productId: string, quantity: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (quantity > product.stock) {
      alert(`Stock insuficiente. Disponible: ${product.stock}`);
      return;
    }

    setCartItems(prev => {
      let updatedList;
      if (quantity <= 0) {
        updatedList = prev.filter(i => i.productId !== productId);
      } else {
        updatedList = prev.map(i => i.productId === productId ? { ...i, quantity } : i);
      }
      return recalculateCart(updatedList, activeClient);
    });
  };

  // Order totals
  const totalAmount = cartItems.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);
  const totalCost = cartItems.reduce((acc, item) => acc + (item.unitCost * item.quantity), 0);
  const pendingAmount = Math.max(0, totalAmount - paidAmount);

  // Deposit/Signal requirement calculations
  const requiredDepositPercent = depositSettings?.requiredDepositPercent || 30; // default 30%
  const isTrustedClient = activeClient?.clientType === 'trusted';
  const bypassDeposit = isTrustedClient && (depositSettings?.trustedClientBypassDeposit ?? true);
  
  const minDepositRequired = bypassDeposit ? 0 : Math.ceil(totalAmount * (requiredDepositPercent / 100));
  const isDepositValid = paidAmount >= minDepositRequired || bypassDeposit;

  // Handle Order Submit
  const handleCreateOrder = async () => {
    if (cartItems.length === 0) return alert("Agrega productos al pedido.");
    if (!selectedClientId) return alert("Selecciona un cliente.");
    if (paidAmount > totalAmount) return alert("El monto abonado no puede superar el total del pedido.");
    
    // Deposit check
    if (paidAmount < minDepositRequired && !bypassDeposit) {
      return alert(`La seña mínima requerida para este pedido es de $${minDepositRequired.toLocaleString('es-AR')} (${requiredDepositPercent}%).`);
    }

    // Cash session check if there's a payment
    if (paidAmount > 0 && !activeSession) {
      return alert("La caja diaria está cerrada. Abre la caja en la sección de Caja para poder registrar pagos, o establece la seña en $0.");
    }

    setLoading(true);
    
    try {
      // 1. Sequential order number
      const coll = collection(db, 'orders');
      const snapshot = await getCountFromServer(coll);
      const orderNumber = snapshot.data().count + 1;

      let paymentStatus: Order['paymentStatus'] = 'unpaid';
      if (paidAmount > 0 && paidAmount < totalAmount) paymentStatus = 'partial';
      else if (paidAmount >= totalAmount) paymentStatus = 'paid';

      const customerName = activeClient ? `${activeClient.firstName} ${activeClient.lastName}` : 'Cliente Eventual';

      const orderData: Omit<Order, 'id'> = {
        orderNumber,
        customerId: selectedClientId,
        customerName,
        date: new Date().toISOString(),
        items: cartItems,
        totalAmount,
        paidAmount,
        pendingAmount,
        paymentStatus,
        orderStatus: 'pending',
        observationsPublic,
        observationsInternal: observationsInternal || `Creado desde administración por ${userData?.displayName}`,
        exchangeRateUsdUsed: exchangeRate,
        exchangeRateDate: new Date().toISOString(),
        totalCost,
        totalProfit: totalAmount - totalCost
      };

      // 2. Add Order Document
      const orderRef = await addDoc(collection(db, 'orders'), orderData);
      const orderId = orderRef.id;

      // 3. Decrement Product & Material Inventory Stocks in Batch
      const batch = writeBatch(db);
      const userId = userData?.uid || 'system';

      for (const item of cartItems) {
        const prodRef = doc(db, 'products', item.productId);
        const product = products.find(p => p.id === item.productId);
        if (product) {
          const prevStock = product.stock;
          const newStock = Math.max(0, prevStock - item.quantity);
          batch.update(prodRef, { stock: newStock });

          // Log product sale movement
          const prodMov = {
            date: new Date().toISOString(),
            movementType: 'out_sale',
            itemId: item.productId,
            itemType: 'product',
            previousQuantity: prevStock,
            modifiedQuantity: -item.quantity,
            finalQuantity: newStock,
            reason: `Venta de producto en Pedido #${orderNumber}`,
            userId,
            orderId
          };
          await addDoc(collection(db, 'inventory_movements'), prodMov);

          // Deduct associated 3D materials (filaments and supplies)
          if (product.type === '3d') {
            const prod3d = product as any;

            // Deduct Filaments
            if (prod3d.filamentIds && prod3d.filamentIds.length > 0) {
              const weightPerFilament = (prod3d.weightGrams * item.quantity) / prod3d.filamentIds.length;
              for (const filamentId of prod3d.filamentIds) {
                const filRef = doc(db, 'inventory', filamentId);
                const filSnap = await getDoc(filRef);
                if (filSnap.exists()) {
                  const filData = filSnap.data();
                  const prevWeight = filData.availableWeightGrams || 0;
                  const newWeight = Math.max(0, prevWeight - weightPerFilament);

                  batch.update(filRef, { availableWeightGrams: newWeight });

                  // Log filament consumption
                  const filMov = {
                    date: new Date().toISOString(),
                    movementType: 'consumption',
                    itemId: filamentId,
                    itemType: 'filament',
                    previousQuantity: prevWeight,
                    modifiedQuantity: -weightPerFilament,
                    finalQuantity: newWeight,
                    reason: `Consumo de filamento por impresión de ${item.quantity}x "${item.name}" en Pedido #${orderNumber}`,
                    userId,
                    orderId
                  };
                  await addDoc(collection(db, 'inventory_movements'), filMov);
                }
              }
            }

            // Deduct Supplies
            if (prod3d.supplyIds && prod3d.supplyIds.length > 0) {
              for (const supplyObj of prod3d.supplyIds) {
                const supplyId = supplyObj.supplyId;
                const qtyNeeded = supplyObj.quantity * item.quantity;

                const supRef = doc(db, 'inventory', supplyId);
                const supSnap = await getDoc(supRef);
                if (supSnap.exists()) {
                  const supData = supSnap.data();
                  const prevQty = supData.currentStock || 0;
                  const newQty = Math.max(0, prevQty - qtyNeeded);

                  batch.update(supRef, { currentStock: newQty });

                  // Log supply consumption
                  const supMov = {
                    date: new Date().toISOString(),
                    movementType: 'consumption',
                    itemId: supplyId,
                    itemType: 'supply',
                    previousQuantity: prevQty,
                    modifiedQuantity: -qtyNeeded,
                    finalQuantity: newQty,
                    reason: `Consumo de insumo por venta de ${item.quantity}x "${item.name}" en Pedido #${orderNumber}`,
                    userId,
                    orderId
                  };
                  await addDoc(collection(db, 'inventory_movements'), supMov);
                }
              }
            }
          }
        }
      }
      await batch.commit();

      // Update client totals (totalPurchased and totalOwed)
      if (activeClient) {
        const clientRef = doc(db, 'clients', selectedClientId);
        const currentOwed = activeClient.totalOwed || 0;
        const currentPurchased = activeClient.totalPurchased || 0;
        await updateDoc(clientRef, {
          totalOwed: currentOwed + pendingAmount,
          totalPurchased: currentPurchased + totalAmount
        });
      }

      // 4. Register Cash Session Transaction if paidAmount > 0
      if (paidAmount > 0 && activeSession) {
        const movementData: Omit<any, 'id'> = {
          sessionId: activeSession.id,
          date: new Date().toISOString(),
          type: paidAmount === totalAmount ? 'sale_income' : 'deposit',
          amount: paidAmount,
          paymentMethod,
          orderId,
          customerId: selectedClientId,
          userId: userData?.uid || '',
          userName: userData?.displayName || 'Admin',
          observation: `${paidAmount === totalAmount ? 'Venta' : 'Seña'} de Pedido #${orderNumber} (${customerName})`
        };

        // Add movement
        await addDoc(collection(db, 'cash_movements'), movementData);

        // Update session totals
        const sessionRef = doc(db, 'cash_sessions', activeSession.id);
        const currentIncome = activeSession.totalIncome || 0;
        const currentExpected = activeSession.expectedAmount || 0;
        const breakdown = { ...(activeSession.breakdown || { cash: 0, transfer: 0, mercadopago: 0, card: 0, other: 0 }) };
        
        breakdown[paymentMethod] = (breakdown[paymentMethod] || 0) + paidAmount;

        await updateDoc(sessionRef, {
          totalIncome: currentIncome + paidAmount,
          expectedAmount: currentExpected + paidAmount,
          breakdown
        });
      }

      navigate('/orders');
    } catch (error) {
      console.error(error);
      alert("Hubo un error al guardar el pedido.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-icon">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Crear Pedido para Cliente</h1>
            <p className="text-slate-500 text-sm">Registra una venta o seña de producto asignándola a un cliente.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Product catalog lookup */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          <div className="card p-5 flex flex-col h-[72vh]">
            <h3 className="font-bold text-slate-800 text-base mb-3 flex items-center gap-2">
              <ShoppingCart size={18} className="text-blue-500" />
              Selección de Productos
            </h3>
            
            <div className="relative mb-4">
              <Search className="absolute left-3 top-3 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Buscar producto por nombre..."
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 no-scrollbar">
              {filteredProducts.map(p => {
                const basePrice = p.useManualPrice ? p.manualRetailPrice : p.calculatedRetailPrice;
                const wholesalePrice = p.calculatedWholesalePrice || basePrice;
                const isOutOfStock = p.stock <= 0;

                // Cart qty
                const cartQty = cartItems.find(item => item.productId === p.id)?.quantity || 0;

                return (
                  <div key={p.id} className={`flex items-center justify-between p-3 border rounded-xl hover:border-blue-300 hover:bg-slate-50/40 transition-colors ${isOutOfStock ? 'opacity-65' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0">
                        {p.mainImage && <img src={p.mainImage} className="w-full h-full object-cover" alt={p.name}/>}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm leading-snug">{p.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-semibold text-slate-600">${basePrice.toLocaleString('es-AR')}</span>
                          {wholesalePrice < basePrice && (
                            <span className="text-[10px] bg-purple-50 text-purple-600 border border-purple-100 font-bold px-1.5 py-0.5 rounded">
                              May: ${wholesalePrice.toLocaleString('es-AR')}
                            </span>
                          )}
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isOutOfStock ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                            Stock: {p.stock}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => addToCart(p)} 
                      disabled={isOutOfStock || cartQty >= p.stock}
                      className="btn-icon text-blue-600 hover:bg-blue-50 rounded-xl"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Order configuration and items list */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          <div className="card p-5 flex flex-col h-[72vh] justify-between">
            <div className="space-y-4 flex flex-col overflow-y-auto no-scrollbar flex-1 pb-4">
              <h3 className="font-bold text-slate-800 text-base border-b pb-2 flex items-center justify-between">
                <span>Resumen del Pedido</span>
                <span className="text-xs font-medium text-slate-400">Total ítems: {cartItems.length}</span>
              </h3>

              {/* Client Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <User size={13} className="text-slate-400" />
                  Cliente Asignado
                </label>
                <select 
                  required
                  value={selectedClientId} 
                  onChange={e => setSelectedClientId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">-- Seleccionar Cliente --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName} ({c.clientType === 'wholesale' ? 'Mayorista' : c.clientType === 'trusted' ? 'Confianza' : 'Minorista'})
                    </option>
                  ))}
                </select>
                
                {activeClient && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                      activeClient.clientType === 'wholesale' 
                        ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                        : activeClient.clientType === 'trusted' 
                        ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                        : 'bg-blue-100 text-blue-700 border border-blue-200'
                    }`}>
                      {activeClient.clientType === 'wholesale' ? 'Tarifa Mayorista' : activeClient.clientType === 'trusted' ? 'Cliente Confianza' : 'Tarifa Minorista'}
                    </span>
                    {isTrustedClient && (
                      <span className="text-[10px] text-amber-600 flex items-center gap-0.5 font-semibold">
                        <Sparkles size={11} /> Seña no requerida
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Cart Items list */}
              <div className="flex-1 border rounded-lg p-3 bg-slate-50/40 space-y-2 overflow-y-auto no-scrollbar min-h-[160px]">
                {cartItems.length === 0 && (
                  <div className="text-center py-10 text-slate-400 flex flex-col items-center justify-center h-full">
                    <ShoppingCart size={32} className="opacity-30 mb-2" />
                    <p className="text-xs">El pedido está vacío.</p>
                  </div>
                )}
                
                {cartItems.map(item => (
                  <div key={item.productId} className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-sm gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-xs truncate">{item.name}</p>
                      <p className="text-[10px] text-slate-500 font-medium">
                        ${item.unitPrice.toLocaleString('es-AR')} c/u 
                        {item.appliedWholesale && <span className="text-purple-600 font-bold ml-1">(May)</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        min="1"
                        value={item.quantity}
                        onChange={e => updateQuantity(item.productId, Number(e.target.value))}
                        className="w-12 p-1 border rounded text-center text-xs font-semibold"
                      />
                      <button onClick={() => updateQuantity(item.productId, 0)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Observation Fields */}
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Observaciones para el cliente</label>
                  <input 
                    type="text" 
                    value={observationsPublic} 
                    onChange={e => setObservationsPublic(e.target.value)}
                    placeholder="Ej. Entregar envuelto para regalo..."
                    className="w-full border rounded-lg p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Observaciones internas (dueño)</label>
                  <input 
                    type="text" 
                    value={observationsInternal} 
                    onChange={e => setObservationsInternal(e.target.value)}
                    placeholder="Ej. Revisar calidad del filamento rojo..."
                    className="w-full border rounded-lg p-2 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Calculations and Actions Footer */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Subtotal pedido:</span>
                  <span className="font-bold text-slate-800 text-sm">${totalAmount.toLocaleString('es-AR')}</span>
                </div>
                
                {/* Paid Amount */}
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium flex items-center gap-1">
                    Monto Abonado (Seña):
                    {!isDepositValid && (
                      <span className="text-red-500" title={`Mínimo requerido $${minDepositRequired}`}>
                        <AlertCircle size={12} />
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      min="0" 
                      max={totalAmount}
                      value={paidAmount || ''} 
                      onChange={e => setPaidAmount(Number(e.target.value))}
                      className="w-24 p-1 border rounded text-right font-bold text-xs"
                      placeholder="$0"
                    />
                  </div>
                </div>

                {/* Minimum Deposit Note */}
                {minDepositRequired > 0 && !bypassDeposit && (
                  <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5 border-t border-slate-200/50 pt-1.5">
                    <Info size={11} className="text-blue-500 flex-shrink-0" />
                    <span>Seña mínima: <strong className="text-slate-700">${minDepositRequired.toLocaleString('es-AR')}</strong> ({requiredDepositPercent}%)</span>
                  </div>
                )}

                {/* Payment Method Selector if paidAmount > 0 */}
                {paidAmount > 0 && (
                  <div className="flex justify-between items-center text-xs pt-1.5 border-t border-slate-200/50">
                    <span className="text-slate-500 font-medium flex items-center gap-1">
                      <CreditCard size={12} className="text-slate-400" /> Método de pago:
                    </span>
                    <select
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value as any)}
                      className="border rounded px-1.5 py-0.5 text-xs bg-white font-semibold"
                    >
                      <option value="cash">Efectivo</option>
                      <option value="transfer">Transferencia</option>
                      <option value="mercadopago">MercadoPago</option>
                      <option value="card">Tarjeta</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                )}
                
                {/* Cash Session Status warning */}
                {paidAmount > 0 && !activeSession && (
                  <div className="bg-red-50 text-red-700 border border-red-100 rounded-lg p-2 mt-1.5 text-[10px] flex items-center gap-1.5 font-semibold">
                    <AlertCircle size={13} className="flex-shrink-0" />
                    <span>La caja diaria está cerrada. No se registrará el pago.</span>
                  </div>
                )}

                <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200 font-bold">
                  <span className="text-slate-600">Saldo Pendiente:</span>
                  <span className={`text-sm ${pendingAmount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    ${pendingAmount.toLocaleString('es-AR')}
                  </span>
                </div>
              </div>

              <button 
                onClick={handleCreateOrder}
                disabled={loading || cartItems.length === 0 || !selectedClientId || (!isDepositValid && !bypassDeposit)}
                className="w-full btn-primary py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creando pedido...' : 'Confirmar y Crear Pedido'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
