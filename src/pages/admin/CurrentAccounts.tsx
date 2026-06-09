import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, getDocs, updateDoc, doc, addDoc, writeBatch, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Client } from '../../types/client';
import { migrateClient } from '../../types/client';
import type { Order } from '../../types/order';
import { allocatePaymentFifo } from '../../services/paymentAllocation';
import type { CashSession, PaymentMethod } from '../../types/cash';
import { useAuth } from '../../context/AuthContext';
import { CreditCard, Search, DollarSign, Receipt, ChevronDown, ChevronUp, X, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { NumericInput } from '../../components/NumericInput';

export const CurrentAccounts: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  // Payment modal state
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | ''>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [observations, setObservations] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Active Daily Cash
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);

  const { userData } = useAuth();

  // Load clients, orders, active cash session in real-time
  useEffect(() => {
    // 1. Listen to clients with debt
    const qClients = query(collection(db, 'clients'), orderBy('lastName', 'asc'));
    const unsubClients = onSnapshot(qClients, (snap) => {
      setClients(snap.docs.map(d => migrateClient({ id: d.id, ...d.data() }) as Client));
      setLoading(false);
    });

    // 2. Listen to all pending/partial orders to show detail
    const qOrders = query(collection(db, 'orders'), where('paymentStatus', 'in', ['unpaid', 'partial']));
    const unsubOrders = onSnapshot(qOrders, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
    });

    // 3. Listen to open cash session
    const qSession = query(collection(db, 'cash_sessions'), where('status', '==', 'open'));
    const unsubSession = onSnapshot(qSession, (snap) => {
      if (!snap.empty) {
        setActiveSession({ id: snap.docs[0].id, ...snap.docs[0].data() } as CashSession);
      } else {
        setActiveSession(null);
      }
    });

    return () => {
      unsubClients();
      unsubOrders();
      unsubSession();
    };
  }, []);

  // Filter clients with active debt (>0 totalOwed) matching search term
  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const nameMatch = `${c.firstName} ${c.lastName}`.toLowerCase().includes(searchTerm.toLowerCase());
      const hasDebt = (c.totalOwed || 0) > 0;
      return hasDebt && nameMatch;
    });
  }, [clients, searchTerm]);

  // Expand client's pending orders
  const getClientPendingOrders = (clientId: string) => {
    return orders
      .filter(o => o.customerId === clientId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  // Open modal
  const openPaymentModal = (client: Client) => {
    setSelectedClient(client);
    setPaymentAmount(client.totalOwed || 0);
    setPaymentMethod('cash');
    setObservations('');
  };

  // Close modal
  const closePaymentModal = () => {
    setSelectedClient(null);
    setPaymentAmount(0);
    setObservations('');
  };

  // Toast helper
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Submit payment
  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = paymentAmount === '' ? 0 : Number(paymentAmount);
    if (!selectedClient || amt <= 0) return;
    if (amt > (selectedClient.totalOwed || 0)) {
      return alert("El monto ingresado supera el saldo adeudado del cliente.");
    }
    if (!activeSession) {
      return alert("La caja diaria está cerrada. Abre la caja en la sección de Caja para poder registrar pagos.");
    }

    setSaving(true);

    try {
      // 1. Fetch all pending orders for this customer (oldest first)
      const customerOrdersQuery = query(
        collection(db, 'orders'),
        where('customerId', '==', selectedClient.id),
        where('paymentStatus', 'in', ['unpaid', 'partial'])
      );
      const ordersSnap = await getDocs(customerOrdersQuery);
      
      const clientOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      const { orderUpdates } = allocatePaymentFifo(clientOrders, amt, '[Pago Cta Cte]');

      const batch = writeBatch(db);
      for (const upd of orderUpdates) {
        const orderRef = doc(db, 'orders', upd.orderId);
        batch.update(orderRef, {
          paidAmount: upd.paidAmount,
          pendingAmount: upd.pendingAmount,
          paymentStatus: upd.paymentStatus,
          observationsInternal: upd.observationsInternal,
        });
      }

      // 2. Update Client totalOwed
      const clientRef = doc(db, 'clients', selectedClient.id);
      const newOwed = Math.max(0, (selectedClient.totalOwed || 0) - amt);
      batch.update(clientRef, { totalOwed: newOwed });

      // Commit DB changes
      await batch.commit();

      // 3. Register Cash Session Transaction
      const movementData: Omit<any, 'id'> = {
        sessionId: activeSession.id,
        date: new Date().toISOString(),
        type: 'account_payment',
        amount: amt,
        paymentMethod,
        customerId: selectedClient.id,
        userId: userData?.uid || '',
        userName: userData?.displayName || 'Admin',
        observation: `Pago a Cuenta Corriente de ${selectedClient.firstName} ${selectedClient.lastName}. ${observations}`
      };
      
      await addDoc(collection(db, 'cash_movements'), movementData);

      // 4. Update Cash Session totals
      const sessionRef = doc(db, 'cash_sessions', activeSession.id);
      const currentIncome = activeSession.totalIncome || 0;
      const currentExpected = activeSession.expectedAmount || 0;
      const breakdown = { ...(activeSession.breakdown || { cash: 0, transfer: 0, mercadopago: 0, card: 0, other: 0 }) };
      
      breakdown[paymentMethod] = (breakdown[paymentMethod] || 0) + amt;

      await updateDoc(sessionRef, {
        totalIncome: currentIncome + amt,
        expectedAmount: currentExpected + amt,
        breakdown
      });

      showToast("Pago registrado exitosamente");
      closePaymentModal();
    } catch (error) {
      console.error(error);
      alert("Error al registrar el pago.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <CreditCard size={26} className="text-blue-600" />
            Cuentas Corrientes
          </h1>
          <p className="page-subtitle">
            Gestión y cobro de saldos deudores acumulados por tus clientes de confianza y mayoristas.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por cliente..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Debt list grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400">
            <Loader2 className="animate-spin text-blue-500 mx-auto mb-3" size={32} />
            <p className="text-sm">Cargando saldos...</p>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="col-span-full card p-10 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle size={32} className="text-emerald-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-800">Cuentas al día</h3>
            <p className="text-slate-500 mt-2 text-sm">No hay clientes con saldos deudores pendientes.</p>
          </div>
        ) : (
          filteredClients.map(client => {
            const isExpanded = expandedClientId === client.id;
            const pendingOrders = getClientPendingOrders(client.id);

            return (
              <div key={client.id} className="card p-4 sm:p-5 border-t-4 border-amber-500 flex flex-col justify-between shadow-sm">
                <div>
                  <div className="flex justify-between items-start mb-3 sm:mb-4 gap-2">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm sm:text-base leading-tight">
                        {client.firstName} {client.lastName}
                      </h3>
                      {client.phone && <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">{client.phone}</p>}
                    </div>
                    <div className="flex flex-wrap gap-1 flex-shrink-0">
                      {client.isWholesale && (
                        <span className="text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100">
                          Mayorista
                        </span>
                      )}
                      {client.isTrusted && (
                        <span className="text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100">
                          Confianza
                        </span>
                      )}
                      {!client.isWholesale && !client.isTrusted && (
                        <span className="text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
                          Minorista
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="mb-3 sm:mb-4">
                    <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold">Total adeudado:</p>
                    <p className="text-2xl sm:text-3xl font-extrabold text-amber-600 mt-0.5">${client.totalOwed?.toLocaleString('es-AR')}</p>
                  </div>
                  
                  {/* Expandable Order List */}
                  <div className="border-t border-slate-100 pt-2.5 mt-2.5">
                    <button 
                      onClick={() => setExpandedClientId(isExpanded ? null : client.id)}
                      className="flex items-center justify-between w-full text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-800"
                    >
                      <span>Pedidos Pendientes ({pendingOrders.length})</span>
                      {isExpanded ? <ChevronUp size={12} className="sm:w-3.5 sm:h-3.5" /> : <ChevronDown size={12} className="sm:w-3.5 sm:h-3.5" />}
                    </button>
                    
                    {isExpanded && (
                      <div className="space-y-1.5 mt-2.5 max-h-[120px] sm:max-h-[160px] overflow-y-auto pr-1 no-scrollbar animate-fadeIn">
                        {pendingOrders.length === 0 && <p className="text-[11px] sm:text-xs text-slate-400 italic">No hay pedidos pendientes de cobro.</p>}
                        {pendingOrders.map(o => (
                          <div key={o.id} className="flex justify-between items-center text-[11px] sm:text-xs bg-slate-50 p-1.5 sm:p-2 rounded border">
                            <span className="text-slate-600 font-medium flex items-center gap-1">
                              <Receipt size={11} className="text-slate-400 sm:w-3 sm:h-3" />
                              Pedido #{String(o.orderNumber).padStart(5,'0')}
                            </span>
                            <span className="font-bold text-slate-800">${o.pendingAmount.toLocaleString('es-AR')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 sm:mt-5 pt-3 sm:pt-4 border-t border-slate-100">
                  <button 
                    onClick={() => openPaymentModal(client)}
                    className="w-full btn-primary py-2 text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/25"
                  >
                    <DollarSign size={14} className="sm:w-4 sm:h-4" /> Registrar Pago
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ══════════════ Payment Modal ══════════════ */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closePaymentModal} />
          
          <form onSubmit={handleRegisterPayment} className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fadeIn overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Registrar Pago a Cuenta</h3>
                <p className="text-xs text-slate-500 mt-0.5">Cliente: {selectedClient.firstName} {selectedClient.lastName}</p>
              </div>
              <button type="button" onClick={closePaymentModal} className="btn-icon">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5 flex justify-between items-center">
                <span className="text-xs font-semibold text-amber-800">Saldo Adeudado Actual:</span>
                <span className="font-extrabold text-amber-600 text-lg">${selectedClient.totalOwed?.toLocaleString('es-AR')}</span>
              </div>

              <div>
                <label className="input-label">Monto a Abonar ($) <span className="text-red-500">*</span></label>
                <NumericInput 
                  allowDecimals
                  required
                  value={paymentAmount} 
                  onChange={val => setPaymentAmount(val)}
                  className="input font-bold text-lg text-slate-800 focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Método de Pago</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as any)}
                    className="input bg-white text-sm"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="transfer">Transferencia</option>
                    <option value="mercadopago">MercadoPago</option>
                    <option value="card">Tarjeta</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="input-label">Observaciones (Opcional)</label>
                <textarea
                  rows={2}
                  value={observations}
                  onChange={e => setObservations(e.target.value)}
                  placeholder="Ej. Transferencia recibida por banco Galicia..."
                  className="input text-sm resize-none"
                />
              </div>

              {/* Cash closed warning */}
              {!activeSession && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-xs p-3 rounded-xl flex items-start gap-2 font-medium">
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>La caja diaria está cerrada. Debes abrir la caja antes de registrar cobros en cuentas corrientes.</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
              <button type="button" onClick={closePaymentModal} className="btn-secondary text-sm">
                Cancelar
              </button>
              <button 
                type="submit" 
                disabled={saving || !activeSession || paymentAmount === '' || Number(paymentAmount) <= 0 || Number(paymentAmount) > (selectedClient.totalOwed || 0)}
                className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 className="animate-spin" size={16} />}
                Confirmar Pago
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══════════════ Toast Notification ══════════════ */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-[fadeIn_0.3s_ease] flex items-center gap-2 bg-slate-800 text-white px-5 py-3 rounded-xl shadow-2xl border border-white/5">
          <CheckCircle size={18} className="text-emerald-400" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </div>
  );
};
