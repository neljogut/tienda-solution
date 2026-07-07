import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, onSnapshot, query, orderBy, doc, getDoc, writeBatch, addDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Order, OrderStatus, PaymentStatus } from '../../types/order';
import type { BusinessSettings } from '../../types/settings';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { CheckCircle2, Clock, Truck, XCircle, Plus, FileDown, FileText, Loader2, Edit2, X, Trash2, AlertCircle, ChevronDown, ChevronUp, Package } from 'lucide-react';
import { generateClientPDF, generateInternalPDF } from '../../services/pdfService';
import { notifyClientOrderChanges } from '../../services/notificationService';
import { getDefaultBusinessSettings } from '../../constants/defaults';
import { NumericInput } from '../../components/NumericInput';

const ORDER_STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'processing', label: 'En proceso' },
  { value: 'finished', label: 'Terminado' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'cancelled', label: 'Cancelado' },
];

const PAYMENT_STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: 'unpaid', label: 'Sin abonar' },
  { value: 'partial', label: 'Señado' },
  { value: 'paid', label: 'Pagado' },
];

const defaultBusinessSettings: BusinessSettings = getDefaultBusinessSettings();

function resolvePaymentAmounts(
  totalAmount: number,
  status: PaymentStatus,
  currentPaid?: number
): { paidAmount: number; pendingAmount: number; paymentStatus: PaymentStatus } {
  if (status === 'paid') {
    return { paidAmount: totalAmount, pendingAmount: 0, paymentStatus: 'paid' };
  }
  if (status === 'unpaid') {
    return { paidAmount: 0, pendingAmount: totalAmount, paymentStatus: 'unpaid' };
  }
  const paidAmount = Math.min(
    totalAmount,
    Math.max(0, Number(currentPaid) || 0)
  );
  if (paidAmount <= 0) {
    return { paidAmount: 0, pendingAmount: totalAmount, paymentStatus: 'unpaid' };
  }
  if (paidAmount >= totalAmount) {
    return { paidAmount: totalAmount, pendingAmount: 0, paymentStatus: 'paid' };
  }
  return {
    paidAmount,
    pendingAmount: totalAmount - paidAmount,
    paymentStatus: 'partial',
  };
}

export const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [business, setBusiness] = useState<BusinessSettings>(defaultBusinessSettings);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editForm, setEditForm] = useState<{
    orderStatus: OrderStatus;
    paymentStatus: PaymentStatus;
    paidAmount: number;
  } | null>(null);

  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const toggleExpand = (orderId: string, e?: React.MouseEvent) => {
    // En fila de escritorio: no expandir si el clic fue en acciones (editar, PDF, etc.)
    if (e) {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('a') || target.closest('select')) {
        return;
      }
    }
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  // Deletion modal state
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);
  const [restoreStock, setRestoreStock] = useState(true);

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission, userData } = useAuth();

  // Sorting state
  const [sortBy, setSortBy] = useState<'orderNumber' | 'customerName' | 'date' | 'orderStatus' | 'paymentStatus' | 'totalAmount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder(field === 'customerName' ? 'asc' : 'desc');
    }
  };

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      let valA: any = a[sortBy];
      let valB: any = b[sortBy];

      if (sortBy === 'date') {
        valA = new Date(a.date).getTime();
        valB = new Date(b.date).getTime();
      } else if (sortBy === 'customerName') {
        valA = (a.customerName || '').toLowerCase();
        valB = (b.customerName || '').toLowerCase();
      } else if (sortBy === 'orderStatus') {
        valA = (a.orderStatus || '').toLowerCase();
        valB = (b.orderStatus || '').toLowerCase();
      } else if (sortBy === 'paymentStatus') {
        valA = (a.paymentStatus || '').toLowerCase();
        valB = (b.paymentStatus || '').toLowerCase();
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [orders, sortBy, sortOrder]);

  const renderSortIndicator = (field: typeof sortBy) => {
    if (sortBy !== field) return <span className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1">⇅</span>;
    return <span className="text-blue-600 ml-1">{sortOrder === 'asc' ? '▲' : '▼'}</span>;
  };

  const renderMobileSortButton = (field: typeof sortBy, label: string) => {
    const isActive = sortBy === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap shadow-sm border ${
          isActive
            ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:border-blue-700 active:scale-95'
            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 active:bg-slate-100 active:scale-95'
        }`}
      >
        {label}
        {isActive ? (
          <span className="text-[10px] font-extrabold">{sortOrder === 'asc' ? '▲' : '▼'}</span>
        ) : (
          <span className="text-slate-300">⇅</span>
        )}
      </button>
    );
  };

  const canChangeOrderState = hasPermission('changeOrderState');
  const canRegisterPayments = hasPermission('registerPayments');

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
    const q = userData?.role === 'employee'
      ? query(collection(db, 'orders'), where('commissionEmployeeId', '==', userData.uid))
      : query(collection(db, 'orders'), orderBy('date', 'desc'));
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



  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || orders.length === 0) return;

    setExpandedOrders((prev) => ({ ...prev, [openId]: true }));
    const timer = setTimeout(() => {
      document.getElementById(`order-row-${openId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);

    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });

    return () => clearTimeout(timer);
  }, [searchParams, orders, setSearchParams]);

  useEffect(() => {
    if (!editingOrder) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEditModal();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [editingOrder]);

  const persistOrderUpdate = async (
    order: Order,
    patch: Partial<Pick<Order, 'orderStatus' | 'paymentStatus' | 'paidAmount' | 'pendingAmount'>>
  ) => {
    setSavingId(order.id);
    try {
      const batch = writeBatch(db);
      const orderRef = doc(db, 'orders', order.id);
      batch.update(orderRef, patch);

      const oldPending = order.pendingAmount ?? 0;
      const newPending = patch.pendingAmount ?? order.pendingAmount ?? 0;
      const pendingDelta = newPending - oldPending;

      if (order.customerId && pendingDelta !== 0) {
        const clientRef = doc(db, 'clients', order.customerId);
        const clientSnap = await getDoc(clientRef);
        if (clientSnap.exists()) {
          const currentOwed = clientSnap.data().totalOwed ?? 0;
          batch.update(clientRef, {
            totalOwed: Math.max(0, currentOwed + pendingDelta),
          });
        }
      }

      await batch.commit();

      const updatedOrder = { ...order, ...patch } as Order;
      const statusChanged = patch.orderStatus !== undefined && patch.orderStatus !== order.orderStatus;
      const paymentChanged =
        patch.paymentStatus !== undefined &&
        (patch.paymentStatus !== order.paymentStatus ||
          patch.paidAmount !== order.paidAmount ||
          patch.pendingAmount !== order.pendingAmount);

      if (statusChanged || paymentChanged) {
        void notifyClientOrderChanges(updatedOrder, {
          orderStatus: patch.orderStatus,
          paymentStatus: patch.paymentStatus,
          paidAmount: patch.paidAmount,
          pendingAmount: patch.pendingAmount,
          previousOrderStatus: order.orderStatus,
          previousPaymentStatus: order.paymentStatus,
        }).catch((err) => console.error('Error notificando al cliente:', err));
      }
    } catch (err) {
      console.error('Error updating order:', err);
      alert('No se pudo actualizar el pedido.');
    } finally {
      setSavingId(null);
    }
  };

  const openEditModal = (order: Order) => {
    setEditingOrder(order);
    setEditForm({
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paidAmount:
        order.paidAmount > 0 && order.paidAmount < order.totalAmount
          ? order.paidAmount
          : Math.round(order.totalAmount * 0.5),
    });
  };

  const closeEditModal = () => {
    setEditingOrder(null);
    setEditForm(null);
  };

  const handleSaveEdit = async () => {
    if (!editingOrder || !editForm) return;

    const patch: Partial<Pick<Order, 'orderStatus' | 'paymentStatus' | 'paidAmount' | 'pendingAmount'>> = {};

    if (canChangeOrderState && editForm.orderStatus !== editingOrder.orderStatus) {
      patch.orderStatus = editForm.orderStatus;
    }

    if (canRegisterPayments) {
      const amounts = resolvePaymentAmounts(
        editingOrder.totalAmount,
        editForm.paymentStatus,
        editForm.paymentStatus === 'partial' ? editForm.paidAmount : undefined
      );
      if (
        amounts.paymentStatus !== editingOrder.paymentStatus ||
        amounts.paidAmount !== editingOrder.paidAmount ||
        amounts.pendingAmount !== editingOrder.pendingAmount
      ) {
        Object.assign(patch, amounts);
      }
    }

    if (Object.keys(patch).length === 0) {
      closeEditModal();
      return;
    }

    await persistOrderUpdate(editingOrder, patch);
    closeEditModal();
  };

  const handleDeleteOrder = async () => {
    if (!deletingOrder) return;
    setSavingId(deletingOrder.id);
    try {
      const batch = writeBatch(db);

      if (deletingOrder.orderStatus !== 'draft') {
        // Restore inventories based on toggles
        const restoreLines: any[] = [];
        for (const item of deletingOrder.items) {
          // 1. Restore product stock in catalog
          if (restoreStock) {
            const prodRef = doc(db, 'products', item.productId);
            const prodSnap = await getDoc(prodRef);
            if (prodSnap.exists()) {
              const product = prodSnap.data();
              const prevStock = product.stock || 0;
              const newStock = prevStock + item.quantity;
              batch.update(prodRef, { stock: newStock });

              restoreLines.push({
                itemId: item.productId,
                itemType: 'product',
                lineType: 'in_restored',
                previousQuantity: prevStock,
                modifiedQuantity: item.quantity,
                finalQuantity: newStock,
              });
            }
          }


        }

        // Add inventory movement document if any restoration occurred
        if (restoreLines.length > 0) {
          await addDoc(collection(db, 'inventory_movements'), {
            date: new Date().toISOString(),
            movementType: 'restoration',
            reason: `Restauración por eliminación de Pedido #${deletingOrder.orderNumber}`,
            userId: hasPermission('changeOrderState') ? 'admin' : 'system',
            orderId: deletingOrder.id,
            lines: restoreLines,
          });
        }

        // Deduct order total from customer stats
        if (deletingOrder.customerId) {
          const clientRef = doc(db, 'clients', deletingOrder.customerId);
          const clientSnap = await getDoc(clientRef);
          if (clientSnap.exists()) {
            const clientData = clientSnap.data();
            const currentOwed = clientData.totalOwed ?? 0;
            const currentPurchased = clientData.totalPurchased ?? 0;
            batch.update(clientRef, {
              totalOwed: Math.max(0, currentOwed - deletingOrder.pendingAmount),
              totalPurchased: Math.max(0, currentPurchased - deletingOrder.totalAmount),
            });
          }
        }
      }

      // Delete Order document
      batch.delete(doc(db, 'orders', deletingOrder.id));
      await batch.commit();

      setDeletingOrder(null);
    } catch (err) {
      console.error('Error deleting order:', err);
      alert('Hubo un error al eliminar el pedido.');
    } finally {
      setSavingId(null);
    }
  };

  const getStatusBadge = (status: Order['orderStatus']) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1.5 text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-bold">
            <FileText size={11} /> Borrador
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded text-[10px] font-bold">
            <Clock size={11} /> Pendiente
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded text-[10px] font-bold">
            <Clock size={11} /> En Proceso
          </span>
        );
      case 'finished':
        return (
          <span className="inline-flex items-center gap-1.5 text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded text-[10px] font-bold">
            <CheckCircle2 size={11} /> Terminado
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1.5 text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold">
            <Truck size={11} /> Entregado
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded text-[10px] font-bold">
            <XCircle size={11} /> Cancelado
          </span>
        );
    }
  };

  const getPaymentBadge = (status: Order['paymentStatus']) => {
    switch (status) {
      case 'unpaid':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-100">
            Sin abonar
          </span>
        );
      case 'partial':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100">
            Señado
          </span>
        );
      case 'paid':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
            Pagado
          </span>
        );
    }
  };

  const canEditOrder = canChangeOrderState || canRegisterPayments;

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
          <>
            {/* Desktop View: Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                  <tr>
                    <th className="p-4 w-10"></th>
                    <th className="p-4 cursor-pointer hover:bg-slate-100/80 transition-colors select-none group" onClick={() => handleSort('orderNumber')}>
                      Nº Pedido {renderSortIndicator('orderNumber')}
                    </th>
                    <th className="p-4 cursor-pointer hover:bg-slate-100/80 transition-colors select-none group" onClick={() => handleSort('customerName')}>
                      Cliente {renderSortIndicator('customerName')}
                    </th>
                    <th className="p-4 cursor-pointer hover:bg-slate-100/80 transition-colors select-none group" onClick={() => handleSort('date')}>
                      Fecha {renderSortIndicator('date')}
                    </th>

                    <th className="p-4 cursor-pointer hover:bg-slate-100/80 transition-colors select-none group" onClick={() => handleSort('orderStatus')}>
                      Estado {renderSortIndicator('orderStatus')}
                    </th>
                    <th className="p-4 cursor-pointer hover:bg-slate-100/80 transition-colors select-none group" onClick={() => handleSort('paymentStatus')}>
                      Pago {renderSortIndicator('paymentStatus')}
                    </th>
                    <th className="p-4 text-right cursor-pointer hover:bg-slate-100/80 transition-colors select-none group" onClick={() => handleSort('totalAmount')}>
                      Total {renderSortIndicator('totalAmount')}
                    </th>
                    <th className="p-4 text-right select-none">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {sortedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-slate-400">
                        No se encontraron pedidos registrados.
                      </td>
                    </tr>
                  ) : (
                    sortedOrders.map(order => {
                      const isExpanded = !!expandedOrders[order.id];
                      return (
                        <React.Fragment key={order.id}>
                          <tr
                            id={`order-row-${order.id}`}
                            className="hover:bg-slate-50/40 transition-colors cursor-pointer"
                            onClick={(e) => toggleExpand(order.id, e)}
                          >
                            <td className="p-4 text-center">
                              {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                            </td>
                            {/* Order Number */}
                            <td className="p-4 font-bold text-slate-800 text-xs">
                              {order.orderStatus === 'draft' ? (
                                <span className="text-slate-400 font-normal italic">Borrador</span>
                              ) : (
                                `#${String(order.orderNumber).padStart(5, '0')}`
                              )}
                            </td>
                            
                            {/* Customer */}
                            <td className="p-4 font-semibold text-slate-700 text-sm">
                              <div className="flex flex-col">
                                <span>{order.customerName}</span>
                                {userData?.role === 'owner' && order.commissionEmployeeName && (
                                  <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 mt-0.5 self-start font-normal">
                                    Colaborador: {order.commissionEmployeeName}
                                  </span>
                                )}
                              </div>
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
                            <td className="p-4">
                              <div>
                                {getPaymentBadge(order.paymentStatus)}
                                {order.paymentStatus === 'partial' && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    <p>${order.paidAmount.toLocaleString('es-AR')} abonado</p>
                                    <p className="font-semibold text-amber-700">Resta: ${(order.pendingAmount ?? (order.totalAmount - order.paidAmount)).toLocaleString('es-AR')}</p>
                                  </div>
                                )}
                              </div>
                            </td>
                            
                            {/* Total Amount */}
                            <td className="p-4 font-black text-slate-800 text-right">
                              ${order.totalAmount.toLocaleString('es-AR', {minimumFractionDigits: 1})}
                            </td>
                            
                            {/* Actions */}
                            <td className="p-4 text-right">
                              <div className="flex justify-end items-center gap-1">
                                {canEditOrder && (
                                  <button
                                    onClick={() => openEditModal(order)}
                                    disabled={savingId === order.id}
                                    className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
                                    title="Editar estado y pago"
                                  >
                                    {savingId === order.id ? (
                                      <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                      <Edit2 size={16} />
                                    )}
                                  </button>
                                )}
                                {hasPermission('generateClientInvoices') && (
                                  <button
                                    onClick={() => generateClientPDF(order, business)}
                                    disabled={order.orderStatus === 'draft'}
                                    className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 disabled:cursor-not-allowed"
                                    title={order.orderStatus === 'draft' ? "No disponible para borradores" : "Comprobante Cliente"}
                                  >
                                    <FileDown size={16} />
                                  </button>
                                )}
                                {hasPermission('downloadInternalPDFs') && (
                                  <button
                                    onClick={() => generateInternalPDF(order, business)}
                                    disabled={order.orderStatus === 'draft'}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 disabled:cursor-not-allowed"
                                    title={order.orderStatus === 'draft' ? "No disponible para borradores" : "Balance Interno"}
                                  >
                                    <FileText size={16} />
                                  </button>
                                )}
                                {canEditOrder && (
                                  <button
                                    onClick={() => {
                                      setDeletingOrder(order);
                                      setRestoreStock(order.orderStatus !== 'draft');
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                                    title="Eliminar Pedido"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Desktop Collapsible row */}
                          {isExpanded && (
                            <tr className="bg-slate-50/50">
                              <td colSpan={9} className="p-6 border-t border-b border-slate-100">
                                <div className="space-y-4 max-w-4xl">
                                  {(() => {
                                    const items3D = order.items.filter(item => item.type === '3d');
                                    const totalItems3D = items3D.reduce((acc, item) => acc + item.quantity, 0);
                                    const printedItems3D = items3D.reduce((acc, item) => acc + (item.printedQty || 0), 0);
                                    return (
                                      <>
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                            <Package size={14} className="text-slate-400" />
                                            Detalle de Productos
                                          </h4>
                                          {totalItems3D > 0 && (
                                            <div className="flex items-center gap-2 text-xs">
                                              <span className="text-slate-500 font-medium">Progreso Impresión:</span>
                                              <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                                {printedItems3D} de {totalItems3D} piezas
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                        <div className="divide-y divide-slate-100 bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm">
                                          {order.items.map((item, idx) => (
                                            <div key={idx} className="p-4 flex items-center justify-between gap-4">
                                              <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden border border-slate-100 flex-shrink-0 flex">
                                                  {item.imageUrl ? (
                                                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover m-auto" />
                                                  ) : (
                                                    <Package size={22} className="text-slate-400 m-auto" />
                                                  )}
                                                </div>
                                                <div>
                                                  <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                                                  <p className="text-xs text-slate-400 mt-0.5">Precio Unitario: ${item.unitPrice.toLocaleString('es-AR')}</p>
                                                  {item.type === '3d' && (
                                                    <div className="mt-1 flex items-center gap-2">
                                                      <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                                        Impresión: {item.printedQty || 0} / {item.quantity}
                                                      </span>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                              <div className="text-right">
                                                <p className="font-semibold text-slate-600">Cant: {item.quantity}</p>
                                                <p className="font-bold text-slate-800 text-sm mt-0.5">${(item.unitPrice * item.quantity).toLocaleString('es-AR')}</p>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </>
                                    );
                                  })()}
                                  
                                  {order.observationsPublic && (
                                    <div className="bg-blue-50/50 border border-blue-100/50 rounded-xl p-3 flex gap-2 text-slate-600 text-xs">
                                      <AlertCircle size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
                                      <div>
                                        <p className="font-bold text-slate-700 mb-0.5">Nota del Cliente:</p>
                                        <p className="italic">{order.observationsPublic}</p>
                                      </div>
                                    </div>
                                  )}
                                  {order.observationsInternal && (
                                    <div className="bg-slate-100/80 border border-slate-200/80 rounded-xl p-3 flex gap-2 text-slate-600 text-xs">
                                      <AlertCircle size={16} className="text-slate-500 flex-shrink-0 mt-0.5" />
                                      <div>
                                        <p className="font-bold text-slate-700 mb-0.5">Nota Interna (Admin):</p>
                                        <p className="italic">{order.observationsInternal}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile View: Cards */}
            <div className="block md:hidden divide-y divide-slate-100 text-xs">
              {/* Mobile Sorting Controls */}
              <div className="p-3 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar select-none">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 mr-1 whitespace-nowrap">
                  Ordenar por:
                </span>
                {renderMobileSortButton('date', 'Fecha')}
                {renderMobileSortButton('orderNumber', 'Nº Pedido')}
                {renderMobileSortButton('customerName', 'Cliente')}
                {renderMobileSortButton('orderStatus', 'Estado')}
                {renderMobileSortButton('paymentStatus', 'Pago')}
                {renderMobileSortButton('totalAmount', 'Total')}

              </div>

              {sortedOrders.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  No se encontraron pedidos registrados.
                </div>
              ) : (
                sortedOrders.map(order => {
                  const isExpanded = !!expandedOrders[order.id];
                  return (
                    <div key={order.id} id={`order-row-${order.id}`} className="p-4 space-y-3">
                      {/* Row 1: Order Number & Date */}
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800 text-sm">
                          {order.orderStatus === 'draft' ? (
                             <span className="text-slate-400 font-normal italic">Borrador</span>
                           ) : (
                             `#${String(order.orderNumber).padStart(5, '0')}`
                           )}
                        </span>
                        <span className="text-slate-500">
                          {new Date(order.date).toLocaleDateString('es-AR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </span>
                      </div>

                      {/* Row 2: Customer Name */}
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-700 text-sm">{order.customerName}</h3>
                        {userData?.role === 'owner' && order.commissionEmployeeName && (
                          <span className="text-[9px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 leading-none">
                            {order.commissionEmployeeName}
                          </span>
                        )}
                      </div>

                      {/* Row 3: Badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {getStatusBadge(order.orderStatus)}
                        {getPaymentBadge(order.paymentStatus)}
                      </div>



                      {/* Row 4: Partial Payment Info */}
                      {order.paymentStatus === 'partial' && (
                        <div className="bg-amber-50/50 border border-amber-100/50 rounded-lg p-2 text-slate-600 space-y-0.5">
                          <div className="flex justify-between">
                            <span>Abonado:</span>
                            <span className="font-medium">${order.paidAmount.toLocaleString('es-AR')}</span>
                          </div>
                          <div className="flex justify-between text-amber-700 font-bold">
                            <span>Resta:</span>
                            <span>${(order.pendingAmount ?? (order.totalAmount - order.paidAmount)).toLocaleString('es-AR')}</span>
                          </div>
                        </div>
                      )}

                      {/* Row 5: Total & Actions */}
                      <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Total</span>
                          <span className="font-black text-slate-800 text-sm">
                            ${order.totalAmount.toLocaleString('es-AR', {minimumFractionDigits: 1})}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleExpand(order.id)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 border border-slate-100 transition-colors mr-1 font-semibold flex items-center gap-1"
                          >
                            Detalle {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                          {canEditOrder && (
                            <button
                              onClick={() => openEditModal(order)}
                              disabled={savingId === order.id}
                              className="p-1.5 text-slate-500 hover:text-amber-600 rounded-lg hover:bg-amber-50 border border-slate-100 transition-colors disabled:opacity-50 animate-fadeIn"
                              title="Editar estado y pago"
                            >
                              {savingId === order.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Edit2 size={14} />
                              )}
                            </button>
                          )}
                          {hasPermission('generateClientInvoices') && (
                            <button
                              onClick={() => generateClientPDF(order, business)}
                              disabled={order.orderStatus === 'draft'}
                              className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title={order.orderStatus === 'draft' ? "No disponible para borradores" : "Comprobante Cliente"}
                            >
                              <FileDown size={14} />
                            </button>
                          )}
                          {hasPermission('downloadInternalPDFs') && (
                            <button
                              onClick={() => generateInternalPDF(order, business)}
                              disabled={order.orderStatus === 'draft'}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title={order.orderStatus === 'draft' ? "No disponible para borradores" : "Balance Interno"}
                            >
                              <FileText size={14} />
                            </button>
                          )}
                          {canEditOrder && (
                            <button
                              onClick={() => {
                                setDeletingOrder(order);
                                setRestoreStock(order.orderStatus !== 'draft');
                              }}
                              className="p-1.5 text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 border border-slate-100 transition-colors"
                              title="Eliminar Pedido"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {(() => {
                        const items3D = order.items.filter(item => item.type === '3d');
                        const totalItems3D = items3D.reduce((acc, item) => acc + item.quantity, 0);
                        const printedItems3D = items3D.reduce((acc, item) => acc + (item.printedQty || 0), 0);
                        return (
                          isExpanded && (
                            <div className="space-y-3 mt-3 pt-3 border-t border-slate-100 bg-slate-50/50 p-3 rounded-xl">
                              <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Productos:</h4>
                                {totalItems3D > 0 && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                                      Imp: {printedItems3D} / {totalItems3D}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="space-y-2">
                                {order.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center gap-2 bg-white p-2 rounded-lg border border-slate-200/60">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-8 h-8 bg-slate-100 rounded overflow-hidden flex-shrink-0 flex">
                                        {item.imageUrl ? (
                                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover m-auto" />
                                        ) : (
                                          <Package size={16} className="text-slate-400 m-auto" />
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="font-bold text-slate-800 text-xs truncate">{item.name}</p>
                                        <p className="text-[10px] text-slate-400">{item.quantity} x ${item.unitPrice.toLocaleString('es-AR')}</p>
                                        {item.type === '3d' && (
                                          <div className="mt-1 flex items-center gap-1">
                                            <span className="text-[8px] font-semibold text-indigo-600 bg-indigo-50 px-1 py-0.2 rounded-full">
                                              Imp: {item.printedQty || 0} / {item.quantity}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <span className="font-bold text-slate-800 whitespace-nowrap">${(item.unitPrice * item.quantity).toLocaleString('es-AR')}</span>
                                  </div>
                                ))}
                              </div>
                              {order.observationsPublic && (
                                <div className="text-[11px] text-slate-500 italic border-l-2 border-blue-400 pl-2 mt-2">
                                  {order.observationsPublic}
                                </div>
                              )}
                            </div>
                          )
                        );
                      })()}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Edit Status Modal — portal al body para evitar problemas con el scroll del layout */}
      {editingOrder && editForm && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={closeEditModal}
        >
          <div
            className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[min(90vh,700px)] overflow-y-auto animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {editingOrder.orderStatus === 'draft' ? (
                     <span className="text-slate-500 font-normal italic">Borrador</span>
                   ) : (
                     `Pedido #${String(editingOrder.orderNumber).padStart(5, '0')}`
                   )}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">{editingOrder.customerName}</p>
              </div>
              <button
                onClick={closeEditModal}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex flex-wrap gap-2">
                {getStatusBadge(editingOrder.orderStatus)}
                {getPaymentBadge(editingOrder.paymentStatus)}
              </div>

              {canChangeOrderState && (
                <div>
                  <label className="input-label">Estado del pedido</label>
                  {editingOrder.orderStatus === 'draft' ? (
                     <div className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3">
                       Este pedido es un borrador y debe ser finalizado por el cliente a través del enlace de pago para actualizar su estado.
                     </div>
                   ) : (
                     <select
                       className="input"
                       value={editForm.orderStatus}
                       onChange={(e) =>
                         setEditForm((prev) =>
                           prev ? { ...prev, orderStatus: e.target.value as OrderStatus } : prev
                         )
                       }
                     >
                       {ORDER_STATUS_OPTIONS.map((opt) => (
                         <option key={opt.value} value={opt.value}>
                           {opt.label}
                         </option>
                       ))}
                     </select>
                   )}
                </div>
              )}

              {canRegisterPayments && editingOrder.orderStatus !== 'draft' && (
                <>
                  <div>
                    <label className="input-label">Estado de pago</label>
                    <select
                      className="input"
                      value={editForm.paymentStatus}
                      onChange={(e) =>
                        setEditForm((prev) =>
                          prev
                            ? { ...prev, paymentStatus: e.target.value as PaymentStatus }
                            : prev
                        )
                      }
                    >
                      {PAYMENT_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {editForm.paymentStatus === 'partial' && (
                    <div>
                      <label className="input-label">Monto abonado</label>
                      <NumericInput
                        className="input"
                        value={editForm.paidAmount}
                        allowDecimals
                        onChange={(val) => {
                          if (val !== '') {
                            setEditForm((prev) =>
                              prev ? { ...prev, paidAmount: val } : prev
                            );
                          }
                        }}
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        Total del pedido: ${editingOrder.totalAmount.toLocaleString('es-AR')}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-slate-100">
              <button type="button" onClick={closeEditModal} className="btn-secondary text-sm">
                {editingOrder.orderStatus === 'draft' ? 'Cerrar' : 'Cancelar'}
              </button>
              {editingOrder.orderStatus !== 'draft' && (
                 <button
                   type="button"
                   onClick={handleSaveEdit}
                   disabled={savingId === editingOrder.id}
                   className="btn-primary text-sm flex items-center gap-2"
                 >
                   {savingId === editingOrder.id ? (
                     <>
                       <Loader2 size={16} className="animate-spin" />
                       <span>Guardando...</span>
                     </>
                   ) : (
                     'Guardar Cambios'
                   )}
                 </button>
               )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Deletion Restoration Modal */}
      {deletingOrder && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setDeletingOrder(null)}
        >
          <div
            className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[min(90vh,700px)] overflow-y-auto animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle size={20} />
                <h2 className="text-lg font-bold">Eliminar Pedido</h2>
              </div>
              <button
                onClick={() => setDeletingOrder(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                ¿Estás seguro de que deseas eliminar permanentemente el{' '}
                 <strong>
                   {deletingOrder.orderStatus === 'draft' ? (
                     <span className="italic">Borrador</span>
                   ) : (
                     `Pedido #${String(deletingOrder.orderNumber).padStart(5, '0')}`
                   )}
                 </strong>{' '}
                 de <strong>{deletingOrder.customerName}</strong>?
              </p>
              
              {deletingOrder.orderStatus !== 'draft' && (
                 <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                   <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Restauración de Inventario</h3>
                   
                   <label className="flex items-center gap-3 cursor-pointer p-1">
                     <input
                       type="checkbox"
                       checked={restoreStock}
                       onChange={(e) => setRestoreStock(e.target.checked)}
                       className="w-4 h-4 rounded text-red-600 border-slate-300 focus:ring-red-500"
                     />
                     <div>
                       <span className="text-xs font-bold text-slate-700 block">Restaurar Stock de Catálogo</span>
                       <span className="text-[10px] text-slate-400">Devuelve las unidades vendidas al stock de productos.</span>
                     </div>
                   </label>


                 </div>
               )}
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-slate-100">
              <button type="button" onClick={() => setDeletingOrder(null)} className="btn-secondary text-sm">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteOrder}
                disabled={savingId === deletingOrder.id}
                className="btn-danger text-sm flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg shadow-sm"
              >
                {savingId === deletingOrder.id && <Loader2 size={16} className="animate-spin" />}
                Confirmar Eliminación
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
