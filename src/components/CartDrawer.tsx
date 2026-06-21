import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowLeft, AlertCircle, Info, CreditCard, User, Sparkles, Loader2, ShoppingCart, Share2, Copy, CheckCircle2, Calendar } from 'lucide-react';
import { useCartStore } from '../store/cartStore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, onSnapshot, collection, query, where, addDoc, writeBatch, getDoc, getCountFromServer } from 'firebase/firestore';
import { estimateDeliveryTime, type EstimationResult } from '../utils/deliveryEstimator';
import { roundPriceUp100, deepestTierScopeCategoryId, aggregatedQtyByScope } from '../services/pricingService';
import { SearchableClientSelect } from './SearchableClientSelect';
import { NumericInput } from './NumericInput';
import type { Client } from '../types/client';
import type { Category } from '../types/category';
import type { VariantGroup } from '../types/variantGroup';

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
  const { isDrawerOpen, closeDrawer, items, getTotalPrice, removeItem, updateQuantity, clearCart } = useCartStore();
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();

  // Admin order creation states
  const [view, setView] = useState<'cart' | 'checkout'>('cart');
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [paidAmount, setPaidAmount] = useState<number | ''>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'mercadopago' | 'card' | 'other'>('cash');
  const [observationsPublic, setObservationsPublic] = useState('');
  const [observationsInternal, setObservationsInternal] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Share draft order states
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Configuration settings
  const [pricingSettings, setPricingSettings] = useState<any>(null);
  const [depositSettings, setDepositSettings] = useState<any>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(1000);
  const [businessSettings, setBusinessSettings] = useState<any>(null);
  const [deliveryEstimation, setDeliveryEstimation] = useState<EstimationResult | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [variantGroups, setVariantGroups] = useState<VariantGroup[]>([]);

  const discountPercentNormal = pricingSettings?.wholesaleDiscountPercentNormal ?? 15;
  const discountPercentKeychain = pricingSettings?.wholesaleDiscountPercentKeychain ?? 10;
  const thresholdNormal = pricingSettings?.wholesaleThresholdGramsNormal ?? 1000;
  const thresholdKeychain = pricingSettings?.wholesaleThresholdGramsKeychain ?? 600;

  // Real-time listeners when drawer is open
  useEffect(() => {
    if (!isDrawerOpen) return;

    // 1. Pricing 3D settings
    const unsubPricing = onSnapshot(doc(db, 'settings', 'pricing3d'), (snap) => {
      if (snap.exists()) setPricingSettings(snap.data());
    });

    // 2. Deposit settings
    const unsubDeposit = onSnapshot(doc(db, 'settings', 'deposit'), (snap) => {
      if (snap.exists()) setDepositSettings(snap.data());
    });

    // 3. Exchange rate settings
    const unsubRate = onSnapshot(doc(db, 'settings', 'exchangeRate'), (snap) => {
      if (snap.exists()) setExchangeRate(snap.data()?.currentUsdToArs || 1000);
    });

    // 4. Clients listener
    const qClients = userData?.role === 'employee'
      ? query(collection(db, 'clients'), where('employeeId', '==', userData.uid))
      : query(collection(db, 'clients'));
    const unsubClients = onSnapshot(qClients, (snap) => {
      setClients(snap.docs.map(d => {
        const raw = d.data();
        const hasNewFields = typeof raw.isWholesale === 'boolean';
        const migrated = (hasNewFields ? raw : {
          ...raw,
          isWholesale: raw.clientType === 'wholesale',
          isTrusted: raw.clientType === 'trusted',
        });
        if (migrated.isLocal === undefined) {
          migrated.isLocal = false;
        }
        return { id: d.id, ...migrated } as Client;
      }));
    });

    // 5. Active cash session listener
    const qSession = query(collection(db, 'cash_sessions'), where('status', '==', 'open'));
    const unsubSession = onSnapshot(qSession, (snap) => {
      const openSessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const mySession = openSessions.find((s: any) => s.openedBy === userData?.uid) || null;
      setActiveSession(mySession);
    });

    // 6. Categories listener
    const unsubCategories = onSnapshot(collection(db, 'categories'), (snap) => {
      const cats: Category[] = [];
      snap.forEach((d) => {
        cats.push({ id: d.id, ...d.data() } as Category);
      });
      setCategories(cats);
    });

    // 7. Variant groups listener
    const unsubVariantGroups = onSnapshot(collection(db, 'variantGroups'), (snap) => {
      const groups: VariantGroup[] = [];
      snap.forEach((d) => {
        groups.push({ id: d.id, ...d.data() } as VariantGroup);
      });
      setVariantGroups(groups);
    });

    // 8. Business settings listener
    const unsubBusiness = onSnapshot(doc(db, 'settings', 'business'), (snap) => {
      if (snap.exists()) setBusinessSettings(snap.data());
    });
 
     return () => {
       unsubPricing();
       unsubDeposit();
       unsubRate();
       unsubClients();
       unsubSession();
       unsubCategories();
       unsubVariantGroups();
       unsubBusiness();
     };
   }, [isDrawerOpen, userData]);

  // Estimate delivery time reactively
  useEffect(() => {
    if (items.length > 0) {
      estimateDeliveryTime(
        items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          type: item.type,
        }))
      )
        .then((res) => {
          setDeliveryEstimation(res);
        })
        .catch((err) => {
          console.error('Error estimating delivery time in CartDrawer:', err);
        });
    } else {
      setDeliveryEstimation(null);
    }
  }, [items]);

  // Reset drawer state on close/open
  useEffect(() => {
    if (!isDrawerOpen && !shareModalOpen) {
      setView('cart');
      setSelectedClientId('');
      setPaidAmount(0);
      setPaymentMethod('cash');
      setObservationsPublic('');
      setObservationsInternal('');
    }
  }, [isDrawerOpen, shareModalOpen]);

  if (!isDrawerOpen && !shareModalOpen) return null;

  const isAdmin = userData?.role === 'owner' || userData?.role === 'employee';

  // Sort clients alphabetically
  const sortedClients = [...clients].sort((a, b) => {
    const nameA = `${a.lastName || ''} ${a.firstName || ''}`.toLowerCase();
    const nameB = `${b.lastName || ''} ${b.firstName || ''}`.toLowerCase();
    return nameA.localeCompare(nameB, 'es');
  });

  // Calculate weights for progress
  let weightNormal = 0;
  let weightKeychain = 0;
  items.forEach(item => {
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

  const meetsNormal = weightNormal >= thresholdNormal;
  const meetsKeychain = weightKeychain >= thresholdKeychain;

  const activeClient = clients.find(c => c.id === selectedClientId);

  // Dynamic total amount calculation based on active client's wholesale status
  const totalAmount = (() => {
    let sum = 0;
    const hasClientWholesale = activeClient?.isWholesale === true;
    
    items.forEach(item => {
      const meetsThreshold = item.isKeychain ? meetsKeychain : meetsNormal;
      const appliesWholesale = (item.type === '3d' && (hasClientWholesale || meetsThreshold));
      
      if (item.resolvedPriceTiers && item.resolvedPriceTiers.length > 0) {
        sum += item.price * item.quantity;
      } else if (appliesWholesale) {
        const discountPercent = item.isKeychain ? discountPercentKeychain : discountPercentNormal;
        const wholesalePrice = roundPriceUp100(item.basePrice * (1 - discountPercent / 100));
        sum += wholesalePrice * item.quantity;
      } else {
        sum += item.basePrice * item.quantity;
      }
    });
    return sum;
  })();

  const isTrustedClient = activeClient?.isTrusted ?? false;
  const bypassDeposit = isTrustedClient && (depositSettings?.trustedClientBypassDeposit ?? true);
  const requiredDepositPercent = depositSettings?.requiredDepositPercent ?? 30;
  const minDepositRequired = bypassDeposit ? 0 : Math.ceil(totalAmount * (requiredDepositPercent / 100));
  
  const paidAmountAmt = paidAmount === '' ? 0 : Number(paidAmount);
  const isDepositValid = bypassDeposit || paidAmountAmt >= minDepositRequired;
  const pendingAmount = Math.max(0, totalAmount - paidAmountAmt);

  const handleCheckout = () => {
    if (!currentUser) {
      alert('Debes iniciar sesión para comprar.');
      return;
    }
    if (items.length === 0) return;
    closeDrawer();
    navigate('/checkout');
  };

  const handleCheckoutClick = () => {
    if (isAdmin) {
      setView('checkout');
    } else {
      handleCheckout();
    }
  };

  const handleCreateOrder = async () => {
    if (!selectedClientId) {
      alert("Por favor, selecciona un cliente.");
      return;
    }
    if (!isDepositValid && !bypassDeposit) {
      alert(`La seña mínima requerida es $${minDepositRequired.toLocaleString('es-AR')}`);
      return;
    }

    setSubmitting(true);
    try {
      if (!activeClient) throw new Error("Cliente no encontrado.");

      // 1. Get next order number
      const countSnapshot = await getCountFromServer(collection(db, 'orders'));
      const orderNumber = countSnapshot.data().count + 1;

      // 2. Prepare items for order
      const hasClientWholesale = activeClient.isWholesale === true;
      const orderItemsRaw = items.map(item => {
        const meetsThreshold = item.isKeychain ? meetsKeychain : meetsNormal;
        const appliesWholesale = (item.type === '3d' && (hasClientWholesale || meetsThreshold));
        
        let finalPrice = item.price;
        if (item.resolvedPriceTiers && item.resolvedPriceTiers.length > 0) {
          finalPrice = item.price;
        } else if (appliesWholesale) {
          const discountPercent = item.isKeychain ? discountPercentKeychain : discountPercentNormal;
          finalPrice = roundPriceUp100(item.basePrice * (1 - discountPercent / 100));
        } else {
          finalPrice = item.basePrice;
        }

        return {
          productId: item.productId,
          name: item.name,
          type: item.type,
          quantity: item.quantity,
          unitPrice: finalPrice,
          appliedWholesale: appliesWholesale,
          imageUrl: item.imageUrl || '',
          isManualPrice: false
        };
      });

      // Resolve cost from db for accuracy
      const resolvedOrderItems = await Promise.all(
        orderItemsRaw.map(async (oItem) => {
          const prodSnap = await getDoc(doc(db, 'products', oItem.productId));
          const prodData = prodSnap.exists() ? prodSnap.data() : null;
          const unitCost = prodData ? prodData.calculatedCost || 0 : 0;
          return {
            ...oItem,
            unitCost,
            unitProfit: oItem.unitPrice - unitCost
          };
        })
      );

      const totalCost = resolvedOrderItems.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);

      const isEmployeeCreator = userData?.role === 'employee';
      let employeeId = isEmployeeCreator ? userData.uid : (activeClient?.employeeId || undefined);
      let employeeName = isEmployeeCreator ? (userData.displayName || userData.email || 'Colaborador') : (activeClient?.employeeName || undefined);

      const commissionPercent = pricingSettings?.employeeCommissionPercent ?? 10;
      const totalProfit = totalAmount - totalCost;
      
      let commissionAmount: number | undefined = undefined;
      if (employeeId) {
        if (isEmployeeCreator) {
          commissionAmount = Number(Math.max(0, totalProfit * (commissionPercent / 100)).toFixed(2));
        } else {
          const profit3D = resolvedOrderItems
            .filter(item => item.type === '3d')
            .reduce((sum, item) => sum + (item.unitProfit * item.quantity), 0);
          commissionAmount = Number(Math.max(0, profit3D * (commissionPercent / 100)).toFixed(2));
        }
      }
      const commissionPaidStatus = employeeId ? 'pending' : undefined;

      const orderData = {
        orderNumber,
        customerId: selectedClientId,
        customerName: `${activeClient.firstName} ${activeClient.lastName}`,
        date: new Date().toISOString(),
        items: resolvedOrderItems,
        totalAmount,
        paidAmount: paidAmountAmt,
        pendingAmount,
        paymentStatus: paidAmountAmt >= totalAmount ? 'paid' : (paidAmountAmt > 0 ? 'partial' : 'unpaid'),
        orderStatus: 'pending',
        observationsPublic,
        observationsInternal,
        exchangeRateUsdUsed: exchangeRate,
        exchangeRateDate: new Date().toISOString(),
        totalCost,
        totalProfit,
        ...(employeeId ? {
          commissionEmployeeId: employeeId,
          commissionEmployeeName: employeeName || 'Colaborador',
          commissionPercent,
          commissionAmount,
          commissionPaidStatus
        } : {})
      };

      // 4. Batch transaction updates
      const batch = writeBatch(db);

      // Save order doc
      const newOrderRef = doc(collection(db, 'orders'));
      batch.set(newOrderRef, orderData);

      // Update client balances
      const clientRef = doc(db, 'clients', selectedClientId);
      batch.update(clientRef, {
        totalPurchased: (activeClient.totalPurchased || 0) + totalAmount,
        totalOwed: (activeClient.totalOwed || 0) + pendingAmount,
      });

      // Update cash register if paidAmountAmt > 0
      if (paidAmountAmt > 0 && activeSession) {
        const sessionRef = doc(db, 'cash_sessions', activeSession.id);
        const currentIncome = activeSession.totalIncome || 0;
        const currentExpected = activeSession.expectedAmount || 0;
        const breakdown = { ...(activeSession.breakdown || { cash: 0, transfer: 0, mercadopago: 0, card: 0, other: 0 }) };
        
        breakdown[paymentMethod] = (breakdown[paymentMethod] || 0) + paidAmountAmt;
        
        batch.update(sessionRef, {
          totalIncome: currentIncome + paidAmountAmt,
          expectedAmount: currentExpected + paidAmountAmt,
          breakdown,
          transactionsCount: (activeSession.transactionsCount || 0) + 1,
        });

        // Add cash movement record
        const transRef = doc(collection(db, 'cash_transactions'));
        batch.set(transRef, {
          sessionId: activeSession.id,
          date: new Date().toISOString(),
          type: 'income',
          amount: paidAmountAmt,
          method: paymentMethod,
          description: `Seña Pedido #${orderNumber} (${activeClient.firstName} ${activeClient.lastName})`,
          orderId: newOrderRef.id,
          createdBy: userData?.uid || 'system',
        });
      }

      // Deduct inventory stock
      const saleLines: Array<any> = [];
      for (const item of resolvedOrderItems) {
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

          if (product.type === '3d') {
            const filamentLines = product.filamentLines?.length
              ? product.filamentLines
              : (product.filamentIds ?? []).map((filamentId: string) => ({
                  supplyId: filamentId,
                  grams: (product.weightGrams * item.quantity) / Math.max(1, product.filamentIds?.length || 1),
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
                  relatedProductId: item.productId,
                });
              }
            }

            if (product.supplyIds?.length) {
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
                    relatedProductId: item.productId,
                  });
                }
              }
            }
          }
        }
      }

      await batch.commit();

      // Write inventory movements
      if (saleLines.length > 0) {
        await addDoc(collection(db, 'inventory_movements'), {
          date: new Date().toISOString(),
          movementType: 'sale',
          reason: `Venta · Pedido #${orderNumber} (Catálogo)`,
          userId: userData?.uid || 'system',
          orderId: newOrderRef.id,
          lines: saleLines,
        });
      }

      alert(`¡Pedido #${orderNumber} creado con éxito!`);
      clearCart();
      setView('cart');
      closeDrawer();
    } catch (err: any) {
      console.error(err);
      alert(`Error al crear el pedido: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleShareDraftOrder = async () => {
    if (items.length === 0) return alert('Agrega al menos un producto al pedido.');
    if (!selectedClientId) return alert('Selecciona un cliente para compartir el pedido.');

    setShareLoading(true);
    try {
      const customerName = activeClient ? `${activeClient.firstName} ${activeClient.lastName}` : 'Cliente';
      
      const hasClientWholesale = activeClient?.isWholesale === true;
      const orderItemsRaw = items.map(item => {
        const meetsThreshold = item.isKeychain ? meetsKeychain : meetsNormal;
        const appliesWholesale = (item.type === '3d' && (hasClientWholesale || meetsThreshold));
        
        let finalPrice = item.price;
        if (item.resolvedPriceTiers && item.resolvedPriceTiers.length > 0) {
          finalPrice = item.price;
        } else if (appliesWholesale) {
          const discountPercent = item.isKeychain ? discountPercentKeychain : discountPercentNormal;
          finalPrice = roundPriceUp100(item.basePrice * (1 - discountPercent / 100));
        } else {
          finalPrice = item.basePrice;
        }

        return {
          productId: item.productId,
          name: item.name,
          type: item.type,
          quantity: item.quantity,
          unitPrice: finalPrice,
          appliedWholesale: appliesWholesale,
          imageUrl: item.imageUrl || '',
          isManualPrice: false
        };
      });

      // Resolve cost from db for accuracy
      const resolvedOrderItems = await Promise.all(
        orderItemsRaw.map(async (oItem) => {
          const prodSnap = await getDoc(doc(db, 'products', oItem.productId));
          const prodData = prodSnap.exists() ? prodSnap.data() : null;
          const unitCost = prodData ? prodData.calculatedCost || 0 : 0;
          return {
            ...oItem,
            unitCost,
            unitProfit: oItem.unitPrice - unitCost
          };
        })
      );

      const totalCost = resolvedOrderItems.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
      const totalProfit = totalAmount - totalCost;

      const isEmployeeCreator = userData?.role === 'employee';
      const employeeId = isEmployeeCreator ? userData.uid : activeClient?.employeeId;
      const employeeName = isEmployeeCreator ? (userData.displayName || userData.email || 'Colaborador') : activeClient?.employeeName;
      const commissionPercent = pricingSettings?.employeeCommissionPercent ?? 10;
      
      let commissionAmount: number | undefined = undefined;
      if (employeeId) {
        if (isEmployeeCreator) {
          commissionAmount = Number(Math.max(0, totalProfit * (commissionPercent / 100)).toFixed(2));
        } else {
          const profit3D = resolvedOrderItems
            .filter(item => item.type === '3d')
            .reduce((sum, item) => sum + (item.unitProfit * item.quantity), 0);
          commissionAmount = Number(Math.max(0, profit3D * (commissionPercent / 100)).toFixed(2));
        }
      }
      const commissionPaidStatus = employeeId ? 'pending' : undefined;

      const draftData = {
        orderNumber: 0,
        customerId: selectedClientId,
        customerName,
        date: new Date().toISOString(),
        items: resolvedOrderItems,
        totalAmount,
        paidAmount: 0,
        pendingAmount: totalAmount,
        paymentStatus: 'unpaid' as const,
        orderStatus: 'draft' as const,
        observationsPublic: observationsPublic || '',
        observationsInternal: `Borrador compartido por ${userData?.displayName || 'owner'} desde catálogo`,
        exchangeRateUsdUsed: exchangeRate,
        exchangeRateDate: new Date().toISOString(),
        totalCost,
        totalProfit,
        sharedAt: new Date().toISOString(),
        ...(employeeId ? {
          commissionEmployeeId: employeeId,
          commissionEmployeeName: employeeName || 'Colaborador',
          commissionPercent,
          commissionAmount,
          commissionPaidStatus
        } : {})
      };

      const draftRef = await addDoc(collection(db, 'orders'), draftData);
      const generatedUrl = `${window.location.origin}/shared-order/${draftRef.id}`;
      setShareUrl(generatedUrl);
      setShareModalOpen(true);
      closeDrawer();
    } catch (err) {
      console.error(err);
      alert('No se pudo crear el pedido compartido. Intentá de nuevo.');
    } finally {
      setShareLoading(false);
    }
  };

  const has3DNormal = items.some(i => i.type === '3d' && !i.isKeychain && (!i.resolvedPriceTiers || i.resolvedPriceTiers.length === 0));
  const has3DKeychain = items.some(i => i.type === '3d' && i.isKeychain && (!i.resolvedPriceTiers || i.resolvedPriceTiers.length === 0));

  const scopeQtyMap = aggregatedQtyByScope(
    items.map(i => ({
      priceTiers: i.priceTiers,
      categoryId: i.categoryId,
      variantGroup: i.variantGroup,
      quantity: i.quantity,
    })),
    categories,
    variantGroups
  );

  return (
    <>
      {isDrawerOpen && (
        <>
          <div 
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 transition-opacity animate-fadeIn"
            onClick={closeDrawer}
          ></div>
          
          <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col animate-slideInRight overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50 relative z-10 flex-shrink-0">
          <div className="flex items-center gap-2">
            {view === 'checkout' ? (
              <button 
                onClick={() => setView('cart')}
                className="p-1.5 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold mr-2"
              >
                <ArrowLeft size={16} /> Volver
              </button>
            ) : (
              <ShoppingBag className="text-blue-600" size={24} />
            )}
            <h2 className="text-xl font-bold text-slate-800">
              {view === 'checkout' ? 'Finalizar Pedido' : 'Tu Carrito'}
            </h2>
          </div>
          <button 
            onClick={closeDrawer}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Sliding Views Container */}
        <div className="flex-1 overflow-hidden relative">
          <div 
            className="absolute inset-y-0 left-0 w-[200%] flex transition-transform duration-300 ease-in-out h-full"
            style={{ transform: view === 'checkout' ? 'translateX(-50%)' : 'translateX(0%)' }}
          >
            {/* VISTA 1: Lista de Productos del Carrito */}
            <div className="w-1/2 h-full flex flex-col justify-between overflow-y-auto">
              <div className="p-4 space-y-4 flex-1">
                {/* Wholesale weight progress bar */}
                {(has3DNormal || has3DKeychain) && items.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-3 mb-2 animate-fadeIn">
                    <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Descuentos por peso (Impresión 3D)</h3>
                    
                    {has3DNormal && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-medium text-slate-700">
                          <span>Impresión 3D: {weightNormal}g / {thresholdNormal}g</span>
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
                )}

                {/* Cart Items */}
                {items.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4 mt-20">
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
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <p className="text-sm font-medium text-blue-600">${(item.price || 0).toLocaleString('es-AR')}</p>
                            {item.price < item.basePrice && (
                              <p className="text-xs text-slate-400 line-through">${(item.basePrice || 0).toLocaleString('es-AR')}</p>
                            )}
                            {(() => {
                              const is3D = item.type === '3d';
                              const hasTiers = item.resolvedPriceTiers && item.resolvedPriceTiers.length > 0;
                              if (!is3D || hasTiers) return null;

                              const isKeychain = item.isKeychain === true;
                              const discountPercent = isKeychain ? discountPercentKeychain : discountPercentNormal;
                              const wholesalePrice = roundPriceUp100(item.basePrice * (1 - discountPercent / 100));

                              if (item.price < item.basePrice) {
                                return (
                                  <span className="text-[9px] bg-purple-50 text-purple-600 border border-purple-100 font-black px-1.5 py-0.5 rounded">
                                    May
                                  </span>
                                );
                              } else if (wholesalePrice < item.basePrice) {
                                return (
                                  <span className="text-[9px] bg-purple-50 text-purple-600 border border-purple-100 font-bold px-1.5 py-0.5 rounded animate-fadeIn">
                                    Mayorista: ${wholesalePrice.toLocaleString('es-AR')}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>

                          {/* Price tier next discount hint */}
                          {item.resolvedPriceTiers && item.resolvedPriceTiers.length > 0 && (() => {
                            const sortedTiers = [...item.resolvedPriceTiers].sort((a, b) => a.minQty - b.minQty);
                            const scopeId = deepestTierScopeCategoryId(item.priceTiers, item.categoryId, categories, item.variantGroup);
                            const effectiveQty = scopeId ? (scopeQtyMap.get(scopeId) ?? item.quantity) : item.quantity;
                            
                            const nextTier = sortedTiers.find(t => t.minQty > effectiveQty);
                            const currentTier = sortedTiers.find(t => effectiveQty >= t.minQty && effectiveQty <= t.maxQty);
                            const lastTier = sortedTiers[sortedTiers.length - 1];
                            const activeTier = currentTier || (effectiveQty > lastTier?.maxQty ? lastTier : null);

                            return (
                              <div className="mt-1 space-y-0.5">
                                {activeTier && activeTier.unitPrice < item.basePrice && (
                                  <div className="text-[10px] text-emerald-600 font-bold">
                                    ¡Descuento por tramo activo!
                                  </div>
                                )}
                                {nextTier ? (
                                  <p className="text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100 inline-block font-medium">
                                    Llevá {nextTier.minQty - effectiveQty} más para pagar ${(nextTier.unitPrice || 0).toLocaleString('es-AR')} c/u
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

              {/* Bottom bar Step 1 */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex-shrink-0 space-y-3">
                {businessSettings?.showEstimatedDeliveryDateToClient !== false && deliveryEstimation?.estimatedDate && (
                  <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 p-2.5 rounded-xl text-xs text-slate-700 animate-fadeIn">
                    <Calendar size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-800">
                        Fecha de Entrega Estimada:
                      </p>
                      <p className="font-semibold text-blue-600 mt-0.5">
                        {deliveryEstimation.estimatedDate.toLocaleDateString('es-AR', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                      <p className="text-[9px] text-slate-400 mt-0.5 leading-normal">
                        (sujeta a tiempos de fabricación, armado y calidad)
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-600 font-medium">Total a pagar:</span>
                  <span className="text-2xl font-bold text-emerald-600">
                    ${(getTotalPrice() || 0).toLocaleString('es-AR')}
                  </span>
                </div>
                
                <button 
                  onClick={handleCheckoutClick}
                  disabled={items.length === 0}
                  className="w-full btn-primary py-3 flex justify-center items-center gap-2 text-lg disabled:opacity-50"
                >
                  {isAdmin ? 'Finalizar Pedido' : 'Finalizar Compra'}
                </button>
              </div>
            </div>

            {/* VISTA 2: Resumen del Pedido (Checkout administrativo) */}
            <div className="w-1/2 h-full flex flex-col justify-between overflow-y-auto bg-slate-50/60 border-l border-slate-100">
              <div className="p-4 space-y-4 flex-1">
                {/* Resumen Header info */}
                <div className="flex justify-between items-center text-slate-800 font-bold text-sm">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="text-blue-600" size={16} />
                    <span>Resumen del Pedido</span>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">
                    {items.length} {items.length === 1 ? 'producto' : 'productos'}
                  </span>
                </div>

                {/* Cliente selector */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <User size={12} className="text-slate-400" />
                    Cliente Asignado
                  </label>
                  
                  <SearchableClientSelect 
                    clients={sortedClients} 
                    value={selectedClientId} 
                    onChange={setSelectedClientId} 
                    placeholder="-- Seleccionar Cliente --"
                  />
                  
                  {activeClient && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {activeClient.isWholesale ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
                          Tarifa Mayorista
                        </span>
                      ) : (
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

                {/* Calculations box */}
                <div className="space-y-3 bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
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
                          <AlertCircle size={14} className="stroke-[2.5] text-red-500" />
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <NumericInput 
                        value={paidAmount} 
                        onChange={val => setPaidAmount(val)}
                        className="w-24 p-1.5 border border-slate-200 rounded-lg text-right font-bold text-sm bg-slate-50"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Minimum Deposit Note */}
                  {minDepositRequired > 0 && !bypassDeposit && (
                    <div className="text-[10px] text-blue-600 flex items-center gap-1.5 mt-0.5 bg-blue-50/50 p-2 rounded-lg border border-blue-100/30">
                      <Info size={12} className="text-blue-500 flex-shrink-0" />
                      <span>Seña mínima: <strong className="text-blue-700">${minDepositRequired.toLocaleString('es-AR')}</strong> ({requiredDepositPercent}%)</span>
                    </div>
                  )}

                  {/* Payment Method Selector if paidAmountAmt > 0 */}
                  {paidAmountAmt > 0 && (
                    <div className="flex justify-between items-center text-xs pt-1.5 border-t border-slate-200/50">
                      <span className="text-slate-500 font-medium flex items-center gap-1">
                        <CreditCard size={12} className="text-slate-400" /> Método de pago:
                      </span>
                      <select
                        value={paymentMethod}
                        onChange={e => setPaymentMethod(e.target.value as any)}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white font-semibold"
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
                    <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-xl p-2.5 mt-1.5 text-[10px] flex items-center gap-1.5 font-semibold animate-fadeIn">
                      <AlertCircle size={14} className="flex-shrink-0 text-amber-600" />
                      <span>La caja diaria está cerrada. El pago no se registrará en la caja diaria.</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-xs pt-2.5 border-t border-slate-200 font-bold">
                    <span className="text-slate-600">Saldo Pendiente:</span>
                    <span className={`text-sm ${pendingAmount > 0 ? 'text-[#f59e0b]' : 'text-emerald-600'}`}>
                      ${pendingAmount.toLocaleString('es-AR')}
                    </span>
                  </div>
                </div>

                {/* Observations */}
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Observaciones para el cliente</label>
                    <input 
                      type="text" 
                      value={observationsPublic} 
                      onChange={e => setObservationsPublic(e.target.value)}
                      placeholder="Ej. Entregar envuelto para regalo..."
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Observaciones internas (dueño)</label>
                    <input 
                      type="text" 
                      value={observationsInternal} 
                      onChange={e => setObservationsInternal(e.target.value)}
                      placeholder="Ej. Revisar calidad del filamento rojo..."
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Bottom bar Step 2 */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex-shrink-0 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleShareDraftOrder}
                  disabled={shareLoading || items.length === 0 || !selectedClientId}
                  className="w-full py-3 text-sm flex items-center justify-center gap-2 border-2 border-slate-200 hover:border-slate-300 text-slate-600 hover:bg-slate-50 rounded-xl font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                >
                  {shareLoading ? (
                    <Loader2 className="animate-spin text-indigo-600" size={16} />
                  ) : (
                    <Share2 size={16} className="text-indigo-600" />
                  )}
                  <span className="text-indigo-600">Compartir pedido (sin cobrar)</span>
                </button>

                <button 
                  onClick={handleCreateOrder}
                  disabled={submitting || items.length === 0 || !selectedClientId || (!isDepositValid && !bypassDeposit)}
                  className="w-full btn-primary py-3 flex justify-center items-center gap-2 text-lg disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <span>Confirmar y Crear Pedido</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
          </div>
        </>
      )}

      {/* Share Order Modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setShareModalOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-fadeIn"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setShareModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            ><X size={18} /></button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-blue-50">
                <Share2 size={22} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Compartir pedido</h3>
                <p className="text-slate-500 text-sm">El cliente puede finalizar el pago sin registrarse</p>
              </div>
            </div>

            {/* Link display */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
              <span className="text-xs text-slate-600 truncate flex-1 font-mono">{shareUrl}</span>
              <button
                onClick={async () => {
                  try { await navigator.clipboard.writeText(shareUrl); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); } catch {}
                }}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
              >
                {shareCopied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                {shareCopied ? 'Copiado' : 'Copiar'}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {/* WhatsApp */}
              <button
                onClick={() => {
                  const clientName = activeClient ? `${activeClient.firstName}` : 'el cliente';
                  const text = encodeURIComponent(`Hola ${clientName}! Te comparto el pedido para que puedas terminarlo cuando quieras:\n${shareUrl}`);
                  window.open(`https://wa.me/?text=${text}`, '_blank');
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-semibold transition-colors shadow-md shadow-green-500/20"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Compartir por WhatsApp
              </button>

              {/* Native share */}
              {typeof navigator.share === 'function' && (
                <button
                  onClick={() => navigator.share({ title: 'Pedido compartido', url: shareUrl }).catch(() => {})}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors"
                >
                  <Share2 size={18} />
                  Más opciones para compartir
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
