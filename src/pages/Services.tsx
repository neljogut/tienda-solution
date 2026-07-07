import React, { useState, useEffect } from 'react';
import { db, storage } from '../firebase';
import { collection, query, where, getDocs, doc, addDoc, serverTimestamp, runTransaction, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Search, Wrench, Phone, MessageSquare, AlertCircle, CheckCircle, Clock, Check, Image as ImageIcon, Loader2, CreditCard, MapPin, Mail, KeyRound, Grid3X3 } from 'lucide-react';
import { PatternDrawer } from '../components/PatternDrawer';
import type { BusinessSettings } from '../types/settings';

const STATUS_DETAILS = {
  received: { label: 'Recibido', color: 'bg-slate-100 text-slate-700 border-slate-200', step: 1 },
  diagnosing: { label: 'En Diagnóstico', color: 'bg-amber-50 text-amber-700 border-amber-200', step: 2 },
  budgeted: { label: 'Presupuestado', color: 'bg-blue-50 text-blue-700 border-blue-200', step: 3 },
  repairing: { label: 'En Reparación', color: 'bg-orange-50 text-orange-700 border-orange-200', step: 4 },
  ready: { label: 'Listo para retirar', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', step: 5 },
  delivered: { label: 'Entregado', color: 'bg-slate-100 text-slate-500 border-slate-200', step: 6 },
  cancelled: { label: 'Cancelado', color: 'bg-red-50 text-red-700 border-red-200', step: 0 }
};

export const Services: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'track' | 'request'>('track');
  
  // Business settings
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);

  // Tracking states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Request form states
  const [clientName, setClientName] = useState('');
  const [clientWhatsApp, setClientWhatsApp] = useState('');
  const [clientDni, setClientDni] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [deviceType, setDeviceType] = useState<'cellphone' | 'pc' | 'other'>('cellphone');
  const [deviceDetails, setDeviceDetails] = useState('');
  const [reportedFault, setReportedFault] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [unlockPin, setUnlockPin] = useState('');
  const [pinType, setPinType] = useState<'text' | 'pattern'>('text');
  const [patternImage, setPatternImage] = useState<string>('');
  
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccessCode, setSubmitSuccessCode] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Client search state
  const [searchingClient, setSearchingClient] = useState(false);
  const [existingClient, setExistingClient] = useState<any | null>(null);

  // Search logic
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const queryTerm = searchQuery.trim();
    if (!queryTerm) return;

    setSearchLoading(true);
    setSearched(true);
    setSearchResults([]);

    try {
      const results: any[] = [];

      // 1. Try to search by unique ticket number (numerical code, e.g., "1005")
      if (/^\d{4,6}$/.test(queryTerm)) {
        // Query by the "ticketCode" field
        const q = query(collection(db, 'repairs'), where('ticketCode', '==', queryTerm));
        const snap = await getDocs(q);
        snap.forEach(doc => {
          results.push({ id: doc.id, ...doc.data() });
        });
      }

      // 2. Try to search by phone number (if no results or if query is phone-like)
      if (results.length === 0) {
        // Clean phone number: remove non-digits
        const cleanPhone = queryTerm.replace(/\D/g, '');
        if (cleanPhone.length >= 8) {
          const q = query(collection(db, 'repairs'), where('clientWhatsAppClean', '==', cleanPhone));
          const snap = await getDocs(q);
          snap.forEach(doc => {
            results.push({ id: doc.id, ...doc.data() });
          });
        }
      }

      // Sort by creation date descending
      results.sort((a, b) => {
        const dateA = a.createdAt?.seconds || 0;
        const dateB = b.createdAt?.seconds || 0;
        return dateB - dateA;
      });

      setSearchResults(results);
    } catch (error) {
      console.error("Error al buscar reparación:", error);
    } finally {
      setSearchLoading(false);
    }
  };

  // Photo change logic
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  // Search existing client by WhatsApp
  const searchClientByWhatsApp = async (whatsapp: string) => {
    if (!whatsapp || whatsapp.length < 8) {
      setExistingClient(null);
      return;
    }

    setSearchingClient(true);
    try {
      const cleanPhone = whatsapp.replace(/\D/g, '');
      
      // Search repairs by this WhatsApp
      const q = query(collection(db, 'repairs'), where('clientWhatsAppClean', '==', cleanPhone));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const firstRepair = snap.docs[0].data();
        setExistingClient({
          name: firstRepair.clientName,
          dni: firstRepair.clientDni || '',
          address: firstRepair.clientAddress || '',
          email: firstRepair.clientEmail || ''
        });
      } else {
        setExistingClient(null);
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
      setClientName(existingClient.name);
      setClientDni(existingClient.dni);
      setClientAddress(existingClient.address);
      setClientEmail(existingClient.email);
    }
  }, [existingClient]);

  // Fetch business settings for WhatsApp number
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'business'), (snap) => {
      if (snap.exists()) {
        setBusinessSettings(snap.data() as BusinessSettings);
      }
    });
    return unsubscribe;
  }, []);

  // Submit request logic
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !clientWhatsApp.trim() || !reportedFault.trim()) {
      setSubmitError("Por favor completa los campos obligatorios (*).");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccessCode(null);

    try {
      const cleanPhone = clientWhatsApp.replace(/\D/g, '');
      let nextTicketCode = "1000";

      // 1. Transaction to generate a sequential ticket code
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

      let photoUrl = "";
      // 2. Upload photo if present
      if (photoFile) {
        const storageRef = ref(storage, `repairs/${nextTicketCode}/${Date.now()}_${photoFile.name}`);
        const uploadResult = await uploadBytes(storageRef, photoFile);
        photoUrl = await getDownloadURL(uploadResult.ref);
      }

      // 3. Save to Firestore
      const newRepair = {
        ticketCode: nextTicketCode,
        clientName: clientName.trim(),
        clientWhatsApp: clientWhatsApp.trim(),
        clientWhatsAppClean: cleanPhone,
        clientDni: clientDni.trim(),
        clientAddress: clientAddress.trim(),
        clientEmail: clientEmail.trim(),
        deviceType,
        deviceDetails: deviceDetails.trim(),
        reportedFault: reportedFault.trim(),
        photoUrl,
        status: 'received',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        costEstimated: 0,
        technicalDiagnosis: '',
        statusNotes: 'Esperando revisión inicial por el técnico.',
        // New fields
        unlockPin: pinType === 'text' ? unlockPin.trim() : '',
        pinType: pinType,
        patternImage: pinType === 'pattern' ? patternImage : '',
        priority: 'normal',
        assignedTechnicianId: '',
        assignedTechnicianName: '',
        budgetItems: [],
        totalBudget: 0
      };

      await addDoc(collection(db, 'repairs'), newRepair);

      setSubmitSuccessCode(nextTicketCode);
      // Reset form
      setClientName('');
      setClientWhatsApp('');
      setClientDni('');
      setClientAddress('');
      setClientEmail('');
      setDeviceType('cellphone');
      setDeviceDetails('');
      setReportedFault('');
      setPhotoFile(null);
      setPhotoPreview(null);
      setUnlockPin('');
      setPinType('text');
      setPatternImage('');
      setExistingClient(null);
    } catch (error: any) {
      console.error("Error al registrar solicitud:", error);
      setSubmitError("Ocurrió un error al enviar tu consulta. Intentá nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const getTimelineSteps = (currentStatus: string) => {
    const statusInfo = STATUS_DETAILS[currentStatus as keyof typeof STATUS_DETAILS];
    if (!statusInfo) return [];
    
    const currentStep = statusInfo.step;
    
    // In case of cancelled, show a customized red step
    if (currentStatus === 'cancelled') {
      return [
        { label: 'Recibido', completed: true },
        { label: 'Cancelado', completed: true, isCancelled: true }
      ];
    }

    return [
      { label: 'Recibido', completed: currentStep >= 1 },
      { label: 'Diagnóstico', completed: currentStep >= 2 },
      { label: 'Presupuestado', completed: currentStep >= 3 },
      { label: 'En Reparación', completed: currentStep >= 4 },
      { label: 'Listo', completed: currentStep >= 5 },
      { label: 'Entregado', completed: currentStep >= 6 }
    ];
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 text-white rounded-3xl p-6 md:p-10 shadow-lg relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-y-1/4 translate-x-1/8">
          <Wrench size={300} />
        </div>
        <div className="relative z-10 max-w-xl space-y-3">
          <span className="bg-white/10 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-white/15">
            🔧 Servicio Técnico Especializado
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Reparación de Celulares y Computadoras
          </h1>
          <p className="text-blue-100 text-sm md:text-base font-medium">
            Seguí el estado de tu equipo en tiempo real sin registrarte, o envianos una consulta rápida con lo que le pasa a tu dispositivo.
          </p>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex bg-slate-200/60 p-1.5 rounded-2xl">
        <button
          onClick={() => setActiveTab('track')}
          className={`flex-1 py-3 text-center text-sm font-extrabold rounded-xl transition-all duration-200 ${
            activeTab === 'track'
              ? 'bg-white text-slate-800 shadow-md shadow-slate-400/10'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          🔍 Consultar mi Equipo
        </button>
        <button
          onClick={() => setActiveTab('request')}
          className={`flex-1 py-3 text-center text-sm font-extrabold rounded-xl transition-all duration-200 ${
            activeTab === 'request'
              ? 'bg-white text-slate-800 shadow-md shadow-slate-400/10'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          📝 Enviar Consulta / Registrar Falla
        </button>
      </div>

      {/* Track Tab */}
      {activeTab === 'track' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-800">
                Seguimiento de Reparación
              </h2>
              <p className="text-xs md:text-sm text-slate-500 font-medium">
                Ingresá el número de WhatsApp registrado o el número de Ticket (4 dígitos) que te entregamos en el local.
              </p>
            </div>

            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Ej: 1024 o 1133445566"
                  className="input pl-11 h-12 text-base rounded-2xl bg-slate-50 border-slate-200/80 focus:bg-white"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={searchLoading}
                className="btn-primary h-12 px-8 rounded-2xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/25 flex items-center justify-center font-bold"
              >
                {searchLoading ? <Loader2 className="animate-spin" size={20} /> : 'Buscar Equipo'}
              </button>
            </form>

            {searched && !searchLoading && searchResults.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4 animate-fadeIn">
                <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                <div className="space-y-1 text-amber-900">
                  <h4 className="font-bold text-sm">No encontramos órdenes activas</h4>
                  <p className="text-xs font-semibold text-amber-700">
                    Revisá haber escrito correctamente tu celular (código de área sin 15 ni 0) o el código de tu ticket. Si no lo encontrás, consultanos haciendo clic en el botón de WhatsApp abajo.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Search Results Display */}
          {!searchLoading && searchResults.map((repair) => {
            const statusInfo = STATUS_DETAILS[repair.status as keyof typeof STATUS_DETAILS] || STATUS_DETAILS.received;
            const steps = getTimelineSteps(repair.status);
            
            return (
              <div key={repair.id} className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 space-y-8 animate-fadeIn">
                {/* Upper Info Row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black text-slate-800">
                        Orden #{repair.ticketCode}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-semibold">
                      Ingreso: {repair.createdAt ? new Date(repair.createdAt.seconds * 1000).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Reciente'}
                    </p>
                  </div>
                  
                  <div className="text-left md:text-right">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Presupuesto</p>
                    <p className="text-2xl font-black text-slate-800">
                      {repair.costEstimated > 0 ? `$${repair.costEstimated.toLocaleString('es-AR')}` : 'A Confirmar'}
                    </p>
                  </div>
                </div>

                {/* Device Details */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider">Equipo / Dispositivo</h4>
                      <p className="text-base font-bold text-slate-800 capitalize mt-0.5">
                        {repair.deviceType === 'cellphone' ? 'Celular' : repair.deviceType === 'pc' ? 'Computadora' : 'Otro'} {repair.deviceDetails ? `- ${repair.deviceDetails}` : ''}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider">Detalle del Problema</h4>
                      <p className="text-sm font-semibold text-slate-600 mt-1 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        {repair.reportedFault}
                      </p>
                    </div>

                    {repair.technicalDiagnosis && (
                      <div>
                        <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider">Diagnóstico del Técnico</h4>
                        <p className="text-sm font-bold text-slate-700 mt-1 bg-blue-50/50 p-4 rounded-2xl border border-blue-100/30">
                          {repair.technicalDiagnosis}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    {repair.photoUrl ? (
                      <div>
                        <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">Foto Adjunta</h4>
                        <a href={repair.photoUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-slate-100 group max-h-[160px] relative">
                          <img src={repair.photoUrl} alt="Estado del equipo" className="w-full object-cover group-hover:scale-105 transition-transform duration-300 max-h-[160px]" />
                        </a>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col justify-end">
                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex items-start gap-3">
                          <Clock className="text-blue-500 mt-0.5 flex-shrink-0" size={18} />
                          <div>
                            <h5 className="text-xs font-bold text-slate-700">Actualización de Estado</h5>
                            <p className="text-xs text-slate-500 font-medium mt-1">
                              {repair.statusNotes || 'El equipo está siendo analizado por el técnico responsable. Te notificaremos cualquier novedad.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Graphic Timeline (Senior-friendly) */}
                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-6">Línea de Tiempo del Estado</h4>
                  
                  {/* Desktop Timeline */}
                  <div className="hidden md:flex items-center justify-between relative px-4">
                    {/* Line behind */}
                    <div className="absolute left-8 right-8 top-1/2 -translate-y-1/2 h-1 bg-slate-100 z-0" />
                    <div 
                      className="absolute left-8 top-1/2 -translate-y-1/2 h-1 bg-blue-600 transition-all duration-500 z-0"
                      style={{ 
                        width: `${
                          repair.status === 'cancelled' ? '100%' :
                          repair.status === 'received' ? '0%' :
                          repair.status === 'diagnosing' ? '20%' :
                          repair.status === 'budgeted' ? '40%' :
                          repair.status === 'repairing' ? '60%' :
                          repair.status === 'ready' ? '80%' : '100%'
                        }` 
                      }}
                    />

                    {steps.map((step, idx) => (
                      <div key={idx} className="flex flex-col items-center relative z-10 space-y-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                          step.isCancelled 
                            ? 'bg-red-500 border-red-500 text-white'
                            : step.completed 
                              ? 'bg-blue-600 border-blue-600 text-white' 
                              : 'bg-white border-slate-200 text-slate-400'
                        }`}>
                          {step.isCancelled ? <AlertCircle size={14} /> : step.completed ? <Check size={14} className="stroke-[3]" /> : <span className="text-xs font-bold">{idx + 1}</span>}
                        </div>
                        <span className={`text-[11px] font-bold tracking-tight ${step.completed ? 'text-slate-800' : 'text-slate-400'}`}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Mobile Timeline (Vertical) */}
                  <div className="md:hidden space-y-4 relative pl-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-1 before:bg-slate-100">
                    {steps.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-3 relative z-10">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 -ml-6 transition-all ${
                          step.isCancelled 
                            ? 'bg-red-500 border-red-500 text-white'
                            : step.completed 
                              ? 'bg-blue-600 border-blue-600 text-white' 
                              : 'bg-white border-slate-200 text-slate-400'
                        }`}>
                          {step.isCancelled ? <AlertCircle size={10} /> : step.completed ? <Check size={10} className="stroke-[3]" /> : <span className="text-[10px] font-bold">{idx + 1}</span>}
                        </div>
                        <span className={`text-xs font-bold ${step.completed ? 'text-slate-800' : 'text-slate-400'}`}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Request Tab */}
      {activeTab === 'request' && (
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800">
              Registrar Nueva Consulta Técnica
            </h2>
            <p className="text-xs md:text-sm text-slate-500 font-medium">
              Completá los datos básicos del equipo y lo que le sucede. Te daremos un número de ticket al instante para que hagas el seguimiento.
            </p>
          </div>

          {submitSuccessCode ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 md:p-8 text-center space-y-6 animate-fadeIn">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600 shadow-inner">
                <CheckCircle size={36} />
              </div>
              
              <div className="space-y-2 max-w-sm mx-auto">
                <h3 className="text-xl font-bold text-emerald-950">¡Solicitud Enviada con Éxito!</h3>
                <p className="text-xs font-semibold text-emerald-700">
                  Registramos tu equipo correctamente. Anotá este código para consultar el estado en la web:
                </p>
              </div>

              <div className="inline-block bg-white border border-emerald-200 rounded-2xl px-8 py-4 shadow-sm">
                <span className="text-3xl font-black text-emerald-800 tracking-wider">#{submitSuccessCode}</span>
              </div>

              <p className="text-[11px] text-slate-400 font-bold max-w-xs mx-auto">
                También te enviaremos una notificación cuando el técnico empiece a revisarlo. ¡Gracias por confiar en Solution!
              </p>

              <button
                onClick={() => setSubmitSuccessCode(null)}
                className="btn-primary py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
              >
                Registrar otra solicitud
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmitRequest} className="space-y-6">
              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 text-red-900 text-xs font-semibold">
                  <AlertCircle className="text-red-500" size={16} />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Client WhatsApp - First field for search */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Número de WhatsApp *</label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    placeholder="Ej: 1133445566"
                    className="input h-11 bg-slate-50 border-slate-200 focus:bg-white pr-10"
                    value={clientWhatsApp}
                    onChange={(e) => {
                      setClientWhatsApp(e.target.value);
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
                    <span className="text-xs font-bold">¡Bienvenido de vuelta! Tus datos se completarán automáticamente.</span>
                  </div>
                </div>
              )}

              {/* Client Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Juan Pérez"
                  className="input h-11 bg-slate-50 border-slate-200 focus:bg-white"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>

              {/* DNI, Address, Email */}
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <CreditCard size={10} /> DNI / CUIT
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 12345678"
                    className="input h-11 bg-slate-50 border-slate-200 focus:bg-white"
                    value={clientDni}
                    onChange={(e) => setClientDni(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <MapPin size={10} /> Dirección
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Av. Principal 123"
                    className="input h-11 bg-slate-50 border-slate-200 focus:bg-white"
                    value={clientAddress}
                    onChange={(e) => setClientAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Mail size={10} /> Correo
                  </label>
                  <input
                    type="email"
                    placeholder="Ej: juan@email.com"
                    className="input h-11 bg-slate-50 border-slate-200 focus:bg-white"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                {/* Device Type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Tipo de Dispositivo *</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'cellphone', icon: '📱', label: 'Celular' },
                      { value: 'pc', icon: '💻', label: 'Computadora' },
                      { value: 'other', icon: '🔧', label: 'Otro' }
                    ].map((device) => (
                      <button
                        key={device.value}
                        type="button"
                        onClick={() => setDeviceType(device.value as any)}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-3.5 rounded-xl text-xs font-bold transition-all ${
                          deviceType === device.value
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

                {/* Device Details */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Marca y Modelo (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej: Samsung S23 o Notebook HP Pavilion"
                    className="input h-11 bg-slate-50 border-slate-200 focus:bg-white"
                    value={deviceDetails}
                    onChange={(e) => setDeviceDetails(e.target.value)}
                  />
                </div>
              </div>

              {/* Reported Fault */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">¿Qué le pasa al equipo? (Falla) *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Describí brevemente el problema (ej: Se le rompió la pantalla, no carga la batería, se tilda al prender, etc.)"
                  className="input p-3 bg-slate-50 border-slate-200 focus:bg-white resize-none"
                  value={reportedFault}
                  onChange={(e) => setReportedFault(e.target.value)}
                />
              </div>

              {/* Photo Upload */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Foto del Equipo o Falla (Opcional)</label>
                
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <label className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl cursor-pointer transition-colors text-xs font-bold text-slate-700">
                    <ImageIcon size={16} />
                    Seleccionar Foto
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoChange}
                    />
                  </label>
                  {photoFile && (
                    <span className="text-xs text-slate-500 font-semibold truncate max-w-xs">
                      {photoFile.name}
                    </span>
                  )}
                </div>

                {photoPreview && (
                  <div className="mt-3 relative inline-block">
                    <img src={photoPreview} alt="Vista previa" className="max-h-[140px] rounded-2xl border border-slate-100 shadow-sm" />
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoPreview(null);
                      }}
                      className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md transition-colors"
                      title="Eliminar foto"
                    >
                      <Check size={12} className="rotate-45" />
                    </button>
                  </div>
                )}
              </div>

              {/* Unlock PIN / Pattern */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  🔒 Desbloqueo del Equipo (Opcional)
                </label>
                
                {/* PIN Type Selector */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPinType('text')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      pinType === 'text'
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                        : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                    }`}
                  >
                    <KeyRound size={14} />
                    PIN / Contraseña
                  </button>
                  <button
                    type="button"
                    onClick={() => setPinType('pattern')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      pinType === 'pattern'
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                        : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                    }`}
                  >
                    <Grid3X3 size={14} />
                    Patrón
                  </button>
                </div>

                {/* PIN Input or Pattern Drawer */}
                {pinType === 'text' ? (
                  <div>
                    <input
                      type="text"
                      placeholder="Ej: 1234 o contraseña"
                      className="input h-11 bg-slate-50 border-slate-200 focus:bg-white"
                      value={unlockPin}
                      onChange={(e) => setUnlockPin(e.target.value)}
                    />
                  </div>
                ) : (
                  <div>
                    <PatternDrawer
                      onPatternSave={(img) => setPatternImage(img)}
                      size={220}
                    />
                  </div>
                )}
                
                <p className="text-[10px] text-slate-400 font-semibold">
                  Si dejás tu PIN o patrón, el técnico podrá probar el táctil, la cámara y otras funciones del equipo sin necesidad de esperarte.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  * Campos obligatorios
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto btn-primary h-11 px-8 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/25 flex items-center justify-center font-bold"
                >
                  {submitting ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                  Enviar Consulta
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Quick Contact Widget */}
      <div className="bg-slate-50 border border-slate-200/60 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center shadow-inner flex-shrink-0">
            <Phone size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">¿Preferís hablarnos directamente?</h4>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Contactanos por WhatsApp y coordinamos el retiro de tu equipo.
            </p>
          </div>
        </div>

        <a
          href={`https://wa.me/${businessSettings?.whatsapp?.replace(/\D/g, '') || '5491133445566'}?text=Hola!%20Tengo%20una%20consulta%20por%20servicio%20t%C3%A9cnico.`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-green-600/20 transition-all hover:scale-[1.02] active:scale-95 flex-shrink-0"
        >
          <MessageSquare size={16} />
          Chatear por WhatsApp
        </a>
      </div>
    </div>
  );
};
