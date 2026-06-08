import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, limit } from 'firebase/firestore';
import { createPortal } from 'react-dom';
import { db } from '../../firebase';
import type { CashSession, CashMovement, PaymentMethod } from '../../types/cash';
import { useAuth } from '../../context/AuthContext';
import { Wallet, LogIn, LogOut, ArrowUpRight, ArrowDownRight, X, PlusCircle, Loader2, CheckCircle } from 'lucide-react';
import { NumericInput } from '../../components/NumericInput';

export const Cash: React.FC = () => {
  const { userData } = useAuth();
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Opening / Closing form states
  const [initialAmount, setInitialAmount] = useState<number | ''>(0);
  const [declaredAmount, setDeclaredAmount] = useState<number | ''>(0);
  const [obs, setObs] = useState('');
  const [sessionSaving, setSessionSaving] = useState(false);

  // Manual transaction modal states
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualAmount, setManualAmount] = useState<number | ''>(0);
  const [manualType, setManualType] = useState<'manual_income' | 'manual_expense'>('manual_income');
  const [manualMethod, setManualMethod] = useState<PaymentMethod>('cash');
  const [manualObs, setManualObs] = useState('');
  const [manualSaving, setManualSaving] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    // 1. Escuchar la caja abierta actualmente
    const qSession = query(collection(db, 'cash_sessions'), where('status', '==', 'open'), limit(1));
    const unsubSession = onSnapshot(qSession, (snap) => {
      if (!snap.empty) {
        const session = { id: snap.docs[0].id, ...snap.docs[0].data() } as CashSession;
        setActiveSession(session);
        
        // 2. Cargar movimientos de esa caja (sorted in-memory to prevent composite index requirement)
        const qMovs = query(collection(db, 'cash_movements'), where('sessionId', '==', session.id));
        const unsubMovs = onSnapshot(qMovs, (snapMovs) => {
          const list = snapMovs.docs.map(d => ({ id: d.id, ...d.data() } as CashMovement));
          list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setMovements(list);
        });
        setLoading(false);
        return () => unsubMovs();
      } else {
        setActiveSession(null);
        setMovements([]);
        setLoading(false);
      }
    });
    return () => unsubSession();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const openCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData) return;
    setSessionSaving(true);
    try {
      const startAmt = initialAmount === '' ? 0 : Number(initialAmount);
      const newSession: Omit<CashSession, 'id'> = {
        openedAt: new Date().toISOString(),
        openedBy: userData.uid,
        openedByName: userData.displayName,
        initialAmount: startAmt,
        status: 'open',
        totalIncome: 0,
        totalExpense: 0,
        expectedAmount: startAmt,
        breakdown: { cash: startAmt, transfer: 0, mercadopago: 0, card: 0, other: 0 }
      };
      await addDoc(collection(db, 'cash_sessions'), newSession);
      setInitialAmount(0);
      showToast("Caja abierta exitosamente");
    } catch (error) {
      console.error(error);
      alert("Error al abrir la caja");
    } finally {
      setSessionSaving(false);
    }
  };

  const closeCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !userData) return;
    setSessionSaving(true);
    
    // Calculates
    const declAmt = declaredAmount === '' ? 0 : Number(declaredAmount);
    const expected = activeSession.initialAmount + activeSession.totalIncome - activeSession.totalExpense;
    const diff = declAmt - expected;
    
    try {
      await updateDoc(doc(db, 'cash_sessions', activeSession.id), {
        status: 'closed',
        closedAt: new Date().toISOString(),
        closedBy: userData.uid,
        closedByName: userData.displayName,
        expectedAmount: expected,
        declaredAmount: declAmt,
        difference: diff,
        observations: obs
      });
      setDeclaredAmount(0);
      setObs('');
      showToast("Caja cerrada exitosamente");
    } catch (error) {
      console.error(error);
      alert("Error al cerrar caja");
    } finally {
      setSessionSaving(false);
    }
  };

  const handleRegisterManualMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = manualAmount === '' ? 0 : Number(manualAmount);
    if (!activeSession || !userData || amt <= 0 || !manualObs.trim()) return;

    setManualSaving(true);
    try {
      // 1. Create movement
      const movementData: Omit<CashMovement, 'id'> = {
        sessionId: activeSession.id,
        date: new Date().toISOString(),
        type: manualType,
        amount: amt,
        paymentMethod: manualMethod,
        userId: userData.uid,
        userName: userData.displayName || 'Admin',
        observation: `[Manual] ${manualObs.trim()}`
      };
      await addDoc(collection(db, 'cash_movements'), movementData);

      // 2. Update session totals
      const sessionRef = doc(db, 'cash_sessions', activeSession.id);
      let incomeChange = 0;
      let expenseChange = 0;
      let breakdownChange = 0;

      if (manualType === 'manual_income') {
        incomeChange = amt;
        breakdownChange = amt;
      } else {
        expenseChange = amt;
        breakdownChange = -amt;
      }

      const currentIncome = activeSession.totalIncome || 0;
      const currentExpense = activeSession.totalExpense || 0;
      const currentExpected = activeSession.expectedAmount || 0;
      const breakdown = { ...(activeSession.breakdown || { cash: 0, transfer: 0, mercadopago: 0, card: 0, other: 0 }) };

      breakdown[manualMethod] = (breakdown[manualMethod] || 0) + breakdownChange;

      await updateDoc(sessionRef, {
        totalIncome: currentIncome + incomeChange,
        totalExpense: currentExpense + expenseChange,
        expectedAmount: currentExpected + breakdownChange,
        breakdown
      });

      showToast("Movimiento manual registrado");
      setManualAmount(0);
      setManualObs('');
      setManualModalOpen(false);
    } catch (error) {
      console.error(error);
      alert("Error al registrar movimiento manual");
    } finally {
      setManualSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-500">Cargando datos de caja...</div>;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Caja Diaria</h1>
          <p className="text-slate-500 text-sm">Control de apertura, cobros y cierre del turno del día.</p>
        </div>
      </div>

      {!activeSession ? (
        <div className="card p-8 max-w-md mx-auto mt-10 shadow-lg">
          <div className="flex flex-col items-center mb-6 text-slate-600">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Wallet size={32} className="text-slate-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Caja Cerrada</h2>
            <p className="text-center text-sm mt-2 text-slate-500">No hay ninguna caja abierta actualmente. Abre la caja para comenzar a registrar ventas.</p>
          </div>
          
          <form onSubmit={openCash} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Monto Inicial en Efectivo ($)</label>
              <NumericInput 
                required
                className="w-full border border-slate-300 rounded-lg p-3 text-lg font-bold focus:ring-2 focus:ring-blue-500"
                value={initialAmount} 
                onChange={val => setInitialAmount(val)}
              />
            </div>
            <button type="submit" disabled={sessionSaving} className="w-full btn-primary py-3 flex justify-center items-center gap-2 text-lg">
              {sessionSaving ? <Loader2 className="animate-spin" size={20} /> : <LogIn size={20} />} 
              Abrir Caja
            </button>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Movimientos */}
            <div className="card overflow-hidden flex flex-col h-[70vh]">
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-slate-50">
                <h3 className="font-semibold text-slate-800 text-sm">Movimientos del Turno</h3>
                <button 
                  onClick={() => setManualModalOpen(true)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-100 transition-colors w-full sm:w-auto justify-center"
                >
                  <PlusCircle size={14} /> Ingreso / Egreso Manual
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                {movements.length === 0 && <p className="text-center text-slate-400 py-10">No hay movimientos en este turno.</p>}
                {movements.map(m => {
                  const isIncome = ['sale_income', 'account_payment', 'deposit', 'manual_income'].includes(m.type);
                  return (
                    <div key={m.id} className="flex justify-between items-center p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isIncome ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                          {isIncome ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{m.observation}</p>
                          <p className="text-xs text-slate-500">{new Date(m.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {m.paymentMethod}</p>
                        </div>
                      </div>
                      <div className={`font-bold ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
                        {isIncome ? '+' : '-'}${m.amount.toLocaleString('es-AR')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Resumen */}
            <div className="card p-6 bg-slate-900 text-white shadow-xl shadow-slate-900/20 flex flex-col justify-between">
              <div>
                <h3 className="font-semibold text-slate-300 mb-6 flex items-center justify-between">
                  <span>Resumen Actual</span>
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded border border-emerald-500/30">Caja Abierta</span>
                </h3>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-800 text-sm">
                    <span className="text-slate-400">Monto Inicial</span>
                    <span className="font-semibold">${activeSession.initialAmount.toLocaleString('es-AR')}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-800 text-sm">
                    <span className="text-slate-400">Ingresos</span>
                    <span className="font-semibold text-emerald-400">+${activeSession.totalIncome.toLocaleString('es-AR')}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-800 text-sm">
                    <span className="text-slate-400">Egresos</span>
                    <span className="font-semibold text-red-400">-${activeSession.totalExpense.toLocaleString('es-AR')}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-slate-300 font-medium text-sm">Total Esperado</span>
                    <span className="text-2xl font-bold text-white">
                      ${(activeSession.initialAmount + activeSession.totalIncome - activeSession.totalExpense).toLocaleString('es-AR')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cierre */}
            <div className="card p-6 border border-red-100">
              <h3 className="font-semibold text-red-800 mb-4 flex items-center gap-2">
                <LogOut size={20} /> Cierre de Caja
              </h3>
              <form onSubmit={closeCash} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Efectivo Real en Caja ($)</label>
                  <NumericInput 
                    required
                    className="w-full border border-slate-300 rounded-lg p-2.5 font-bold text-lg focus:ring-2 focus:ring-red-500"
                    value={declaredAmount} 
                    onChange={val => setDeclaredAmount(val)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Observaciones</label>
                  <textarea 
                    rows={2}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-red-500"
                    value={obs} onChange={e => setObs(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={sessionSaving} className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-lg transition-colors flex justify-center items-center gap-1.5">
                  {sessionSaving ? <Loader2 className="animate-spin" size={16} /> : <LogOut size={16} />}
                  Cerrar Caja
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ Manual Movement Modal ══════════════ */}
      {manualModalOpen && activeSession && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setManualModalOpen(false)}>
          <div className="absolute inset-0" />
          
          <form onSubmit={handleRegisterManualMovement} className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fadeIn overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Registrar Movimiento Manual</h3>
                <p className="text-xs text-slate-500 mt-0.5">Ingresos y egresos directos de caja.</p>
              </div>
              <button type="button" onClick={() => setManualModalOpen(false)} className="btn-icon">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setManualType('manual_income')}
                  className={`py-2 text-sm font-semibold rounded-lg transition-all ${
                    manualType === 'manual_income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Ingreso (+)
                </button>
                <button
                  type="button"
                  onClick={() => setManualType('manual_expense')}
                  className={`py-2 text-sm font-semibold rounded-lg transition-all ${
                    manualType === 'manual_expense' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Egreso (-)
                </button>
              </div>

              <div>
                <label className="input-label">Monto ($) <span className="text-red-500">*</span></label>
                <NumericInput 
                  allowDecimals
                  required
                  value={manualAmount} 
                  onChange={val => setManualAmount(val)}
                  className="input font-bold text-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="input-label">Método de Pago</label>
                <select
                  value={manualMethod}
                  onChange={e => setManualMethod(e.target.value as any)}
                  className="input bg-white text-sm"
                >
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="mercadopago">MercadoPago</option>
                  <option value="card">Tarjeta</option>
                  <option value="other">Otro</option>
                </select>
              </div>

              <div>
                <label className="input-label">Concepto / Descripción <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  required
                  value={manualObs} 
                  onChange={e => setManualObs(e.target.value)}
                  placeholder="Ej. Compra de cinta de embalar, Envío moto..."
                  className="input text-sm"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
              <button type="button" onClick={() => setManualModalOpen(false)} className="btn-secondary text-sm">
                Cancelar
              </button>
              <button 
                type="submit" 
                disabled={manualSaving || manualAmount === '' || manualAmount <= 0 || !manualObs.trim()}
                className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {manualSaving && <Loader2 className="animate-spin" size={16} />}
                Confirmar
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-[fadeIn_0.3s_ease] flex items-center gap-2 bg-slate-800 text-white px-5 py-3 rounded-xl shadow-2xl border border-white/5">
          <CheckCircle size={18} className="text-emerald-400" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </div>
  );
};
