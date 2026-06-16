import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../firebase';
import { syncClientUserLink } from './notificationService';

export async function resolveCustomerId(
  currentUser: User,
  userData: { customerId?: string; displayName?: string; email?: string } | null,
  presetCustomerId?: string
): Promise<string> {
  if (presetCustomerId?.trim()) {
    const presetDoc = await getDoc(doc(db, 'clients', presetCustomerId.trim()));
    if (presetDoc.exists()) {
      await syncClientUserLink(presetCustomerId.trim(), currentUser.uid);
      return presetCustomerId.trim();
    }
  }

  let resolvedCustomerId = userData?.customerId || '';

  if (resolvedCustomerId) {
    const clientDoc = await getDoc(doc(db, 'clients', resolvedCustomerId));
    if (clientDoc.exists()) {
      await syncClientUserLink(resolvedCustomerId, currentUser.uid);
      return resolvedCustomerId;
    } else {
      resolvedCustomerId = '';
    }
  }

  const clientQuery = query(collection(db, 'clients'), where('userId', '==', currentUser.uid));
  const clientSnap = await getDocs(clientQuery);
  if (!clientSnap.empty) {
    resolvedCustomerId = clientSnap.docs[0].id;
  } else if (currentUser.email) {
    const emailQuery = query(collection(db, 'clients'), where('email', '==', currentUser.email));
    const emailSnap = await getDocs(emailQuery);
    if (!emailSnap.empty) {
      resolvedCustomerId = emailSnap.docs[0].id;
      await updateDoc(doc(db, 'clients', resolvedCustomerId), { userId: currentUser.uid });
    } else {
      const names = (userData?.displayName || 'Cliente').trim().split(/\s+/);
      const firstName = names[0] || 'Cliente';
      const lastName = names.slice(1).join(' ') || 'Registrado';
      const newClientRef = doc(collection(db, 'clients'));
      resolvedCustomerId = newClientRef.id;
      await setDoc(newClientRef, {
        firstName,
        lastName,
        email: currentUser.email || '',
        userId: currentUser.uid,
        createdAt: new Date().toISOString(),
        totalPurchased: 0,
        totalOwed: 0,
        isWholesale: false,
        isTrusted: false,
      });
    }
  }

  if (resolvedCustomerId) {
    await updateDoc(doc(db, 'users', currentUser.uid), { customerId: resolvedCustomerId });
  }

  return resolvedCustomerId;
}
