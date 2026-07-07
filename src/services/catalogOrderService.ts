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

  let employeeId: string | undefined = undefined;
  let employeeName: string | undefined = undefined;
  let clientData: any = null;

  if (resolvedCustomerId) {
    const clientSnap = await getDoc(doc(db, 'clients', resolvedCustomerId));
    if (clientSnap.exists()) {
      clientData = clientSnap.data();
      employeeId = clientData.employeeId;
      employeeName = clientData.employeeName;
    }
  }

  const pricingResaleSnap = await getDoc(doc(db, 'settings', 'pricingResale'));
  const commissionPercent = pricingResaleSnap.exists()
    ? (pricingResaleSnap.data().employeeCommissionPercent ?? 10)
    : 10;

  const totalProfit = totalAmount - totalCost;
  let commissionAmount: number | undefined = undefined;
  if (employeeId) {
    commissionAmount = Number(Math.max(0, totalProfit * (commissionPercent / 100)).toFixed(2));
  }
  const commissionPaidStatus = employeeId ? 'pending' : undefined;



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
    totalProfit,

    ...(employeeId ? {
      commissionEmployeeId: employeeId,
      commissionEmployeeName: employeeName || 'Colaborador',
      commissionPercent,
      commissionAmount,
      commissionPaidStatus,
    } : {}),
  };

  const orderRef = await addDoc(collection(db, 'orders'), newOrder);
  const orderId = orderRef.id;

  const batch = writeBatch(db);

  if (resolvedCustomerId && clientData) {
    const clientRef = doc(db, 'clients', resolvedCustomerId);
    batch.update(clientRef, {
      totalPurchased: (clientData.totalPurchased || 0) + totalAmount,
      totalOwed: (clientData.totalOwed || 0) + totalAmount,
    });
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
