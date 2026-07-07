import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { UserData } from '../types/user';

export const unifyClientsAndOrders = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const batch = writeBatch(db);
    let modificationsCount = 0;

    // 1. Fetch all data
    const usersSnap = await getDocs(collection(db, 'users'));
    const clientsSnap = await getDocs(collection(db, 'clients'));
    const ordersSnap = await getDocs(collection(db, 'orders'));

    const users: UserData[] = [];
    usersSnap.forEach(d => {
      users.push({ uid: d.id, ...d.data() } as UserData);
    });

    const clients: any[] = [];
    clientsSnap.forEach(d => {
      clients.push({ id: d.id, ...d.data() });
    });

    const orders: any[] = [];
    ordersSnap.forEach(d => {
      orders.push({ id: d.id, ...d.data() });
    });

    console.log(`[Unificación] Iniciando alineación con ${users.length} usuarios, ${clients.length} clientes, y ${orders.length} pedidos.`);

    // Map clients for quick lookup
    const getClientByUserId = (uid: string) => clients.find(c => c.userId === uid);
    const getClientByEmail = (email: string) => {
      if (!email) return null;
      return clients.find(c => c.email && c.email.toLowerCase() === email.toLowerCase());
    };

    const usersToUpdate: { uid: string; customerId: string }[] = [];
    const clientsToUpdate: { id: string; userId?: string; email?: string }[] = [];
    const newClientsToCreate: any[] = [];

    // 2. Align Users with Clients (Idempotent mutual linking)
    for (const user of users) {
      if (user.role !== 'client') continue;

      let linkedClient = (user.customerId ? clients.find(c => c.id === user.customerId) : null) ||
                         getClientByUserId(user.uid) ||
                         getClientByEmail(user.email);

      if (linkedClient) {
        let needsUpdate = false;
        const clientUpdate: any = {};
        
        if (linkedClient.userId !== user.uid) {
          clientUpdate.userId = user.uid;
          linkedClient.userId = user.uid;
          needsUpdate = true;
        }
        if (user.email && (!linkedClient.email || linkedClient.email.toLowerCase() !== user.email.toLowerCase())) {
          clientUpdate.email = user.email;
          linkedClient.email = user.email;
          needsUpdate = true;
        }

        if (needsUpdate) {
          clientsToUpdate.push({ id: linkedClient.id, ...clientUpdate });
        }

        if (user.customerId !== linkedClient.id) {
          usersToUpdate.push({ uid: user.uid, customerId: linkedClient.id });
          user.customerId = linkedClient.id;
        }
      } else {
        // If the user already had a customerId set, it means they had a client profile that was explicitly deleted.
        // We clean up by deleting the user document rather than recreating the client profile.
        if (user.customerId) {
          batch.delete(doc(db, 'users', user.uid));
          modificationsCount++;
          continue;
        }

        // Create client profile for registered user if missing
        const names = (user.displayName || 'Cliente').trim().split(/\s+/);
        const firstName = names[0] || 'Cliente';
        const lastName = names.slice(1).join(' ') || 'Registrado';

        const newClientData = {
          firstName,
          lastName,
          email: user.email,
          userId: user.uid,
          createdAt: (user as any).createdAt || new Date().toISOString(),
          totalPurchased: 0,
          totalOwed: 0,
          isWholesale: false,
          isTrusted: false,
        };

        const tempId = `temp_${Math.random().toString(36).substr(2, 9)}`;
        const newClient = { id: tempId, ...newClientData, isNew: true };
        clients.push(newClient);
        newClientsToCreate.push(newClient);

        usersToUpdate.push({ uid: user.uid, customerId: tempId });
        user.customerId = tempId;
      }
    }

    // Write links
    for (const newC of newClientsToCreate) {
      const newRef = doc(collection(db, 'clients'));
      const tempId = newC.id;
      newC.id = newRef.id;
      
      const userUpdate = usersToUpdate.find(u => u.customerId === tempId);
      if (userUpdate) {
        userUpdate.customerId = newRef.id;
      }

      const { id, isNew, ...saveData } = newC;
      batch.set(newRef, saveData);
      modificationsCount++;
    }

    for (const userUpd of usersToUpdate) {
      const userRef = doc(db, 'users', userUpd.uid);
      batch.update(userRef, { customerId: userUpd.customerId });
      modificationsCount++;
    }

    for (const clientUpd of clientsToUpdate) {
      const clientRef = doc(db, 'clients', clientUpd.id);
      const { id, ...saveData } = clientUpd;
      batch.update(clientRef, saveData);
      modificationsCount++;
    }

    // 3. Unify Duplicates (Strict Auto-merges only)
    const activeClients = clients.filter(c => !c.isNew);
    const clientsToDelete: string[] = [];
    const clientIdMapping: Record<string, string> = {};

    // Group clients by email (lowercase)
    const clientsByEmail: Record<string, any[]> = {};
    for (const c of activeClients) {
      if (!c.email) continue;
      const emailKey = c.email.toLowerCase().trim();
      if (!clientsByEmail[emailKey]) clientsByEmail[emailKey] = [];
      clientsByEmail[emailKey].push(c);
    }

    // Unify exact emails
    for (const email in clientsByEmail) {
      const group = clientsByEmail[email];
      if (group.length <= 1) continue;

      const sorted = [...group].sort((a, b) => {
        if (a.userId && !b.userId) return -1;
        if (!a.userId && b.userId) return 1;
        const countA = orders.filter(o => o.customerId === a.id).length;
        const countB = orders.filter(o => o.customerId === b.id).length;
        return countB - countA;
      });

      const keep = sorted[0];
      const duplicates = sorted.slice(1);

      console.log(`[Unificación] Unificando duplicados por correo idéntico (${email}).`);

      for (const dup of duplicates) {
        clientIdMapping[dup.id] = keep.id;
        clientsToDelete.push(dup.id);
      }
    }

    // Apply deletions in batch
    for (const delId of clientsToDelete) {
      batch.delete(doc(db, 'clients', delId));
      modificationsCount++;
    }

    // 4. Align Orders & cash movements, and synchronize customerName
    for (const order of orders) {
      let currentId = order.customerId;
      let updatedId = currentId;

      // If customerId is user uid, map to customerId
      const matchedUser = users.find(u => u.uid === currentId);
      if (matchedUser && matchedUser.customerId) {
        updatedId = matchedUser.customerId;
      } else {
        const matchedClient = clients.find(c => c.userId === currentId);
        if (matchedClient) {
          updatedId = matchedClient.id;
        }
      }

      // If mapped client has been merged
      if (clientIdMapping[updatedId]) {
        updatedId = clientIdMapping[updatedId];
      }

      // Resolve final client details to sync customerName
      const finalClient = clients.find(c => c.id === updatedId);
      const expectedName = finalClient ? `${finalClient.firstName} ${finalClient.lastName}` : order.customerName;

      const needsIdUpdate = updatedId && updatedId !== currentId;
      const needsNameUpdate = expectedName && expectedName !== order.customerName;

      if (needsIdUpdate || needsNameUpdate) {
        const updateData: any = {};
        if (needsIdUpdate) {
          updateData.customerId = updatedId;
          order.customerId = updatedId;
        }
        if (needsNameUpdate) {
          updateData.customerName = expectedName;
          order.customerName = expectedName;
        }
        batch.update(doc(db, 'orders', order.id), updateData);
        modificationsCount++;
      }
    }

    // 5. Recalculate Totals for All Active Clients
    const finalClients = clients.filter(c => !clientsToDelete.includes(c.id));
    for (const client of finalClients) {
      const clientOrders = orders.filter(
        o => o.customerId === client.id && o.orderStatus !== 'cancelled'
      );

      const totalPurchased = clientOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      const totalOwed = clientOrders.reduce((sum, o) => sum + (o.pendingAmount || 0), 0);

      if (client.totalPurchased !== totalPurchased || client.totalOwed !== totalOwed) {
        batch.update(doc(db, 'clients', client.id), { totalPurchased, totalOwed });
        modificationsCount++;
      }
    }

    if (modificationsCount > 0) {
      await batch.commit();
      console.log(`[Unificación] Guardado exitoso. Se realizaron ${modificationsCount} modificaciones.`);
      return { success: true, message: `Se realizaron y guardaron ${modificationsCount} alineaciones en la base de datos.` };
    }

    return { success: true, message: 'La base de datos ya se encuentra alineada y al día.' };

  } catch (error: any) {
    console.error('Error durante la unificación de clientes:', error);
    return { success: false, message: error.message || 'Error al ejecutar la unificación.' };
  }
};
