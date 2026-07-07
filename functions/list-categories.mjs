import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { Firestore } from '@google-cloud/firestore';
import { getFirebaseCliAuthClient } from '../scripts/firebase-cli-auth.mjs';

async function initFirestore() {
  const authClient = await getFirebaseCliAuthClient();
  return new Firestore({
    projectId: 'solution-3d',
    tokenProvider: authClient,
  });
}

async function run() {
  const db = await initFirestore();
  
  // 1. Fetch categories
  const catSnap = await db.collection('categories').get();
  const categories = catSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  console.log('--- CATEGORÍAS ---');
  categories.forEach(c => {
    console.log(`ID: ${c.id} | Nombre: "${c.name}" | ParentID: "${c.parentId || 'ninguno'}"`);
  });
  
  // 2. Fetch the two products
  console.log('\n--- PRODUCTOS SELECCIONADOS ---');
  const prodSnap = await db.collection('products').get();
  prodSnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.name.includes('FILAR PLA GRIS PLATA') || data.name.includes('FILAR PLA NEGRO MATE')) {
      console.log(`Producto: "${data.name}"`);
      console.log(`  categoryId: "${data.categoryId}"`);
      console.log(`  category (campo de texto en doc): "${data.category}"`);
      
      // Resolve path recursively
      let path = [];
      let currentId = data.categoryId;
      while (currentId) {
        const cat = categories.find(c => c.id === currentId);
        if (cat) {
          path.unshift(cat.name);
          currentId = cat.parentId;
        } else {
          currentId = null;
        }
      }
      console.log(`  Ruta Real (calculada recursivamente): ${path.join(' › ')}`);
    }
  });
}

run().catch(console.error);
