import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Quote, QuoteItem } from '../../types/quote';
import type { Product } from '../../types/product';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { QuotePDF } from '../../components/QuotePDF';
import { ArrowLeft, Save, Plus, Trash2, Search, FileText, Edit, Check } from 'lucide-react';
import { useBusinessSettings } from '../../hooks/useBusinessSettings';

export const QuoteForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const businessSettings = useBusinessSettings();

  const [customerName, setCustomerName] = useState('');
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dbProducts, setDbProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // For manual items
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');

  // For inline editing
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');

  const [savedQuote, setSavedQuote] = useState<Quote | null>(null);

  useEffect(() => {
    // Load products for search
    const fetchProducts = async () => {
      const snap = await getDocs(collection(db, 'products'));
      const prods = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Product[];
      setDbProducts(prods.filter(p => p.isActive));
    };
    fetchProducts();

    // If edit mode, load quote
    if (id) {
      const fetchQuote = async () => {
        const docRef = doc(db, 'quotes', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const q = { id: docSnap.id, ...docSnap.data() } as Quote;
          setCustomerName(q.customerName);
          setItems(q.items);
          setSavedQuote(q);
        }
      };
      fetchQuote();
    }
  }, [id]);

  const searchResults = useMemo(() => {
    if (!searchTerm) return [];
    const lower = searchTerm.toLowerCase();
    return dbProducts.filter(p => 
      p.name.toLowerCase().includes(lower) || 
      (p.barcode && p.barcode.toLowerCase() === lower)
    ).slice(0, 5);
  }, [dbProducts, searchTerm]);

  const addProduct = (product: Product) => {
    const price = product.hasManualPrice && product.manualPrice ? product.manualPrice : (product.calculatedRetailPrice || 0);
    const existingIndex = items.findIndex(i => i.id === product.id);
    
    if (existingIndex >= 0) {
      const newItems = [...items];
      newItems[existingIndex].quantity += 1;
      newItems[existingIndex].subtotal = newItems[existingIndex].quantity * newItems[existingIndex].unitPrice;
      setItems(newItems);
    } else {
      setItems([...items, {
        id: product.id,
        isManual: false,
        name: product.name,
        unitPrice: price,
        quantity: 1,
        subtotal: price
      }]);
    }
    setSearchTerm('');
  };

  const addManualItem = () => {
    if (!manualName || !manualPrice) return;
    const price = parseFloat(manualPrice);
    if (isNaN(price)) return;

    setItems([...items, {
      id: `manual_${Date.now()}`,
      isManual: true,
      name: manualName,
      unitPrice: price,
      quantity: 1,
      subtotal: price
    }]);
    setManualName('');
    setManualPrice('');
  };

  const updateQuantity = (index: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    const newItems = [...items];
    newItems[index].quantity = newQuantity;
    newItems[index].subtotal = newQuantity * newItems[index].unitPrice;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const startEdit = (index: number, item: QuoteItem) => {
    setEditingItemIndex(index);
    setEditItemName(item.name);
    setEditItemPrice(item.unitPrice.toString());
  };

  const saveEdit = (index: number) => {
    const price = parseFloat(editItemPrice);
    if (isNaN(price)) return;
    
    const newItems = [...items];
    newItems[index].name = editItemName;
    newItems[index].unitPrice = price;
    newItems[index].subtotal = price * newItems[index].quantity;
    setItems(newItems);
    setEditingItemIndex(null);
  };

  const total = items.reduce((sum, item) => sum + item.subtotal, 0);

  const handleSave = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 7); // 7 days validity

      const quoteData = {
        customerName,
        items,
        total,
        validUntil: validUntil.toISOString(),
      };

      if (id) {
        await updateDoc(doc(db, 'quotes', id), quoteData);
        setSavedQuote({ ...savedQuote, ...quoteData } as Quote);
      } else {
        const fullQuoteData = {
          ...quoteData,
          createdAt: now.toISOString(),
        };
        const docRef = await addDoc(collection(db, 'quotes'), fullQuoteData);
        setSavedQuote({ id: docRef.id, ...fullQuoteData } as Quote);
      }
      alert('Presupuesto guardado correctamente.');
    } catch (e) {
      console.error(e);
      alert('Error al guardar el presupuesto.');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/admin/quotes')}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft size={24} className="text-slate-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {id ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Builder Section */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
            
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Nombre del Cliente (Opcional)</label>
              <input 
                type="text" 
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ej. Juan Pérez"
                className="input w-full"
              />
            </div>

            <hr className="border-slate-100" />

            <div className="space-y-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Search size={18} className="text-indigo-600" />
                Buscar en Catálogo
              </h3>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Buscar producto por nombre o código de barras..."
                  className="input w-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    {searchResults.map(p => (
                      <button
                        key={p.id}
                        onClick={() => addProduct(p)}
                        className="w-full text-left p-3 hover:bg-slate-50 border-b border-slate-100 flex justify-between items-center"
                      >
                        <div>
                          <div className="font-bold text-slate-800 text-sm">{p.name}</div>
                          {p.barcode && <div className="text-xs text-slate-400 font-mono">{p.barcode}</div>}
                        </div>
                        <div className="font-bold text-indigo-600">
                          ${(p.hasManualPrice && p.manualPrice ? p.manualPrice : (p.calculatedRetailPrice || 0)).toLocaleString()}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Plus size={18} className="text-emerald-600" />
                  Agregar Artículo Manual
                </h3>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="text-slate-500 py-1 font-semibold">Atajos:</span>
                  <button onClick={() => setManualName('SERVICIO TÉCNICO')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded transition-colors border border-slate-200">Servicio Técnico</button>
                  <button onClick={() => setManualName('MANTENIMIENTO')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded transition-colors border border-slate-200">Mantenimiento</button>
                  <button onClick={() => setManualName('FORMATEO')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded transition-colors border border-slate-200">Formateo</button>
                </div>
              </div>
              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder="Descripción"
                  className="input flex-1"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                />
                <input 
                  type="number"
                  placeholder="Precio Unitario"
                  className="input w-32"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                />
                <button 
                  onClick={addManualItem}
                  disabled={!manualName || !manualPrice}
                  className="btn-primary disabled:opacity-50"
                >
                  Agregar
                </button>
              </div>
            </div>

          </div>

          {/* Items Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Artículo</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Cant.</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Unitario</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Subtotal</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <tr key={idx}>
                    {editingItemIndex === idx ? (
                      <>
                        <td className="p-4" colSpan={2}>
                          <input 
                            type="text" 
                            className="input w-full text-sm py-1.5" 
                            value={editItemName} 
                            onChange={e => setEditItemName(e.target.value)} 
                          />
                        </td>
                        <td className="p-4">
                          <input 
                            type="number" 
                            className="input w-24 text-sm py-1.5 text-right" 
                            value={editItemPrice} 
                            onChange={e => setEditItemPrice(e.target.value)} 
                          />
                        </td>
                        <td className="p-4 text-right font-bold text-sm">
                          ${(parseFloat(editItemPrice) * item.quantity || 0).toLocaleString()}
                        </td>
                        <td className="p-4 text-right">
                          <button onClick={() => saveEdit(idx)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                            <Check size={16} />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-4">
                          <p className={`text-sm ${item.isManual ? 'text-slate-600' : 'font-bold text-slate-800'}`}>
                            {item.name}
                          </p>
                          {item.isManual && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 rounded uppercase">Manual</span>}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => updateQuantity(idx, item.quantity - 1)} className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200">-</button>
                            <span className="font-bold w-4 text-center">{item.quantity}</span>
                            <button onClick={() => updateQuantity(idx, item.quantity + 1)} className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200">+</button>
                          </div>
                        </td>
                        <td className="p-4 text-right font-mono text-sm">${item.unitPrice.toLocaleString()}</td>
                        <td className="p-4 text-right font-bold text-sm">${item.subtotal.toLocaleString()}</td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => startEdit(idx, item)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                              <Edit size={16} />
                            </button>
                            <button onClick={() => removeItem(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      No hay artículos en el presupuesto.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-slate-800">Resumen</h2>
            
            <div className="flex justify-between items-center py-4 border-t border-b border-slate-100">
              <span className="text-slate-500 font-bold">Total Final:</span>
              <span className="text-3xl font-black text-indigo-600">${total.toLocaleString()}</span>
            </div>

            <button 
              onClick={handleSave}
              disabled={loading || items.length === 0}
              className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={20} />
              {loading ? 'Guardando...' : 'Guardar Presupuesto'}
            </button>
          </div>

          {savedQuote && (
            <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 shadow-sm space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                  <FileText size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-indigo-900">PDF Generado</h3>
                  <p className="text-xs text-indigo-700/80">El presupuesto está listo para ser descargado.</p>
                </div>
              </div>
              
              <PDFDownloadLink
                document={
                  <QuotePDF 
                    quote={savedQuote} 
                    settings={businessSettings}
                  />
                }
                fileName={`Presupuesto_${savedQuote.id.slice(0, 6)}_${savedQuote.customerName.replace(/\s+/g, '_')}.pdf`}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
              >
                {/* @ts-expect-error - The render prop works but types can be tricky */}
                {({ loading }) => (loading ? 'Generando PDF...' : 'Descargar PDF')}
              </PDFDownloadLink>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
