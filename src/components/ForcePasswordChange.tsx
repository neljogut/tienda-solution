import React, { useState, useEffect } from 'react';
import { updatePassword, signOut } from 'firebase/auth';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { KeyRound, LogOut, Loader2, User } from 'lucide-react';

export const ForcePasswordChange: React.FC = () => {
  const { userData } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Profile fields states
  const [phone, setPhone] = useState('');
  const [dni, setDni] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const [clientData, setClientData] = useState<any>(null);
  const [loadingClient, setLoadingClient] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Load client data if available
  useEffect(() => {
    const loadClient = async () => {
      if (userData?.customerId) {
        try {
          const docSnap = await getDoc(doc(db, 'clients', userData.customerId));
          if (docSnap.exists()) {
            setClientData(docSnap.data());
          }
        } catch (e) {
          console.error("Error loading client data:", e);
        }
      }
      setLoadingClient(false);
    };
    loadClient();
  }, [userData]);

  // Pre-fill states from client data
  useEffect(() => {
    if (clientData) {
      setPhone(clientData.phone || '');
      setDni(clientData.dni || '');
      setProvince(clientData.province || '');
      setCity(clientData.city || '');
      setPostalCode(clientData.postalCode || '');
      
      if (clientData.address) {
        const parts = clientData.address.trim().split(/\s+/);
        if (parts.length > 1) {
          const num = parts[parts.length - 1];
          if (/^\d+$/.test(num) || num.includes('-')) {
            setNumber(num);
            setStreet(parts.slice(0, -1).join(' '));
          } else {
            setStreet(clientData.address);
          }
        } else {
          setStreet(clientData.address);
        }
      }
    }
  }, [clientData]);

  // Determine if profile fields are missing
  const needsProfileCompletion = 
    !clientData?.phone || 
    !clientData?.dni || 
    !clientData?.province || 
    !clientData?.city || 
    !clientData?.address || 
    !clientData?.postalCode;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    // Profile validation if required
    if (needsProfileCompletion) {
      if (!phone.trim() || !dni.trim() || !province.trim() || !city.trim() || !street.trim() || !number.trim() || !postalCode.trim()) {
        setError('Por favor completa todos los datos de perfil y envío obligatorios.');
        return;
      }
    }

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user || !userData) {
        throw new Error('Sesión no encontrada.');
      }

      // 1. Update password in Firebase Authentication
      await updatePassword(user, password);

      // 2. Save profile fields to Clients collection
      if (userData.customerId) {
        const fullAddress = `${street.trim()} ${number.trim()}`;
        await updateDoc(doc(db, 'clients', userData.customerId), {
          phone: phone.trim(),
          dni: dni.trim(),
          province: province.trim(),
          city: city.trim(),
          address: fullAddress,
          postalCode: postalCode.trim()
        });
      }

      // 3. Set forcePasswordChange to false and sync DNI in Users collection
      const userRef = doc(db, 'users', userData.uid);
      await updateDoc(userRef, {
        forcePasswordChange: false,
        dni: dni.trim()
      });

      setSuccess(true);
    } catch (err: any) {
      console.error('Error changing password and saving profile:', err);
      setError(err.message || 'Error al guardar los cambios. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  if (loadingClient) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="animate-spin" size={32} />
          <p className="text-xs font-semibold">Cargando perfil...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4 py-8 font-sans">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-center text-white flex flex-col items-center">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md mb-3">
            <KeyRound size={22} className="text-white" />
          </div>
          <h2 className="text-xl font-bold">Cambio de Contraseña Obligatorio</h2>
          <p className="text-blue-100 text-xs mt-1 leading-relaxed">
            {needsProfileCompletion 
              ? 'Por seguridad y para completar tu perfil, debes establecer tu contraseña personal y rellenar tus datos personales y de facturación.' 
              : 'Por seguridad, debes establecer una contraseña personal en tu primer acceso antes de continuar.'}
          </p>
        </div>

        <div className="p-8">
          {success ? (
            <div className="space-y-4 text-center">
              <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-100 font-semibold">
                ¡Contraseña y datos actualizados con éxito!
              </div>
              <p className="text-xs text-slate-500">
                Redirigiendo a la plataforma...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 text-xs">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 font-semibold">
                  {error}
                </div>
              )}

              {needsProfileCompletion && (
                <>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1 flex items-center gap-1">
                    <User size={14} /> Datos Personales y de Facturación
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-500 mb-1 uppercase">DNI (sin puntos)</label>
                      <input
                        type="text"
                        required
                        value={dni}
                        onChange={(e) => setDni(e.target.value)}
                        className="input w-full bg-slate-50 text-xs"
                        placeholder="Ej: 12345678"
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-500 mb-1 uppercase">Teléfono de Contacto</label>
                      <input
                        type="text"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="input w-full bg-slate-50 text-xs"
                        placeholder="Ej: 1123456789"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-500 mb-1 uppercase">Provincia</label>
                      <input
                        type="text"
                        required
                        value={province}
                        onChange={(e) => setProvince(e.target.value)}
                        className="input w-full bg-slate-50 text-xs"
                        placeholder="Ej: Buenos Aires"
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-500 mb-1 uppercase">Localidad</label>
                      <input
                        type="text"
                        required
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="input w-full bg-slate-50 text-xs"
                        placeholder="Ej: La Plata"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <label className="block font-bold text-slate-500 mb-1 uppercase">Calle</label>
                      <input
                        type="text"
                        required
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        className="input w-full bg-slate-50 text-xs"
                        placeholder="Ej: Av. Siempreviva"
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-500 mb-1 uppercase">Altura</label>
                      <input
                        type="text"
                        required
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        className="input w-full bg-slate-50 text-xs"
                        placeholder="Ej: 742"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-500 mb-1 uppercase">Código Postal</label>
                    <input
                      type="text"
                      required
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className="input w-full bg-slate-50 text-xs max-w-[200px]"
                      placeholder="Ej: 1900"
                      disabled={loading}
                    />
                  </div>
                </>
              )}

              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1 pt-2">Establecer Nueva Contraseña</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-500 mb-1 uppercase">Nueva Contraseña</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input w-full text-xs"
                    placeholder="Mínimo 6 caracteres"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-500 mb-1 uppercase">Confirmar Contraseña</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input w-full text-xs"
                    placeholder="Repite la contraseña"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t mt-4">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  disabled={loading}
                >
                  <LogOut size={14} />
                  Salir
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-2 btn-primary flex-1 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    'Guardar y Acceder'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
