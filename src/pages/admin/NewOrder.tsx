import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, addDoc, getCountFromServer, doc, getDoc, updateDoc, writeBatch, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Product } from '../../types/product';
import type { Order } from '../../types/order';
import type { Client } from '../../types/client';
import { migrateClient, getClientLabel } from '../../types/client';
import type { ExchangeRateData, DepositSettings, PricingSettings3D } from '../../types/settings';
import type { CashSession, PaymentMethod } from '../../types/cash';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Plus, Trash2, ShoppingCart, User, CreditCard, AlertCircle, Sparkles, Info, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getTierPrice, recalculateAllProductsInFirestore } from '../../services/pricingService';
import { NumericInput } from '../../components/NumericInput';

export const NewOrder: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [clientSearchTerm, setClientSearchTerm] = useState('');

  // Sort and filter clients alphabetically
  const sortedAndFilteredClients = useMemo(() => {
    const sorted = [...clients].sort((a, b) => {
      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
      return nameA.localeCompare(nameB, 'es');
    });
    if (!clientSearchTerm.trim()) return sorted;
    const term = clientSearchTerm.toLowerCase();
    return sorted.filter(c => 
      c.firstName.toLowerCase().includes(term) || 
      c.lastName.toLowerCase().includes(term)
    );
  }, [clients, clientSearchTerm]);

  const [cartItems, setCartItems] = useState<any[]>([]);
  const [paidAmount, setPaidAmount] = useState<number | ''>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [observationsPublic, setObservationsPublic] = useState('');
  const [observationsInternal, setObservationsInternal] = useState('');
  const [loading, setLoading] = useState(false);

  // Settings & Exchange Rate
  const [depositSettings, setDepositSettings] = useState<DepositSettings | null>(null);
  const [pricing3dSettings, setPricing3dSettings] = useState<PricingSettings3D | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(1000);
  
  // Daily Cash active session
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);

  const { userData } = useAuth();
  const navigate = useNavigate();

  // Load products, clients, settings, active cash session in real-time
  useEffect(() => {
    // Run an automatic recalculation to ensure manual-priced product wholesale values are accurate
    recalculateAllProductsInFirestore().catch(err => console.error('Recalculation error:', err));

    // 1. Live products listener
    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });

    // 2. Live clients listener
    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      setClients(snap.docs.map(d => migrateClient({ id: d.id, ...d.data() }) as Client));
    });

    // 3. Live deposit settings listener
    const unsubDeposit = onSnapshot(doc(db, 'settings', 'deposit'), (snap) => {
      if (snap.exists()) setDepositSettings(snap.data() as DepositSettings);
    });

    // 4. Live exchange rate listener
    const unsubRate = onSnapshot(doc(db, 'settings', 'exchangeRate'), (snap) => {
      if (snap.exists()) setExchangeRate((snap.data() as ExchangeRateData).currentUsdToArs);
    });

    // 4b. Live pricing3d settings listener
    const unsubPricing3d = onSnapshot(doc(db, 'settings', 'pricing3d'), (snap) => {
      if (snap.exists()) setPricing3dSettings(snap.data() as PricingSettings3D);
    });

    // 5. Live active cash session listener
    const qSession = query(collection(db, 'cash_sessions'), where('status', '==', 'open'));
    const unsubSession = onSnapshot(qSession, (snap) => {
      if (!snap.empty) {
        setActiveSession({ id: snap.docs[0].id, ...snap.docs[0].data() } as CashSession);
      } else {
        setActiveSession(null);
      }
    });

    return () => {
      unsubProducts();
      unsubClients();
      unsubDeposit();
      unsubRate();
      unsubPricing3d();
      unsubSession();
    };
  }, []);

  // Filter products by name
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  // Active client details
  const activeClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId) || null;
  }, [selectedClientId, clients]);

  // Compute unit price for a product based on current selected client and cart quantity
  const calculateItemPrice = (product: Product, quantity: number, client: Client | null, total3DWeight = 0, allAreKeychains = false) => {
    // 0. If product has price tiers, it ignores wholesale client / threshold discounts and uses tier price
    if (product.priceTiers && product.priceTiers.length > 0) {
      const basePrice = product.useManualPrice ? product.manualRetailPrice : product.calculatedRetailPrice;
      return getTierPrice(quantity, basePrice, product.priceTiers);
    }

    const isClientWholesale = client?.isWholesale ?? false;
    const threshold = allAreKeychains
      ? (pricing3dSettings?.wholesaleThresholdGramsKeychain ?? 600)
      : (pricing3dSettings?.wholesaleThresholdGramsNormal ?? 1000);
    const meetsThreshold = product.type === '3d' && total3DWeight >= threshold;
    const isWholesale = isClientWholesale || meetsThreshold;
    
    // 1. If wholesale client or meets weight threshold, use product calculated wholesale price
    if (isWholesale) {
      if (product.calculatedWholesalePrice) {
        // Safeguard: if for some reason the wholesale price in DB is higher than manual retail, apply a default 20% discount
        if (product.useManualPrice && product.calculatedWholesalePrice > product.manualRetailPrice) {
          return Math.ceil(product.manualRetailPrice * 0.8);
        }
        return product.calculatedWholesalePrice;
      }
      
      // Dynamic fallback
      const basePrice = product.useManualPrice ? product.manualRetailPrice : product.calculatedRetailPrice;
      return Math.ceil(basePrice * 0.8); // 20% default wholesale fallback if not calculated in DB
    }
    
    // 2. Otherwise (minorista / trusted), apply tier pricing if available
    const basePrice = product.useManualPrice ? product.manualRetailPrice : product.calculatedRetailPrice;
    return getTierPrice(quantity, basePrice, product.priceTiers);
  };

  // Recalculate cart item prices whenever the client or items change
  const recalculateCart = (items: any[], client: Client | null) => {
    // 1. Calculate total weight of 3D products in the items list
    let total3DWeight = 0;
    let has3D = false;
    let allAreKeychains = true;
    
    items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product && product.type === '3d') {
        has3D = true;
        total3DWeight += (product.weightGrams || 0) * (item.quantity === '' ? 0 : Number(item.quantity));
        if (product.category !== 'Llaveros') {
          allAreKeychains = false;
        }
      }
    });
    if (!has3D) allAreKeychains = false;

    const threshold = allAreKeychains
      ? (pricing3dSettings?.wholesaleThresholdGramsKeychain ?? 600)
      : (pricing3dSettings?.wholesaleThresholdGramsNormal ?? 1000);

    return items.map(item => {
      const product = products.find(p => p.id === item.productId);
      if (!product) return item;
      const unitPrice = calculateItemPrice(product, (item.quantity as any) === '' ? 1 : Number(item.quantity), client, total3DWeight, allAreKeychains);
      const hasTiers = product.priceTiers && product.priceTiers.length > 0;
      const isWholesaleApplied = !hasTiers && ((client?.isWholesale ?? false) || (product.type === '3d' && total3DWeight >= threshold));
      return {
        ...item,
        unitPrice,
        unitProfit: unitPrice - (product.calculatedCost || 0),
        appliedWholesale: isWholesaleApplied || !!(hasTiers && unitPrice < (product.useManualPrice ? product.manualRetailPrice : product.calculatedRetailPrice))
      };
    });
  };

  // Trigger cart updates when selected client changes
  useEffect(() => {
    if (cartItems.length > 0) {
      setCartItems(prev => recalculateCart(prev, activeClient));
    }
  }, [selectedClientId, products, pricing3dSettings]);

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
          appliedWholesale: activeClient?.isWholesale ?? false,
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
  const updateQuantity = (productId: string, quantity: number | '') => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (quantity !== '' && quantity > product.stock) {
      alert(`Stock insuficiente. Disponible: ${product.stock}`);
      return;
    }

    setCartItems(prev => {
      let updatedList;
      if (quantity !== '' && quantity <= 0) {
        updatedList = prev.filter(i => i.productId !== productId);
      } else {
        updatedList = prev.map(i => i.productId === productId ? { ...i, quantity } : i);
      }
      return recalculateCart(updatedList, activeClient);
    });
  };

  // Order totals
  const totalAmount = cartItems.reduce((acc, item) => acc + (item.unitPrice * ((item.quantity as any) === '' ? 0 : Number(item.quantity))), 0);
  const totalCost = cartItems.reduce((acc, item) => acc + (item.unitCost * ((item.quantity as any) === '' ? 0 : Number(item.quantity))), 0);
  const paidAmountAmt = paidAmount === '' ? 0 : Number(paidAmount);
  const pendingAmount = Math.max(0, totalAmount - paidAmountAmt);

  // Deposit/Signal requirement calculations
  const requiredDepositPercent = depositSettings?.requiredDepositPercent || 30; // default 30%
  const isTrustedClient = activeClient?.isTrusted ?? false;
  const bypassDeposit = isTrustedClient && (depositSettings?.trustedClientBypassDeposit ?? true);
  
  const minDepositRequired = bypassDeposit ? 0 : Math.ceil(totalAmount * (requiredDepositPercent / 100));
  const isDepositValid = paidAmountAmt >= minDepositRequired || bypassDeposit;

  // Handle Order Submit
  const handleCreateOrder = async () => {
    if (cartItems.length === 0) return alert("Agrega productos al pedido.");
    if (!selectedClientId) return alert("Selecciona un cliente.");
    
    // Validate that all items have a valid quantity
    const hasInvalidQty = cartItems.some(item => (item.quantity as any) === '' || item.quantity <= 0);
    if (hasInvalidQty) {
      return alert("Por favor, ingresa una cantidad válida (mayor a 0) para todos los productos en el carrito.");
    }

    if (paidAmountAmt > totalAmount) return alert("El monto abonado no puede superar el total del pedido.");
    
    // Deposit check
    if (paidAmountAmt < minDepositRequired && !bypassDeposit) {
      return alert(`La seña mínima requerida para este pedido es de $${minDepositRequired.toLocaleString('es-AR')} (${requiredDepositPercent}%).`);
    }

    // Cash session check if there's a payment
    if (paidAmountAmt > 0 && !activeSession) {
      return alert("La caja diaria está cerrada. Abre la caja en la sección de Caja para poder registrar pagos, o establece la seña en $0.");
    }

    setLoading(true);
    
    try {
      // 1. Sequential order number
      const coll = collection(db, 'orders');
      const snapshot = await getCountFromServer(coll);
      const orderNumber = snapshot.data().count + 1;

      let paymentStatus: Order['paymentStatus'] = 'unpaid';
      if (paidAmountAmt > 0 && paidAmountAmt < totalAmount) paymentStatus = 'partial';
      else if (paidAmountAmt >= totalAmount) paymentStatus = 'paid';

      const customerName = activeClient ? `${activeClient.firstName} ${activeClient.lastName}` : 'Cliente Eventual';

      const sanitizedItems = cartItems.map(item => ({ ...item, quantity: Number(item.quantity) }));

      const orderData: Omit<Order, 'id'> = {
        orderNumber,
        customerId: selectedClientId,
        customerName,
        date: new Date().toISOString(),
        items: sanitizedItems,
        totalAmount,
        paidAmount: paidAmountAmt,
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
      const saleLines: {
        itemId: string;
        itemType: 'filament' | 'supply' | 'product';
        lineType: 'out_sale' | 'consumption';
        modifiedQuantity: number;
        previousQuantity: number;
        finalQuantity: number;
      }[] = [];

      for (const item of sanitizedItems) {
        const prodRef = doc(db, 'products', item.productId);
        const product = products.find(p => p.id === item.productId);
        if (product) {
          const qty = item.quantity;
          const prevStock = product.stock;
          const newStock = Math.max(0, prevStock - qty);
          batch.update(prodRef, { stock: newStock });

          saleLines.push({
            itemId: item.productId,
            itemType: 'product',
            lineType: 'out_sale',
            previousQuantity: prevStock,
            modifiedQuantity: -qty,
            finalQuantity: newStock,
          });

          // Deduct associated 3D materials (filaments and supplies)
          if (product.type === '3d') {
            const prod3d = product as any;

            // Deduct Filaments (gramos exactos por línea si están definidos)
            const filamentLines = prod3d.filamentLines?.length
              ? prod3d.filamentLines
              : (prod3d.filamentIds ?? []).map((filamentId: string) => ({
                  supplyId: filamentId,
                  grams: (prod3d.weightGrams * qty) / Math.max(1, prod3d.filamentIds.length),
                }));

            for (const line of filamentLines) {
              const filamentId = line.supplyId;
              const weightToDeduct = (line.grams || 0) * qty;
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

            // Deduct Supplies
            if (prod3d.supplyIds && prod3d.supplyIds.length > 0) {
              for (const supplyObj of prod3d.supplyIds) {
                const supplyId = supplyObj.supplyId;
                const qtyNeeded = supplyObj.quantity * qty;

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
          reason: `Venta · Pedido #${orderNumber}`,
          userId,
          orderId,
          lines: saleLines,
        });
      }

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

      // 4. Register Cash Session Transaction if paidAmountAmt > 0
      if (paidAmountAmt > 0 && activeSession) {
        const movementData: Omit<any, 'id'> = {
          sessionId: activeSession.id,
          date: new Date().toISOString(),
          type: paidAmountAmt === totalAmount ? 'sale_income' : 'deposit',
          amount: paidAmountAmt,
          paymentMethod,
          orderId,
          customerId: selectedClientId,
          userId: userData?.uid || '',
          userName: userData?.displayName || 'Admin',
          observation: `${paidAmountAmt === totalAmount ? 'Venta' : 'Seña'} de Pedido #${orderNumber} (${customerName})`
        };

        // Add movement
        await addDoc(collection(db, 'cash_movements'), movementData);

        // Update session totals
        const sessionRef = doc(db, 'cash_sessions', activeSession.id);
        const currentIncome = activeSession.totalIncome || 0;
        const currentExpected = activeSession.expectedAmount || 0;
        const breakdown = { ...(activeSession.breakdown || { cash: 0, transfer: 0, mercadopago: 0, card: 0, other: 0 }) };
        
        breakdown[paymentMethod] = (breakdown[paymentMethod] || 0) + paidAmountAmt;

        await updateDoc(sessionRef, {
          totalIncome: currentIncome + paidAmountAmt,
          expectedAmount: currentExpected + paidAmountAmt,
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
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <User size={13} className="text-slate-400" />
                  Cliente Asignado
                </label>
                
                {/* Search input for clients */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Buscar cliente por nombre/apellido..."
                    value={clientSearchTerm}
                    onChange={(e) => setClientSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50/50 focus:ring-2 focus:ring-blue-500"
                  />
                  {clientSearchTerm && (
                    <button
                      onClick={() => setClientSearchTerm('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <select 
                  required
                  value={selectedClientId} 
                  onChange={e => setSelectedClientId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">-- Seleccionar Cliente --</option>
                  {sortedAndFilteredClients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName} ({getClientLabel(c)})
                    </option>
                  ))}
                </select>
                
                {activeClient && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {activeClient.isWholesale && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
                        Tarifa Mayorista
                      </span>
                    )}
                    {!activeClient.isWholesale && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200">
                        Tarifa Minorista
                      </span>
                    )}
                    {activeClient.isTrusted && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                        De Confianza
                      </span>
                    )}
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
                      <NumericInput 
                        value={item.quantity}
                        onChange={val => updateQuantity(item.productId, val)}
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
                    <NumericInput 
                      value={paidAmount} 
                      onChange={val => setPaidAmount(val)}
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
                {paidAmountAmt > 0 && (
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
                {paidAmountAmt > 0 && !activeSession && (
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
