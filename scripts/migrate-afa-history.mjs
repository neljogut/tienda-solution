import { Firestore } from '@google-cloud/firestore';
import { getFirebaseCliAuthClient } from './firebase-cli-auth.mjs';

const PROJECT_ID = 'dualgi3de';
const EXECUTE = process.argv.includes('--execute');

const OLD_AFA_ID_NOW_NEWELLS = 'TBeuiKfxVlyGj37M4NY7';
const NEW_AFA_ID = 'SNqHkTDeJLKOKpBZ1QDf';

async function main() {
  console.log(EXECUTE ? '\n🚀 MIGRACIÓN ACTIVA: Escribiendo en Firestore...\n' : '\n🔍 MODO DRY-RUN: Leyendo base de datos sin escribir...\n');

  const authClient = await getFirebaseCliAuthClient();
  const db = new Firestore({
    projectId: PROJECT_ID,
    authClient,
    ignoreUndefinedProperties: true,
  });

  console.log('Cargando pedidos...');
  const ordersSnap = await db.collection('orders').get();
  
  let ordersToUpdateCount = 0;
  let itemsUpdatedCount = 0;
  let movementsUpdatedCount = 0;

  for (const doc of ordersSnap.docs) {
    const order = doc.data();
    order.id = doc.id;
    
    let orderModified = false;
    
    if (order.items && Array.isArray(order.items)) {
      const updatedItems = order.items.map(item => {
        // Find if the item belongs to Newell's ID but has the name "AFA"
        if (item.productId === OLD_AFA_ID_NOW_NEWELLS && item.name === 'AFA') {
          orderModified = true;
          itemsUpdatedCount += item.quantity;
          console.log(`[Pedido #${order.orderNumber}] Modificando item "${item.name}" (Cant: ${item.quantity}) de Newell's ID -> AFA ID`);
          return {
            ...item,
            productId: NEW_AFA_ID
          };
        }
        return item;
      });

      if (orderModified) {
        ordersToUpdateCount++;
        
        if (EXECUTE) {
          await db.collection('orders').doc(order.id).update({
            items: updatedItems
          });
          console.log(`[Pedido #${order.orderNumber}] Guardado con éxito.`);
        } else {
          console.log(`[Pedido #${order.orderNumber}] [DRY-RUN] Se guardaría modificado.`);
        }

        // Now search and update inventory movements associated with this order
        console.log(`  Buscando movimientos de inventario relacionados al Pedido #${order.orderNumber}...`);
        const movementsSnap = await db.collection('inventory_movements')
          .where('orderId', '==', order.id)
          .get();

        for (const movDoc of movementsSnap.docs) {
          const mov = movDoc.data();
          mov.id = movDoc.id;
          
          let movModified = false;
          let updatedLines = null;
          let updatedRelatedProductId = null;

          if (mov.lines && Array.isArray(mov.lines)) {
            updatedLines = mov.lines.map(line => {
              let lineModified = false;
              const updatedLine = { ...line };
              
              if (line.itemId === OLD_AFA_ID_NOW_NEWELLS) {
                lineModified = true;
                updatedLine.itemId = NEW_AFA_ID;
                console.log(`    [Movimiento ${mov.id}] Modificando itemId de Newell's ID -> AFA ID`);
              }
              if (line.relatedProductId === OLD_AFA_ID_NOW_NEWELLS) {
                lineModified = true;
                updatedLine.relatedProductId = NEW_AFA_ID;
                console.log(`    [Movimiento ${mov.id}] Modificando relatedProductId de Newell's ID -> AFA ID`);
              }
              
              if (lineModified) {
                movModified = true;
                return updatedLine;
              }
              return line;
            });
          } else if (mov.relatedProductId === OLD_AFA_ID_NOW_NEWELLS) {
            movModified = true;
            updatedRelatedProductId = NEW_AFA_ID;
            console.log(`    [Movimiento ${mov.id}] Modificando campo relatedProductId simple de Newell's ID -> AFA ID`);
          }

          if (movModified) {
            movementsUpdatedCount++;
            if (EXECUTE) {
              const updateData = {};
              if (updatedLines) updateData.lines = updatedLines;
              if (updatedRelatedProductId) updateData.relatedProductId = updatedRelatedProductId;
              
              await db.collection('inventory_movements').doc(mov.id).update(updateData);
              console.log(`    [Movimiento ${mov.id}] Guardado con éxito.`);
            } else {
              console.log(`    [Movimiento ${mov.id}] [DRY-RUN] Se guardaría modificado.`);
            }
          }
        }
      }
    }
  }

  console.log('\n======================================');
  console.log(`RESUMEN DE MIGRACIÓN:`);
  console.log(`- Pedidos que se modificarán: ${ordersToUpdateCount}`);
  console.log(`- Ítems de venta migrados (cant. total): ${itemsUpdatedCount}`);
  console.log(`- Movimientos de inventario corregidos: ${movementsUpdatedCount}`);
  console.log('======================================');
  if (!EXECUTE) {
    console.log('Para ejecutar la migración real en Firestore, ejecutá el script agregando el flag --execute');
  }
}

main().catch(console.error);
