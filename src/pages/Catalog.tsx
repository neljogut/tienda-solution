import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { collection, onSnapshot, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Product } from '../types/product';
import type { Category } from '../types/category';
import { ProductCard } from '../components/ProductCard';
import { ProductDetail } from './ProductDetail';
import { useAuth } from '../context/AuthContext';
import { usePricingData } from '../hooks/usePricingData';
import {
  getCategoryTreeIds,
  dedupeCategories,
  resolveCategoryId,
  getSortedCategoryTree,
} from '../utils/categories';
import { Search, Package, X, ChevronRight, ChevronDown, Share2, Copy, Check as CheckIcon, LayoutGrid, List, Eye, EyeOff, Pencil, Printer, Monitor, Loader2 } from 'lucide-react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

export const Catalog: React.FC = () => {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { categoryId } = useParams<{ categoryId?: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [businessSettings, setBusinessSettings] = useState<any>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [mobileCols, setMobileCols] = useState<1 | 2>(2);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showCategoryShareMenu, setShowCategoryShareMenu] = useState(false);
  const [copiedCategoryLink, setCopiedCategoryLink] = useState(false);

  const categoryMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(event.target as Node)) {
        setShowCategoryMenu(false);
      }
    };
    if (showCategoryMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCategoryMenu]);

  const isOwner = userData?.role === 'owner';
  const [clientViewMode, setClientViewMode] = useState(false);
  const isAdminView = (userData?.role === 'owner' || userData?.role === 'employee') && !clientViewMode;

  // Hero text editing state
  const [editingHero, setEditingHero] = useState(false);
  const [heroTextDraft, setHeroTextDraft] = useState('');
  const [savingHero, setSavingHero] = useState(false);

  const [editingHeroTitle, setEditingHeroTitle] = useState(false);
  const [heroTitleDraft, setHeroTitleDraft] = useState('');
  const [savingHeroTitle, setSavingHeroTitle] = useState(false);

  const { getRetailPrice, getCost } = usePricingData();

  useEffect(() => {
    const q = query(collection(db, 'products'), where('isActive', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach((doc) => {
        prods.push({ id: doc.id, ...doc.data() } as Product);
      });
      setProducts(prods);
      setLoading(false);
    });

    const catUnsub = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const cats: Category[] = [];
      snapshot.forEach((doc) => {
        cats.push({ id: doc.id, ...doc.data() } as Category);
      });
      setCategories(cats);
    });

    const settingsUnsub = onSnapshot(doc(db, 'settings', 'business'), (snap) => {
      if (snap.exists()) {
        setBusinessSettings(snap.data());
      }
      setLoadingSettings(false);
    });

    return () => { 
      unsubscribe(); 
      catUnsub(); 
      settingsUnsub();
    };
  }, []);

  const [orders, setOrders] = useState<any[]>([]);

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

  const soldQuantities = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((order) => {
      if (order.orderStatus === 'cancelled') return;
      order.items?.forEach((item: any) => {
        const pId = item.productId;
        if (!pId) return;
        counts[pId] = (counts[pId] || 0) + (item.quantity || 0);
      });
    });
    return counts;
  }, [orders]);

  const { canonical: canonicalCategories, idRemap } = useMemo(
    () => dedupeCategories(categories),
    [categories]
  );

  const selectedType = 'all'; // Defaulted to all resale products

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchParam = params.get('search');
    if (searchParam) {
      setSearchTerm(searchParam);
    }

    if (categoryId) {
      setSelectedCategory(categoryId);
      setExpandedCategories(prev => {
        const next = new Set(prev);
        let current: Category | undefined = canonicalCategories.find(c => c.id === categoryId);
        while (current && current.parentId) {
          next.add(current.parentId);
          const parentId = current.parentId;
          current = canonicalCategories.find(c => c.id === parentId);
        }
        return next;
      });
    } else {
      setSelectedCategory('all');
    }
  }, [categoryId, canonicalCategories, location.search]);

  const selectedCategoryObj = useMemo(() => {
    return canonicalCategories.find(c => c.id === selectedCategory);
  }, [selectedCategory, canonicalCategories]);

  const categoryUrl = useMemo(() => {
    if (selectedType !== 'all') {
      return `${window.location.origin}/catalog/type/${selectedType}/category/${selectedCategory}`;
    }
    return `${window.location.origin}/catalog/category/${selectedCategory}`;
  }, [selectedCategory, selectedType]);

  const handleShareCategoryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowCategoryShareMenu(prev => !prev);
  };

  const handleCopyCategoryLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(categoryUrl);
      setCopiedCategoryLink(true);
      setTimeout(() => {
        setCopiedCategoryLink(false);
        setShowCategoryShareMenu(false);
      }, 1500);
    } catch {
      setShowCategoryShareMenu(false);
    }
  };

  const handleShareCategoryWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = selectedCategoryObj?.name || "Categoría";
    const text = encodeURIComponent(`Mirá esta categoría de productos: ${name}\n${categoryUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
    setShowCategoryShareMenu(false);
  };

  const handleShareCategoryNative = (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = selectedCategoryObj?.name || "Categoría";
    navigator.share({ title: name, url: categoryUrl }).catch(() => {});
    setShowCategoryShareMenu(false);
  };

  const handleCategoryChange = (newCat: string) => {
    if (newCat === 'all') {
      if (selectedType === 'all') {
        navigate('/catalog');
      } else {
        navigate(`/catalog/type/${selectedType}`);
      }
    } else {
      if (selectedType === 'all') {
        navigate(`/catalog/category/${newCat}`);
      } else {
        navigate(`/catalog/type/${selectedType}/category/${newCat}`);
      }
    }
    setShowCategoryMenu(false);
  };

  const categoryFilterIds = useMemo(() => {
    if (selectedCategory === 'all') return null;
    return getCategoryTreeIds(canonicalCategories, selectedCategory);
  }, [selectedCategory, canonicalCategories]);

  // Determine active background type depending on selected category
  const activeBgType = useMemo(() => {
    if (selectedCategory === 'all') return 'main';
    
    // Check if selected category or any of its parents is 'informática' or '3d'
    let currentId: string | null = selectedCategory;
    while (currentId) {
      const cat = canonicalCategories.find(c => c.id === currentId);
      if (!cat) break;
      
      const name = cat.name.toLowerCase();
      if (name.includes('inform') || name.includes('computaci')) return 'it';
      if (name.includes('3d') || name.includes('impresion') || name.includes('impresión')) return '3d';
      
      currentId = cat.parentId;
    }
    
    // Fallback: If categories aren't loaded yet from Firestore (e.g. on initial page reload),
    // check the category ID string itself to display the correct background immediately.
    const idLower = selectedCategory.toLowerCase();
    if (idLower.includes('inform') || idLower.includes('comput') || idLower.includes('hardware')) return 'it';
    if (idLower.includes('3d') || idLower.includes('impresi') || idLower.includes('filam') || idLower.includes('insum')) return '3d';
    
    return 'main';
  }, [selectedCategory, canonicalCategories]);

  // Find category IDs belonging to the "Llaveros" tree (case-insensitive)
  const llaverosCatIds = useMemo(() => {
    const ids = new Set<string>();
    const llaverosRoot = canonicalCategories.find(
      c => c.name.toLowerCase().trim() === 'llaveros'
    );
    if (llaverosRoot) {
      const treeIds = getCategoryTreeIds(canonicalCategories, llaverosRoot.id);
      treeIds.forEach(id => ids.add(id));
    }
    return ids;
  }, [canonicalCategories]);

  // Compute category sales totals
  const categorySalesTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    products.forEach((p) => {
      const catId = resolveCategoryId(p.categoryId, idRemap) ?? 'sin_categoria';
      const resolvedCatId = resolveCategoryId(p.categoryId, idRemap) ?? '';
      
      const isLlavero = (p.type === '3d' && (p as any).isKeychain) ||
                        (resolvedCatId && llaverosCatIds.has(resolvedCatId));
      
      const qty = soldQuantities[p.id] || 0;
      const score = isLlavero ? (qty > 0 ? 1 : 0) : qty;
      
      totals[catId] = (totals[catId] || 0) + score;
    });
    return totals;
  }, [products, soldQuantities, idRemap, llaverosCatIds]);

  // Sort canonical categories using DFS tree helper to preserve parent-child hierarchy
  const sortedCategories = useMemo(() => {
    return getSortedCategoryTree(canonicalCategories, categorySalesTotals);
  }, [canonicalCategories, categorySalesTotals]);

  // A category matches selectedType if there is at least one active product of selectedType inside it or its subcategories.
  const visibleCategories = useMemo(() => {
    if (selectedType === 'all') return sortedCategories;
    return sortedCategories.filter(cat => {
      const catTreeIds = getCategoryTreeIds(canonicalCategories, cat.id);
      const count = products.filter(p => {
        const resolved = resolveCategoryId(p.categoryId, idRemap);
        return resolved && catTreeIds.has(resolved) && p.type === selectedType;
      }).length;
      return count > 0;
    });
  }, [sortedCategories, selectedType, products, canonicalCategories, idRemap]);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const resolvedCategoryId = resolveCategoryId(p.categoryId, idRemap);
    const matchesCategory =
      selectedCategory === 'all' ||
      (resolvedCategoryId && categoryFilterIds?.has(resolvedCategoryId));
    const matchesType =
      selectedType === 'all' || p.type === selectedType;
    return matchesSearch && matchesCategory && matchesType;
  });

  // Sort products by category position in the sorted tree, then by actual quantity sold
  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      const catIdA = resolveCategoryId(a.categoryId, idRemap) ?? 'sin_categoria';
      const catIdB = resolveCategoryId(b.categoryId, idRemap) ?? 'sin_categoria';
      
      const indexA = sortedCategories.findIndex(c => c.id === catIdA);
      const indexB = sortedCategories.findIndex(c => c.id === catIdB);
      
      const idxA = indexA === -1 ? 9999 : indexA;
      const idxB = indexB === -1 ? 9999 : indexB;
      
      if (idxA !== idxB) return idxA - idxB;
      
      const scoreA = soldQuantities[a.id] || 0;
      const scoreB = soldQuantities[b.id] || 0;
      if (scoreA !== scoreB) return scoreB - scoreA;
      
      return a.name.localeCompare(b.name, 'es');
    });
  }, [filteredProducts, sortedCategories, soldQuantities, idRemap]);

  const activeFilters = (selectedCategory !== 'all' ? 1 : 0) + (selectedType !== 'all' ? 1 : 0);

  const clearFilters = () => {
    navigate('/catalog');
    setSearchTerm('');
  };

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

  return (
    <div className="animate-fadeIn relative z-0">
      {/* Luces de fondo radiales decorativas */}
      <div className="absolute inset-0 bg-premium-radial -m-4 sm:-m-6 lg:-m-8 z-0 pointer-events-none rounded-3xl opacity-100" />

      <div className="relative z-10 space-y-6">
        <div 
          className="w-full flex flex-col items-center justify-center gap-2 py-8 md:py-12 border-b border-slate-200/60 relative overflow-hidden rounded-b-3xl shadow-sm transition-all duration-700 ease-in-out min-h-[160px] md:min-h-[220px]"
        >
          {/* Background image layers for smooth transitions */}
          <div 
            className={`absolute inset-0 rounded-b-3xl bg-cover bg-center transition-opacity duration-700 ease-in-out z-0 ${activeBgType === 'main' ? 'opacity-100' : 'opacity-0'}`}
            style={{ backgroundImage: `url('/catalog-bg-main.jpg')` }}
          />
          <div 
            className={`absolute inset-0 rounded-b-3xl bg-cover bg-center transition-opacity duration-700 ease-in-out z-0 ${activeBgType === 'it' ? 'opacity-100' : 'opacity-0'}`}
            style={{ backgroundImage: `url('/catalog-bg-it.jpg')` }}
          />
          <div 
            className={`absolute inset-0 rounded-b-3xl bg-cover bg-center transition-opacity duration-700 ease-in-out z-0 ${activeBgType === '3d' ? 'opacity-100' : 'opacity-0'}`}
            style={{ backgroundImage: `url('/catalog-bg-3d.jpg')` }}
          />

          {/* Overlay to ensure text readability with matching rounded bottom corners */}
          <div className="absolute inset-0 rounded-b-3xl bg-white/40 backdrop-blur-[2px] z-10 transition-opacity duration-300"></div>

          <div className="relative z-20 w-full flex flex-col items-center px-4">

          {/* Owner toggle: switch to client view */}
          {isOwner && (
            <button
              onClick={() => setClientViewMode(v => !v)}
              className={`absolute top-0 right-0 flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                clientViewMode
                  ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/30'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-blue-400 hover:text-blue-600'
               }`}
              title={clientViewMode ? 'Volviendo a vista de administrador' : 'Ver como cliente'}
            >
              {clientViewMode ? <EyeOff size={14} /> : <Eye size={14} />}
              {clientViewMode ? 'Vista Admin' : 'Ver como cliente'}
            </button>
          )}

          {/* SOLUTION title */}
          <div className="flex flex-col items-center gap-3 mt-6 md:mt-8">
            {isOwner && editingHeroTitle ? (
              <div className="flex items-center gap-2 w-full max-w-lg mt-1">
                <input
                  autoFocus
                  type="text"
                  value={heroTitleDraft}
                  onChange={e => setHeroTitleDraft(e.target.value)}
                  maxLength={50}
                  className="flex-1 text-center text-2xl font-black uppercase border border-blue-400 rounded-xl px-3 py-1 outline-none focus:ring-2 focus:ring-blue-400 bg-white shadow"
                  placeholder="Ej: SOLUTION CATÁLOGO"
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      setSavingHeroTitle(true);
                      await setDoc(doc(db, 'settings', 'business'), { catalogTitle: heroTitleDraft }, { merge: true });
                      setSavingHeroTitle(false);
                      setEditingHeroTitle(false);
                    }
                    if (e.key === 'Escape') setEditingHeroTitle(false);
                  }}
                />
                <button
                  onClick={async () => {
                    setSavingHeroTitle(true);
                    await setDoc(doc(db, 'settings', 'business'), { catalogTitle: heroTitleDraft }, { merge: true });
                    setSavingHeroTitle(false);
                    setEditingHeroTitle(false);
                  }}
                  disabled={savingHeroTitle}
                  className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl disabled:opacity-50"
                >
                  {savingHeroTitle ? <Loader2 size={18} className="animate-spin" /> : <CheckIcon size={18} />}
                </button>
                <button
                  onClick={() => setEditingHeroTitle(false)}
                  disabled={savingHeroTitle}
                  className="p-2 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-xl disabled:opacity-50"
                >
                  <X size={18} />
                </button>
              </div>
            ) : loadingSettings ? (
              <div className="h-12 w-64 md:w-80 bg-white/20 backdrop-blur-[1px] animate-pulse rounded-2xl border border-white/30 shadow-sm" />
            ) : (
              <div className="group relative flex items-center justify-center">
                <h1 className="text-3xl md:text-5xl font-black tracking-tight text-blue-900 drop-shadow-md select-none uppercase text-center px-5 py-1.5 bg-white/30 backdrop-blur-sm rounded-2xl border border-white/40 shadow-sm">
                  {businessSettings?.catalogTitle || 'SOLUTION CATÁLOGO'}
                </h1>
                {isOwner && !editingHeroTitle && (
                  <button
                    onClick={() => {
                      setHeroTitleDraft(businessSettings?.catalogTitle || 'SOLUTION CATÁLOGO');
                      setEditingHeroTitle(true);
                    }}
                    className="absolute -right-8 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-white text-blue-600 rounded-full shadow hover:bg-blue-50 border border-blue-100"
                    title="Editar Título"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            )}

            {/* Editable hero subtitle */}
            {isOwner && editingHero ? (
              <div className="flex items-center gap-2 w-full max-w-sm mt-1">
                <input
                  autoFocus
                  type="text"
                  value={heroTextDraft}
                  onChange={e => setHeroTextDraft(e.target.value)}
                  maxLength={80}
                  className="flex-1 text-center text-xs border border-blue-400 rounded-xl px-3 py-1 outline-none focus:ring-2 focus:ring-blue-400 bg-white shadow"
                  placeholder="Escribí el texto para tus clientes..."
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      setSavingHero(true);
                      await setDoc(doc(db, 'settings', 'business'), { catalogHeroText: heroTextDraft }, { merge: true });
                      setSavingHero(false);
                      setEditingHero(false);
                    }
                    if (e.key === 'Escape') setEditingHero(false);
                  }}
                />
                <button
                  disabled={savingHero}
                  onClick={async () => {
                    setSavingHero(true);
                    await setDoc(doc(db, 'settings', 'business'), { catalogHeroText: heroTextDraft }, { merge: true });
                    setSavingHero(false);
                    setEditingHero(false);
                  }}
                  className="px-3 py-1 rounded-xl bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {savingHero ? '...' : 'Guardar'}
                </button>
                <button
                  onClick={() => setEditingHero(false)}
                  className="px-3 py-1 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : loadingSettings ? (
              <div className="h-7 w-48 md:w-64 bg-white/20 backdrop-blur-[1px] animate-pulse rounded-xl border border-white/30 shadow-sm mt-2" />
            ) : (
              <div className="group relative flex items-center justify-center mt-1">
                <p className="text-xs md:text-sm text-slate-800 font-bold text-center drop-shadow-md px-3.5 py-1 bg-white/35 backdrop-blur-sm rounded-xl border border-white/40 shadow-sm">
                  {businessSettings?.catalogHeroText || 'Tu tienda de impresión 3D y tecnología'}
                </p>
                {isOwner && (
                  <button
                    onClick={() => {
                      setHeroTextDraft(businessSettings?.catalogHeroText || '');
                      setEditingHero(true);
                    }}
                    className="absolute -right-8 opacity-0 group-hover/hero:opacity-100 transition-opacity p-1 bg-white text-blue-600 rounded-full shadow hover:bg-blue-50 border border-blue-100"
                    title="Editar texto"
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Category shortcut buttons */}
          <div className="flex items-center gap-3 mt-4 md:mt-5 flex-wrap justify-center">
            <button
              onClick={() => {
                const cat = canonicalCategories.find(c =>
                  c.name.toLowerCase().includes('informatica') ||
                  c.name.toLowerCase().includes('informática') ||
                  c.name.toLowerCase().includes('computaci')
                );
                if (cat) handleCategoryChange(cat.id);
                else setSearchTerm('informatica');
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-600 to-sky-600 text-white font-bold text-sm shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/30 hover:scale-105 active:scale-95 transition-all duration-200 border border-white/20"
            >
              <Monitor size={16} />
              Informática
            </button>
            <button
              onClick={() => {
                // Find impresion 3d category by name
                const cat = canonicalCategories.find(c =>
                  c.name.toLowerCase().includes('impresion') ||
                  c.name.toLowerCase().includes('impresión') ||
                  c.name.toLowerCase().includes('3d')
                );
                if (cat) handleCategoryChange(cat.id);
                else setSearchTerm('3d');
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-sm shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all duration-200 border border-white/20"
            >
              <Printer size={16} />
              Impresión 3D
            </button>
          </div>
        </div>
        </div>

        {/* Filters Bar */}
        <div className="card p-4 bg-white">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            {/* Search */}
            <div className="relative flex-1 w-full">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text"
                placeholder="Buscar producto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10 pr-10"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Limpiar búsqueda"
                >
                  <X size={14} className="stroke-[2.5]" />
                </button>
              )}
            </div>

            {/* Collapsible Categories Dropdown Selector */}
            <div className="relative w-full md:w-auto flex items-center gap-2">
              <div className="relative z-20 flex-1 md:flex-none" ref={categoryMenuRef}>
                <button
                  onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                  className="btn-secondary w-full md:w-60 flex items-center justify-between gap-2 text-xs h-10"
                >
                <span className="truncate">
                  {selectedCategory === 'all'
                    ? 'Todas las categorías'
                    : canonicalCategories.find(c => c.id === selectedCategory)?.name || 'Categoría'}
                </span>
                <ChevronDown size={16} className={`transition-transform duration-200 ${showCategoryMenu ? 'rotate-180' : ''}`} />
              </button>

              {showCategoryMenu && (
                <div className="absolute right-0 md:left-0 mt-2 w-80 bg-white border border-slate-200 shadow-xl rounded-xl p-3 z-30 max-h-96 overflow-y-auto space-y-1.5 text-sm animate-fadeIn">
                  <button
                    onClick={() => handleCategoryChange('all')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-semibold transition-all border text-left ${
                      selectedCategory === 'all'
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>Todas las categorías</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                      selectedCategory === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {products.length}
                    </span>
                  </button>
                  
                  {visibleCategories.map(cat => {
                    if (!isCategoryVisible(cat)) return null;
                    
                    const isSelected = selectedCategory === cat.id;
                    const catTreeIds = getCategoryTreeIds(canonicalCategories, cat.id);
                    const count = products.filter(p => {
                      const resolved = resolveCategoryId(p.categoryId, idRemap);
                      return resolved && catTreeIds.has(resolved) && (p.stock ?? 0) > 0;
                    }).length;

                    if (count === 0) return null;

                    const sales = categorySalesTotals[cat.id] || 0;

                    return (
                      <div key={cat.id} className="relative group/item">
                        <button
                          onClick={() => handleCategoryChange(cat.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all border text-left font-semibold ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                          style={{ paddingLeft: `${((cat as any).depth || 0) * 12 + 12}px` }}
                        >
                          <div className="flex items-center gap-1 min-w-0">
                            {hasChildren(cat.id) && (
                              <span 
                                onClick={(e) => toggleExpandCategory(cat.id, e)}
                                className="p-1 -ml-1.5 rounded-md hover:bg-black/10 text-slate-400 hover:text-slate-600 cursor-pointer"
                              >
                                {expandedCategories.has(cat.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </span>
                            )}
                            <span className="truncate">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'
                            }`}>
                              {count}
                            </span>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Share category link dropdown button */}
            {selectedCategory !== 'all' && (
              <div className="relative">
                <button
                  onClick={handleShareCategoryClick}
                  className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors h-10 w-10 flex items-center justify-center bg-white"
                  title="Compartir esta categoría"
                >
                  <Share2 size={16} />
                </button>

                {showCategoryShareMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-20" 
                      onClick={() => setShowCategoryShareMenu(false)} 
                    />
                      <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 shadow-xl rounded-xl p-2 z-30 space-y-1 text-xs animate-fadeIn">
                        {/* Share on WhatsApp */}
                        <button
                          onClick={handleShareCategoryWhatsApp}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-green-50 text-slate-700 hover:text-green-700 transition-colors text-sm font-medium w-full text-left"
                        >
                          <svg className="w-4 h-4 fill-current flex-shrink-0" viewBox="0 0 16 16">
                            <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326z" />
                            <path d="M7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232" />
                          </svg>
                          <span className="truncate">Enviar por WhatsApp</span>
                        </button>

                        {/* Copy URL */}
                        <button
                          onClick={handleCopyCategoryLink}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-blue-50 text-slate-700 hover:text-blue-700 transition-colors text-sm font-medium w-full text-left"
                        >
                          {copiedCategoryLink ? <CheckIcon size={16} className="text-green-500 flex-shrink-0" /> : <Copy size={16} className="flex-shrink-0" />}
                          <span className="truncate">{copiedCategoryLink ? '¡Copiado!' : 'Copiar link'}</span>
                        </button>

                        {/* Native share */}
                        {typeof navigator.share === 'function' && (
                          <button
                            onClick={handleShareCategoryNative}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-700 transition-colors text-sm font-medium w-full text-left"
                          >
                            <Share2 size={16} className="flex-shrink-0" />
                            <span className="truncate">Más opciones</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {activeFilters > 0 && (
              <button onClick={clearFilters} className="btn-ghost flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                <X size={14} />
                Limpiar ({activeFilters})
              </button>
            )}
          </div>
        </div>

        {/* Results info */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 font-medium">
            {loading ? 'Cargando...' : `${sortedProducts.length} producto${sortedProducts.length !== 1 ? 's' : ''} encontrado${sortedProducts.length !== 1 ? 's' : ''}`}
          </p>

          {/* Alternador de Columnas en Móvil */}
          <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-xl md:hidden">
            <button
              type="button"
              onClick={() => setMobileCols(1)}
              className={`p-1.5 rounded-lg transition-all ${
                mobileCols === 1 
                  ? 'bg-white text-slate-800 shadow-xs font-bold' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Vista de 1 columna"
            >
              <List size={16} />
            </button>
            <button
              type="button"
              onClick={() => setMobileCols(2)}
              className={`p-1.5 rounded-lg transition-all ${
                mobileCols === 2 
                  ? 'bg-white text-slate-800 shadow-xs font-bold' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Vista de 2 columnas"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
          </div>
        ) : sortedProducts.length === 0 ? (
          <div className="card p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
              <Package size={40} className="text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-1">No se encontraron productos</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              {searchTerm ? 'Probá con otra búsqueda o cambiá los filtros.' : 'Todavía no hay productos publicados.'}
            </p>
          </div>
        ) : (
          <div className={`grid ${
            mobileCols === 1 ? 'grid-cols-1' : 'grid-cols-2'
          } sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5`}>
            {sortedProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                isAdminView={isAdminView}
                getRetailPrice={getRetailPrice}
                getCost={getCost}
                salesCount={soldQuantities[product.id] || 0}
                onCardClick={(p) => setSelectedProduct(p)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && createPortal(
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setSelectedProduct(null)}
        >
          <div 
            className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl relative border border-slate-100 p-6 md:p-8"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-all active:scale-95 z-50"
              title="Cerrar"
            >
              <X size={18} className="stroke-[2.5]" />
            </button>
            {(() => {
              const currentIndex = sortedProducts.findIndex(p => p.id === selectedProduct.id);
              const handlePrev = sortedProducts.length > 1 ? () => {
                const prevIndex = (currentIndex - 1 + sortedProducts.length) % sortedProducts.length;
                setSelectedProduct(sortedProducts[prevIndex]);
              } : undefined;
              const handleNext = sortedProducts.length > 1 ? () => {
                const nextIndex = (currentIndex + 1) % sortedProducts.length;
                setSelectedProduct(sortedProducts[nextIndex]);
              } : undefined;
              return (
                <ProductDetail
                  productId={selectedProduct.id}
                  onClose={() => setSelectedProduct(null)}
                  isModal={true}
                  onPrev={handlePrev}
                  onNext={handleNext}
                  productsList={sortedProducts}
                  onSelectProduct={(id) => {
                    const p = sortedProducts.find(x => x.id === id);
                    if (p) setSelectedProduct(p);
                  }}
                />
              );
            })()}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
