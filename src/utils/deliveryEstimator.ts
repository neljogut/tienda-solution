import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface EstimationResult {
  estimatedDays: number;
  estimatedDate: Date | null;
  explanation: string;
}

export async function estimateDeliveryTime(
  newItems: Array<{ productId: string; quantity: number; type: string }>
): Promise<EstimationResult> {
  const has3D = newItems.some(item => item.type === '3d');
  
  if (!has3D) {
    return {
      estimatedDays: 0,
      estimatedDate: null,
      explanation: 'Pedido sin impresión 3D.'
    };
  }

  try {
    // 1. Fetch Print Queue Settings
    const settingsSnap = await getDoc(doc(db, 'settings', 'printQueue'));
    const printerCount = settingsSnap.exists() ? (settingsSnap.data().printerCount || 1) : 1;
    const workHoursPerDay = settingsSnap.exists() ? (settingsSnap.data().workHoursPerDay || 8) : 8;

    // 2. Fetch 3D Products (for printTimeMinutes)
    const prodsSnap = await getDocs(query(collection(db, 'products'), where('type', '==', '3d')));
    const productTimes: Record<string, number> = {};
    prodsSnap.forEach(d => {
      productTimes[d.id] = d.data().printTimeMinutes || 0;
    });

    // 3. Fetch Active Orders
    const activeOrdersSnap = await getDocs(
      query(collection(db, 'orders'), where('orderStatus', 'in', ['pending', 'processing']))
    );

    let existingQueueMinutes = 0;
    activeOrdersSnap.forEach(docSnap => {
      const order = docSnap.data();
      const items = order.items || [];
      items.forEach((item: any) => {
        if (item.type === '3d') {
          const printTime = productTimes[item.productId] || 0;
          const printed = item.printedQty || 0;
          const pending = Math.max(0, item.quantity - printed);
          
          if (pending > 0) {
            existingQueueMinutes += pending * printTime;
          }
        }
      });
    });

    // 4. Calculate print time for new items
    let newItemsMinutes = 0;
    newItems.forEach(item => {
      if (item.type === '3d') {
        const printTime = productTimes[item.productId] || 0;
        newItemsMinutes += item.quantity * printTime;
      }
    });

    const totalMinutes = existingQueueMinutes + newItemsMinutes;
    // Parallelize with printerCount
    const adjustedMinutes = printerCount > 1 ? totalMinutes / printerCount : totalMinutes;
    // Calculate days based on workHoursPerDay
    const daysNeeded = workHoursPerDay > 0 ? (adjustedMinutes / 60 / workHoursPerDay) : 0;

    // Apply safety margin (40% buffer) and add 1 day for assembly/finishing/packaging
    const estimatedDays = Math.ceil(daysNeeded * 1.4) + 1;

    const estDate = new Date();
    estDate.setDate(estDate.getDate() + estimatedDays);

    return {
      estimatedDays,
      estimatedDate: estDate,
      explanation: `Cola actual: ${Math.round(existingQueueMinutes)} min. Nueva impresión: ${Math.round(newItemsMinutes)} min. Total estimando ${printerCount} impresora(s) y ${workHoursPerDay}h/día.`
    };
  } catch (error) {
    console.error('Error estimating delivery time:', error);
    // Fallback: 5 days
    const estDate = new Date();
    estDate.setDate(estDate.getDate() + 5);
    return {
      estimatedDays: 5,
      estimatedDate: estDate,
      explanation: 'Error al consultar la cola de producción. Usando tiempo estándar de 5 días.'
    };
  }
}
