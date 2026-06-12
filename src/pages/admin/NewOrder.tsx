import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, addDoc, getCountFromServer, doc, getDoc, updateDoc, writeBatch, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Product } from '../../types/product';
import type { Order } from '../../types/order';
import type { Client } from '../../types/client';
import { migrateClient, getClientLabel } from '../../types/client';
import type { Category } from '../../types/category';
import { dedupeCategories, resolveCategoryId, getCategoryTreeIds, getSortedCategoryTree } from '../../utils/categories';
import type { ExchangeRateData, DepositSettings, PricingSettings3D } from '../../types/settings';
import type { CashSession, PaymentMethod } from '../../types/cash';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Plus, Minus, Trash2, ShoppingCart, User, CreditCard, AlertCircle, Sparkles, Info, ChevronRight, ChevronDown, Check, ShoppingBag, Share2, Copy, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getTierPrice, recalculateAllProductsInFirestore, resolveInheritedPriceTiers, deepestTierScopeCategoryId, aggregatedQtyByScope } from '../../services/pricingService';
import { NumericInput } from '../../components/NumericInput';

// Helper for client initials
function getClientInitials(firstName: string, lastName: string): string {
  const f = firstName ? firstName.trim().charAt(0).toUpperCase() : '';
  const l = lastName ? lastName.trim().charAt(0).toUpperCase() : '';
  return `${f}${l}` || '?';
}

// Helper for client avatar background color style based on the first letter of their first name
function getClientAvatarStyle(firstName: string): React.CSSProperties {
  const name = (firstName || '').trim().toLowerCase();
  if (!name) return { backgroundColor: '#f1f5f9', color: '#475569' };
  
  const charCode = name.charCodeAt(0) || 0;
  
  const palettes = [
    { bg: '#e2e8f0', text: '#334155' }, // Slate 200 / 700
    { bg: '#dbeafe', text: '#1e40af' }, // Blue 100 / 800
    { bg: '#e0e7ff', text: '#3730a3' }, // Indigo 100 / 800
    { bg: '#e0f2fe', text: '#0369a1' }, // Sky 100 / 700
    { bg: '#f1f5f9', text: '#475569' }, // Slate 100 / 600
    { bg: '#eff6ff', text: '#2563eb' }, // Blue 50 / 600
    { bg: '#f5f3ff', text: '#5b21b6' }, // Violet 50 / 800
    { bg: '#ecfeff', text: '#0891b2' }, // Cyan 50 / 800
  ];
  
  const index = charCode % palettes.length;
  return {
    backgroundColor: palettes[index].bg,
    color: palettes[index].text
  };
}

interface SearchableClientSelectProps {
  clients: Client[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const SearchableClientSelect: React.FC<SearchableClientSelectProps> = ({
  clients,
  value,
  onChange,
  placeholder = 'Buscar y seleccionar cliente...'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const selectedClient = clients.find(c => c.id === value);
  const displayValue = selectedClient 
    ? `${selectedClient.firstName} ${selectedClient.lastName}`
    : '';

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return clients;
    return clients.filter(c => 
      c.firstName.toLowerCase().includes(term) ||
      c.lastName.toLowerCase().includes(term)
    );
  }, [clients, search]);

  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      });
    }
  };

  const handleFocus = () => {
    setIsOpen(true);
    setSearch('');
    updateCoords();
  };

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);

    const clickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const portalDropdown = document.getElementById('portal-client-dropdown');
        if (portalDropdown && portalDropdown.contains(e.target as Node)) {
          return;
        }
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', clickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
      document.removeEventListener('mousedown', clickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          value={isOpen ? search : displayValue}
          onChange={e => setSearch(e.target.value)}
          onFocus={handleFocus}
          className="w-full border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-ellipsis truncate transition-all duration-200"
        />
        <div className="absolute left-3 top-3 text-slate-400">
          <User size={15} />
        </div>
        <div className="absolute right-3 top-3 text-slate-400 pointer-events-none">
          <ChevronDown size={15} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && coords && createPortal(
        <div 
          id="portal-client-dropdown"
          className="fixed bg-white border border-slate-200/80 rounded-xl shadow-2xl z-[999] py-1.5 text-xs ring-1 ring-black/5 scrollbar-thin max-h-56 overflow-y-auto"
          style={{
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            top: `${coords.top + coords.height + 4}px`,
          }}
          onClick={e => e.stopPropagation()}
        >
          {filtered.length === 0 ? (
            <div className="text-slate-400 py-4 text-center flex flex-col items-center gap-1">
              <User size={18} className="opacity-40" />
              <span>No se encontraron clientes</span>
            </div>
          ) : (
            filtered.map(c => {
              const isSelected = c.id === value;
              const initials = getClientInitials(c.firstName, c.lastName);
              const avatarStyle = getClientAvatarStyle(c.firstName);
              const label = getClientLabel(c);

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 transition-colors flex items-center justify-between gap-2 border-b border-slate-50 last:border-0 ${
                    isSelected 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div 
                      className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold shadow-sm" 
                      style={avatarStyle}
                    >
                      {initials}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-slate-800 truncate">{c.firstName} {c.lastName}</span>
                      <span className={`text-[10px] truncate font-medium ${isSelected ? 'text-blue-500' : 'text-slate-400'}`}>
                        {label}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isSelected && <Check size={14} className="text-blue-600" />}
                  </div>
                </button>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export const NewOrder: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  // Sort clients alphabetically
  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => {
      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
      return nameA.localeCompare(nameB, 'es');
    });
  }, [clients]);

  const [cartItems, setCartItems] = useState<any[]>([]);
  const [paidAmount, setPaidAmount] = useState<number | ''>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [observationsPublic, setObservationsPublic] = useState('');
  const [observationsInternal, setObservationsInternal] = useState('');
  const [loading, setLoading] = useState(false);
  const [addToast, setAddToast] = useState<string | null>(null);
  const cartSummaryRef = useRef<HTMLDivElement>(null);

  // Share draft order state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Settings & Exchange Rate
  const [depositSettings, setDepositSettings] = useState<DepositSettings | null>(null);
  const [pricing3dSettings, setPricing3dSettings] = useState<PricingSettings3D | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(1000);
  
  // Daily Cash active session
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);

  const { currentUser, userData } = useAuth();
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
    const qClients = userData?.role === 'employee'
      ? query(collection(db, 'clients'), where('employeeId', '==', userData.uid))
      : query(collection(db, 'clients'));
    const unsubClients = onSnapshot(qClients, (snap) => {
      setClients(snap.docs.map(d => migrateClient({ id: d.id, ...d.data() }) as Client));
    });

    // 2b. Live categories listener
    const unsubCategories = onSnapshot(collection(db, 'categories'), (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
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
      const openSessions = snap.docs.map(d => ({ id: d.id, ...d.data() } as CashSession));
      const mySession = openSessions.find(s => s.openedBy === userData?.uid) || null;
      setActiveSession(mySession);
    });

    return () => {
      unsubProducts();
      unsubClients();
      unsubCategories();
      unsubDeposit();
      unsubRate();
      unsubPricing3d();
      unsubSession();
    };
  }, []);

  // Fetch orders once on load to compute sales scores
  useEffect(() => {
    if (!currentUser) return;
    const fetchOrders = async () => {
      try {
        const snap = await getDocs(collection(db, 'orders'));
        const ords: any[] = [];
        snap.forEach((doc) => {
          ords.push({ id: doc.id, ...doc.data() });
        });
        setOrders(ords);
      } catch (err) {
        console.warn("No se pudieron cargar los pedidos para ranking de ventas:", err);
      }
    };
    fetchOrders();
  }, [currentUser]);

  const salesScores = useMemo(() => {
    const scores: Record<string, number> = {};
    orders.forEach((order) => {
      if (order.orderStatus === 'cancelled') return;
      order.items?.forEach((item: any) => {
        const pId = item.productId;
        if (!pId) return;
        
        const prod = products.find(p => p.id === pId);
        const isLlavero = prod
          ? (prod.type === '3d' && (prod as any).isKeychain)
          : (item.isKeychain || item.category?.toLowerCase() === 'llaveros');
          
        const contribution = isLlavero ? 1 : (item.quantity || 0);
        scores[pId] = (scores[pId] || 0) + contribution;
      });
    });
    return scores;
  }, [orders, products]);

  const { canonical: canonicalCategories, idRemap } = useMemo(
    () => dedupeCategories(categories),
    [categories]
  );

  const categoryFilterIds = useMemo(() => {
    if (selectedCategory === 'all') return null;
    return getCategoryTreeIds(canonicalCategories, selectedCategory);
  }, [selectedCategory, canonicalCategories]);

  // Compute category sales totals
  const categorySalesTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    products.forEach((p) => {
      const catId = resolveCategoryId(p.categoryId, idRemap) ?? 'sin_categoria';
      totals[catId] = (totals[catId] || 0) + (salesScores[p.id] || 0);
    });
    return totals;
  }, [products, salesScores, idRemap]);

  // Sort canonical categories using DFS tree helper to preserve parent-child hierarchy
  const sortedCategories = useMemo(() => {
    return getSortedCategoryTree(canonicalCategories, categorySalesTotals);
  }, [canonicalCategories, categorySalesTotals]);

  // Filter products by name and category
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const resolvedCategoryId = resolveCategoryId(p.categoryId, idRemap);
      const matchesCategory =
        selectedCategory === 'all' ||
        (resolvedCategoryId && categoryFilterIds?.has(resolvedCategoryId));
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory, categoryFilterIds, idRemap]);

  // Sort products by category position in the sorted tree, then by sales score
  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      const catIdA = resolveCategoryId(a.categoryId, idRemap) ?? 'sin_categoria';
      const catIdB = resolveCategoryId(b.categoryId, idRemap) ?? 'sin_categoria';
      
      const indexA = sortedCategories.findIndex(c => c.id === catIdA);
      const indexB = sortedCategories.findIndex(c => c.id === catIdB);
      
      const idxA = indexA === -1 ? 9999 : indexA;
      const idxB = indexB === -1 ? 9999 : indexB;
      
      if (idxA !== idxB) return idxA - idxB;
      
      const scoreA = salesScores[a.id] || 0;
      const scoreB = salesScores[b.id] || 0;
      if (scoreA !== scoreB) return scoreB - scoreA;
      
      return a.name.localeCompare(b.name, 'es');
    });
  }, [filteredProducts, sortedCategories, salesScores, idRemap]);

  const isCategoryVisible = (cat: Category) => {
    let currentParentId = cat.parentId;
    while (currentParentId) {
      if (!expandedCategories.has(currentParentId)) {
        return false;
      }
      const parent = canonicalCategories.find(c => c.id === currentParentId);
      currentParentId = parent ? parent.parentId : null;
    }
    return true;
  };

  const hasChildren = (catId: string) => {
    return canonicalCategories.some(c => c.parentId === catId);
  };

  const toggleExpandCategory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Active client details
  const activeClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId) || null;
  }, [selectedClientId, clients]);

  // Compute unit price for a product based on current selected client, cart quantity, and scope-aggregated tier qty
  const calculateItemPrice = (
    product: Product,
    quantity: number,
    client: Client | null,
    total3DWeightNormal = 0,
    total3DWeightKeychain = 0,
    scopeQtyMap?: Map<string, number>
  ) => {
    // 0. If product has price tiers, resolve them and use aggregated scope quantity
    const resolvedTiers = resolveInheritedPriceTiers(product.priceTiers, product.categoryId, categories);
    if (resolvedTiers && resolvedTiers.length > 0) {
      const basePrice = product.useManualPrice ? product.manualRetailPrice : product.calculatedRetailPrice;
      const scopeId = deepestTierScopeCategoryId(product.priceTiers, product.categoryId, categories);
      const effectiveQty = (scopeId && scopeQtyMap) ? (scopeQtyMap.get(scopeId) ?? quantity) : quantity;
      return getTierPrice(effectiveQty, basePrice, resolvedTiers);
    }

    const isClientWholesale = client?.isWholesale ?? false;
    let isWholesale = isClientWholesale;

    if (product.type === '3d') {
      const isKeychain = !!(product as any).isKeychain;
      const threshold = isKeychain
        ? (pricing3dSettings?.wholesaleThresholdGramsKeychain ?? 600)
        : (pricing3dSettings?.wholesaleThresholdGramsNormal ?? 1000);
      const totalWeight = isKeychain ? total3DWeightKeychain : total3DWeightNormal;
      const meetsThreshold = totalWeight >= threshold;
      isWholesale = isClientWholesale || meetsThreshold;
    }
    
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
    return getTierPrice(quantity, basePrice, resolvedTiers);
  };

  // Recalculate cart item prices whenever the client or items change
  const recalculateCart = (items: any[], client: Client | null) => {
    // 1. Build aggregated quantity map by tier scope (category-level aggregation)
    const scopeQtyMap = aggregatedQtyByScope(
      items.map(item => {
        const product = products.find(p => p.id === item.productId);
        return {
          priceTiers: product?.priceTiers,
          categoryId: product?.categoryId,
          quantity: item.quantity,
        };
      }),
      categories
    );

    // 2. Calculate total weight of 3D products (excluding those with tiers)
    let total3DWeightNormal = 0;
    let total3DWeightKeychain = 0;
    
    items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product && product.type === '3d') {
        const resolvedTiers = resolveInheritedPriceTiers(product.priceTiers, product.categoryId, categories);
        const hasTiers = resolvedTiers && resolvedTiers.length > 0;
        if (hasTiers) return; // Price tiers ignore wholesale thresholds

        const weight = (product.weightGrams || 0) * (item.quantity === '' ? 0 : Number(item.quantity));
        if ((product as any).isKeychain) {
          total3DWeightKeychain += weight;
        } else {
          total3DWeightNormal += weight;
        }
      }
    });

    const thresholdNormal = pricing3dSettings?.wholesaleThresholdGramsNormal ?? 1000;
    const thresholdKeychain = pricing3dSettings?.wholesaleThresholdGramsKeychain ?? 600;

    return items.map(item => {
      const product = products.find(p => p.id === item.productId);
      if (!product) return item;
      const unitPrice = calculateItemPrice(
        product, 
        (item.quantity as any) === '' ? 1 : Number(item.quantity), 
        client, 
        total3DWeightNormal,
        total3DWeightKeychain,
        scopeQtyMap
      );
      const resolvedTiers = resolveInheritedPriceTiers(product.priceTiers, product.categoryId, categories);
      const hasTiers = resolvedTiers && resolvedTiers.length > 0;
      
      let isWholesaleApplied = false;
      if (!hasTiers) {
        if (client?.isWholesale) {
          isWholesaleApplied = true;
        } else if (product.type === '3d') {
          if ((product as any).isKeychain) {
            isWholesaleApplied = total3DWeightKeychain >= thresholdKeychain;
          } else {
            isWholesaleApplied = total3DWeightNormal >= thresholdNormal;
          }
        }
      }

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

  const showAddToast = useCallback((message: string) => {
    setAddToast(message);
    window.setTimeout(() => setAddToast(null), 2200);
  }, []);

  const scrollToCartSummary = useCallback(() => {
    cartSummaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Add item to cart
  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      showAddToast(`Sin stock: ${product.name}`);
      return;
    }

    const existing = cartItems.find(item => item.productId === product.id);
    const currentQty = existing ? existing.quantity : 0;

    if (currentQty >= product.stock) {
      showAddToast(`Stock máximo: ${product.stock}`);
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

    const newQty = currentQty + 1;
    showAddToast(`${product.name} · cant. ${newQty}`);

    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.setTimeout(() => scrollToCartSummary(), 120);
    }
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

      const totalProfit = totalAmount - totalCost;
      const employeeId = activeClient?.employeeId;
      const employeeName = activeClient?.employeeName;
      const commissionPercent = pricing3dSettings?.employeeCommissionPercent ?? 10;
      const commissionAmount = employeeId ? Number((totalProfit * (commissionPercent / 100)).toFixed(2)) : undefined;
      const commissionPaidStatus = employeeId ? 'pending' : undefined;

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
        totalProfit,
        ...(employeeId ? {
          commissionEmployeeId: employeeId,
          commissionEmployeeName: employeeName || 'Colaborador',
          commissionPercent,
          commissionAmount,
          commissionPaidStatus
        } : {})
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

  // Create a draft order and open share modal
  const handleShareDraftOrder = async () => {
    if (cartItems.length === 0) return alert('Agrega al menos un producto al pedido.');
    if (!selectedClientId) return alert('Selecciona un cliente para compartir el pedido.');
    const hasInvalidQty = cartItems.some(item => (item.quantity as any) === '' || item.quantity <= 0);
    if (hasInvalidQty) return alert('Revisá que todos los productos tengan una cantidad válida.');

    setShareLoading(true);
    try {
      const customerName = activeClient ? `${activeClient.firstName} ${activeClient.lastName}` : 'Cliente';
      const sanitizedItems = cartItems.map(item => ({ ...item, quantity: Number(item.quantity) }));
      const exchangeRateSnap = await getDoc(doc(db, 'settings', 'exchangeRate'));
      const currentExchangeRate = exchangeRateSnap.exists() ? (exchangeRateSnap.data() as ExchangeRateData).currentUsdToArs : exchangeRate;

      const totalProfit = totalAmount - totalCost;
      const employeeId = activeClient?.employeeId;
      const employeeName = activeClient?.employeeName;
      const commissionPercent = pricing3dSettings?.employeeCommissionPercent ?? 10;
      const commissionAmount = employeeId ? Number((totalProfit * (commissionPercent / 100)).toFixed(2)) : undefined;
      const commissionPaidStatus = employeeId ? 'pending' : undefined;

      const draftData = {
        orderNumber: 0, // will be assigned when finalized
        customerId: selectedClientId,
        customerName,
        date: new Date().toISOString(),
        items: sanitizedItems,
        totalAmount,
        paidAmount: 0,
        pendingAmount: totalAmount,
        paymentStatus: 'unpaid' as const,
        orderStatus: 'draft' as const,
        observationsPublic: observationsPublic || '',
        observationsInternal: `Borrador compartido por ${userData?.displayName || 'owner'}`,
        exchangeRateUsdUsed: currentExchangeRate,
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
    } catch (err) {
      console.error(err);
      alert('No se pudo crear el pedido compartido. Intentá de nuevo.');
    } finally {
      setShareLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn">
      {/* Share Order Modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShareModalOpen(false)}>
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

      <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 ${cartItems.length > 0 ? 'pb-24 lg:pb-0' : ''}`}>
        {/* Left Side: Product catalog lookup */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          <div className="card p-5 flex flex-col h-[min(55vh,520px)] lg:h-[72vh]">
            <h3 className="font-bold text-slate-800 text-base mb-3 flex items-center gap-2">
              <ShoppingCart size={18} className="text-blue-500" />
            </h3>
            <div className="flex gap-2 items-center mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Buscar producto por nombre..."
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-slate-50/50 text-sm"
                />
              </div>

              {/* Collapsible Categories Dropdown Selector */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                  className="btn-secondary flex items-center justify-between gap-1.5 text-xs py-2 px-3 border rounded-lg h-[38px]"
                >
                  <span className="truncate max-w-[120px]">
                    {selectedCategory === 'all'
                      ? 'Todas'
                      : canonicalCategories.find(c => c.id === selectedCategory)?.name || 'Cat'}
                  </span>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${showCategoryMenu ? 'rotate-180' : ''}`} />
                </button>

                {showCategoryMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-20" 
                      onClick={() => setShowCategoryMenu(false)} 
                    />
                    <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 shadow-xl rounded-lg p-2 z-30 max-h-60 overflow-y-auto space-y-1 text-xs">
                      <button
                        onClick={() => {
                          setSelectedCategory('all');
                          setShowCategoryMenu(false);
                        }}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md font-semibold transition-all border text-left ${
                          selectedCategory === 'all'
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span>Todas las categorías</span>
                        <span className={`text-[9px] px-1 py-0.1 rounded-full ${
                          selectedCategory === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {products.length}
                        </span>
                      </button>
                      
                      {sortedCategories.map(cat => {
                        if (!isCategoryVisible(cat)) return null;
                        
                        const isSelected = selectedCategory === cat.id;
                        const count = products.filter(p => resolveCategoryId(p.categoryId, idRemap) === cat.id).length;
                        const sales = categorySalesTotals[cat.id] || 0;
                        const hasKids = hasChildren(cat.id);
                        const isExpanded = expandedCategories.has(cat.id);
                        
                        return (
                          <div
                            key={cat.id}
                            style={{ paddingLeft: `${cat.depth * 0.75}rem` }}
                            className="flex items-center gap-1 w-full"
                          >
                            {hasKids ? (
                              <button
                                onClick={(e) => toggleExpandCategory(cat.id, e)}
                                className="p-0.5 hover:bg-slate-100 rounded text-slate-500 transition-colors flex-shrink-0"
                              >
                                {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                              </button>
                            ) : (
                              <div className="w-4 flex-shrink-0" />
                            )}
                            
                            <button
                              onClick={() => {
                                setSelectedCategory(cat.id);
                                if (hasKids) {
                                  setExpandedCategories(prev => {
                                    const next = new Set(prev);
                                    next.add(cat.id);
                                    return next;
                                  });
                                } else {
                                  setShowCategoryMenu(false);
                                }
                              }}
                              className={`flex-1 flex items-center justify-between px-2 py-1 rounded-md font-semibold transition-all border text-left ${
                                isSelected
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <span className="truncate">{cat.name}</span>
                              <div className="flex items-center gap-1">
                                <span className={`text-[9px] px-1 py-0.1 rounded-full ${
                                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'
                                }`}>
                                  {count}
                                </span>
                                {sales > 0 && (
                                  <span className="text-[9px] font-bold text-emerald-500">
                                    ★{sales}
                                  </span>
                                )}
                              </div>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 no-scrollbar">
              {sortedProducts.map(p => {
                const basePrice = p.useManualPrice ? p.manualRetailPrice : p.calculatedRetailPrice;
                const wholesalePrice = p.calculatedWholesalePrice || basePrice;
                const isOutOfStock = p.stock <= 0;

                // Cart qty
                const cartQty = cartItems.find(item => item.productId === p.id)?.quantity || 0;

                return (
                  <div key={p.id} className={`flex items-center gap-2 p-3 border rounded-xl hover:border-blue-300 hover:bg-slate-50/40 transition-colors ${isOutOfStock ? 'opacity-65' : ''}`}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0">
                        {p.mainImage && <img src={p.mainImage} className="w-full h-full object-cover" alt={p.name}/>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 text-sm leading-snug truncate">{p.name}</p>
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
                      type="button"
                      onClick={() => addToCart(p)}
                      className="relative flex-shrink-0 min-w-11 min-h-11 flex items-center justify-center text-blue-600 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 rounded-xl border border-blue-100 touch-manipulation"
                      aria-label={`Agregar ${p.name}`}
                    >
                      <Plus size={20} />
                      {cartQty > 0 && (
                        <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center">
                          {cartQty}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Order configuration and items list */}
        <div ref={cartSummaryRef} className="lg:col-span-5 flex flex-col space-y-4 scroll-mt-20">
          <div className="card p-5 flex flex-col min-h-[min(60vh,560px)] lg:h-[72vh] justify-between">
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
                
                <SearchableClientSelect 
                  clients={sortedClients} 
                  value={selectedClientId} 
                  onChange={setSelectedClientId} 
                  placeholder="-- Seleccionar Cliente --"
                />
                
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
              <div className="flex-1 border border-slate-100 rounded-xl p-3 bg-slate-50/40 space-y-2.5 overflow-y-auto no-scrollbar min-h-[180px]">
                {cartItems.length === 0 && (
                  <div className="text-center py-10 text-slate-400 flex flex-col items-center justify-center h-full">
                    <ShoppingCart size={32} className="opacity-30 mb-2" />
                    <p className="text-xs">El pedido está vacío.</p>
                  </div>
                )}
                
                {cartItems.map(item => {
                  const product = products.find(p => p.id === item.productId);
                  const imageUrl = product?.mainImage;
                  const itemSubtotal = item.unitPrice * (item.quantity === '' ? 0 : Number(item.quantity));

                  return (
                    <div 
                      key={item.productId} 
                      className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 hover:border-slate-200/80 shadow-sm transition-all duration-200 group"
                    >
                      {/* Product Thumbnail */}
                      <div className="w-11 h-11 rounded-lg overflow-hidden border border-slate-100 flex-shrink-0 bg-slate-50 flex items-center justify-center relative shadow-inner">
                        {imageUrl ? (
                          <img 
                            src={imageUrl} 
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                            alt={item.name}
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center text-slate-400">
                            <ShoppingBag size={18} className="opacity-60" />
                          </div>
                        )}
                      </div>

                      {/* Product details */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-xs leading-tight truncate group-hover:text-blue-600 transition-colors" title={item.name}>
                          {item.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] text-slate-500 font-semibold">
                            ${item.unitPrice.toLocaleString('es-AR')}
                          </span>
                          {item.appliedWholesale && (
                            <span className="text-[9px] bg-purple-50 text-purple-600 border border-purple-100 font-black px-1.5 py-0.2 rounded">
                              May
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quantity Controls & Subtotal */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {/* Premium Quantity controls */}
                        <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50/50 shadow-sm overflow-hidden h-7">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.productId, item.quantity === '' ? 0 : Number(item.quantity) - 1)}
                            className="w-7 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 border-r border-slate-200 transition-colors active:bg-slate-200"
                          >
                            <Minus size={12} />
                          </button>
                          
                          <NumericInput
                            value={item.quantity}
                            onChange={val => updateQuantity(item.productId, val)}
                            className="w-9 h-full border-0 bg-white text-center text-xs font-bold text-slate-800 focus:ring-0 focus:outline-none"
                          />
                          
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.productId, item.quantity === '' ? 1 : Number(item.quantity) + 1)}
                            className="w-7 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 border-l border-slate-200 transition-colors active:bg-slate-200"
                          >
                            <Plus size={12} />
                          </button>
                        </div>

                        {/* Line Subtotal */}
                        <div className="text-right min-w-[70px]">
                          <span className="font-extrabold text-slate-800 text-xs tracking-tight">
                            ${itemSubtotal.toLocaleString('es-AR')}
                          </span>
                        </div>

                        {/* Delete Button */}
                        <button 
                          type="button"
                          onClick={() => updateQuantity(item.productId, 0)} 
                          className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors duration-200"
                          aria-label={`Eliminar ${item.name}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
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
                  <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-lg p-2 mt-1.5 text-[10px] flex items-center gap-1.5 font-semibold animate-fadeIn">
                    <AlertCircle size={13} className="flex-shrink-0 text-amber-600" />
                    <span>La caja diaria está cerrada. El pago se aplicará al pedido pero no quedará registrado en los movimientos de caja diaria.</span>
                  </div>
                )}

                <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200 font-bold">
                  <span className="text-slate-600">Saldo Pendiente:</span>
                  <span className={`text-sm ${pendingAmount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    ${pendingAmount.toLocaleString('es-AR')}
                  </span>
                </div>
              </div>

              {/* Share draft order button */}
              <button
                onClick={handleShareDraftOrder}
                disabled={shareLoading || cartItems.length === 0 || !selectedClientId}
                className="w-full py-2.5 text-sm flex items-center justify-center gap-2 border-2 border-blue-200 text-blue-600 hover:border-blue-400 hover:bg-blue-50 rounded-lg font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Share2 size={16} />
                {shareLoading ? 'Generando link...' : 'Compartir pedido (sin cobrar)'}
              </button>

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

      {/* Toast al agregar producto */}
      {addToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-2xl animate-fadeIn max-w-[90vw] text-center">
          {addToast}
        </div>
      )}

      {/* Barra móvil: acceso rápido al resumen del pedido */}
      {cartItems.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 lg:hidden">
          <button
            type="button"
            onClick={scrollToCartSummary}
            className="w-full btn-primary py-3 text-sm flex items-center justify-center gap-2 shadow-xl"
          >
            <ShoppingCart size={18} />
            Ver pedido ({cartItems.length} {cartItems.length === 1 ? 'producto' : 'productos'})
          </button>
        </div>
      )}
    </div>
  );
};
