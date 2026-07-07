import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowLeft, AlertCircle, Info, CreditCard, User, Sparkles, Loader2, ShoppingCart, Share2, Copy, CheckCircle2, Search } from 'lucide-react';
import { useCartStore } from '../store/cartStore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, onSnapshot, collection, query, where, addDoc, writeBatch, getDoc, getCountFromServer } from 'firebase/firestore';

import { roundPriceUp100, deepestTierScopeCategoryId, aggregatedQtyByScope, getTierPrice } from '../services/pricingService';
import { SearchableClientSelect } from './SearchableClientSelect';
import { NumericInput } from './NumericInput';
import type { Client } from '../types/client';
import type { Category } from '../types/category';
import type { VariantGroup } from '../types/variantGroup';
import type { PriceTier } from '../types/product';

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

  const [exchangeRate, setExchangeRate] = useState<number>(1000);
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
    let unsubClients = () => {};
    if (userData?.role === 'owner' || userData?.role === 'employee') {
      const qClients = userData?.role === 'employee'
        ? query(collection(db, 'clients'), where('employeeId', '==', userData.uid))
        : query(collection(db, 'clients'));
      unsubClients = onSnapshot(qClients, (snap) => {
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
      }, (err) => {
        console.error("Error listening to clients:", err);
      });
    } else if (userData?.role === 'client' && userData?.customerId) {
      unsubClients = onSnapshot(doc(db, 'clients', userData.customerId), (snap) => {
        if (snap.exists()) {
          const raw = snap.data();
          const hasNewFields = typeof raw.isWholesale === 'boolean';
          const migrated = (hasNewFields ? raw : {
            ...raw,
            isWholesale: raw.clientType === 'wholesale',
            isTrusted: raw.clientType === 'trusted',
          });
          if (migrated.isLocal === undefined) {
            migrated.isLocal = false;
          }
          setClients([{ id: snap.id, ...migrated } as Client]);
        } else {
          setClients([]);
        }
      }, (err) => {
        console.error("Error listening to client doc:", err);
      });
    } else {
      setClients([]);
    }



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

     return () => {
       unsubPricing();
       unsubDeposit();
       unsubRate();
       unsubClients();
       unsubCategories();
       unsubVariantGroups();
     };
   }, [isDrawerOpen, userData]);





  const scopeStatusList = useMemo(() => {
    if (!items || items.length === 0) return [];
    
    const scopesMap = new Map<string, {
      scopeId: string;
      scopeName: string;
      effectiveQty: number;
      resolvedPriceTiers: PriceTier[];
      basePrice: number;
      itemsCount: number;
    }>();

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

    items.forEach(item => {
      if (!item || !item.resolvedPriceTiers || item.resolvedPriceTiers.length === 0) return;
      
      const scopeId = deepestTierScopeCategoryId(item.priceTiers, item.categoryId, categories, item.variantGroup);
      if (!scopeId) return;

      const existing = scopesMap.get(scopeId);
      const qty = item.quantity ?? 0;

      if (existing) {
        existing.itemsCount += 1;
      } else {
        let lookupId = scopeId;
        let isGroup = false;
        if (scopeId.startsWith('group::')) {
          lookupId = scopeId.replace('group::', '');
          isGroup = true;
        }
        const scopeCategory = !isGroup && categories ? categories.find(c => c && c.id.toLowerCase() === lookupId.toLowerCase()) : null;
        const scopeGroup = isGroup && variantGroups ? variantGroups.find(g => g && (g.id.toLowerCase() === lookupId.toLowerCase() || g.name.toLowerCase() === lookupId.toLowerCase())) : null;
        const rawName = scopeCategory ? scopeCategory.name : (scopeGroup ? scopeGroup.name : (isGroup ? lookupId.toUpperCase() : ''));
        const segments = rawName.split(' - ').map(s => s.trim());
        const scopeName = segments.length >= 2
          ? `${segments[segments.length - 2]} ${segments[segments.length - 1]}`
          : rawName;

        const effectiveQty = scopeQtyMap.get(scopeId) ?? qty;

        scopesMap.set(scopeId, {
          scopeId,
          scopeName: scopeName || 'Otros',
          effectiveQty,
          resolvedPriceTiers: item.resolvedPriceTiers,
          basePrice: item.basePrice ?? item.price ?? 0,
          itemsCount: 1
        });
      }
    });

    return Array.from(scopesMap.values()).map(data => {
      const sortedTiers = [...data.resolvedPriceTiers].sort((a, b) => a.minQty - b.minQty);
      const nextTier = sortedTiers.find(t => t.minQty > data.effectiveQty);
      const currentTier = sortedTiers.find(t => data.effectiveQty >= t.minQty && data.effectiveQty <= t.maxQty);
      const lastTier = sortedTiers[sortedTiers.length - 1];
      const activeTier = currentTier || (data.effectiveQty > lastTier?.maxQty ? lastTier : null);

      return {
        ...data,
        nextTier,
        activeTier,
        isMaxDiscount: !nextTier
      };
    });
  }, [items, categories, variantGroups]);

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

  const effectiveClientId = isAdmin ? selectedClientId : (userData?.customerId || '');
  const activeClient = clients.find(c => c.id === effectiveClientId);
  const hasClientWholesale = activeClient?.isWholesale === true;

  const scopeQtyMap = useMemo(() => {
    return aggregatedQtyByScope(
      items.map(i => ({
        priceTiers: i.priceTiers,
        categoryId: i.categoryId,
        variantGroup: i.variantGroup,
        quantity: i.quantity,
      })),
      categories,
      variantGroups
    );
  }, [items, categories, variantGroups]);

  // Dynamic total amount calculation based on active client's wholesale status
  const totalAmount = (() => {
    let sum = 0;
    
    items.forEach(item => {
      const meetsThreshold = item.isKeychain ? meetsKeychain : meetsNormal;
      const appliesWholesale = (item.type === '3d' && (hasClientWholesale || meetsThreshold));
      
      if (item.resolvedPriceTiers && item.resolvedPriceTiers.length > 0) {
        const scopeId = deepestTierScopeCategoryId(item.priceTiers, item.categoryId, categories, item.variantGroup);
        const effectiveQty = scopeId ? (scopeQtyMap.get(scopeId) ?? item.quantity) : item.quantity;
        const itemPrice = getTierPrice(effectiveQty, item.basePrice, item.resolvedPriceTiers, hasClientWholesale);
        sum += itemPrice * item.quantity;
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

  const totalBasePrice = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.basePrice * (item.quantity || 0)), 0);
  }, [items]);

  const totalSavings = useMemo(() => {
    return Math.max(0, totalBasePrice - totalAmount);
  }, [totalBasePrice, totalAmount]);

  if (!isDrawerOpen && !shareModalOpen) return null;

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
          finalPrice = getTierPrice(item.quantity, item.basePrice, item.resolvedPriceTiers, hasClientWholesale);
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
        commissionAmount = Number(Math.max(0, totalProfit * (commissionPercent / 100)).toFixed(2));
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
          finalPrice = getTierPrice(item.quantity, item.basePrice, item.resolvedPriceTiers, hasClientWholesale);
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
        commissionAmount = Number(Math.max(0, totalProfit * (commissionPercent / 100)).toFixed(2));
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
      clearCart();
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

  const handleExploreMore = (lookupId: string, isGroup: boolean, scopeName: string) => {
    closeDrawer();
    
    // Buscar el primer producto en el carrito que corresponda a este descuento
    const matchingItem = items.find(item => {
      const itemScopeId = deepestTierScopeCategoryId(item.priceTiers, item.categoryId, categories, item.variantGroup);
      return itemScopeId && itemScopeId.toLowerCase() === (isGroup ? `group::${lookupId.toLowerCase()}` : lookupId.toLowerCase());
    });

    if (matchingItem && matchingItem.categoryId) {
      const catObj = categories.find(c => c && c.id === matchingItem.categoryId);
      if (catObj && catObj.parentId) {
        // Redirigir a la categoría padre (ej: FILAR)
        navigate(`/catalog/category/${catObj.parentId}`);
        return;
      } else {
        // Redirigir a la categoría propia del producto
        navigate(`/catalog/category/${matchingItem.categoryId}`);
        return;
      }
    }

    // Fallback por si no se encuentra el producto o la categoría
    if (isGroup) {
      navigate('/catalog');
    } else {
      navigate(`/catalog/category/${lookupId}`);
    }
  };



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
          <div className="flex items-center gap-1">
            {view === 'cart' && items.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('¿Vaciar todo el carrito?')) { clearCart(); closeDrawer(); }
                }}
                title="Vaciar carrito"
                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button 
              onClick={closeDrawer}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Sliding Views Container */}
        <div className="flex-1 overflow-hidden relative">
          <div 
            className="absolute inset-y-0 left-0 w-[200%] flex transition-transform duration-300 ease-in-out h-full"
            style={{ transform: view === 'checkout' ? 'translateX(-50%)' : 'translateX(0%)' }}
          >
            {/* VISTA 1: Lista de Productos del Carrito */}
            <div className="w-1/2 h-full flex flex-col justify-between overflow-hidden">
              <div className="p-4 space-y-4 flex-1 overflow-y-auto">
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

                {/* Consolidated Category Discounts */}
                {scopeStatusList.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-3 mb-2 animate-fadeIn">
                    <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Descuentos por Cantidad</h3>
                    <div className="space-y-2">
                      {scopeStatusList.map(status => (
                        <div key={status.scopeId} className="text-xs flex flex-col gap-1.5 p-2.5 bg-white rounded-lg border border-slate-100 shadow-sm animate-fadeIn">
                          <div className="flex justify-between items-center font-bold text-slate-800">
                            <span className="text-sm">{status.scopeName}</span>
                            <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-1.5 py-0.5 rounded-full border border-slate-100">
                              {status.effectiveQty} unidades
                            </span>
                          </div>
                          {status.activeTier && status.activeTier.unitPrice < (status.basePrice ?? 0) && (
                            <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                              <CheckCircle2 size={12} className="text-emerald-500" /> Descuento para {status.scopeName}
                            </div>
                          )}
                          {status.nextTier ? (
                            <p className="text-[10px] text-orange-700 bg-orange-50/70 px-2 py-1 rounded border border-orange-100/80 font-medium">
                              Llevá {status.nextTier.minQty - status.effectiveQty} unidad{status.nextTier.minQty - status.effectiveQty > 1 ? 'es' : ''} más de {status.scopeName} para pagar ${(status.nextTier.unitPrice || 0).toLocaleString('es-AR')} c/u
                            </p>
                          ) : (
                            <p className="text-[10px] text-emerald-700 bg-emerald-50/70 px-2 py-1 rounded border border-emerald-100/80 font-medium">
                              ¡Descuento máximo aplicado!
                            </p>
                          )}
                          
                          <button
                            onClick={() => {
                              const isGroup = status.scopeId.startsWith('group::');
                              const lookupId = isGroup ? status.scopeId.replace('group::', '') : status.scopeId;
                              handleExploreMore(lookupId, isGroup, status.scopeName);
                            }}
                            className="w-full mt-1.5 py-1.5 px-3 bg-blue-50 hover:bg-blue-100/80 text-blue-600 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 border border-blue-100"
                          >
                            <Search size={11} className="text-blue-500" />
                            <span>Ver más productos de {status.scopeName}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cart Items */}
                {items.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4 mt-20">
                    <ShoppingBag size={48} className="opacity-20" />
                    <p>Tu carrito está vacío</p>
                  </div>
                ) : (
                  items.map(item => {
                    const is3D = item.type === '3d';
                    const hasTiers = item.resolvedPriceTiers && item.resolvedPriceTiers.length > 0;
                    const meetsThreshold = item.isKeychain ? meetsKeychain : meetsNormal;
                    const appliesWholesale = (is3D && (hasClientWholesale || meetsThreshold));
                    
                    const scopeId = deepestTierScopeCategoryId(item.priceTiers, item.categoryId, categories, item.variantGroup);
                    const effectiveQty = scopeId ? (scopeQtyMap.get(scopeId) ?? item.quantity) : item.quantity;

                    let displayPrice = item.price;
                    if (hasTiers) {
                      displayPrice = getTierPrice(effectiveQty, item.basePrice, item.resolvedPriceTiers, hasClientWholesale);
                    } else if (appliesWholesale) {
                      const discountPercent = item.isKeychain ? discountPercentKeychain : discountPercentNormal;
                      displayPrice = roundPriceUp100(item.basePrice * (1 - discountPercent / 100));
                    } else {
                      displayPrice = item.basePrice;
                    }

                    return (
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
                              <p className="text-sm font-medium text-blue-600">${(displayPrice || 0).toLocaleString('es-AR')}</p>
                              {displayPrice < item.basePrice && (
                                <p className="text-xs text-slate-400 line-through">${(item.basePrice || 0).toLocaleString('es-AR')}</p>
                              )}
                              {(() => {
                                if (!is3D || hasTiers) return null;

                                const isKeychain = item.isKeychain === true;
                                const discountPercent = isKeychain ? discountPercentKeychain : discountPercentNormal;
                                const wholesalePrice = roundPriceUp100(item.basePrice * (1 - discountPercent / 100));

                                if (displayPrice < item.basePrice) {
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
                            {(() => {
                              const itemScopeId = deepestTierScopeCategoryId(item.priceTiers, item.categoryId, categories, item.variantGroup);
                              if (itemScopeId && item.resolvedPriceTiers && item.resolvedPriceTiers.length > 0) {
                                let lookupId = itemScopeId;
                                let isGroup = false;
                                if (itemScopeId.startsWith('group::')) {
                                  lookupId = itemScopeId.replace('group::', '');
                                  isGroup = true;
                                }
                                const scopeCategory = !isGroup && categories ? categories.find(c => c && c.id.toLowerCase() === lookupId.toLowerCase()) : null;
                                const scopeGroup = isGroup && variantGroups ? variantGroups.find(g => g && (g.id.toLowerCase() === lookupId.toLowerCase() || g.name.toLowerCase() === lookupId.toLowerCase())) : null;
                                const rawName = scopeCategory ? scopeCategory.name : (scopeGroup ? scopeGroup.name : (isGroup ? lookupId.toUpperCase() : ''));
                                const segments = rawName.split(' - ').map(s => s.trim());
                                const cleanScopeName = segments.length >= 2
                                  ? `${segments[segments.length - 2]} ${segments[segments.length - 1]}`
                                  : rawName;

                                return (
                                  <div className="mt-1 flex items-center gap-1 flex-wrap">
                                    <span className="text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 animate-fadeIn">
                                      🏷️ {cleanScopeName}
                                    </span>
                                    <span className="text-[9px] text-slate-400">
                                      (suma al descuento)
                                    </span>
                                  </div>
                                );
                              }
                              return null;
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
                  );
                })
                )}
              </div>

              {/* Bottom bar Step 1 */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex-shrink-0 space-y-3">


                {/* Price breakdown */}
                <div className="space-y-1.5">
                  {totalSavings > 0 && (
                    <div className="flex justify-between items-center text-sm text-slate-400">
                      <span className="font-medium">Subtotal sin descuento:</span>
                      <span className="line-through">
                        ${((getTotalPrice() || 0) + totalSavings).toLocaleString('es-AR')}
                      </span>
                    </div>
                  )}

                  {totalSavings > 0 && (
                    <div className="flex justify-between items-center text-sm font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-1.5 animate-fadeIn">
                      <span>Descuento aplicado:</span>
                      <span>-${totalSavings.toLocaleString('es-AR')}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-1">
                    <span className="text-slate-700 font-semibold text-sm">Total a pagar:</span>
                    <span className="text-2xl font-bold text-emerald-600">
                      ${(getTotalPrice() || 0).toLocaleString('es-AR')}
                    </span>
                  </div>
                </div>
                
                <div className="flex justify-center pt-1">
                  <button 
                    onClick={handleCheckoutClick}
                    disabled={items.length === 0}
                    className="w-auto px-8 py-2 btn-primary flex justify-center items-center gap-2 text-sm font-black tracking-wide uppercase disabled:opacity-50 shadow-md shadow-blue-500/10"
                  >
                    {isAdmin ? 'Finalizar Pedido' : 'Finalizar Compra'}
                  </button>
                </div>
              </div>
            </div>

            {/* VISTA 2: Resumen del Pedido (Checkout administrativo) */}
            <div className="w-1/2 h-full flex flex-col justify-between overflow-hidden bg-slate-50/60 border-l border-slate-100">
              <div className="p-4 space-y-4 flex-1 overflow-y-auto">
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
                <div className="space-y-3 bg-[#f8fafc] border border-slate-100 rounded-2xl p-4 shadow-sm">
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
                        className="w-24 p-1.5 border border-slate-200 rounded-lg text-right font-bold text-sm bg-white"
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



                  <div className="flex justify-between items-center text-xs pt-2.5 border-t border-slate-200 font-bold">
                    <span className="text-slate-600">Saldo Pendiente:</span>
                    <span className={`text-sm ${pendingAmount > 0 ? 'text-[#f59e0b]' : 'text-emerald-600'}`}>
                      ${pendingAmount.toLocaleString('es-AR')}
                    </span>
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
