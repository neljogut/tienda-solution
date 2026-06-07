import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, onSnapshot, query, orderBy, doc, getDoc, writeBatch, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Order, OrderStatus, PaymentStatus } from '../../types/order';
import type { BusinessSettings } from '../../types/settings';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { CheckCircle2, Clock, Truck, XCircle, Plus, FileDown, FileText, Loader2, Edit2, X, Trash2, AlertCircle } from 'lucide-react';
import { generateClientPDF, generateInternalPDF } from '../../services/pdfService';
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

  // Deletion modal state
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);
  const [restoreStock, setRestoreStock] = useState(true);
  const [restoreFilament, setRestoreFilament] = useState(true);
  const [restoreSupplies, setRestoreSupplies] = useState(true);

  const navigate = useNavigate();
  const { hasPermission } = useAuth();

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

        // Deduct associated 3D materials (filaments and supplies)
        if (item.type === '3d') {
          // 2. Restore filaments
          if (restoreFilament) {
            const prodRef = doc(db, 'products', item.productId);
            const prodSnap = await getDoc(prodRef);
            if (prodSnap.exists()) {
              const product = prodSnap.data();
              const filamentLines = product.filamentLines?.length
                ? product.filamentLines
                : (product.filamentIds ?? []).map((filamentId: string) => ({
                    supplyId: filamentId,
                    grams: (product.weightGrams * item.quantity) / Math.max(1, product.filamentIds.length),
                  }));

              for (const line of filamentLines) {
                const filamentId = line.supplyId;
                const weightToRestore = (line.grams || 0) * item.quantity;
                if (!filamentId || weightToRestore <= 0) continue;

                const filRef = doc(db, 'inventory', filamentId);
                const filSnap = await getDoc(filRef);
                if (filSnap.exists()) {
                  const filData = filSnap.data();
                  const prevWeight = filData.availableWeightGrams || 0;
                  const newWeight = prevWeight + weightToRestore;
                  batch.update(filRef, { availableWeightGrams: newWeight });

                  restoreLines.push({
                    itemId: filamentId,
                    itemType: 'filament',
                    lineType: 'restored',
                    previousQuantity: prevWeight,
                    modifiedQuantity: weightToRestore,
                    finalQuantity: newWeight,
                  });
                }
              }
            }
          }

          // 3. Restore supplies
          if (restoreSupplies) {
            const prodRef = doc(db, 'products', item.productId);
            const prodSnap = await getDoc(prodRef);
            if (prodSnap.exists()) {
              const product = prodSnap.data();
              if (product.supplyIds && product.supplyIds.length > 0) {
                for (const supplyObj of product.supplyIds) {
                  const supplyId = supplyObj.supplyId;
                  const qtyNeeded = supplyObj.quantity * item.quantity;

                  const supRef = doc(db, 'inventory', supplyId);
                  const supSnap = await getDoc(supRef);
                  if (supSnap.exists()) {
                    const supData = supSnap.data();
                    const prevQty = supData.currentStock || 0;
                    const newQty = prevQty + qtyNeeded;
                    batch.update(supRef, { currentStock: newQty });

                    restoreLines.push({
                      itemId: supplyId,
                      itemType: 'supply',
                      lineType: 'restored',
                      previousQuantity: prevQty,
                      modifiedQuantity: qtyNeeded,
                      finalQuantity: newQty,
                    });
                  }
                }
              }
            }
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
                  <th className="p-4 text-right">Acciones</th>
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
                          <button
                            onClick={() => generateClientPDF(order, business)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Comprobante Cliente"
                          >
                            <FileDown size={16} />
                          </button>
                          <button
                            onClick={() => generateInternalPDF(order, business)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Balance Interno"
                          >
                            <FileText size={16} />
                          </button>
                          {canEditOrder && (
                            <button
                              onClick={() => {
                                setDeletingOrder(order);
                                setRestoreStock(true);
                                setRestoreFilament(true);
                                setRestoreSupplies(true);
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
                  ))
                )}
              </tbody>
            </table>
          </div>
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
                  Pedido #{String(editingOrder.orderNumber).padStart(5, '0')}
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
                </div>
              )}

              {canRegisterPayments && (
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
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingId === editingOrder.id}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {savingId === editingOrder.id && <Loader2 size={16} className="animate-spin" />}
              </button>
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
                ¿Estás seguro de que deseas eliminar permanentemente el <strong>Pedido #{String(deletingOrder.orderNumber).padStart(5, '0')}</strong> de <strong>{deletingOrder.customerName}</strong>?
              </p>
              
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

                {deletingOrder.items.some(i => i.type === '3d') && (
                  <>
                    <label className="flex items-center gap-3 cursor-pointer p-1 border-t border-slate-200/50 pt-2">
                      <input
                        type="checkbox"
                        checked={restoreFilament}
                        onChange={(e) => setRestoreFilament(e.target.checked)}
                        className="w-4 h-4 rounded text-red-600 border-slate-300 focus:ring-red-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-700 block">Restaurar Gramos de Filamento</span>
                        <span className="text-[10px] text-slate-400">Devuelve los gramos de filamentos asociados al stock.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer p-1 border-t border-slate-200/50 pt-2">
                      <input
                        type="checkbox"
                        checked={restoreSupplies}
                        onChange={(e) => setRestoreSupplies(e.target.checked)}
                        className="w-4 h-4 rounded text-red-600 border-slate-300 focus:ring-red-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-700 block">Restaurar Insumos/Tornillos</span>
                        <span className="text-[10px] text-slate-400">Devuelve los insumos consumidos al inventario.</span>
                      </div>
                    </label>
                  </>
                )}
              </div>
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
