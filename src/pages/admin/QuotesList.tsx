import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Quote } from '../../types/quote';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, FileText, Search, Download, Loader2 } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { QuotePDF } from '../../components/QuotePDF';
import { useBusinessSettings } from '../../hooks/useBusinessSettings';

export const QuotesList: React.FC = () => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const businessSettings = useBusinessSettings();

  useEffect(() => {
    const q = query(collection(db, 'quotes'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Quote[];
      setQuotes(data);
    });
    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este presupuesto?')) {
      await deleteDoc(doc(db, 'quotes', id));
    }
  };

  const handleDownloadPDF = async (quote: Quote) => {
    setDownloadingId(quote.id);
    try {
      const blob = await pdf(
        <QuotePDF 
          quote={quote} 
          settings={businessSettings}
        />
      ).toBlob();
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Presupuesto_${quote.id.slice(0, 6)}_${(quote.customerName || 'Anonimo').replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Error al generar el PDF.');
    }
    setDownloadingId(null);
  };

  const filteredQuotes = quotes.filter(q => 
    q.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Presupuestos</h1>
          <p className="text-slate-500">Historial de cotizaciones generadas.</p>
        </div>
        <button 
          onClick={() => navigate('/admin/quotes/new')}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={20} /> Nuevo Presupuesto
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="relative w-full">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Buscar por cliente..."
            className="input pl-10 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Fecha</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Total</th>
                <th className="p-4">Vencimiento</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredQuotes.map(q => {
                const isExpired = new Date(q.validUntil) < new Date();
                return (
                  <tr key={q.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-sm text-slate-600">
                      {new Date(q.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <span className="font-bold text-slate-800">{q.customerName || 'Cliente Anónimo'}</span>
                      <p className="text-xs text-slate-500">{q.items.length} ítems</p>
                    </td>
                    <td className="p-4 font-bold text-slate-800">
                      ${q.total.toLocaleString()}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                        isExpired ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {new Date(q.validUntil).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => navigate(`/admin/quotes/${q.id}`)}
                          className="p-2 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-50 transition-colors"
                          title="Ver y Editar"
                        >
                          <FileText size={18} />
                        </button>
                        <button
                          onClick={() => handleDownloadPDF(q)}
                          disabled={downloadingId === q.id}
                          className="p-2 text-slate-500 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-50"
                          title="Descargar PDF"
                        >
                          {downloadingId === q.id ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                        </button>
                        <button
                          onClick={() => handleDelete(q.id)}
                          className="p-2 text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredQuotes.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    No hay presupuestos generados.
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
