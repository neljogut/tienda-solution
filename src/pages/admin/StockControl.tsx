import React, { useState, useRef, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { Product } from '../../types/product';
import { BarcodeScanner } from '../../components/BarcodeScanner';
import { Barcode, Camera, Search, Loader2, Check } from 'lucide-react';

interface StockControlProps {
  products: Product[];
}

export const StockControl: React.FC<StockControlProps> = ({ products }) => {
  const [showScanner, setShowScanner] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [savingStock, setSavingStock] = useState<string | null>(null);
  const [recentlySaved, setRecentlySaved] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus the scanner input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const handleScan = (decodedText: string) => {
    setShowScanner(false);
    setSearchTerm(decodedText);
  };

  const updateStock = async (productId: string, newStock: number) => {
    setSavingStock(productId);
    try {
      await updateDoc(doc(db, 'products', productId), { stock: newStock });
      setRecentlySaved(productId);
      setTimeout(() => setRecentlySaved(null), 2000);
    } catch (e) {
      console.error(e);
    }
    setSavingStock(null);
  };

  const filteredProducts = useMemo(() => {
    let filtered = products;
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        (p.barcode && p.barcode.toLowerCase() === lowerSearch) || 
        p.name.toLowerCase().includes(lowerSearch)
      );
    }
    // Sort by stock ascending
    return filtered.sort((a, b) => (a.stock || 0) - (b.stock || 0));
  }, [products, searchTerm]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {showScanner && (
        <BarcodeScanner 
          onResult={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Control Panel */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
          <Barcode className="text-indigo-600" /> 
          Escáner de Código de Barras
        </h3>
        <p className="text-sm text-slate-500">
          Usa una pistola lectora láser y gatilla sobre el código, o usa la cámara de tu celular.
        </p>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              <Search size={18} />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Haz clic aquí para escanear con pistola..."
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-indigo-100 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all font-mono text-lg"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
          <button
            onClick={() => setShowScanner(true)}
            className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all"
          >
            <Camera size={20} />
            <span className="hidden sm:inline">Cámara</span>
          </button>
        </div>
      </div>

      {/* Stock Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Producto</th>
                <th className="p-4">Código (SKU)</th>
                <th className="p-4 text-center">Stock Actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {p.mainImage ? (
                        <img src={p.mainImage} alt={p.name} className="w-10 h-10 rounded-lg object-cover border" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-100 border flex items-center justify-center text-slate-400 text-xs">Sin img</div>
                      )}
                      <div>
                        <p className="font-bold text-slate-800 text-sm leading-tight">{p.name}</p>
                        <p className="text-[10px] text-slate-400 font-semibold">{p.category}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm font-mono text-slate-600">
                    {p.barcode || <span className="text-slate-300 italic text-xs">Sin código</span>}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => updateStock(p.id, Math.max(0, (p.stock || 0) - 1))}
                        disabled={savingStock === p.id}
                        className="w-8 h-8 rounded-full bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center font-bold disabled:opacity-50 flex-shrink-0"
                      >
                        -
                      </button>
                      <input 
                        type="number"
                        value={p.stock || 0}
                        onChange={(e) => updateStock(p.id, parseInt(e.target.value) || 0)}
                        className="w-16 text-center font-black text-lg border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none p-1"
                      />
                      <button 
                        onClick={() => updateStock(p.id, (p.stock || 0) + 1)}
                        disabled={savingStock === p.id}
                        className="w-8 h-8 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold disabled:opacity-50 flex-shrink-0"
                      >
                        +
                      </button>
                      
                      <div className="w-6 flex items-center justify-center flex-shrink-0">
                        {savingStock === p.id && <Loader2 size={16} className="text-blue-500 animate-spin" />}
                        {recentlySaved === p.id && <Check size={16} className="text-emerald-500" />}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-500">
                    No se encontraron productos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
