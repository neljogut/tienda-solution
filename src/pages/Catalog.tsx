import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { Product } from '../types/product';
import type { Category } from '../types/category';
import { ProductCard } from '../components/ProductCard';
import { useAuth } from '../context/AuthContext';
import { usePricingData } from '../hooks/usePricingData';
import {
  getCategoryTreeIds,
  dedupeCategories,
  resolveCategoryId,
  getSortedCategoryTree,
} from '../utils/categories';
import { Search, Package, X, ChevronRight, ChevronDown, Plus, Share2, Copy, Check as CheckIcon } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

export const Catalog: React.FC = () => {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  const { categoryId } = useParams<{ categoryId?: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showCategoryShareMenu, setShowCategoryShareMenu] = useState(false);
  const [copiedCategoryLink, setCopiedCategoryLink] = useState(false);

  const isAdminView = userData?.role === 'owner' || userData?.role === 'employee';
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

    return () => { unsubscribe(); catUnsub(); };
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

  useEffect(() => {
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
  }, [categoryId, canonicalCategories]);

  const selectedCategoryObj = useMemo(() => {
    return canonicalCategories.find(c => c.id === selectedCategory);
  }, [selectedCategory, canonicalCategories]);

  const categoryUrl = useMemo(() => {
    return `${window.location.origin}/catalog/category/${selectedCategory}`;
  }, [selectedCategory]);

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

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const resolvedCategoryId = resolveCategoryId(p.categoryId, idRemap);
    const matchesCategory =
      selectedCategory === 'all' ||
      (resolvedCategoryId && categoryFilterIds?.has(resolvedCategoryId));
    const matchesType = selectedType === 'all' || p.type === selectedType;
    return matchesSearch && matchesCategory && matchesType;
  });

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

  const activeFilters = (selectedCategory !== 'all' ? 1 : 0) + (selectedType !== 'all' ? 1 : 0);

  const clearFilters = () => {
    navigate('/catalog');
    setSelectedType('all');
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
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/60 pb-5">
        <div>
          <h1 className="page-title">Catálogo</h1>
          <p className="page-subtitle">Explorá nuestros productos de impresión 3D y artículos varios</p>
        </div>
        {isAdminView && (
          <button
            onClick={() => navigate('/admin/products/new')}
            className="btn-primary py-2.5 px-4 text-sm flex items-center justify-center gap-2 self-start sm:self-auto"
          >
            <Plus size={18} /> Agregar Producto
          </button>
        )}
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
              className="input pl-10"
            />
          </div>

          {/* Collapsible Categories Dropdown Selector */}
          <div className="relative w-full md:w-auto flex items-center gap-2">
            <div className="relative flex-1 md:flex-initial">
              <button
                onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                className="btn-secondary w-full md:w-60 flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate">
                  {selectedCategory === 'all'
                    ? 'Todas las categorías'
                    : canonicalCategories.find(c => c.id === selectedCategory)?.name || 'Categoría'}
                </span>
                <ChevronDown size={16} className={`transition-transform duration-200 ${showCategoryMenu ? 'rotate-180' : ''}`} />
              </button>

              {showCategoryMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-20" 
                    onClick={() => setShowCategoryMenu(false)} 
                  />
                  <div className="absolute right-0 md:left-0 mt-2 w-72 bg-white border border-slate-200 shadow-xl rounded-xl p-3 z-30 max-h-80 overflow-y-auto space-y-1 text-xs">
                    <button
                      onClick={() => {
                        navigate('/catalog');
                        setShowCategoryMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-semibold transition-all border text-left ${
                        selectedCategory === 'all'
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span>Todas las categorías</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        selectedCategory === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {products.length}
                      </span>
                    </button>
                    
                    {sortedCategories.map(cat => {
                      if (!isCategoryVisible(cat)) return null;
                      
                      const isSelected = selectedCategory === cat.id;
                      const catTreeIds = getCategoryTreeIds(canonicalCategories, cat.id);
                      const count = products.filter(p => {
                        const resolved = resolveCategoryId(p.categoryId, idRemap);
                        return resolved && catTreeIds.has(resolved);
                      }).length;
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
                              className="p-1 hover:bg-slate-100 rounded text-slate-500 transition-colors flex-shrink-0"
                            >
                              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </button>
                          ) : (
                            <div className="w-5 flex-shrink-0" />
                          )}
                          
                          <button
                            onClick={() => {
                              navigate(`/catalog/category/${cat.id}`);
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
                            className={`flex-1 flex items-center justify-between px-2 py-1.5 rounded-lg font-semibold transition-all border text-left ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20'
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

            {/* Share Category Button */}
            {selectedCategory !== 'all' && (
              <div className="relative">
                <button
                  onClick={handleShareCategoryClick}
                  className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors flex items-center justify-center h-10 w-10 flex-shrink-0"
                  title="Compartir categoría"
                >
                  <Share2 size={16} />
                </button>

                {showCategoryShareMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowCategoryShareMenu(false)} 
                    />
                    <div className="absolute top-full right-0 mt-2 z-50 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 flex flex-col gap-1 min-w-[170px] animate-fadeIn">
                      {/* WhatsApp */}
                      <button
                        onClick={handleShareCategoryWhatsApp}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-green-50 text-slate-700 hover:text-green-700 transition-colors text-sm font-medium w-full text-left"
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="#25D366" className="flex-shrink-0">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        WhatsApp
                      </button>

                      {/* Copy link */}
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

          {/* Type filter */}
          <select 
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="input w-full md:w-40 text-xs"
          >
            <option value="all">Todos los tipos</option>
            <option value="3d">Impresión 3D</option>
            <option value="resale">Artículos Varios</option>
          </select>

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
        <p className="text-sm text-slate-500">
          {loading ? 'Cargando...' : `${sortedProducts.length} producto${sortedProducts.length !== 1 ? 's' : ''} encontrado${sortedProducts.length !== 1 ? 's' : ''}`}
        </p>
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
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
          {sortedProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              isAdminView={isAdminView}
              getRetailPrice={getRetailPrice}
              getCost={getCost}
            />
          ))}
        </div>
      )}
    </div>
  );
};
