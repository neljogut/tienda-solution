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
import { Search, Package, X, ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Catalog: React.FC = () => {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);

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
    setSelectedCategory('all');
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
          <div className="relative w-full md:w-auto">
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
                      setSelectedCategory('all');
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
          {isAdminView && (
            <div 
              onClick={() => navigate('/admin/products/new')}
              className="card border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/10 cursor-pointer flex flex-col items-center justify-center text-center p-6 min-h-[280px] group transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-full bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition-colors">
                <Plus size={24} className="text-slate-400 group-hover:text-blue-600 transition-colors" />
              </div>
              <p className="font-bold text-slate-700 group-hover:text-blue-700 transition-colors text-sm sm:text-base">Nuevo Producto</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[150px]">Creá y publicá un nuevo artículo en el catálogo</p>
            </div>
          )}
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
