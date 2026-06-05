import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import type { CashSession, CashMovement } from '../../types/cash';
import { History, Calendar, User, ChevronDown, ChevronUp, Clock, AlertTriangle, CheckCircle, Loader2, PlusCircle } from 'lucide-react';

export const CashHistory: React.FC = () => {
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [sessionMovements, setSessionMovements] = useState<Record<string, CashMovement[]>>({});
  const [loadingMovementsId, setLoadingMovementsId] = useState<string | null>(null);

  useEffect(() => {
    const fetchClosedSessions = async () => {
      try {
        const q = query(
          collection(db, 'cash_sessions'),
          where('status', '==', 'closed'),
          orderBy('closedAt', 'desc')
        );
        const snap = await getDocs(q);
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as CashSession)));
      } catch (err) {
        console.error('Error fetching closed cash sessions:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchClosedSessions();
  }, []);

  const loadSessionMovements = async (sessionId: string) => {
    if (sessionMovements[sessionId]) return; // already loaded
    setLoadingMovementsId(sessionId);
    try {
      const q = query(
        collection(db, 'cash_movements'),
        where('sessionId', '==', sessionId),
        orderBy('date', 'asc')
      );
      const snap = await getDocs(q);
      const movements = snap.docs.map(d => ({ id: d.id, ...d.data() } as CashMovement));
      setSessionMovements(prev => ({ ...prev, [sessionId]: movements }));
    } catch (err) {
      console.error('Error fetching movements:', err);
    } finally {
      setLoadingMovementsId(null);
    }
  };

  const handleToggleSession = (sessionId: string) => {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
    } else {
      setExpandedSessionId(sessionId);
      loadSessionMovements(sessionId);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <History size={26} className="text-blue-600" />
            Historial de Cajas
          </h1>
          <p className="page-subtitle">
            Revisá los cierres de caja anteriores, arqueos, diferencias y transacciones detalladas.
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium">Cargando historial...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-16 text-center text-slate-400">
            <History size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-semibold">No hay cajas cerradas registradas.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sessions.map(session => {
              const isExpanded = expandedSessionId === session.id;
              const diff = session.difference || 0;
              const hasDiff = Math.abs(diff) > 1;

              return (
                <div key={session.id} className="transition-colors hover:bg-slate-50/30">
                  {/* Master row */}
                  <div 
                    onClick={() => handleToggleSession(session.id)}
                    className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">
                          Caja #{session.id.slice(0, 6).toUpperCase()}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                          hasDiff 
                            ? 'bg-red-50 text-red-600 border border-red-100' 
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        }`}>
                          {hasDiff ? (
                            <>
                              <AlertTriangle size={10} />
                              Diferencia: ${diff.toLocaleString('es-AR')}
                            </>
                          ) : (
                            <>
                              <CheckCircle size={10} />
                              Arqueo OK
                            </>
                          )}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500">
                        <p className="flex items-center gap-1">
                          <Calendar size={13} className="text-slate-400" />
                          Abierta: {formatDate(session.openedAt)}
                        </p>
                        <p className="flex items-center gap-1">
                          <Clock size={13} className="text-slate-400" />
                          Cerrada: {formatDate(session.closedAt)}
                        </p>
                        <p className="flex items-center gap-1">
                          <User size={13} className="text-slate-400" />
                          Abrió: {session.openedByName}
                        </p>
                        <p className="flex items-center gap-1">
                          <User size={13} className="text-slate-400" />
                          Cerró: {session.closedByName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Monto Cerrado</p>
                        <p className="text-lg font-extrabold text-slate-800">${session.declaredAmount?.toLocaleString('es-AR')}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Inicial: ${session.initialAmount?.toLocaleString('es-AR')}</p>
                      </div>
                      <div className="text-slate-400">
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </div>
                    </div>
                  </div>

                  {/* Detail Panel */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-slate-50 bg-slate-50/30 animate-fadeIn">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-5">
                        {/* Financial breakdown */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-3">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1.5">
                            Detalles del Turno
                          </h4>
                          <div className="space-y-1.5 text-xs text-slate-600">
                            <div className="flex justify-between">
                              <span>Monto Inicial:</span>
                              <span className="font-semibold">${session.initialAmount?.toLocaleString('es-AR')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Total Ingresos:</span>
                              <span className="font-semibold text-emerald-600">+${session.totalIncome?.toLocaleString('es-AR')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Total Egresos:</span>
                              <span className="font-semibold text-red-600">-${session.totalExpense?.toLocaleString('es-AR')}</span>
                            </div>
                            <div className="flex justify-between border-t pt-1.5 font-bold text-slate-800">
                              <span>Esperado en Caja:</span>
                              <span>${session.expectedAmount?.toLocaleString('es-AR')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Efectivo Declarado:</span>
                              <span>${session.declaredAmount?.toLocaleString('es-AR')}</span>
                            </div>
                          </div>
                        </div>

                        {/* Breakdown by payment method */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-3">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1.5">
                            Arqueo por Método
                          </h4>
                          <div className="space-y-1.5 text-xs text-slate-600">
                            <div className="flex justify-between">
                              <span>Efectivo (Cash):</span>
                              <span className="font-semibold">${session.breakdown?.cash?.toLocaleString('es-AR') ?? 0}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Transferencia:</span>
                              <span className="font-semibold">${session.breakdown?.transfer?.toLocaleString('es-AR') ?? 0}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>MercadoPago:</span>
                              <span className="font-semibold">${session.breakdown?.mercadopago?.toLocaleString('es-AR') ?? 0}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Tarjeta:</span>
                              <span className="font-semibold">${session.breakdown?.card?.toLocaleString('es-AR') ?? 0}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Otro:</span>
                              <span className="font-semibold">${session.breakdown?.other?.toLocaleString('es-AR') ?? 0}</span>
                            </div>
                          </div>
                        </div>

                        {/* Notes and observations */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-3">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1.5">
                            Observaciones de Cierre
                          </h4>
                          <p className="text-xs text-slate-600 leading-relaxed italic">
                            {session.observations || 'Sin observaciones registradas para esta caja.'}
                          </p>
                        </div>
                      </div>

                      {/* Session Movements Detail List */}
                      <div className="mt-6 bg-white rounded-xl border border-slate-200/85 overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                          Transacciones Registradas en esta Caja
                        </div>
                        <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto pr-1 no-scrollbar">
                          {loadingMovementsId === session.id ? (
                            <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                              <Loader2 className="animate-spin text-blue-500" size={14} />
                              Cargando movimientos...
                            </div>
                          ) : !sessionMovements[session.id] || sessionMovements[session.id].length === 0 ? (
                            <div className="p-8 text-center text-xs text-slate-400">
                              No se registraron movimientos en este turno.
                            </div>
                          ) : (
                            sessionMovements[session.id].map(mov => {
                              const isIncome = ['sale_income', 'account_payment', 'deposit', 'manual_income'].includes(mov.type);
                              return (
                                <div key={mov.id} className="p-3 flex justify-between items-center hover:bg-slate-50 transition-colors text-xs">
                                  <div className="flex items-center gap-3">
                                    <div className={`p-1.5 rounded-lg ${isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                      {isIncome ? <PlusCircle size={14} /> : <AlertTriangle size={14} />}
                                    </div>
                                    <div>
                                      <p className="font-semibold text-slate-700">{mov.observation}</p>
                                      <p className="text-[10px] text-slate-400 mt-0.5">
                                        {new Date(mov.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - Método: {mov.paymentMethod} - Operador: {mov.userName}
                                      </p>
                                    </div>
                                  </div>
                                  <div className={`font-bold text-sm ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {isIncome ? '+' : '-'}${mov.amount.toLocaleString('es-AR')}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
