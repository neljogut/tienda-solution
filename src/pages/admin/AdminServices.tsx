import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, runTransaction, query, where, getDocs } from 'firebase/firestore';
import { Search, Plus, Filter, MessageSquare, Printer, Check, X, FileText, AlertCircle, Wrench, Phone, Loader2, Shield, User, Activity, AlertTriangle, CheckCircle, Package, Lock, KeyRound, Grid3X3, Mail, MapPin, CreditCard } from 'lucide-react';
import { REPAIR_STATUS_DETAILS, REPAIR_PRIORITY_DETAILS } from '../../types/repair';
import type { Repair, RepairStatus, RepairPriority, RepairItem } from '../../types/repair';
import { PatternDrawer } from '../../components/PatternDrawer';
import type { BusinessSettings } from '../../types/settings';

const STATUS_DETAILS = REPAIR_STATUS_DETAILS;

export const AdminServices: React.FC = () => {
  const [repairs, setRepairs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals / Form toggles
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [selectedRepair, setSelectedRepair] = useState<any | null>(null);

  // New Intake Form
  const [newClientName, setNewClientName] = useState('');
  const [newClientWhatsApp, setNewClientWhatsApp] = useState('');
  const [newClientDni, setNewClientDni] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newDeviceType, setNewDeviceType] = useState<'cellphone' | 'pc' | 'other'>('cellphone');
  const [newDeviceDetails, setNewDeviceDetails] = useState('');
  const [newReportedFault, setNewReportedFault] = useState('');
  const [newAccessoriesLeft, setNewAccessoriesLeft] = useState('');
  const [newCostEstimated, setNewCostEstimated] = useState('0');
  const [newTechnicalDiagnosis, setNewTechnicalDiagnosis] = useState('');
  const [submittingIntake, setSubmittingIntake] = useState(false);
  const [newCreatedTicketCode, setNewCreatedTicketCode] = useState<string | null>(null);
  
  // New fields for intake
  const [newUnlockPin, setNewUnlockPin] = useState('');
  const [newPinType, setNewPinType] = useState<'text' | 'pattern'>('text');
  const [newPatternImage, setNewPatternImage] = useState<string>('');
  const [newPriority, setNewPriority] = useState<RepairPriority>('normal');
  const [newAssignedTechnicianId, setNewAssignedTechnicianId] = useState('');
  const [newAssignedTechnicianName, setNewAssignedTechnicianName] = useState('');
  const [newBudgetItems, setNewBudgetItems] = useState<RepairItem[]>([]);
  
  // Client search state
  const [searchingClient, setSearchingClient] = useState(false);
  const [existingClient, setExistingClient] = useState<any | null>(null);
  const [clientRepairs, setClientRepairs] = useState<any[]>([]);

  // Edit / Update State Form
  const [editStatus, setEditStatus] = useState<string>('received');
  const [editCost, setEditCost] = useState<string>('0');
  const [editDiagnosis, setEditDiagnosis] = useState('');
  const [editStatusNotes, setEditStatusNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  
  // Edit fields
  const [editUnlockPin, setEditUnlockPin] = useState('');
  const [editPinType, setEditPinType] = useState<'text' | 'pattern'>('text');
  const [editPatternImage, setEditPatternImage] = useState<string>('');
  const [editPriority, setEditPriority] = useState<RepairPriority>('normal');
  const [editAssignedTechnicianId, setEditAssignedTechnicianId] = useState('');
  const [editAssignedTechnicianName, setEditAssignedTechnicianName] = useState('');
  const [editBudgetItems, setEditBudgetItems] = useState<RepairItem[]>([]);

  // Employees for technician assignment
  const [employees, setEmployees] = useState<{uid: string; displayName: string}[]>([]);

  // Business settings for WhatsApp number
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);

  // Fetch Business Settings
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'business'), (snap) => {
      if (snap.exists()) {
        setBusinessSettings(snap.data() as BusinessSettings);
      }
    });
    return unsubscribe;
  }, []);

  // Fetch Repairs from Firestore
  useEffect(() => {
    const q = collection(db, 'repairs');
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      // Sort by createdAt descending
      list.sort((a, b) => {
        const dateA = a.createdAt?.seconds || 0;
        const dateB = b.createdAt?.seconds || 0;
        return dateB - dateA;
      });
      setRepairs(list);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching repairs:", error);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Fetch employees for technician assignment
  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', 'in', ['owner', 'employee']));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: {uid: string; displayName: string}[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        list.push({ uid: doc.id, displayName: data.displayName });
      });
      setEmployees(list);
    });
    return unsubscribe;
  }, []);

  // Search existing client by WhatsApp
  const searchClientByWhatsApp = async (whatsapp: string) => {
    if (!whatsapp || whatsapp.length < 8) {
      setExistingClient(null);
      setClientRepairs([]);
      return;
    }

    setSearchingClient(true);
    try {
      const cleanPhone = whatsapp.replace(/\D/g, '');
      
      // Search repairs by this WhatsApp
      const q = query(collection(db, 'repairs'), where('clientWhatsAppClean', '==', cleanPhone));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        // Get the first repair to extract client data
        const firstRepair = snap.docs[0].data();
        const allRepairs: any[] = [];
        snap.forEach(doc => {
          allRepairs.push({ id: doc.id, ...doc.data() });
        });
        
        setExistingClient({
          name: firstRepair.clientName,
          whatsapp: firstRepair.clientWhatsApp,
          dni: firstRepair.clientDni || '',
          address: firstRepair.clientAddress || '',
          email: firstRepair.clientEmail || ''
        });
        setClientRepairs(allRepairs);
      } else {
        setExistingClient(null);
        setClientRepairs([]);
      }
    } catch (error) {
      console.error("Error searching client:", error);
    } finally {
      setSearchingClient(false);
    }
  };

  // Auto-fill client data when existing client found
  useEffect(() => {
    if (existingClient) {
      setNewClientName(existingClient.name);
      setNewClientDni(existingClient.dni);
      setNewClientAddress(existingClient.address);
      setNewClientEmail(existingClient.email);
    }
  }, [existingClient]);

  // Filter & Search Logic
  const filteredRepairs = repairs.filter(r => {
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchesSearch = 
      r.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.clientWhatsApp.includes(searchTerm) ||
      (r.ticketCode && r.ticketCode.includes(searchTerm)) ||
      (r.deviceDetails && r.deviceDetails.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  // Open Edit Modal
  const handleOpenEdit = (repair: any) => {
    setSelectedRepair(repair);
    setEditStatus(repair.status);
    setEditCost(String(repair.costEstimated || 0));
    setEditDiagnosis(repair.technicalDiagnosis || '');
    setEditStatusNotes(repair.statusNotes || '');
    // New fields
    setEditUnlockPin(repair.unlockPin || '');
    setEditPinType(repair.patternImage ? 'pattern' : 'text');
    setEditPatternImage(repair.patternImage || '');
    setEditPriority(repair.priority || 'normal');
    setEditAssignedTechnicianId(repair.assignedTechnicianId || '');
    setEditAssignedTechnicianName(repair.assignedTechnicianName || '');
    setEditBudgetItems(repair.budgetItems || []);
    setShowEditModal(true);
  };

  // Register New Repair Intake
  const handleRegisterIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim() || !newClientWhatsApp.trim() || !newReportedFault.trim()) return;

    setSubmittingIntake(true);
    let nextTicketCode = "1000";

    try {
      const cleanPhone = newClientWhatsApp.replace(/\D/g, '');

      // 1. Safe transaction for sequential Ticket Code
      const counterRef = doc(db, 'settings', 'counters');
      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let currentCounter = 1000;
        
        if (counterDoc.exists()) {
          currentCounter = counterDoc.data().repairCounter || 1000;
        } else {
          transaction.set(counterRef, { repairCounter: 1000 });
        }
        
        const newCounter = currentCounter + 1;
        transaction.update(counterRef, { repairCounter: newCounter });
        nextTicketCode = String(newCounter);
      });

      const intakeData = {
        ticketCode: nextTicketCode,
        clientName: newClientName.trim(),
        clientWhatsApp: newClientWhatsApp.trim(),
        clientWhatsAppClean: cleanPhone,
        clientDni: newClientDni.trim(),
        clientAddress: newClientAddress.trim(),
        clientEmail: newClientEmail.trim(),
        deviceType: newDeviceType,
        deviceDetails: newDeviceDetails.trim(),
        reportedFault: newReportedFault.trim(),
        accessoriesLeft: newAccessoriesLeft.trim(),
        costEstimated: parseFloat(newCostEstimated) || 0,
        technicalDiagnosis: newTechnicalDiagnosis.trim(),
        status: 'received',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        statusNotes: 'Equipo recibido en el taller. Pendiente de diagnóstico técnico inicial.',
        // New fields
        unlockPin: newPinType === 'text' ? newUnlockPin.trim() : '',
        pinType: newPinType,
        patternImage: newPinType === 'pattern' ? newPatternImage : '',
        priority: newPriority,
        assignedTechnicianId: newAssignedTechnicianId,
        assignedTechnicianName: newAssignedTechnicianName,
        budgetItems: newBudgetItems,
        totalBudget: newBudgetItems.reduce((sum, item) => sum + item.amount, 0)
      };

      await addDoc(collection(db, 'repairs'), intakeData);
      
      // Save code for success modal
      setNewCreatedTicketCode(nextTicketCode);
      setSelectedRepair(intakeData); // for print and whatsapp options in success modal

      // Clear Form
      setNewClientName('');
      setNewClientWhatsApp('');
      setNewClientDni('');
      setNewClientAddress('');
      setNewClientEmail('');
      setNewDeviceType('cellphone');
      setNewDeviceDetails('');
      setNewReportedFault('');
      setNewAccessoriesLeft('');
      setNewCostEstimated('0');
      setNewTechnicalDiagnosis('');
      // Clear new fields
      setNewUnlockPin('');
      setNewPinType('text');
      setNewPatternImage('');
      setNewPriority('normal');
      setNewAssignedTechnicianId('');
      setNewAssignedTechnicianName('');
      setNewBudgetItems([]);
      setExistingClient(null);
      setClientRepairs([]);
      
      setShowAddModal(false);
      setShowSuccessModal(true);
    } catch (err) {
      console.error("Error al registrar orden técnica:", err);
      alert("Hubo un error al guardar los datos. Intente nuevamente.");
    } finally {
      setSubmittingIntake(false);
    }
  };

  // Save updates (Diagnosis, Cost, Notes, Status)
  const handleSaveUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepair) return;

    setSavingEdit(true);
    try {
      const repairRef = doc(db, 'repairs', selectedRepair.id);
      
      const updates = {
        status: editStatus,
        costEstimated: parseFloat(editCost) || 0,
        technicalDiagnosis: editDiagnosis.trim(),
        statusNotes: editStatusNotes.trim(),
        updatedAt: serverTimestamp(),
        // New fields
        unlockPin: editPinType === 'text' ? editUnlockPin.trim() : '',
        pinType: editPinType,
        patternImage: editPinType === 'pattern' ? editPatternImage : '',
        priority: editPriority,
        assignedTechnicianId: editAssignedTechnicianId,
        assignedTechnicianName: editAssignedTechnicianName,
        budgetItems: editBudgetItems,
        totalBudget: editBudgetItems.reduce((sum, item) => sum + item.amount, 0)
      };

      await updateDoc(repairRef, updates);
      setShowEditModal(false);

      // Trigger automatic option to send update on WhatsApp
      const updatedRepair = { ...selectedRepair, ...updates };
      setSelectedRepair(updatedRepair);
      
      // Ask or automatically show options (we will just trigger whatsapp dialog/actions manually)
    } catch (err) {
      console.error("Error al actualizar reparación:", err);
      alert("No se pudo guardar la actualización.");
    } finally {
      setSavingEdit(false);
    }
  };

  // WhatsApp link generator
  const handleSendWhatsAppMessage = (repair: any, type: 'welcome' | 'update') => {
    if (!repair) return;
    const phone = repair.clientWhatsAppClean;
    const name = repair.clientName;
    const ticket = repair.ticketCode;
    const device = `${repair.deviceType === 'cellphone' ? 'Celular' : repair.deviceType === 'pc' ? 'Computadora' : 'Equipo'} ${repair.deviceDetails || ''}`;
    const trackingLink = `${window.location.origin}/servicios?search=${ticket}`;

    let text = "";
    if (type === 'welcome') {
      text = `Hola ${name}! Registramos el ingreso de tu ${device} en *Solution Servicio Técnico*. El número de tu Ticket es *#${ticket}*. Podés seguir el estado de la reparación en tiempo real desde este link: ${trackingLink}`;
    } else {
      const statusLabel = STATUS_DETAILS[repair.status as keyof typeof STATUS_DETAILS]?.label || 'Actualizado';
      const costText = repair.costEstimated > 0 ? `Costo estimado: *$${repair.costEstimated.toLocaleString('es-AR')}*` : 'Presupuesto a confirmar';
      text = `Hola ${name}! Te informamos sobre el estado de tu ${device} (Ticket *#${ticket}*). Estado actual: *${statusLabel}*. ${costText}. Notas del técnico: _"${repair.statusNotes || ''}"_. Seguimiento completo en: ${trackingLink}`;
    }

    const encodedText = encodeURIComponent(text);
    window.open(`https://wa.me/${phone.startsWith('54') ? phone : '54' + phone}?text=${encodedText}`, '_blank');
  };

  // Printable A4 sheet function
  const triggerPrint = (repair: any) => {
    if (!repair) return;
    
    // Set active print repair in state temporarily and wait a tiny bit to trigger print
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      alert("Permite las ventanas emergentes en tu navegador para imprimir.");
      return;
    }

    const formattedDate = repair.createdAt 
      ? new Date(repair.createdAt.seconds * 1000).toLocaleString('es-AR')
      : new Date().toLocaleString('es-AR');

    const priorityInfo = REPAIR_PRIORITY_DETAILS[repair.priority as keyof typeof REPAIR_PRIORITY_DETAILS] || REPAIR_PRIORITY_DETAILS.normal;

    const htmlContent = `
      <html>
        <head>
          <title>Comprobante de Recepción - Ticket #${repair.ticketCode}</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; padding: 40px; line-height: 1.5; }
            .ticket-container { border: 2px solid #cbd5e1; border-radius: 20px; padding: 30px; max-width: 700px; margin: 0 auto; background: #fff; position: relative; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 20px; }
            .logo-title { font-size: 24px; font-weight: 900; letter-spacing: 1px; color: #1e3a8a; }
            .ticket-number { font-size: 28px; font-weight: 900; color: #2563eb; }
            .section-title { font-size: 11px; text-transform: uppercase; font-weight: 800; color: #64748b; letter-spacing: 1px; margin-bottom: 5px; margin-top: 15px; }
            .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            .details-box { background: #f8fafc; border: 1px solid #f1f5f9; padding: 15px; border-radius: 12px; font-size: 14px; }
            .bold { font-weight: 700; color: #0f172a; }
            .footer-info { margin-top: 30px; text-align: center; border-top: 1px dashed #e2e8f0; padding-top: 20px; font-size: 12px; color: #64748b; }
            .tracking-box { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 15px; border-radius: 12px; margin-top: 20px; font-size: 13px; text-align: center; font-weight: 600; }
            .priority-badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; }
            .priority-low { background: #f1f5f9; color: #64748b; }
            .priority-normal { background: #dbeafe; color: #2563eb; }
            .priority-high { background: #fef3c7; color: #d97706; }
            .priority-urgent { background: #fee2e2; color: #dc2626; }
            .pin-box { background: #fef3c7; border: 1px solid #fcd34d; color: #92400e; padding: 10px; border-radius: 8px; margin-top: 10px; font-size: 13px; }
            @media print {
              body { padding: 0; }
              .ticket-container { border: 1px solid #94a3b8; box-shadow: none; padding: 20px; }
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="ticket-container">
            <div class="header">
              <div>
                <div class="logo-title">SOLUTION</div>
                <div style="font-size: 10px; color: #64748b; font-weight: 600;">SERVICIO TÉCNICO ESPECIALIZADO</div>
              </div>
              <div style="text-align: right;">
                <div class="ticket-number">TICKET #${repair.ticketCode}</div>
                <div class="priority-badge priority-${repair.priority}" style="margin-top: 5px;">${priorityInfo.icon} ${priorityInfo.label}</div>
              </div>
            </div>

            <div class="details-grid">
              <div>
                <div class="section-title">Datos del Cliente</div>
                <div class="details-box">
                  <div>Cliente: <span class="bold">${repair.clientName}</span></div>
                  <div>WhatsApp: <span class="bold">${repair.clientWhatsApp}</span></div>
                  ${repair.clientDni ? `<div>DNI/CUIT: <span class="bold">${repair.clientDni}</span></div>` : ''}
                  ${repair.clientAddress ? `<div>Dirección: <span class="bold">${repair.clientAddress}</span></div>` : ''}
                  ${repair.clientEmail ? `<div>Email: <span class="bold">${repair.clientEmail}</span></div>` : ''}
                  <div style="margin-top: 5px; font-size: 11px; color: #64748b;">Fecha de Ingreso: ${formattedDate}</div>
                </div>
              </div>

              <div>
                <div class="section-title">Datos del Dispositivo</div>
                <div class="details-box">
                  <div>Tipo: <span class="bold" style="text-transform: capitalize;">${repair.deviceType === 'cellphone' ? 'Celular' : repair.deviceType === 'pc' ? 'Computadora' : 'Otro'}</span></div>
                  <div>Modelo: <span class="bold">${repair.deviceDetails || 'Sin detalles'}</span></div>
                  <div>Accesorios Dejados: <span class="bold">${repair.accessoriesLeft || 'Ninguno'}</span></div>
                  ${repair.assignedTechnicianName ? `<div>Técnico: <span class="bold">${repair.assignedTechnicianName}</span></div>` : ''}
                </div>
              </div>
            </div>

            ${repair.unlockPin || repair.patternImage ? `
              <div class="pin-box">
                ${repair.pinType === 'pattern' && repair.patternImage ? `
                  <strong>🔒 Patrón de Desbloqueo:</strong>
                  <div style="margin-top: 8px;">
                    <img src="${repair.patternImage}" alt="Patrón de desbloqueo" style="width: 120px; height: 120px; border: 2px solid #d97706; border-radius: 12px; background: white;" />
                  </div>
                ` : `
                  <strong>🔒 PIN / Contraseña:</strong> <span style="font-size: 16px; font-family: monospace;">${repair.unlockPin}</span>
                `}
                <div style="font-size: 10px; color: #a16207; margin-top: 3px;">Este código es confidencial. Solo para uso del técnico.</div>
              </div>
            ` : ''}

            <div>
              <div class="section-title">Falla Reportada por el Cliente</div>
              <div class="details-box" style="font-style: italic; background: #fffbeb; border-color: #fef3c7; color: #92400e;">
                "${repair.reportedFault}"
              </div>
            </div>

            <div class="tracking-box">
              Podés seguir el estado de tu reparación en tiempo real desde la web:<br>
              <span style="font-size: 16px; font-family: monospace; color: #2563eb; font-weight: 900;">${window.location.origin}/servicios</span><br>
              Ingresando tu número de ticket: <span style="font-size: 15px; background: #fff; padding: 2px 8px; border-radius: 6px; border: 1px solid #bfdbfe; font-weight: 800;">#${repair.ticketCode}</span>
            </div>

            <div class="footer-info">
              Solution · Tu centro de soluciones técnicas.<br>
              Conserva este comprobante para retirar el dispositivo una vez finalizada la reparación.
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2.5">
            <Wrench className="text-blue-600" size={24} />
            Gestión de Servicio Técnico
          </h1>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            Registrá ingresos, actualizá diagnósticos y notificá a tus clientes por WhatsApp.
          </p>
        </div>
      </div>

      {/* Mobile Floating Action Button */}
      <div className="md:hidden fixed bottom-20 right-4 z-40">
        <button
          onClick={() => setShowAddModal(true)}
          className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg shadow-blue-500/30 flex items-center justify-center transition-all"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* Desktop Button */}
      <div className="hidden md:flex justify-end">
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center justify-center gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 py-3 px-5 font-bold text-sm h-11"
        >
          <Plus size={16} />
          Nuevo Ingreso (Local)
        </button>
      </div>

      {/* KPI Dashboard Cards */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Package className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Por Asignar</p>
                <p className="text-xl font-black text-slate-800">
                  {repairs.filter(r => r.status === 'received').length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Activity className="text-amber-600" size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">En Proceso</p>
                <p className="text-xl font-black text-slate-800">
                  {repairs.filter(r => ['diagnosing', 'budgeted', 'repairing'].includes(r.status)).length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <CheckCircle className="text-emerald-600" size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Por Entregar</p>
                <p className="text-xl font-black text-slate-800">
                  {repairs.filter(r => r.status === 'ready').length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="text-red-600" size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Urgentes</p>
                <p className="text-xl font-black text-red-600">
                  {repairs.filter(r => r.priority === 'urgent' && r.status !== 'delivered' && r.status !== 'cancelled').length}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Assistant Card */}
      {!loading && repairs.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl p-4 border border-emerald-200 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-white text-lg">🤖</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-emerald-800">Asistente IA</h3>
              <div className="mt-2 space-y-1.5">
                {repairs.filter(r => r.status === 'received').length > 0 && (
                  <p className="text-xs text-emerald-700">
                    📥 Tenés <strong>{repairs.filter(r => r.status === 'received').length}</strong> equipo(s) nuevo(s) esperando diagnóstico.
                  </p>
                )}
                {repairs.filter(r => r.priority === 'urgent' && r.status !== 'delivered' && r.status !== 'cancelled').length > 0 && (
                  <p className="text-xs text-red-600 font-semibold">
                    ⚡ Hay <strong>{repairs.filter(r => r.priority === 'urgent' && r.status !== 'delivered' && r.status !== 'cancelled').length}</strong> reparación(es) urgente(s) pendiente(s). ¡Revisá prioridades!
                  </p>
                )}
                {repairs.filter(r => r.status === 'ready').length > 0 && (
                  <p className="text-xs text-blue-600">
                    📦 Hay <strong>{repairs.filter(r => r.status === 'ready').length}</strong> equipo(s) listo(s) para entregar. ¿Les avisamos por WhatsApp?
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters and Search Bar */}
      <div className="bg-white rounded-3xl p-4 md:p-5 shadow-sm border border-slate-100 flex flex-col md:flex-row gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por cliente, celular, ticket..."
            className="input pl-11 h-11 text-sm bg-slate-50 border-slate-200/80 focus:bg-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Status Filter */}
        <div className="relative w-full md:w-56">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
          <select
            className="input pl-11 h-11 text-xs bg-slate-50 border-slate-200/80 focus:bg-white cursor-pointer select-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="received">Recibido</option>
            <option value="diagnosing">En Diagnóstico</option>
            <option value="budgeted">Presupuestado</option>
            <option value="repairing">En Reparación</option>
            <option value="ready">Listo para retirar</option>
            <option value="delivered">Entregados</option>
            <option value="cancelled">Cancelados</option>
          </select>
        </div>
      </div>

      {/* Repairs Table / Cards */}
      {loading ? (
        <div className="flex justify-center items-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredRepairs.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 flex flex-col items-center justify-center text-center border border-slate-100 shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
            <Wrench size={28} className="text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-700">No se encontraron reparaciones</h3>
          <p className="text-xs text-slate-500 max-w-xs mt-1">
            {searchTerm || statusFilter !== 'all' 
              ? 'Probá cambiando los filtros o la búsqueda.' 
              : 'Todavía no hay ninguna orden técnica registrada.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="py-4 px-6">Ticket</th>
                    <th className="py-4 px-6">Cliente</th>
                    <th className="py-4 px-6">Dispositivo</th>
                  <th className="py-4 px-6">Prioridad</th>
                  <th className="py-4 px-6">Técnico</th>
                  <th className="py-4 px-6">Desbloqueo</th>
                  <th className="py-4 px-6">Estado</th>
                    <th className="py-4 px-6 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredRepairs.map((repair) => {
                    const statusInfo = STATUS_DETAILS[repair.status as keyof typeof STATUS_DETAILS] || STATUS_DETAILS.received;
                    const priorityInfo = REPAIR_PRIORITY_DETAILS[repair.priority as keyof typeof REPAIR_PRIORITY_DETAILS] || REPAIR_PRIORITY_DETAILS.normal;
                    const isUrgent = repair.priority === 'urgent';
                    return (
                      <tr key={repair.id} className={`hover:bg-slate-50/50 transition-colors ${isUrgent ? 'bg-red-50/30' : ''}`}>
                        <td className="py-4 px-6 font-black text-blue-600">#{repair.ticketCode}</td>
                        <td className="py-4 px-6">
                          <div className="font-bold text-slate-800">{repair.clientName}</div>
                          <div className="text-xs text-slate-400 font-semibold flex items-center gap-1 mt-0.5">
                            <Phone size={12} />{repair.clientWhatsApp}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="font-semibold text-slate-700 capitalize">
                            {repair.deviceType === 'cellphone' ? '📱 Celular' : repair.deviceType === 'pc' ? '💻 Computadora' : '🔧 Otro'}
                          </div>
                          <div className="text-xs text-slate-400 font-medium truncate max-w-[150px] mt-0.5">
                            {repair.deviceDetails || 'Sin detalles'}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${priorityInfo.color}`}>
                            {priorityInfo.icon} {priorityInfo.label}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-xs text-slate-600 font-semibold">
                            {repair.assignedTechnicianName || <span className="text-slate-300 italic">Sin asignar</span>}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          {repair.pinType === 'pattern' && repair.patternImage ? (
                            <button onClick={() => { const win = window.open('', '_blank', 'width=300,height=350'); if (win) { win.document.write(`<html><head><title>Patrón - #${repair.ticketCode}</title></head><body style="font-family: Arial; text-align: center; padding: 20px;"><h3 style="color: #1e293b;">Patrón de Desbloqueo</h3><p style="color: #64748b; font-size: 12px;">Ticket #${repair.ticketCode}</p><img src="${repair.patternImage}" style="width: 200px; height: 200px; border: 2px solid #3b82f6; border-radius: 16px;" /><p style="color: #dc2626; font-size: 10px; margin-top: 10px;">⚠️ CONFIDENCIAL</p></body></html>`); win.document.close(); } }} className="p-1.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors" title="Ver patrón"><Grid3X3 size={14} /></button>
                          ) : repair.unlockPin ? (
                            <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">{repair.unlockPin}</span>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border uppercase tracking-wider select-none ${statusInfo.color.split(' hover:')[0]}`}>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right space-x-1.5 flex justify-end items-center h-full">
                          <button onClick={() => handleOpenEdit(repair)} className="p-2 rounded-xl border border-slate-100 hover:border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-100/60 transition-all" title="Actualizar"><FileText size={16} /></button>
                          <button onClick={() => triggerPrint(repair)} className="p-2 rounded-xl border border-slate-100 hover:border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-100/60 transition-all" title="Imprimir"><Printer size={16} /></button>
                          <button onClick={() => handleSendWhatsAppMessage(repair, 'update')} className="p-2 rounded-xl border border-slate-100 hover:border-slate-200 text-green-600 hover:bg-green-50/50 transition-all" title="WhatsApp"><MessageSquare size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filteredRepairs.map((repair) => {
              const statusInfo = STATUS_DETAILS[repair.status as keyof typeof STATUS_DETAILS] || STATUS_DETAILS.received;
              const priorityInfo = REPAIR_PRIORITY_DETAILS[repair.priority as keyof typeof REPAIR_PRIORITY_DETAILS] || REPAIR_PRIORITY_DETAILS.normal;
              const isUrgent = repair.priority === 'urgent';
              return (
                <div key={repair.id} className={`bg-white rounded-2xl p-4 border shadow-sm ${isUrgent ? 'border-red-200 bg-red-50/30' : 'border-slate-100'}`}>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-blue-600 text-lg">#{repair.ticketCode}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${priorityInfo.color}`}>
                        {priorityInfo.icon} {priorityInfo.label}
                      </span>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${statusInfo.color.split(' hover:')[0]}`}>
                      {statusInfo.label}
                    </span>
                  </div>

                  {/* Client & Device */}
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-bold text-slate-800">{repair.clientName}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-xs text-slate-500 flex items-center gap-1"><Phone size={10} />{repair.clientWhatsApp}</span>
                    </div>
                    <div className="text-xs text-slate-600">
                      {repair.deviceType === 'cellphone' ? '📱' : repair.deviceType === 'pc' ? '💻' : '🔧'} 
                      <span className="font-semibold capitalize"> {repair.deviceType === 'cellphone' ? 'Celular' : repair.deviceType === 'pc' ? 'Computadora' : 'Otro'}</span>
                      {repair.deviceDetails && <span className="text-slate-400"> · {repair.deviceDetails}</span>}
                    </div>
                  </div>

                  {/* Info Row */}
                  <div className="flex flex-wrap gap-2 text-[10px] text-slate-500 mb-3">
                    {repair.assignedTechnicianName && (
                      <span className="bg-slate-100 px-2 py-1 rounded-lg font-semibold">👤 {repair.assignedTechnicianName}</span>
                    )}
                    {repair.unlockPin && (
                      <span className="bg-amber-50 text-amber-600 px-2 py-1 rounded-lg font-semibold font-mono">🔒 {repair.unlockPin}</span>
                    )}
                    {repair.pinType === 'pattern' && repair.patternImage && (
                      <button onClick={() => { const win = window.open('', '_blank', 'width=300,height=350'); if (win) { win.document.write(`<html><head><title>Patrón</title></head><body style="font-family: Arial; text-align: center; padding: 20px;"><img src="${repair.patternImage}" style="width: 200px; height: 200px; border: 2px solid #3b82f6; border-radius: 16px;" /></body></html>`); win.document.close(); } }} className="bg-amber-50 text-amber-600 px-2 py-1 rounded-lg font-semibold">⊞ Ver patrón</button>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-3 border-t border-slate-100">
                    <button onClick={() => handleOpenEdit(repair)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">
                      <FileText size={14} /> Editar
                    </button>
                    <button onClick={() => triggerPrint(repair)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">
                      <Printer size={14} /> Imprimir
                    </button>
                    <button onClick={() => handleSendWhatsAppMessage(repair, 'update')} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-50 hover:bg-green-100 text-green-700 text-xs font-bold transition-colors">
                      <MessageSquare size={14} /> WhatsApp
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add Intake Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-lg shadow-2xl relative border border-slate-100 max-h-[95vh] md:max-h-[90vh] overflow-y-auto p-5 md:p-8">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all"
            >
              <X size={16} />
            </button>

            <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
              <Plus className="text-blue-600" size={20} />
              Ingreso de Equipo (Taller)
            </h3>

            <form onSubmit={handleRegisterIntake} className="space-y-4">
              {/* Client WhatsApp - First field for search */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">WhatsApp del Cliente *</label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    placeholder="Ej: 1122334455"
                    className="input h-10 text-xs bg-slate-50 pr-10"
                    value={newClientWhatsApp}
                    onChange={(e) => {
                      setNewClientWhatsApp(e.target.value);
                      searchClientByWhatsApp(e.target.value);
                    }}
                  />
                  {searchingClient && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 size={14} className="animate-spin text-blue-500" />
                    </div>
                  )}
                </div>
              </div>

              {/* Existing Client Info Card */}
              {existingClient && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2 text-blue-700">
                    <CheckCircle size={14} />
                    <span className="text-xs font-bold">Cliente encontrado - {clientRepairs.length} reparación(es) anterior(es)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div><span className="font-bold">Nombre:</span> {existingClient.name}</div>
                    <div><span className="font-bold">DNI:</span> {existingClient.dni || 'No registrado'}</div>
                    <div><span className="font-bold">Dirección:</span> {existingClient.address || 'No registrada'}</div>
                    <div><span className="font-bold">Email:</span> {existingClient.email || 'No registrado'}</div>
                  </div>
                  <p className="text-[10px] text-blue-600 font-semibold">
                    ℹ️ Los datos se completarán automáticamente. Podés editarlos si es necesario.
                  </p>
                </div>
              )}

              {/* Client Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: María López"
                  className="input h-10 text-xs bg-slate-50"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                />
              </div>

              {/* DNI, Address, Email */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <CreditCard size={10} /> DNI / CUIT
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 12345678"
                    className="input h-10 text-xs bg-slate-50"
                    value={newClientDni}
                    onChange={(e) => setNewClientDni(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <MapPin size={10} /> Dirección
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Av. Principal 123"
                    className="input h-10 text-xs bg-slate-50"
                    value={newClientAddress}
                    onChange={(e) => setNewClientAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <Mail size={10} /> Correo
                  </label>
                  <input
                    type="email"
                    placeholder="Ej: maria@email.com"
                    className="input h-10 text-xs bg-slate-50"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600">Tipo de Dispositivo</label>
                <div className="flex gap-2">
                  {[
                    { value: 'cellphone', icon: '📱', label: 'Celular' },
                    { value: 'pc', icon: '💻', label: 'Computadora' },
                    { value: 'other', icon: '🔧', label: 'Otro' }
                  ].map((device) => (
                    <button
                      key={device.value}
                      type="button"
                      onClick={() => setNewDeviceType(device.value as any)}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-xs font-bold transition-all ${
                        newDeviceType === device.value
                          ? 'bg-blue-100 text-blue-700 border-2 border-blue-500 shadow-md'
                          : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                      }`}
                    >
                      <span className="text-lg">{device.icon}</span>
                      {device.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Detalle / Modelo</label>
                <input
                  type="text"
                  placeholder="Ej: Moto G54 Gris"
                  className="input h-10 text-xs bg-slate-50"
                  value={newDeviceDetails}
                  onChange={(e) => setNewDeviceDetails(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Falla Reportada *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Ej: Se cayó, astilló pantalla y el táctil no responde."
                  className="input p-3.5 text-xs bg-slate-50 resize-none"
                  value={newReportedFault}
                  onChange={(e) => setNewReportedFault(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Accesorios Dejados (funda, cargador, chip)</label>
                <input
                  type="text"
                  placeholder="Ej: Con funda negra y chip Movistar. Sin cargador."
                  className="input h-10 text-xs bg-slate-50"
                  value={newAccessoriesLeft}
                  onChange={(e) => setNewAccessoriesLeft(e.target.value)}
                />
              </div>

              {/* PIN / Pattern Section */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <Shield size={12} /> Desbloqueo del Equipo
                </label>
                
                {/* PIN Type Selector */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewPinType('text')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      newPinType === 'text'
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                        : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                    }`}
                  >
                    <KeyRound size={14} />
                    PIN / Contraseña
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPinType('pattern')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      newPinType === 'pattern'
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                        : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                    }`}
                  >
                    <Grid3X3 size={14} />
                    Patrón
                  </button>
                </div>

                {/* PIN Input or Pattern Drawer */}
                {newPinType === 'text' ? (
                  <div>
                    <input
                      type="text"
                      placeholder="Ej: 1234 o contraseña"
                      className="input h-10 text-xs bg-slate-50"
                      value={newUnlockPin}
                      onChange={(e) => setNewUnlockPin(e.target.value)}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Opcional - Para probar el equipo</p>
                  </div>
                ) : (
                  <div>
                    <PatternDrawer
                      onPatternSave={(img) => setNewPatternImage(img)}
                      size={200}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Dibujá el patrón de desbloqueo del equipo</p>
                  </div>
                )}
              </div>

              {/* Priority Buttons */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <Activity size={12} /> Prioridad
                </label>
                <div className="flex gap-2">
                  {Object.entries(REPAIR_PRIORITY_DETAILS).map(([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setNewPriority(key as RepairPriority)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        newPriority === key
                          ? `${info.color} border-2 border-current shadow-md`
                          : 'bg-slate-100 text-slate-500 border-2 border-transparent hover:bg-slate-200'
                      }`}
                    >
                      <span className="text-base">{info.icon}</span>
                      {info.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Technician Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <User size={12} /> Técnico Asignado
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewAssignedTechnicianId('');
                      setNewAssignedTechnicianName('');
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      !newAssignedTechnicianId
                        ? 'bg-slate-200 text-slate-700 border-2 border-slate-400'
                        : 'bg-slate-100 text-slate-500 border-2 border-transparent hover:bg-slate-200'
                    }`}
                  >
                    Sin asignar
                  </button>
                  {employees.map(emp => (
                    <button
                      key={emp.uid}
                      type="button"
                      onClick={() => {
                        setNewAssignedTechnicianId(emp.uid);
                        setNewAssignedTechnicianName(emp.displayName);
                      }}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        newAssignedTechnicianId === emp.uid
                          ? 'bg-blue-100 text-blue-700 border-2 border-blue-500 shadow-md'
                          : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                      }`}
                    >
                      <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                        {emp.displayName.charAt(0).toUpperCase()}
                      </div>
                      {emp.displayName}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">Presupuesto Inicial ($)</label>
                  <input
                    type="number"
                    placeholder="0"
                    className="input h-10 text-xs bg-slate-50"
                    value={newCostEstimated}
                    onChange={(e) => setNewCostEstimated(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">Diagnóstico Preliminar</label>
                  <input
                    type="text"
                    placeholder="Ej: Cambio de módulo requerido"
                    className="input h-10 text-xs bg-slate-50"
                    value={newTechnicalDiagnosis}
                    onChange={(e) => setNewTechnicalDiagnosis(e.target.value)}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-secondary py-2.5 px-5 rounded-xl font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingIntake}
                  className="btn-primary py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center"
                >
                  {submittingIntake ? <Loader2 className="animate-spin mr-1.5" size={14} /> : null}
                  Registrar Ingreso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Modal (after Manual Intake) */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-sm shadow-2xl p-6 text-center space-y-5 border border-slate-100">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <Check className="stroke-[3]" size={24} />
            </div>

            <div>
              <h3 className="text-base font-extrabold text-slate-800">Orden Registrada Correctamente</h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">
                El equipo ha sido registrado con el Ticket <strong className="text-blue-600">#{newCreatedTicketCode}</strong>.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                onClick={() => {
                  triggerPrint(selectedRepair);
                }}
                className="btn-primary flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2"
              >
                <Printer size={14} />
                Imprimir Ticket A4
              </button>
              <button
                onClick={() => {
                  handleSendWhatsAppMessage(selectedRepair, 'welcome');
                }}
                className="btn-secondary flex-1 py-2.5 rounded-xl bg-green-50 hover:bg-green-100 text-green-700 border-green-200/80 font-bold text-xs flex items-center justify-center gap-2"
              >
                <MessageSquare size={14} />
                Enviar WhatsApp
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  setShowSuccessModal(false);
                  setSelectedRepair(null);
                  setNewCreatedTicketCode(null);
                }}
                className="btn-ghost w-full py-2 text-xs text-slate-500 hover:text-slate-800 font-bold"
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Update State Modal */}
      {showEditModal && selectedRepair && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-md shadow-2xl relative border border-slate-100 max-h-[95vh] md:max-h-[90vh] overflow-y-auto p-5 md:p-8">
            <button
              onClick={() => setShowEditModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all"
            >
              <X size={16} />
            </button>

            <h3 className="text-lg font-black text-slate-800 mb-6">
              Actualizar Orden #{selectedRepair.ticketCode}
            </h3>

            <form onSubmit={handleSaveUpdate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">Estado de Reparación</label>
                  <select
                    className="input h-10 text-xs bg-slate-50"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
                    <option value="received">Recibido</option>
                    <option value="diagnosing">En Diagnóstico</option>
                    <option value="budgeted">Presupuestado</option>
                    <option value="repairing">En Reparación</option>
                    <option value="ready">Listo para retirar</option>
                    <option value="delivered">Entregado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">Presupuesto/Costo ($)</label>
                  <input
                    type="number"
                    placeholder="0"
                    className="input h-10 text-xs bg-slate-50"
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Diagnóstico Técnico</label>
                <textarea
                  rows={2}
                  placeholder="Ej: Cortocircuito en placa principal reparado. Integrado de carga sustituido."
                  className="input p-3.5 text-xs bg-slate-50 resize-none"
                  value={editDiagnosis}
                  onChange={(e) => setEditDiagnosis(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Notas para el Cliente (Seguimiento)</label>
                <textarea
                  rows={2}
                  placeholder="Ej: Tu equipo ya pasó la etapa de pruebas y funciona OK. Podés pasar a retirarlo cuando gustes."
                  className="input p-3.5 text-xs bg-slate-50 resize-none"
                  value={editStatusNotes}
                  onChange={(e) => setEditStatusNotes(e.target.value)}
                />
              </div>

              {/* PIN / Pattern Section */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <Shield size={12} /> Desbloqueo del Equipo
                </label>
                
                {/* PIN Type Selector */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditPinType('text')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      editPinType === 'text'
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                        : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                    }`}
                  >
                    <KeyRound size={14} />
                    PIN / Contraseña
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPinType('pattern')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      editPinType === 'pattern'
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                        : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                    }`}
                  >
                    <Grid3X3 size={14} />
                    Patrón
                  </button>
                </div>

                {/* PIN Input or Pattern Drawer */}
                {editPinType === 'text' ? (
                  <div>
                    <input
                      type="text"
                      placeholder="PIN o contraseña"
                      className="input h-10 text-xs bg-slate-50"
                      value={editUnlockPin}
                      onChange={(e) => setEditUnlockPin(e.target.value)}
                    />
                  </div>
                ) : (
                  <div>
                    {editPatternImage && (
                      <div className="mb-3">
                        <p className="text-[10px] text-slate-500 font-bold mb-2">Patrón actual:</p>
                        <img 
                          src={editPatternImage} 
                          alt="Patrón actual" 
                          className="border-2 border-slate-200 rounded-xl"
                          style={{ width: 150, height: 150 }}
                        />
                      </div>
                    )}
                    <PatternDrawer
                      onPatternSave={(img) => setEditPatternImage(img)}
                      initialPattern={editPatternImage}
                      size={200}
                    />
                  </div>
                )}
              </div>

              {/* Priority Buttons */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <Activity size={12} /> Prioridad
                </label>
                <div className="flex gap-2">
                  {Object.entries(REPAIR_PRIORITY_DETAILS).map(([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setEditPriority(key as RepairPriority)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        editPriority === key
                          ? `${info.color} border-2 border-current shadow-md`
                          : 'bg-slate-100 text-slate-500 border-2 border-transparent hover:bg-slate-200'
                      }`}
                    >
                      <span className="text-base">{info.icon}</span>
                      {info.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Technician Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <User size={12} /> Técnico Asignado
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditAssignedTechnicianId('');
                      setEditAssignedTechnicianName('');
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      !editAssignedTechnicianId
                        ? 'bg-slate-200 text-slate-700 border-2 border-slate-400'
                        : 'bg-slate-100 text-slate-500 border-2 border-transparent hover:bg-slate-200'
                    }`}
                  >
                    Sin asignar
                  </button>
                  {employees.map(emp => (
                    <button
                      key={emp.uid}
                      type="button"
                      onClick={() => {
                        setEditAssignedTechnicianId(emp.uid);
                        setEditAssignedTechnicianName(emp.displayName);
                      }}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        editAssignedTechnicianId === emp.uid
                          ? 'bg-blue-100 text-blue-700 border-2 border-blue-500 shadow-md'
                          : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                      }`}
                    >
                      <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                        {emp.displayName.charAt(0).toUpperCase()}
                      </div>
                      {emp.displayName}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 flex items-start gap-3">
                <AlertCircle className="text-blue-500 mt-0.5 flex-shrink-0" size={16} />
                <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                  Al actualizar la orden, podrás usar el botón de WhatsApp rápido en la lista para avisarle al cliente con el mensaje redactado automáticamente según estos campos.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn-secondary py-2.5 px-5 rounded-xl font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="btn-primary py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center"
                >
                  {savingEdit ? <Loader2 className="animate-spin mr-1.5" size={14} /> : null}
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
