import {
  collection,
  addDoc,
  doc,
  writeBatch,
  getDoc,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { CartItem } from '../store/cartStore';
import type { User } from 'firebase/auth';
import { resolveCustomerId } from './clientResolver';

export interface CreateCatalogOrderResult {
  orderId: string;
  orderNumber: number;
  totalAmount: number;
}

export async function createCatalogOrderClient(
  items: CartItem[],
  customerName: string,
  currentUser: User,
  userData: { customerId?: string; displayName?: string; email?: string } | null
): Promise<CreateCatalogOrderResult> {
  if (items.length === 0) {
    throw new Error('El carrito está vacío.');
  }

  const exchangeRateSnap = await getDoc(doc(db, 'settings', 'exchangeRate'));
  const exchangeRate = exchangeRateSnap.exists()
    ? exchangeRateSnap.data().currentUsdToArs
    : 1000;

  const countSnapshot = await getCountFromServer(collection(db, 'orders'));
  const orderNumber = countSnapshot.data().count + 1;

  const orderItems = await Promise.all(
    items.map(async (item) => {
      const prodSnap = await getDoc(doc(db, 'products', item.productId));
      const product = prodSnap.exists() ? prodSnap.data() : null;
      const unitCost = product ? product.calculatedCost || 0 : 0;
      return {
        productId: item.productId,
        name: item.name,
        type: item.type,
        quantity: item.quantity,
        unitPrice: item.price,
        appliedWholesale: false,
        unitCost,
        unitProfit: item.price - unitCost,
        imageUrl: item.imageUrl || '',
        isManualPrice: product ? product.useManualPrice || false : false,
      };
    })
  );

  const totalCost = orderItems.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const resolvedCustomerId = await resolveCustomerId(currentUser, userData);

  const newOrder = {
    orderNumber,
    customerId: resolvedCustomerId,
    customerName,
    date: new Date().toISOString(),
    items: orderItems,
    totalAmount,
    paidAmount: 0,
    pendingAmount: totalAmount,
    paymentStatus: 'unpaid' as const,
    orderStatus: 'pending' as const,
    observationsPublic: 'Pedido creado desde el catálogo web.',
    observationsInternal: 'Creado desde checkout del catálogo.',
    exchangeRateUsdUsed: exchangeRate,
    exchangeRateDate: new Date().toISOString(),
    totalCost,
    totalProfit: totalAmount - totalCost,
  };

  const orderRef = await addDoc(collection(db, 'orders'), newOrder);
  const orderId = orderRef.id;

  const batch = writeBatch(db);

  if (resolvedCustomerId) {
    const clientRef = doc(db, 'clients', resolvedCustomerId);
    const clientSnap = await getDoc(clientRef);
    if (clientSnap.exists()) {
      const clientData = clientSnap.data();
      batch.update(clientRef, {
        totalPurchased: (clientData.totalPurchased || 0) + totalAmount,
        totalOwed: (clientData.totalOwed || 0) + totalAmount,
      });
    }
  }

  const saleLines: Array<Record<string, unknown>> = [];

  for (const item of orderItems) {
    const prodRef = doc(db, 'products', item.productId);
    const prodSnap = await getDoc(prodRef);
    if (!prodSnap.exists()) continue;

    const product = prodSnap.data();
    const prevStock = product.stock || 0;
    const newStock = Math.max(0, prevStock - item.quantity);
    batch.update(prodRef, { stock: newStock });

    saleLines.push({
      itemId: item.productId,
      itemType: 'product',
      lineType: 'out_sale',
      previousQuantity: prevStock,
      modifiedQuantity: -item.quantity,
      finalQuantity: newStock,
    });

    if (product.type === '3d') {
      const filamentLines = product.filamentLines?.length
        ? product.filamentLines
        : (product.filamentIds ?? []).map((filamentId: string) => ({
            supplyId: filamentId,
            grams:
              (product.weightGrams * item.quantity) / Math.max(1, product.filamentIds?.length || 1),
          }));

      for (const line of filamentLines) {
        const filamentId = line.supplyId;
        const weightToDeduct = (line.grams || 0) * item.quantity;
        if (!filamentId || weightToDeduct <= 0) continue;

        const filRef = doc(db, 'inventory', filamentId);
        const filSnap = await getDoc(filRef);
        if (filSnap.exists()) {
          const filData = filSnap.data();
          const prevWeight = filData.availableWeightGrams || 0;
          const newWeight = Math.max(0, prevWeight - weightToDeduct);
          batch.update(filRef, { availableWeightGrams: newWeight });
          saleLines.push({
            itemId: filamentId,
            itemType: 'filament',
            lineType: 'consumption',
            previousQuantity: prevWeight,
            modifiedQuantity: -weightToDeduct,
            finalQuantity: newWeight,
          });
        }
      }

      if (product.supplyIds?.length) {
        for (const supplyObj of product.supplyIds) {
          const supplyId = supplyObj.supplyId;
          const qtyNeeded = supplyObj.quantity * item.quantity;
          const supRef = doc(db, 'inventory', supplyId);
          const supSnap = await getDoc(supRef);
          if (supSnap.exists()) {
            const supData = supSnap.data();
            const prevQty = supData.currentStock || 0;
            const newQty = Math.max(0, prevQty - qtyNeeded);
            batch.update(supRef, { currentStock: newQty });
            saleLines.push({
              itemId: supplyId,
              itemType: 'supply',
              lineType: 'consumption',
              previousQuantity: prevQty,
              modifiedQuantity: -qtyNeeded,
              finalQuantity: newQty,
            });
          }
        }
      }
    }
  }

  await batch.commit();

  if (saleLines.length > 0) {
    await addDoc(collection(db, 'inventory_movements'), {
      date: new Date().toISOString(),
      movementType: 'sale',
      reason: `Venta · Pedido #${orderNumber} (Checkout)`,
      userId: currentUser.uid,
      orderId,
      lines: saleLines,
    });
  }

  return { orderId, orderNumber, totalAmount };
}
