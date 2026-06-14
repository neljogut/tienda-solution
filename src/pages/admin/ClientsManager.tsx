import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { migrateClient, getClientLabel } from '../../types/client';
import type { Client } from '../../types/client';
import { useAuth } from '../../context/AuthContext';
import type { UserData } from '../../types/user';
import {
  Users, Plus, Search, Edit, Trash2, Phone, Mail, MapPin,
  Crown, Shield, Star, X, ChevronUp, Eye, UserPlus, ShieldAlert, Store, RefreshCw
} from 'lucide-react';

/* ─────────────────────────── helpers ─────────────────────────── */

const emptyForm = () => ({
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  province: '',
  postalCode: '',
  dni: '',
  cuit: '',
  isWholesale: false,
  isTrusted: false,
  isLocal: false,
  observations: '',
  employeeId: '',
  employeeName: '',
});

function getClientBadges(client: Pick<Client, 'isWholesale' | 'isTrusted' | 'isLocal'>) {
  const badges: { label: string; className: string; icon: React.ReactNode }[] = [];

  if (client.isLocal) {
    badges.push({ label: 'Negocio', className: 'badge badge-cyan', icon: <Store size={12} /> });
  }
  if (client.isWholesale) {
    badges.push({ label: 'Mayorista', className: 'badge badge-purple', icon: <Crown size={12} /> });
  }
  if (client.isTrusted) {
    badges.push({ label: 'Confianza', className: 'badge badge-yellow', icon: <Shield size={12} /> });
  }
  if (badges.length === 0) {
    badges.push({ label: 'Minorista', className: 'badge badge-blue', icon: <Star size={12} /> });
  }

  return badges;
}

/* ─────────────────────────── component ─────────────────────────── */

export const ClientsManager: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWholesale, setFilterWholesale] = useState<boolean | null>(null);
  const [filterTrusted, setFilterTrusted] = useState<boolean | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  // Merge states
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeTab, setMergeTab] = useState<'merge' | 'orphans'>('merge');
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeError, setMergeError] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrphanTargets, setSelectedOrphanTargets] = useState<Record<string, string>>({});
  const [linkOrphanLoading, setLinkOrphanLoading] = useState(false);
  const [dismissedPairs, setDismissedPairs] = useState<string[]>([]);
  const [mergedFields, setMergedFields] = useState<Record<string, string>>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    dni: '',
    cuit: '',
    address: '',
    city: '',
    province: '',
    postalCode: '',
    observations: '',
  });

  useEffect(() => {
    const sourceClient = clients.find(c => c.id === mergeSourceId);
    const targetClient = clients.find(c => c.id === mergeTargetId);
    if (sourceClient && targetClient) {
      setMergedFields({
        firstName: targetClient.firstName || sourceClient.firstName || '',
        lastName: targetClient.lastName || sourceClient.lastName || '',
        phone: targetClient.phone || sourceClient.phone || '',
        email: targetClient.email || sourceClient.email || '',
        dni: targetClient.dni || sourceClient.dni || '',
        cuit: targetClient.cuit || sourceClient.cuit || '',
        address: targetClient.address || sourceClient.address || '',
        city: targetClient.city || sourceClient.city || '',
        province: targetClient.province || sourceClient.province || '',
        postalCode: targetClient.postalCode || sourceClient.postalCode || '',
        observations: targetClient.observations 
          ? (sourceClient.observations && targetClient.observations !== sourceClient.observations
              ? `${targetClient.observations}\n---\nFusión: ${sourceClient.observations}`
              : targetClient.observations)
          : (sourceClient.observations || ''),
      });
    } else {
      setMergedFields({
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        dni: '',
        cuit: '',
        address: '',
        city: '',
        province: '',
        postalCode: '',
        observations: '',
      });
    }
  }, [mergeSourceId, mergeTargetId, clients]);

  const handleSwapMerge = () => {
    const temp = mergeSourceId;
    setMergeSourceId(mergeTargetId);
    setMergeTargetId(temp);
  };

  const renderMergeRow = (
    field: string,
    label: string,
    source: Client | undefined,
    target: Client | undefined,
    isTextArea = false
  ) => {
    if (!source || !target) return null;
    const valSource = (source as any)[field] || '';
    const valTarget = (target as any)[field] || '';
    const currentMerged = mergedFields[field] || '';
    const isDifferent = valSource && valTarget && valSource !== valTarget;

    return (
      <tr key={field} className={`hover:bg-slate-50/50 ${isDifferent ? 'bg-amber-50/30' : ''}`}>
        <td className="p-2.5 font-bold text-slate-600">
          {label}
          {isDifferent && <span className="text-amber-600 ml-1 font-normal text-[9px]">(Difiere)</span>}
        </td>
        <td className="p-2.5 bg-red-50/10 max-w-[150px] truncate">
          {valSource ? (
            <button
              type="button"
              onClick={() => setMergedFields(prev => ({ ...prev, [field]: valSource }))}
              title="Copiar a resultado"
              className="text-left text-red-600 hover:text-red-800 font-medium hover:underline w-full truncate block"
            >
              {valSource}
            </button>
          ) : (
            <span className="text-slate-300 italic">Vacío</span>
          )}
        </td>
        <td className="p-2.5 bg-emerald-50/10 max-w-[150px] truncate">
          {valTarget ? (
            <button
              type="button"
              onClick={() => setMergedFields(prev => ({ ...prev, [field]: valTarget }))}
              title="Copiar a resultado"
              className="text-left text-emerald-600 hover:text-emerald-800 font-medium hover:underline w-full truncate block"
            >
              {valTarget}
            </button>
          ) : (
            <span className="text-slate-300 italic">Vacío</span>
          )}
        </td>
        <td className="p-2">
          {isTextArea ? (
            <textarea
              value={currentMerged}
              onChange={e => setMergedFields(prev => ({ ...prev, [field]: e.target.value }))}
              className="input w-full py-1 px-1.5 h-12 text-[11px] resize-none"
            />
          ) : (
            <input
              type="text"
              value={currentMerged}
              onChange={e => setMergedFields(prev => ({ ...prev, [field]: e.target.value }))}
              className="input w-full py-1 px-1.5 h-7 text-[11px]"
            />
          )}
        </td>
      </tr>
    );
  };

  const { userData } = useAuth();
  const [employees, setEmployees] = useState<UserData[]>([]);

  useEffect(() => {
    if (userData?.role !== 'owner') return;
    const q = query(collection(db, 'users'), where('role', '==', 'employee'));
    const unsubscribeEmployees = onSnapshot(q, (snapshot) => {
      const list: UserData[] = [];
      snapshot.forEach((d) => {
        list.push({ uid: d.id, ...d.data() } as UserData);
      });
      setEmployees(list);
    });
    return () => unsubscribeEmployees();
  }, [userData]);

  /* ── real-time listener ── */
  useEffect(() => {
    const q = userData?.role === 'employee'
      ? query(collection(db, 'clients'), where('employeeId', '==', userData.uid))
      : query(collection(db, 'clients'));
      
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Client[] = [];
      snapshot.forEach((d) => {
        const migrated = migrateClient({ id: d.id, ...d.data() });
        list.push(migrated as Client);
      });
      list.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
      setClients(list);
    });

    const qOrders = userData?.role === 'employee'
      ? query(collection(db, 'orders'), where('commissionEmployeeId', '==', userData.uid))
      : query(collection(db, 'orders'));

    const unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setOrders(list);
    });

    const unsubscribeDismissed = onSnapshot(doc(db, 'settings', 'dismissed_duplicates'), (snap) => {
      if (snap.exists()) {
        setDismissedPairs(snap.data().pairs || []);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeOrders();
      unsubscribeDismissed();
    };
  }, []);

  const orphanedOrders = useMemo(() => {
    const activeClientIds = new Set(clients.map(c => c.id));
    const orphans: Record<string, { customerId: string; customerName: string; orderCount: number; totalAmount: number }> = {};

    orders.forEach(o => {
      if (o.customerId && o.customerId !== 'eventual' && !activeClientIds.has(o.customerId)) {
        const key = o.customerId;
        if (!orphans[key]) {
          orphans[key] = {
            customerId: o.customerId,
            customerName: o.customerName || 'Cliente sin nombre',
            orderCount: 0,
            totalAmount: 0
          };
        }
        orphans[key].orderCount += 1;
        orphans[key].totalAmount += (o.totalAmount || 0);
      }
    });

    return Object.values(orphans);
  }, [clients, orders]);

  const potentialDuplicates = useMemo(() => {
    const list: { clientA: Client; clientB: Client; reason: string; key: string }[] = [];
    const dismissedKeys = new Set(dismissedPairs);

    const clean = (s: string) => {
      return s.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 2);
    };

    for (let i = 0; i < clients.length; i++) {
      const cA = clients[i];
      const lastNameA = cA.lastName || '';
      const firstNameA = cA.firstName || '';
      const wordsLastNameA = clean(lastNameA);
      const wordsFirstNameA = clean(firstNameA);

      for (let j = i + 1; j < clients.length; j++) {
        const cB = clients[j];
        
        const key1 = `${cA.id}_${cB.id}`;
        const key2 = `${cB.id}_${cA.id}`;
        if (dismissedKeys.has(key1) || dismissedKeys.has(key2)) continue;

        const lastNameB = cB.lastName || '';
        const firstNameB = cB.firstName || '';
        const wordsLastNameB = clean(lastNameB);
        const wordsFirstNameB = clean(firstNameB);

        const phoneA = cA.phone?.replace(/\D/g, '');
        const phoneB = cB.phone?.replace(/\D/g, '');
        const phoneMatch = phoneA && phoneB && phoneA.length > 6 && phoneA === phoneB;

        const dniA = cA.dni?.trim();
        const dniB = cB.dni?.trim();
        const dniMatch = dniA && dniB && dniA.length > 4 && dniA === dniB;

        const cuitA = cA.cuit?.replace(/\D/g, '');
        const cuitB = cB.cuit?.replace(/\D/g, '');
        const cuitMatch = cuitA && cuitB && cuitA.length > 5 && cuitA === cuitB;

        // nameMatch: comparte al menos una palabra del nombre Y una del apellido
        const sharedLast = wordsLastNameA.filter(w => wordsLastNameB.includes(w));
        const sharedFirst = wordsFirstNameA.filter(w => wordsFirstNameB.includes(w));
        const nameMatch = sharedLast.length >= 1 && sharedFirst.length >= 1;

        if (phoneMatch || dniMatch || cuitMatch || nameMatch) {
          let reason = '';
          if (phoneMatch) reason = `Mismo número de teléfono (${cA.phone})`;
          else if (dniMatch) reason = `Mismo número de DNI (${cA.dni})`;
          else if (cuitMatch) reason = `Mismo número de CUIT (${cA.cuit})`;
          else reason = `Nombre y apellido coincidentes o muy similares`;

          list.push({
            clientA: cA,
            clientB: cB,
            reason,
            key: key1
          });
        }
      }
    }
    return list;
  }, [clients, dismissedPairs]);

  const handleDismissDuplicate = async (key: string) => {
    try {
      const { setDoc, doc, arrayUnion } = await import('firebase/firestore');
      await setDoc(doc(db, 'settings', 'dismissed_duplicates'), { pairs: arrayUnion(key) }, { merge: true });
    } catch (err) {
      console.error("Error dismissing duplicate:", err);
    }
  };

  /* ── filtered list ── */
  const filtered = useMemo(() => {
    let result = clients;
    if (filterWholesale !== null) {
      result = result.filter((c) => c.isWholesale === filterWholesale);
    }
    if (filterTrusted !== null) {
      result = result.filter((c) => c.isTrusted === filterTrusted);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (c) =>
          c.firstName.toLowerCase().includes(term) ||
          c.lastName.toLowerCase().includes(term) ||
          (c.phone && c.phone.includes(term)) ||
          (c.email && c.email.toLowerCase().includes(term)) ||
          (c.cuit && c.cuit.includes(term))
      );
    }
    return result;
  }, [clients, filterWholesale, filterTrusted, searchTerm]);

  /* ── modal helpers ── */
  const openAdd = () => {
    setEditingClient(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setForm({
      firstName: client.firstName,
      lastName: client.lastName,
      phone: client.phone || '',
      email: client.email || '',
      address: client.address || '',
      city: client.city || '',
      province: client.province || '',
      postalCode: client.postalCode || '',
      dni: client.dni || '',
      cuit: client.cuit || '',
      isWholesale: client.isWholesale ?? false,
      isTrusted: client.isTrusted ?? false,
      isLocal: client.isLocal ?? false,
      observations: client.observations || '',
      employeeId: client.employeeId || '',
      employeeName: client.employeeName || '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingClient(null);
    setForm(emptyForm());
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  /* ── save (add / edit) ── */
  const handleSave = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone?.trim() || '',
        email: form.email?.trim() || '',
        address: form.address?.trim() || '',
        city: form.city?.trim() || '',
        province: form.province?.trim() || '',
        postalCode: form.postalCode?.trim() || '',
        dni: form.dni?.trim() || '',
        cuit: form.cuit?.trim() || '',
        isWholesale: form.isWholesale,
        isTrusted: form.isTrusted,
        isLocal: form.isLocal,
        observations: form.observations?.trim() || '',
      };

      if (userData?.role === 'owner') {
        data.employeeId = form.employeeId;
        data.employeeName = form.employeeId
          ? (employees.find(emp => emp.uid === form.employeeId)?.displayName || 'Empleado')
          : '';
      }

      if (editingClient) {
        await updateDoc(doc(db, 'clients', editingClient.id), data);
        
        // Also update customerName in all their orders
        try {
          const { query, where, getDocs, collection, writeBatch } = await import('firebase/firestore');
          const ordersQuery = query(collection(db, 'orders'), where('customerId', '==', editingClient.id));
          const ordersSnap = await getDocs(ordersQuery);
          if (!ordersSnap.empty) {
            const batch = writeBatch(db);
            const newName = `${form.firstName.trim()} ${form.lastName.trim()}`;
            ordersSnap.forEach(o => {
              batch.update(doc(db, 'orders', o.id), { customerName: newName });
            });
            await batch.commit();
          }
        } catch (e) {
          console.error("Error updating order customer names:", e);
        }
      } else {
        const newClientData: Record<string, any> = {
          ...data,
          createdAt: new Date().toISOString(),
          totalPurchased: 0,
          totalOwed: 0,
        };
        if (userData?.role === 'employee') {
          newClientData.employeeId = userData.uid;
          newClientData.employeeName = userData.displayName || userData.email || 'Empleado';
        } else if (userData?.role === 'owner') {
          newClientData.employeeId = form.employeeId;
          newClientData.employeeName = form.employeeId
            ? (employees.find(emp => emp.uid === form.employeeId)?.displayName || 'Empleado')
            : '';
        }
        await addDoc(collection(db, 'clients'), newClientData);
      }
      closeModal();
    } catch (err) {
      console.error('Error al guardar cliente:', err);
    } finally {
      setSaving(false);
    }
  };

  /* ── delete ── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { writeBatch, getDocs, collection, query, where, doc } = await import('firebase/firestore');
      const batch = writeBatch(db);

      // 1. Delete the client
      batch.delete(doc(db, 'clients', deleteTarget.id));

      // 2. Convert orders of this client to 'eventual' to preserve financial history
      const ordersQuery = query(collection(db, 'orders'), where('customerId', '==', deleteTarget.id));
      const ordersSnap = await getDocs(ordersQuery);
      const originalName = `${deleteTarget.firstName} ${deleteTarget.lastName}`;
      ordersSnap.forEach(o => {
        batch.update(doc(db, 'orders', o.id), {
          customerId: 'eventual',
          customerName: `${originalName} (Eliminado)`
        });
      });

      // 3. Convert cash movements to 'eventual'
      const movementsQuery = query(collection(db, 'cash_movements'), where('customerId', '==', deleteTarget.id));
      const movementsSnap = await getDocs(movementsQuery);
      movementsSnap.forEach(m => {
        batch.update(doc(db, 'cash_movements', m.id), {
          customerId: 'eventual'
        });
      });

      await batch.commit();
      alert('Cliente eliminado con éxito. Sus pedidos históricos se conservaron como ventas eventuales para no afectar los balances.');
    } catch (err) {
      console.error('Error al eliminar cliente:', err);
      alert('Error al eliminar cliente.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleMergeClients = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeSourceId || !mergeTargetId) {
      setMergeError('Por favor selecciona ambos clientes.');
      return;
    }
    if (mergeSourceId === mergeTargetId) {
      setMergeError('El cliente duplicado y el principal no pueden ser el mismo.');
      return;
    }

    setMergeLoading(true);
    setMergeError('');

    try {
      const { writeBatch, getDocs, collection, query, where, doc } = await import('firebase/firestore');
      
      const sourceClient = clients.find(c => c.id === mergeSourceId);
      const targetClient = clients.find(c => c.id === mergeTargetId);
      if (!sourceClient || !targetClient) {
        throw new Error('Uno o ambos clientes seleccionados no existen.');
      }

      const batch = writeBatch(db);

      // Unified target name
      const targetName = `${mergedFields.firstName.trim()} ${mergedFields.lastName.trim()}`;

      // 1. Update all orders where customerId === sourceId
      const ordersQuery = query(collection(db, 'orders'), where('customerId', '==', mergeSourceId));
      const ordersSnap = await getDocs(ordersQuery);
      ordersSnap.forEach(o => {
        batch.update(doc(db, 'orders', o.id), {
          customerId: mergeTargetId,
          customerName: targetName
        });
      });

      // 2. Update all cash movements where customerId === sourceId
      const movementsQuery = query(collection(db, 'cash_movements'), where('customerId', '==', mergeSourceId));
      const movementsSnap = await getDocs(movementsQuery);
      movementsSnap.forEach(m => {
        batch.update(doc(db, 'cash_movements', m.id), {
          customerId: mergeTargetId
        });
      });

      // 3. Update target client unifiable fields from mergedFields state
      const targetUpdates: any = {
        firstName: mergedFields.firstName.trim(),
        lastName: mergedFields.lastName.trim(),
        phone: mergedFields.phone.trim(),
        email: mergedFields.email.trim(),
        dni: mergedFields.dni.trim(),
        cuit: mergedFields.cuit.trim(),
        address: mergedFields.address.trim(),
        city: mergedFields.city.trim(),
        province: mergedFields.province.trim(),
        postalCode: mergedFields.postalCode.trim(),
        observations: mergedFields.observations.trim(),
        isWholesale: targetClient.isWholesale || sourceClient.isWholesale,
        isTrusted: targetClient.isTrusted || sourceClient.isTrusted,
        isLocal: targetClient.isLocal || sourceClient.isLocal,
      };

      // Handle user accounts mapping updates
      if (targetClient.userId) {
        targetUpdates.userId = targetClient.userId;
      } else if (sourceClient.userId) {
        targetUpdates.userId = sourceClient.userId;
      }

      if (sourceClient.userId) {
        const userRef = doc(db, 'users', sourceClient.userId);
        batch.update(userRef, { customerId: mergeTargetId });
      }
      if (targetClient.userId) {
        const userRef = doc(db, 'users', targetClient.userId);
        batch.update(userRef, { customerId: mergeTargetId });
      }
      
      // Update target balances
      const totalPurchased = (targetClient.totalPurchased || 0) + (sourceClient.totalPurchased || 0);
      const totalOwed = (targetClient.totalOwed || 0) + (sourceClient.totalOwed || 0);
      targetUpdates.totalPurchased = totalPurchased;
      targetUpdates.totalOwed = totalOwed;

      batch.update(doc(db, 'clients', mergeTargetId), targetUpdates);

      // 4. Delete source client
      batch.delete(doc(db, 'clients', mergeSourceId));

      await batch.commit();

      // Reset & close
      setMergeSourceId('');
      setMergeTargetId('');
      setIsMergeModalOpen(false);
      alert('Clientes fusionados exitosamente.');
    } catch (err: any) {
      console.error(err);
      setMergeError(err.message || 'Error al fusionar clientes.');
    } finally {
      setMergeLoading(false);
    }
  };

  const handleLinkOrphanedOrders = async (orphanId: string, targetClientId: string) => {
    if (!targetClientId) {
      alert('Por favor selecciona un cliente para vincular.');
      return;
    }
    setLinkOrphanLoading(true);
    try {
      const { writeBatch, getDocs, collection, query, where, doc } = await import('firebase/firestore');
      
      const targetClient = clients.find(c => c.id === targetClientId);
      if (!targetClient) {
        throw new Error('El cliente seleccionado no existe.');
      }

      const batch = writeBatch(db);
      const targetName = `${targetClient.firstName} ${targetClient.lastName}`;

      // 1. Update all orders with this old customerId
      const ordersQuery = query(collection(db, 'orders'), where('customerId', '==', orphanId));
      const ordersSnap = await getDocs(ordersQuery);
      
      let addedPurchased = 0;
      let addedOwed = 0;

      ordersSnap.forEach(o => {
        const orderData = o.data();
        batch.update(doc(db, 'orders', o.id), {
          customerId: targetClientId,
          customerName: targetName
        });
        if (orderData.orderStatus !== 'cancelled') {
          addedPurchased += (orderData.totalAmount || 0);
          addedOwed += (orderData.pendingAmount || 0);
        }
      });

      // 2. Update cash movements
      const movementsQuery = query(collection(db, 'cash_movements'), where('customerId', '==', orphanId));
      const movementsSnap = await getDocs(movementsQuery);
      movementsSnap.forEach(m => {
        batch.update(doc(db, 'cash_movements', m.id), {
          customerId: targetClientId
        });
      });

      // 3. Update client statistics
      const newPurchased = (targetClient.totalPurchased || 0) + addedPurchased;
      const newOwed = (targetClient.totalOwed || 0) + addedOwed;

      batch.update(doc(db, 'clients', targetClientId), {
        totalPurchased: newPurchased,
        totalOwed: newOwed
      });

      await batch.commit();
      
      // Remove this orphan from selectedOrphanTargets
      setSelectedOrphanTargets(prev => {
        const copy = { ...prev };
        delete copy[orphanId];
        return copy;
      });

      alert('Pedidos vinculados exitosamente y nombres unificados.');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error al vincular los pedidos.');
    } finally {
      setLinkOrphanLoading(false);
    }
  };



  /* ── active filter label ── */
  const activeFilterLabels: string[] = [];
  if (filterWholesale === true) activeFilterLabels.push('Mayoristas');
  if (filterWholesale === false) activeFilterLabels.push('Minoristas');
  if (filterTrusted === true) activeFilterLabels.push('De Confianza');
  if (filterTrusted === false) activeFilterLabels.push('Sin Confianza');

  const clearFilters = () => {
    setFilterWholesale(null);
    setFilterTrusted(null);
    setSearchTerm('');
  };

  /* ── render ── */
  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users size={26} className="text-blue-600" />
            Gestión de Clientes
          </h1>
          <p className="page-subtitle">
            Administra tu cartera de clientes, datos de contacto y clasificación.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsMergeModalOpen(true)}
            className="btn-secondary flex items-center justify-center gap-2 text-xs py-2 px-4 whitespace-nowrap"
          >
            Fusionar Duplicados
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2 text-xs py-2 px-4">
            <Plus size={20} />
            Nuevo Cliente
          </button>
        </div>
      </div>

      {/* ─── Alerta de Posibles Duplicados ─── */}
      {potentialDuplicates.length > 0 && (
        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 shadow-sm space-y-3 animate-fadeIn">
          <div className="flex items-center gap-2 text-amber-800">
            <ShieldAlert size={20} className="flex-shrink-0" />
            <h3 className="font-extrabold text-sm">Posibles clientes duplicados detectados</h3>
            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {potentialDuplicates.length} {potentialDuplicates.length === 1 ? 'aviso' : 'avisos'}
            </span>
          </div>
          <p className="text-xs text-amber-700/90 leading-relaxed">
            Hemos encontrado coincidencias en nombres o datos de contacto. Puedes fusionarlos en un único perfil para conservar todos sus pedidos y cuentas corrientes unificados, o desestimar el aviso si se trata de personas diferentes.
          </p>
          <div className="divide-y divide-amber-100/60 max-h-[220px] overflow-y-auto pr-1">
            {potentialDuplicates.map(dup => (
              <div key={dup.key} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs first:pt-1 last:pb-1">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 font-bold text-slate-800">
                    <span>{dup.clientA.firstName} {dup.clientA.lastName}</span>
                    <span className="text-slate-400 font-normal">y</span>
                    <span>{dup.clientB.firstName} {dup.clientB.lastName}</span>
                  </div>
                  <p className="text-[10px] text-amber-700 font-medium mt-0.5">Motivo: {dup.reason}</p>
                </div>
                <div className="flex gap-2 self-start sm:self-center">
                  <button
                    onClick={() => {
                      setMergeSourceId(dup.clientA.id);
                      setMergeTargetId(dup.clientB.id);
                      setMergeTab('merge');
                      setIsMergeModalOpen(true);
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg text-[11px] shadow-sm transition-all cursor-pointer"
                  >
                    Fusionar...
                  </button>
                  <button
                    onClick={() => handleDismissDuplicate(dup.key)}
                    className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 font-bold px-3 py-1.5 rounded-lg text-[11px] transition-all cursor-pointer"
                  >
                    Desestimar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Search & Filter Bar ─── */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative flex-1 w-full">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono, email o CUIT..."
              className="input pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Filter toggles */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Filtrar:</span>

          {/* Wholesale filter */}
          <button
            onClick={() => setFilterWholesale(filterWholesale === null ? true : filterWholesale === true ? false : null)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              filterWholesale === true
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/25'
                : filterWholesale === false
                ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-300'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Crown size={12} />
            {filterWholesale === true ? '✓ Mayoristas' : filterWholesale === false ? '✗ Solo Minoristas' : 'Mayorista'}
          </button>

          {/* Trusted filter */}
          <button
            onClick={() => setFilterTrusted(filterTrusted === null ? true : filterTrusted === true ? false : null)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              filterTrusted === true
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
                : filterTrusted === false
                ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Shield size={12} />
            {filterTrusted === true ? '✓ Confianza' : filterTrusted === false ? '✗ Sin Confianza' : 'Confianza'}
          </button>

          {(filterWholesale !== null || filterTrusted !== null) && (
            <button
              onClick={clearFilters}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors flex items-center gap-1"
            >
              <X size={12} />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ─── Clients Count ─── */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Users size={16} />
        <span>
          {filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'}
          {activeFilterLabels.length > 0 && ` (${activeFilterLabels.join(', ')})`}
          {searchTerm && ` — búsqueda: "${searchTerm}"`}
        </span>
      </div>

      {/* ─── Client Table ─── */}
      <div className="table-container">
        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="table-header">
                <th>Cliente</th>
                <th>Clasificación</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th>Ciudad</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12">
                    <div className="flex flex-col items-center justify-center text-slate-400 gap-3">
                      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                        <UserPlus size={28} className="text-slate-300" />
                      </div>
                      <p className="font-medium text-slate-500">
                        {searchTerm || filterWholesale !== null || filterTrusted !== null
                          ? 'No se encontraron clientes con esos filtros.'
                          : 'Aún no hay clientes registrados.'}
                      </p>
                      {!searchTerm && filterWholesale === null && filterTrusted === null && (
                        <button onClick={openAdd} className="btn-primary text-sm flex items-center gap-2 mt-1">
                          <Plus size={16} /> Agregar primer cliente
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((client) => {
                  const badges = getClientBadges(client);
                  const isExpanded = expandedId === client.id;
                  return (
                    <React.Fragment key={client.id}>
                      {/* Main Row */}
                      <tr className="table-row group">
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                              {client.firstName[0]}{client.lastName[0]}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800">
                                {client.lastName}, {client.firstName}
                              </p>
                              <div className="flex flex-col gap-0.5 mt-0.5">
                                {client.cuit && (
                                  <p className="text-xs text-slate-400">CUIT: {client.cuit}</p>
                                )}
                                {client.employeeName && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 w-max">
                                    Colaborador: {client.employeeName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {badges.map((b, i) => (
                              <span key={i} className={b.className}>
                                {b.icon}
                                {b.label}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          {client.phone ? (
                            <span className="flex items-center gap-1.5 text-sm text-slate-600">
                              <Phone size={14} className="text-slate-400" />
                              {client.phone}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                        <td>
                          {client.email ? (
                            <span className="flex items-center gap-1.5 text-sm text-slate-600">
                              <Mail size={14} className="text-slate-400" />
                              {client.email}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                        <td>
                          {client.city ? (
                            <span className="flex items-center gap-1.5 text-sm text-slate-600">
                              <MapPin size={14} className="text-slate-400" />
                              {client.city}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                        <td>
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : client.id)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Ver detalle"
                            >
                              {isExpanded ? <ChevronUp size={18} /> : <Eye size={18} />}
                            </button>
                            <button
                              onClick={() => openEdit(client)}
                              className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <Edit size={18} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(client)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Detail Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={6} className="px-6 py-5">
                            <div className="animate-fadeIn grid grid-cols-1 md:grid-cols-3 gap-6">
                              {/* Personal Data */}
                              <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                  Datos Personales
                                </h4>
                                <div className="space-y-2 text-sm">
                                  <p>
                                    <span className="text-slate-400">Nombre:</span>{' '}
                                    <span className="font-medium text-slate-700">{client.firstName} {client.lastName}</span>
                                  </p>
                                  {client.dni && (
                                    <p>
                                      <span className="text-slate-400">DNI:</span>{' '}
                                      <span className="font-medium text-slate-700">{client.dni}</span>
                                    </p>
                                  )}
                                  {client.cuit && (
                                    <p>
                                      <span className="text-slate-400">CUIT:</span>{' '}
                                      <span className="font-medium text-slate-700">{client.cuit}</span>
                                    </p>
                                  )}
                                  {client.phone && (
                                    <p className="flex items-center gap-1.5">
                                      <Phone size={13} className="text-slate-400" />
                                      <span className="font-medium text-slate-700">{client.phone}</span>
                                    </p>
                                  )}
                                  {client.email && (
                                    <p className="flex items-center gap-1.5">
                                      <Mail size={13} className="text-slate-400" />
                                      <span className="font-medium text-slate-700">{client.email}</span>
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Address */}
                              <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                  Dirección
                                </h4>
                                <div className="space-y-2 text-sm">
                                  {client.address && (
                                    <p className="flex items-center gap-1.5">
                                      <MapPin size={13} className="text-slate-400" />
                                      <span className="font-medium text-slate-700">{client.address}</span>
                                    </p>
                                  )}
                                  {(client.city || client.province) && (
                                    <p>
                                      <span className="text-slate-400">Localidad:</span>{' '}
                                      <span className="font-medium text-slate-700">
                                        {[client.city, client.province].filter(Boolean).join(', ')}
                                      </span>
                                    </p>
                                  )}
                                  {client.postalCode && (
                                    <p>
                                      <span className="text-slate-400">C.P.:</span>{' '}
                                      <span className="font-medium text-slate-700">{client.postalCode}</span>
                                    </p>
                                  )}
                                  {!client.address && !client.city && !client.province && !client.postalCode && (
                                    <p className="text-slate-300 italic">Sin dirección registrada</p>
                                  )}
                                </div>
                              </div>

                              {/* Account Info */}
                              <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                  Cuenta
                                </h4>
                                <div className="space-y-2 text-sm">
                                  <p>
                                    <span className="text-slate-400">Clasificación:</span>{' '}
                                    <span className="flex flex-wrap gap-1 mt-1">
                                      {badges.map((b, i) => (
                                        <span key={i} className={b.className}>{b.icon}{b.label}</span>
                                      ))}
                                    </span>
                                  </p>
                                  <p>
                                    <span className="text-slate-400">Total comprado:</span>{' '}
                                    <span className="font-bold text-emerald-600">
                                      ${(client.totalPurchased ?? 0).toLocaleString('es-AR')}
                                    </span>
                                  </p>
                                  <p>
                                    {(client.totalOwed ?? 0) < 0 ? (
                                      <>
                                        <span className="text-slate-400">Saldo a favor:</span>{' '}
                                        <span className="font-bold text-emerald-600">
                                          ${Math.abs(client.totalOwed ?? 0).toLocaleString('es-AR')}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-slate-400">Total adeudado:</span>{' '}
                                        <span className={`font-bold ${(client.totalOwed ?? 0) > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                                          ${(client.totalOwed ?? 0).toLocaleString('es-AR')}
                                        </span>
                                      </>
                                    )}
                                  </p>
                                  <p>
                                    <span className="text-slate-400">Registrado:</span>{' '}
                                    <span className="font-medium text-slate-700">
                                      {client.createdAt
                                        ? new Date(client.createdAt).toLocaleDateString('es-AR', {
                                            day: '2-digit',
                                            month: 'long',
                                            year: 'numeric',
                                          })
                                        : '—'}
                                    </span>
                                  </p>
                                </div>
                                {client.observations && (
                                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                                    <span className="font-semibold">Observaciones:</span> {client.observations}
                                  </div>
                                )}
                              </div>
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
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              No se encontraron clientes con esos filtros.
            </div>
          ) : (
            filtered.map((client) => {
              const badges = getClientBadges(client);
              const isExpanded = expandedId === client.id;
              return (
                <div key={client.id} className="p-4 space-y-3">
                  {/* Row 1: Profile Initials & Name */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {client.firstName[0]}{client.lastName[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">
                        {client.lastName}, {client.firstName}
                      </p>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {client.cuit && (
                          <p className="text-[10px] text-slate-400">CUIT: {client.cuit}</p>
                        )}
                        {client.employeeName && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 w-max">
                            Colaborador: {client.employeeName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Badges */}
                  <div className="flex flex-wrap gap-1">
                    {badges.map((b, i) => (
                      <span key={i} className={b.className}>
                        {b.icon}
                        {b.label}
                      </span>
                    ))}
                  </div>

                  {/* Row 3: Contacts */}
                  <div className="grid grid-cols-1 gap-1.5 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100/50">
                    {client.phone ? (
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <Phone size={12} className="text-slate-400" />
                        {client.phone}
                      </span>
                    ) : (
                      <span className="text-slate-300 italic">Sin teléfono</span>
                    )}
                    {client.email ? (
                      <span className="flex items-center gap-1.5 text-slate-600 break-all">
                        <Mail size={12} className="text-slate-400" />
                        {client.email}
                      </span>
                    ) : (
                      <span className="text-slate-300 italic">Sin email</span>
                    )}
                  </div>

                  {/* Expanded Section */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-slate-100 space-y-3 mt-2 animate-fadeIn text-xs">
                      {/* Address Info */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Dirección</span>
                        {client.address || client.city || client.province ? (
                          <p className="text-slate-700 flex items-start gap-1">
                            <MapPin size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />
                            <span>
                              {client.address && `${client.address}, `}
                              {[client.city, client.province].filter(Boolean).join(', ')}
                              {client.postalCode && ` (C.P. ${client.postalCode})`}
                            </span>
                          </p>
                        ) : (
                          <p className="text-slate-400 italic">Sin dirección registrada</p>
                        )}
                      </div>

                      {/* Account Stats */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-emerald-50/50 border border-emerald-100/50 rounded-lg p-2">
                          <span className="text-[9px] text-slate-400 block uppercase font-bold">Total comprado</span>
                          <span className="font-bold text-emerald-600 text-sm">
                            ${(client.totalPurchased ?? 0).toLocaleString('es-AR')}
                          </span>
                        </div>
                        <div className={`border rounded-lg p-2 ${
                          (client.totalOwed ?? 0) > 0 
                            ? 'bg-red-50/50 border-red-100/50' 
                            : (client.totalOwed ?? 0) < 0
                              ? 'bg-emerald-50/50 border-emerald-100/50'
                              : 'bg-slate-50/50 border-slate-100/50'
                        }`}>
                          <span className="text-[9px] text-slate-400 block uppercase font-bold">
                            {(client.totalOwed ?? 0) < 0 ? 'Saldo a favor' : 'Total adeudado'}
                          </span>
                          <span className={`font-bold text-sm ${
                            (client.totalOwed ?? 0) > 0 
                              ? 'text-red-600' 
                              : (client.totalOwed ?? 0) < 0
                                ? 'text-emerald-600'
                                : 'text-slate-600'
                          }`}>
                            ${Math.abs(client.totalOwed ?? 0).toLocaleString('es-AR')}
                          </span>
                        </div>
                      </div>

                      {/* Observations */}
                      {client.observations && (
                        <div className="p-2.5 bg-amber-50 border border-amber-200/60 rounded-xl text-amber-800">
                          <span className="font-semibold block text-[10px] uppercase mb-0.5">Observaciones</span>
                          {client.observations}
                        </div>
                      )}

                      {/* Created date */}
                      {client.createdAt && (
                        <div className="text-[10px] text-slate-400">
                          Registrado el {new Date(client.createdAt).toLocaleDateString('es-AR', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions Row */}
                  <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                    <span className="text-[10px] text-slate-400">
                      {client.city ? `${client.city}` : 'Sin ciudad'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : client.id)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors"
                        title="Ver detalle"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        onClick={() => openEdit(client)}
                        className="p-1.5 text-slate-500 hover:text-amber-600 rounded-lg hover:bg-amber-50 border border-slate-100 transition-colors"
                        title="Editar"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(client)}
                        className="p-1.5 text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 border border-slate-100 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ══════════════ Add / Edit Modal ══════════════ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeModal} />

          {/* Modal Panel */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  {editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {editingClient
                    ? `Editando datos de ${editingClient.firstName} ${editingClient.lastName}`
                    : 'Completa los datos del nuevo cliente'}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* Name row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="input-label">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="firstName"
                    className="input"
                    placeholder="Ej: Juan"
                    value={form.firstName}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label className="input-label">
                    Apellido <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="lastName"
                    className="input"
                    placeholder="Ej: Pérez"
                    value={form.lastName}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Contact row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Teléfono</label>
                  <input
                    name="phone"
                    className="input"
                    placeholder="Ej: 3515551234"
                    value={form.phone}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label className="input-label">Email</label>
                  <input
                    name="email"
                    type="email"
                    className="input"
                    placeholder="Ej: cliente@email.com"
                    value={form.email}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Address row */}
              <div>
                <label className="input-label">Dirección</label>
                <input
                  name="address"
                  className="input"
                  placeholder="Ej: Av. Colón 1234"
                  value={form.address}
                  onChange={handleChange}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="input-label">Ciudad</label>
                  <input
                    name="city"
                    className="input"
                    placeholder="Ej: Córdoba"
                    value={form.city}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label className="input-label">Provincia</label>
                  <input
                    name="province"
                    className="input"
                    placeholder="Ej: Córdoba"
                    value={form.province}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label className="input-label">Código Postal</label>
                  <input
                    name="postalCode"
                    className="input"
                    placeholder="Ej: 5000"
                    value={form.postalCode}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* DNI & CUIT */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">DNI (no obligatorio)</label>
                  <input
                    name="dni"
                    className="input text-sm"
                    placeholder="Ej: 12345678"
                    value={form.dni}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label className="input-label">CUIT (no obligatorio)</label>
                  <input
                    name="cuit"
                    className="input text-sm"
                    placeholder="Ej: 20-12345678-9"
                    value={form.cuit}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* ── Classification toggles ── */}
              <div className="space-y-3">
                <label className="input-label">Clasificación del Cliente</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Wholesale toggle */}
                  {userData?.role !== 'employee' && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, isWholesale: !form.isWholesale })}
                      className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 ${
                        form.isWholesale
                          ? 'border-purple-500 bg-purple-50 shadow-md shadow-purple-500/10'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                        form.isWholesale ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-400'
                      }`}>
                        <Crown size={20} />
                      </div>
                      <div className="text-left col-span-2">
                        <p className={`font-semibold text-sm ${form.isWholesale ? 'text-purple-700' : 'text-slate-700'}`}>
                          Mayorista
                        </p>
                        <p className="text-xs text-slate-400">Accede a precios mayoristas</p>
                      </div>
                      <div className={`ml-auto w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                        form.isWholesale ? 'bg-purple-500 border-purple-500 text-white' : 'border-slate-300'
                      }`}>
                        {form.isWholesale && <span className="text-xs font-bold">✓</span>}
                      </div>
                    </button>
                  )}

                  {/* Trusted toggle */}
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, isTrusted: !form.isTrusted })}
                    className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 ${
                      form.isTrusted
                        ? 'border-amber-500 bg-amber-50 shadow-md shadow-amber-500/10'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                      form.isTrusted ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'
                    }`}>
                      <Shield size={20} />
                    </div>
                    <div className="text-left col-span-2">
                      <p className={`font-semibold text-sm ${form.isTrusted ? 'text-amber-700' : 'text-slate-700'}`}>
                        De Confianza
                      </p>
                      <p className="text-xs text-slate-400">No requiere seña obligatoria</p>
                    </div>
                    <div className={`ml-auto w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                      form.isTrusted ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300'
                    }`}>
                      {form.isTrusted && <span className="text-xs font-bold">✓</span>}
                    </div>
                  </button>

                  {/* Local toggle */}
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, isLocal: !form.isLocal })}
                    className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 ${
                      form.isLocal
                        ? 'border-cyan-500 bg-cyan-50 shadow-md shadow-cyan-500/10'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                      form.isLocal ? 'bg-cyan-500 text-white' : 'bg-slate-100 text-slate-400'
                    }`}>
                      <Store size={20} />
                    </div>
                    <div className="text-left col-span-2">
                      <p className={`font-semibold text-sm ${form.isLocal ? 'text-cyan-700' : 'text-slate-700'}`}>
                        Es Local / Comercio
                      </p>
                      <p className="text-xs text-slate-400">Marcar como negocio físico</p>
                    </div>
                    <div className={`ml-auto w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                      form.isLocal ? 'bg-cyan-500 border-cyan-500 text-white' : 'border-slate-300'
                    }`}>
                      {form.isLocal && <span className="text-xs font-bold">✓</span>}
                    </div>
                  </button>
                </div>
                <p className="text-xs text-slate-400 pl-1">
                  Resultado: <span className="font-semibold text-slate-600">{getClientLabel(form)}</span>
                </p>
              </div>

              {/* Collaborator Assignment (only for Owner) */}
              {userData?.role === 'owner' && (
                <div className="space-y-1">
                  <label className="input-label">Asignar Colaborador (Comisiones)</label>
                  <select
                    name="employeeId"
                    className="input text-sm bg-white"
                    value={form.employeeId}
                    onChange={e => {
                      const selectedEmp = employees.find(emp => emp.uid === e.target.value);
                      setForm({
                        ...form,
                        employeeId: e.target.value,
                        employeeName: selectedEmp ? (selectedEmp.displayName || selectedEmp.email || 'Empleado') : ''
                      });
                    }}
                  >
                    <option value="">Ninguno / Mío (Owner)</option>
                    {employees.map(emp => (
                      <option key={emp.uid} value={emp.uid}>
                        {emp.displayName || emp.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Observations */}
              <div>
                <label className="input-label">Observaciones</label>
                <textarea
                  name="observations"
                  className="input min-h-[80px] resize-y"
                  placeholder="Notas internas sobre el cliente..."
                  value={form.observations}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-6 border-t border-slate-100">
              <button onClick={closeModal} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!form.firstName.trim() || !form.lastName.trim() || saving}
                className="btn-primary flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Guardando...
                  </>
                ) : editingClient ? (
                  'Guardar Cambios'
                ) : (
                  <>
                    <Plus size={18} />
                    Crear Cliente
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ Delete Confirmation Modal ══════════════ */}
      {/* ══════════════ Delete Confirmation Modal ══════════════ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fadeIn p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
                <Trash2 size={24} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">¿Eliminar cliente?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Estás a punto de eliminar a{' '}
                  <span className="font-semibold text-slate-700">
                    {deleteTarget.firstName} {deleteTarget.lastName}
                  </span>
                  . Esta acción no se puede deshacer.
                </p>
              </div>
              <div className="flex gap-3 w-full mt-2">
                <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button onClick={handleDelete} className="btn-danger flex-1">
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ Merge Duplicates / Orphans Modal ══════════════ */}
      {isMergeModalOpen && (() => {
        const sourceClient = clients.find(c => c.id === mergeSourceId);
        const targetClient = clients.find(c => c.id === mergeTargetId);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setIsMergeModalOpen(false)} />
            <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${mergeSourceId && mergeTargetId && mergeTab === 'merge' ? 'max-w-3xl' : 'max-w-lg'} animate-fadeIn p-6 transition-all duration-300`}>
              <div className="flex items-center justify-between border-b pb-3 mb-3">
                <h3 className="text-base font-extrabold text-slate-800">Herramientas de Unificación</h3>
                <button 
                  onClick={() => setIsMergeModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b mb-4 text-xs font-bold">
                <button
                  type="button"
                  className={`flex-1 pb-2 border-b-2 transition-all ${mergeTab === 'merge' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                  onClick={() => setMergeTab('merge')}
                >
                  Fusionar Clientes
                </button>
                <button
                  type="button"
                  className={`flex-1 pb-2 border-b-2 transition-all flex justify-center items-center gap-1.5 ${mergeTab === 'orphans' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                  onClick={() => setMergeTab('orphans')}
                >
                  Pedidos Huérfanos
                  {orphanedOrders.length > 0 && (
                    <span className="bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[9px] font-black">
                      {orphanedOrders.length}
                    </span>
                  )}
                </button>
              </div>

              {mergeTab === 'merge' ? (
                <form onSubmit={handleMergeClients} className="space-y-4 text-xs">
                  {mergeError && (
                    <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg">
                      {mergeError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">
                        1. Cliente Duplicado (Se eliminará)
                      </label>
                      <select
                        value={mergeSourceId}
                        onChange={e => setMergeSourceId(e.target.value)}
                        className="input w-full"
                        required
                      >
                        <option value="">-- Selecciona el duplicado a eliminar --</option>
                        {clients.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.lastName}, {c.firstName} {c.email ? `(${c.email})` : '(Sin email)'}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">
                        2. Cliente Principal (Se conservará)
                      </label>
                      <select
                        value={mergeTargetId}
                        onChange={e => setMergeTargetId(e.target.value)}
                        className="input w-full"
                        required
                      >
                        <option value="">-- Selecciona el cliente principal a conservar --</option>
                        {clients.filter(c => c.id !== mergeSourceId).map(c => (
                          <option key={c.id} value={c.id}>
                            {c.lastName}, {c.firstName} {c.email ? `(${c.email})` : '(Sin email)'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {sourceClient && targetClient && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <span className="text-[10px] text-slate-500 font-bold">REVISIÓN DE DATOS (Hacé clic en los valores para copiarlos)</span>
                        <button
                          type="button"
                          onClick={handleSwapMerge}
                          className="text-[10px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-extrabold px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
                        >
                          <RefreshCw size={11} className="text-slate-400" />
                          Intercambiar Roles
                        </button>
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[280px] overflow-y-auto">
                        <table className="w-full text-left border-collapse min-w-[500px]">
                          <thead>
                            <tr className="bg-slate-100/80 border-b text-[9px] font-black text-slate-500 uppercase sticky top-0 z-10">
                              <th className="p-2 w-1/4">Campo</th>
                              <th className="p-2 w-1/3 bg-red-50/40 text-red-700">Se Elimina</th>
                              <th className="p-2 w-1/3 bg-emerald-50/40 text-emerald-700">Se Conserva</th>
                              <th className="p-2 text-slate-700">Resultado Final</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y text-[11px]">
                            {renderMergeRow('firstName', 'Nombre', sourceClient, targetClient)}
                            {renderMergeRow('lastName', 'Apellido', sourceClient, targetClient)}
                            {renderMergeRow('phone', 'Teléfono', sourceClient, targetClient)}
                            {renderMergeRow('email', 'Email', sourceClient, targetClient)}
                            {renderMergeRow('dni', 'DNI', sourceClient, targetClient)}
                            {renderMergeRow('cuit', 'CUIT', sourceClient, targetClient)}
                            {renderMergeRow('address', 'Dirección', sourceClient, targetClient)}
                            {renderMergeRow('city', 'Localidad', sourceClient, targetClient)}
                            {renderMergeRow('province', 'Provincia', sourceClient, targetClient)}
                            {renderMergeRow('postalCode', 'Cód. Postal', sourceClient, targetClient)}
                            {renderMergeRow('observations', 'Observaciones', sourceClient, targetClient, true)}
                          </tbody>
                        </table>
                      </div>

                      <div className="bg-amber-50 border border-amber-200/60 p-3 rounded-xl text-amber-900 space-y-1 mt-2">
                        <p className="font-extrabold text-[11px] flex items-center gap-1">⚠️ Efectos de la Fusión:</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-[10px] text-amber-800/95 leading-normal">
                          <li>Todos los pedidos e historial de cuentas corrientes se transferirán al principal.</li>
                          <li>Se unificarán los saldos: comprado <strong>${((targetClient.totalPurchased || 0) + (sourceClient.totalPurchased || 0)).toLocaleString('es-AR')}</strong>, deudores <strong>${((targetClient.totalOwed || 0) + (sourceClient.totalOwed || 0)).toLocaleString('es-AR')}</strong>.</li>
                          <li>Las cuentas de acceso del cliente (userId) se redireccionarán de forma transparente.</li>
                          <li>El duplicado original se eliminará definitivamente.</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 w-full mt-4 pt-3 border-t">
                    <button 
                      type="button" 
                      onClick={() => setIsMergeModalOpen(false)} 
                      className="btn-secondary flex-1"
                      disabled={mergeLoading}
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      className="btn-primary flex-1 flex justify-center items-center gap-1.5"
                      disabled={mergeLoading || !mergeSourceId || !mergeTargetId}
                    >
                      {mergeLoading ? 'Fusionando...' : 'Fusionar Clientes'}
                    </button>
                  </div>
                </form>
            ) : (
              <div className="space-y-4 text-xs max-h-[400px] overflow-y-auto pr-1">
                <p className="text-slate-500 leading-normal">
                  Aquí aparecen grupos de pedidos enlazados a códigos de cliente que fueron borrados del sistema. Elige a qué cliente activo deseas vincularlos para unificar su historial.
                </p>

                {orphanedOrders.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 border border-dashed rounded-xl">
                    No hay pedidos huérfanos. Todos los pedidos están correctamente vinculados a clientes activos.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orphanedOrders.map(orphan => (
                      <div key={orphan.customerId} className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-2.5">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{orphan.customerName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">ID Anterior: {orphan.customerId}</p>
                          </div>
                          <div className="text-right">
                            <span className="inline-block bg-blue-50 text-blue-600 border border-blue-100 rounded px-1.5 py-0.5 text-[10px] font-bold">
                              {orphan.orderCount} {orphan.orderCount === 1 ? 'pedido' : 'pedidos'}
                            </span>
                            <p className="text-[10px] text-slate-500 font-bold mt-0.5">Total: ${orphan.totalAmount.toLocaleString('es-AR')}</p>
                          </div>
                        </div>

                        <div className="flex gap-2 items-center">
                          <select
                            value={selectedOrphanTargets[orphan.customerId] || ''}
                            onChange={e => setSelectedOrphanTargets(prev => ({ ...prev, [orphan.customerId]: e.target.value }))}
                            className="input bg-white text-[11px] flex-1 py-1 px-2 h-8"
                          >
                            <option value="">-- Vincular a cliente activo --</option>
                            {clients.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.lastName}, {c.firstName}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleLinkOrphanedOrders(orphan.customerId, selectedOrphanTargets[orphan.customerId])}
                            disabled={linkOrphanLoading || !selectedOrphanTargets[orphan.customerId]}
                            className="btn-primary text-[10px] py-1 px-3 h-8 whitespace-nowrap"
                          >
                            Vincular
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    })()}
    </div>
  );
};
