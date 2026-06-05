import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Order } from '../../types/order';
import type { BusinessSettings } from '../../types/settings';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, Truck, XCircle, Plus, FileDown, FileText } from 'lucide-react';
import { generateClientPDF, generateInternalPDF } from '../../services/pdfService';

const defaultBusinessSettings: BusinessSettings = {
  name: 'Dualgi 3D',
  ownerName: 'Maxi',
  phone: '+54 9 11 1234-5678',
  email: 'contacto@dualgi3d.com',
  address: 'Calle Falsa 123',
  city: 'Buenos Aires',
  province: 'CABA',
  cuit: '20-12345678-9',
  socialMedia: '@dualgi3d',
  description: 'Materializando tus ideas en 3D'
};

export const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [business, setBusiness] = useState<BusinessSettings>(defaultBusinessSettings);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch Business Settings
    const fetchBusiness = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'business'));
        if (docSnap.exists()) {
          setBusiness(docSnap.data() as BusinessSettings);
        }
      } catch (err) {
        console.error('Error fetching business settings:', err);
      }
    };
    fetchBusiness();

    // Stream Orders
    const q = query(collection(db, 'orders'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ords: Order[] = [];
      snapshot.forEach((doc) => {
        ords.push({ id: doc.id, ...doc.data() } as Order);
      });
      setOrders(ords);
      setLoading(false);
    }, (err) => {
      console.error('Error loading orders:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getStatusBadge = (status: Order['orderStatus']) => {
    switch(status) {
      case 'pending': 
        return <span className="inline-flex items-center gap-1.5 text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded text-[10px] font-bold"><Clock size={11}/> Pendiente</span>;
      case 'processing': 
        return <span className="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded text-[10px] font-bold"><Clock size={11}/> En Proceso</span>;
      case 'finished': 
        return <span className="inline-flex items-center gap-1.5 text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded text-[10px] font-bold"><CheckCircle2 size={11}/> Terminado</span>;
      case 'delivered': 
        return <span className="inline-flex items-center gap-1.5 text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold"><Truck size={11}/> Entregado</span>;
      case 'cancelled': 
        return <span className="inline-flex items-center gap-1.5 text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded text-[10px] font-bold"><XCircle size={11}/> Cancelado</span>;
    }
  };

  const getPaymentBadge = (status: Order['paymentStatus']) => {
    switch(status) {
      case 'unpaid': 
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-100">Sin abonar</span>;
      case 'partial': 
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100">Señado</span>;
      case 'paid': 
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">Pagado</span>;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <CheckCircle2 size={26} className="text-blue-600" />
            Gestión de Pedidos
          </h1>
          <p className="page-subtitle">Historial completo de ventas, presupuestos y estado de cobros.</p>
        </div>
        <button 
          onClick={() => navigate('/orders/new')} 
          className="btn-primary flex items-center gap-2 w-full md:w-auto justify-center"
        >
          <Plus size={20} />
          Crear Pedido
        </button>
      </div>

      {/* Orders List Container */}
      <div className="card overflow-hidden border border-slate-200/80 shadow-sm">
        {loading ? (
          <div className="p-16 text-center text-slate-400">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium">Cargando listado de pedidos...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-4">Nº Pedido</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Pago</th>
                  <th className="p-4 text-right">Total</th>
                  <th className="p-4 text-right">Descargar PDFs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400">
                      No se encontraron pedidos registrados.
                    </td>
                  </tr>
                ) : (
                  orders.map(order => (
                    <tr key={order.id} className="hover:bg-slate-50/40 transition-colors">
                      {/* Order Number */}
                      <td className="p-4 font-bold text-slate-800">
                        #{String(order.orderNumber).padStart(5, '0')}
                      </td>
                      
                      {/* Customer */}
                      <td className="p-4 font-semibold text-slate-700">
                        {order.customerName}
                      </td>
                      
                      {/* Date */}
                      <td className="p-4 text-slate-500">
                        {new Date(order.date).toLocaleDateString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </td>
                      
                      {/* Status */}
                      <td className="p-4">{getStatusBadge(order.orderStatus)}</td>
                      
                      {/* Payment Status */}
                      <td className="p-4">{getPaymentBadge(order.paymentStatus)}</td>
                      
                      {/* Total Amount */}
                      <td className="p-4 font-black text-slate-800 text-right">
                        ${order.totalAmount.toLocaleString('es-AR', {minimumFractionDigits: 1})}
                      </td>
                      
                      {/* Actions */}
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1">
                          {/* Client Invoice PDF */}
                          <button 
                            onClick={() => generateClientPDF(order, business)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Comprobante Cliente"
                          >
                            <FileDown size={16} />
                          </button>
                          
                          {/* Internal Cost PDF */}
                          <button 
                            onClick={() => generateInternalPDF(order, business)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Balance Interno"
                          >
                            <FileText size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
