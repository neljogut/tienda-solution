import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, onSnapshot, collection, getCountFromServer } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Loader2, Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react';

export const Register: React.FC = () => {
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [dni, setDni] = useState('');
  const [phone, setPhone] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [businessSettings, setBusinessSettings] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'business'), (snap) => {
      if (snap.exists()) {
        setBusinessSettings(snap.data());
      }
    });
    return () => unsub();
  }, []);

  const handleNextStep = (e: React.MouseEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !email.includes('@')) {
      setError('Por favor ingresa un correo electrónico válido.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setStep(2);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (step === 1) {
      // If submitted via enter key in step 1, proceed to step 2 instead of submitting
      if (!email.trim() || !email.includes('@') || password.length < 6 || password !== confirmPassword) {
        setError('Por favor completa las credenciales de acceso válidas.');
        return;
      }
      setStep(2);
      return;
    }

    if (!firstName.trim() || !lastName.trim() || !dni.trim() || !phone.trim() || !province.trim() || !city.trim() || !street.trim() || !number.trim() || !postalCode.trim()) {
      setError('Por favor completa todos los datos personales y de facturación.');
      return;
    }

    setLoading(true);

    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const fullAddress = `${street.trim()} ${number.trim()}`;

    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update profile
      await updateProfile(user, {
        displayName: fullName
      });

      // Check if this is the first user in the system
      let resolvedRole = 'client';
      try {
        const usersColl = collection(db, 'users');
        const countSnap = await getCountFromServer(usersColl);
        if (countSnap.data().count === 0) {
          resolvedRole = 'owner';
        }
      } catch (e) {
        console.warn("Error checking users count, defaulting to client:", e);
      }

      // Check if there is an existing client with this DNI or email to link
      let customerId = '';
      try {
        const { query, where, getDocs, updateDoc, doc, setDoc } = await import('firebase/firestore');
        let clientSnap: any = null;

        // 1. Try finding by DNI first if provided
        if (dni.trim()) {
          const clientDniQuery = query(collection(db, 'clients'), where('dni', '==', dni.trim()));
          const snap = await getDocs(clientDniQuery);
          if (!snap.empty) {
            clientSnap = snap;
          }
        }

        // 2. Try finding by email if not found by DNI
        if (!clientSnap && email.trim()) {
          const clientEmailQuery = query(collection(db, 'clients'), where('email', '==', email.trim()));
          const snap = await getDocs(clientEmailQuery);
          if (!snap.empty) {
            clientSnap = snap;
          }
        }

        if (clientSnap && !clientSnap.empty) {
          const clientDoc = clientSnap.docs[0];
          customerId = clientDoc.id;
          const clientData = clientDoc.data();

          // Link client to user, and overwrite name with the one chosen by the user
          await updateDoc(doc(db, 'clients', customerId), {
            userId: user.uid,
            email: clientData.email || email.trim(),
            dni: clientData.dni || dni.trim(),
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: clientData.phone || phone.trim(),
            province: clientData.province || province.trim(),
            city: clientData.city || city.trim(),
            address: clientData.address || fullAddress,
            postalCode: clientData.postalCode || postalCode.trim()
          });

          // Propagate new name to all existing orders for this client
          try {
            const { writeBatch } = await import('firebase/firestore');
            const ordersQuery = query(collection(db, 'orders'), where('customerId', '==', customerId));
            const ordersSnap = await getDocs(ordersQuery);
            if (!ordersSnap.empty) {
              const batch = writeBatch(db);
              ordersSnap.forEach(o => {
                batch.update(doc(db, 'orders', o.id), { customerName: fullName });
              });
              await batch.commit();
            }
          } catch (err) {
            console.warn("Error propagating name change to orders during registration link:", err);
          }
        } else {
          // Create a new client profile
          const newClientRef = doc(collection(db, 'clients'));
          customerId = newClientRef.id;
          await setDoc(newClientRef, {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            dni: dni.trim(),
            phone: phone.trim(),
            province: province.trim(),
            city: city.trim(),
            address: fullAddress,
            postalCode: postalCode.trim(),
            userId: user.uid,
            createdAt: new Date().toISOString(),
            totalPurchased: 0,
            totalOwed: 0,
            isWholesale: false,
            isTrusted: false
          });
        }
      } catch (e) {
        console.warn("Error creating/linking client profile on signup:", e);
      }

      // Create user document in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: fullName,
        role: resolvedRole,
        customerId: customerId || null,
        dni: dni.trim(),
        createdAt: new Date().toISOString()
      });

      navigate('/catalog');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al crear la cuenta. Verifica tus datos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 py-8">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 transition-all duration-300">
        <div className="bg-blue-600 p-6 text-center flex flex-col items-center">
          {businessSettings?.logoUrl ? (
            <img src={businessSettings.logoUrl} className="h-16 max-w-[200px] object-contain rounded-2xl mb-4 border border-white/10" alt="Logo" />
          ) : (
            <div className="h-16 max-w-[200px] flex items-center justify-center mb-4">
              <img src="/logo-white-text.png" className="h-full w-full object-contain" alt="Logo" />
            </div>
          )}
          <h2 className="text-2xl font-bold text-white">Crear Cuenta</h2>
          <p className="text-blue-100 mt-1">
            {step === 1 ? 'Paso 1 de 2: Credenciales de Acceso' : 'Paso 2 de 2: Datos Personales y de Facturación'}
          </p>
        </div>
        
        <div className="p-8">
          <form onSubmit={handleRegister} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100 font-semibold">
                {error}
              </div>
            )}
            
            {/* Sliding animation wizard container */}
            <div className="relative overflow-hidden w-full">
              <div className={`transition-all duration-500 ease-in-out transform flex w-[200%] ${step === 1 ? 'translate-x-0' : '-translate-x-1/2'}`}>
                
                {/* ─── STEP 1 ─── */}
                <div className="w-1/2 pr-4 space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">Credenciales de Acceso</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      required={step === 1}
                      autoComplete="new-email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs"
                      placeholder="correo@ejemplo.com"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Contraseña</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required={step === 1}
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full px-4 py-2 pr-10 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs"
                          placeholder="Mínimo 6 caracteres"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Confirmar Contraseña</label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          required={step === 1}
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full px-4 py-2 pr-10 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs"
                          placeholder="Repite la contraseña"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                        >
                          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t flex justify-end">
                    <button
                      type="button"
                      onClick={handleNextStep}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl transition-all shadow-md shadow-blue-500/20 hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-1.5 cursor-pointer"
                    >
                      Siguiente
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>

                {/* ─── STEP 2 ─── */}
                <div className="w-1/2 pl-4 space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">Datos Personales y Facturación</h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Nombre completo</label>
                      <input
                        type="text"
                        required={step === 2}
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs"
                        placeholder="Juan"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Apellido</label>
                      <input
                        type="text"
                        required={step === 2}
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs"
                        placeholder="Pérez"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">DNI (sin puntos)</label>
                      <input
                        type="text"
                        required={step === 2}
                        value={dni}
                        onChange={(e) => setDni(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs"
                        placeholder="Ej: 12345678"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Teléfono</label>
                      <input
                        type="text"
                        required={step === 2}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs"
                        placeholder="Ej: 1123456789"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Provincia</label>
                      <input
                        type="text"
                        required={step === 2}
                        value={province}
                        onChange={(e) => setProvince(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs"
                        placeholder="Ej: Buenos Aires"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Localidad</label>
                      <input
                        type="text"
                        required={step === 2}
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs"
                        placeholder="Ej: La Plata"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">Calle</label>
                      <input
                        type="text"
                        required={step === 2}
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs"
                        placeholder="Ej: Av. Siempreviva"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Altura</label>
                      <input
                        type="text"
                        required={step === 2}
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs"
                        placeholder="Ej: 742"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Código Postal</label>
                    <input
                      type="text"
                      required={step === 2}
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-xs max-w-[200px]"
                      placeholder="Ej: 1900"
                    />
                  </div>

                  <div className="pt-4 border-t flex justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-2.5 px-4 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ArrowLeft size={14} />
                      Atrás
                    </button>
                    
                    <button
                      type="submit"
                      disabled={loading}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-lg shadow-blue-500/20 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0 flex items-center justify-center gap-1.5 cursor-pointer flex-1"
                    >
                      {loading ? <Loader2 className="animate-spin" size={16} /> : 'Finalizar Registro'}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            ¿Ya tienes una cuenta?{' '}
            <Link to="/login" className="text-blue-600 font-semibold hover:underline">
              Inicia sesión aquí
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
