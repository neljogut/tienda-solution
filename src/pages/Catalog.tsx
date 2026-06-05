import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Product } from '../types/product';
import type { Category } from '../types/category';
import { ProductCard } from '../components/ProductCard';
import { useAuth } from '../context/AuthContext';
import { usePricingData } from '../hooks/usePricingData';
import {
  getCategoryTreeIds,
  flattenCategoriesForSelect,
  dedupeCategories,
  resolveCategoryId,
} from '../utils/categories';
import { Search, Package, X } from 'lucide-react';

export const Catalog: React.FC = () => {
  const { userData } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [loading, setLoading] = useState(true);

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

  const { canonical: canonicalCategories, idRemap } = useMemo(
    () => dedupeCategories(categories),
    [categories]
  );

  const categoryFilterIds = useMemo(() => {
    if (selectedCategory === 'all') return null;
    return getCategoryTreeIds(canonicalCategories, selectedCategory);
  }, [selectedCategory, canonicalCategories]);

  const categoryOptions = useMemo(
    () => flattenCategoriesForSelect(categories),
    [categories]
  );

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

  const activeFilters = (selectedCategory !== 'all' ? 1 : 0) + (selectedType !== 'all' ? 1 : 0);

  const clearFilters = () => {
    setSelectedCategory('all');
    setSelectedType('all');
    setSearchTerm('');
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="page-title">Catálogo</h1>
        <p className="page-subtitle">Explorá nuestros productos de impresión 3D y reventa</p>
      </div>

      {/* Filters Bar */}
      <div className="card-glass p-4 sticky top-16 z-20">
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
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

          {/* Category filter */}
          <select 
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="input w-full md:w-48"
          >
            <option value="all">Todas las categorías</option>
            {categoryOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>

          {/* Type filter */}
          <select 
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="input w-full md:w-40"
          >
            <option value="all">Todos los tipos</option>
            <option value="3d">Impresión 3D</option>
            <option value="resale">Reventa</option>
          </select>

          {activeFilters > 0 && (
            <button onClick={clearFilters} className="btn-ghost flex items-center gap-1 text-sm text-red-500 hover:text-red-700">
              <X size={14} />
              Limpiar ({activeFilters})
            </button>
          )}
        </div>
      </div>

      {/* Results info */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {loading ? 'Cargando...' : `${filteredProducts.length} producto${filteredProducts.length !== 1 ? 's' : ''} encontrado${filteredProducts.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
        </div>
      ) : filteredProducts.length === 0 ? (
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredProducts.map(product => (
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
