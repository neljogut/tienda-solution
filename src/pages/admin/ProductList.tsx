import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Product } from '../../types/product';
import type { Category } from '../../types/category';
import { dedupeCategories, resolveCategoryId } from '../../utils/categories';
import { useNavigate } from 'react-router-dom';
import { Edit, Trash2, Plus, Power, PowerOff, Search } from 'lucide-react';
import { formatPrintTime } from '../../utils/printTime';

function getCategoryLabel(categoryId: string, categories: Category[]): string {
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return 'Sin categoría';
  if (!cat.parentId) return cat.name;
  const parent = categories.find((c) => c.id === cat.parentId);
  return parent ? `${parent.name} › ${cat.name}` : cat.name;
}

export const ProductList: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach((doc) => {
        prods.push({ id: doc.id, ...doc.data() } as Product);
      });
      setProducts(prods);
    });

    const unsubCategories = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const cats: Category[] = [];
      snapshot.forEach((d) => cats.push({ id: d.id, ...d.data() } as Category));
      setCategories(cats);
    });

    return () => {
      unsubscribe();
      unsubCategories();
    };
  }, []);

  const { canonical: canonicalCategories, idRemap } = useMemo(
    () => dedupeCategories(categories),
    [categories]
  );

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(term));
  }, [products, searchTerm]);

  const productsByCategory = useMemo(() => {
    const groups = new Map<string, Product[]>();
    const orderMap = new Map(canonicalCategories.map((c) => [c.id, c.order ?? 0]));

    for (const product of filteredProducts) {
      const categoryId = resolveCategoryId(product.categoryId, idRemap) ?? 'sin_categoria';
      if (!groups.has(categoryId)) groups.set(categoryId, []);
      groups.get(categoryId)!.push(product);
    }

    for (const list of groups.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }

    return [...groups.entries()]
      .sort(([idA], [idB]) => {
        if (idA === 'sin_categoria') return 1;
        if (idB === 'sin_categoria') return -1;
        const orderDiff = (orderMap.get(idA) ?? 9999) - (orderMap.get(idB) ?? 9999);
        if (orderDiff !== 0) return orderDiff;
        return getCategoryLabel(idA, canonicalCategories).localeCompare(
          getCategoryLabel(idB, canonicalCategories),
          'es'
        );
      })
      .map(([categoryId, items]) => ({
        categoryId,
        label: categoryId === 'sin_categoria'
          ? 'Sin categoría'
          : getCategoryLabel(categoryId, canonicalCategories),
        products: items,
      }));
  }, [filteredProducts, canonicalCategories, idRemap]);

  const toggleActive = async (id: string, currentStatus: boolean) => {
    await updateDoc(doc(db, 'products', id), { isActive: !currentStatus });
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este producto?')) {
      await deleteDoc(doc(db, 'products', id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestión de Productos</h1>
          <p className="text-slate-500">Administra tu catálogo, precios y stock.</p>
        </div>
        <button 
          onClick={() => navigate('/admin/products/new')} 
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          Nuevo Producto
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row justify-between gap-4 items-center">
        <div className="relative w-full">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Buscar producto por nombre..."
            className="input pl-10 w-full text-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm">
                <th className="p-4 font-medium">Producto</th>
                <th className="p-4 font-medium">Tipo</th>
                <th className="p-4 font-medium">Tiempo</th>
                <th className="p-4 font-medium">Stock</th>
                <th className="p-4 font-medium">Precio (Minorista)</th>
                <th className="p-4 font-medium">Estado</th>
                <th className="p-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No hay productos creados. Empieza creando uno nuevo.
                  </td>
                </tr>
              ) : productsByCategory.map((group) => (
                <React.Fragment key={group.categoryId}>
                  <tr className="bg-slate-100/80">
                    <td colSpan={7} className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                      {group.label}
                      <span className="ml-2 font-semibold text-slate-400 normal-case">
                        ({group.products.length})
                      </span>
                    </td>
                  </tr>
                  {group.products.map((product) => {
                    const price = product.useManualPrice
                      ? product.manualRetailPrice
                      : product.calculatedRetailPrice;
                    return (
                      <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0">
                              {product.mainImage ? (
                                <img
                                  src={product.mainImage}
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : null}
                            </div>
                            <p className="font-semibold text-slate-800">{product.name}</p>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${product.type === '3d' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {product.type === '3d' ? 'Impresión 3D' : 'Reventa'}
                          </span>
                          {product.useManualPrice && (
                            <span className="ml-2 px-2 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-800">
                              Manual
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-sm text-slate-600">
                          {product.type === '3d' ? (
                            formatPrintTime(product.printTimeMinutes)
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-4">
                          {product.stock !== undefined ? (
                            <span className={`font-semibold ${product.stock > 0 ? 'text-slate-700' : 'text-red-500'}`}>
                              {product.stock}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="p-4 font-medium text-slate-900">
                          ${price?.toLocaleString('es-AR') || 0}
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => toggleActive(product.id, product.isActive)}
                            className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-md transition-colors ${product.isActive ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-slate-500 bg-slate-100 hover:bg-slate-200'}`}
                          >
                            {product.isActive ? <Power size={14} /> : <PowerOff size={14} />}
                            {product.isActive ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => navigate(`/admin/products/${product.id}`)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Editar"
                            >
                              <Edit size={18} />
                            </button>
                            <button
                              onClick={() => handleDelete(product.id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
