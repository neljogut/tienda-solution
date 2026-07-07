import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, Mail, Edit2, Check, X, Loader2, CreditCard } from 'lucide-react';
import { updateProfile } from 'firebase/auth';
import { auth, db } from '../../firebase';
import { doc, updateDoc, query, where, getDocs, collection, writeBatch } from 'firebase/firestore';

export const MyAccount: React.FC = () => {
  const { userData } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(userData?.displayName || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // States for employee payout details
  const [payoutAlias, setPayoutAlias] = useState(userData?.payoutDetails?.alias || '');
  const [payoutCbu, setPayoutCbu] = useState(userData?.payoutDetails?.cbu || '');
  const [payoutHolderName, setPayoutHolderName] = useState(userData?.payoutDetails?.holderName || '');
  const [payoutBankName, setPayoutBankName] = useState(userData?.payoutDetails?.bankName || '');
  const [payoutCuit, setPayoutCuit] = useState(userData?.payoutDetails?.cuit || '');
  const [payoutPhone, setPayoutPhone] = useState(userData?.payoutDetails?.phone || '');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (userData?.payoutDetails) {
      setPayoutAlias(userData.payoutDetails.alias || '');
      setPayoutCbu(userData.payoutDetails.cbu || '');
      setPayoutHolderName(userData.payoutDetails.holderName || '');
      setPayoutBankName(userData.payoutDetails.bankName || '');
      setPayoutCuit(userData.payoutDetails.cuit || '');
      setPayoutPhone(userData.payoutDetails.phone || '');
    }
  }, [userData]);

  const handleSavePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData) return;
    setPayoutLoading(true);
    setPayoutMessage(null);

    try {
      const userRef = doc(db, 'users', userData.uid);
      await updateDoc(userRef, {
        payoutDetails: {
          alias: payoutAlias.trim(),
          cbu: payoutCbu.trim(),
          holderName: payoutHolderName.trim(),
          bankName: payoutBankName.trim(),
          cuit: payoutCuit.trim(),
          phone: payoutPhone.trim(),
        }
      });
      setPayoutMessage({ type: 'success', text: 'Datos de transferencia guardados correctamente.' });
    } catch (error: any) {
      console.error('Error saving payout details:', error);
      setPayoutMessage({ type: 'error', text: 'Error al guardar los datos de transferencia.' });
    } finally {
      setPayoutLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !userData) return;
    setLoading(true);
    setMessage(null);

    try {
      // 1. Update Auth Profile
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: name.trim()
        });
      }

      // 2. Update users collection
      const userRef = doc(db, 'users', userData.uid);
      await updateDoc(userRef, {
        displayName: name.trim()
      });

      // 3. Update client collection & order names if client linked
      if (userData.customerId) {
        const names = name.trim().split(/\s+/);
        const firstName = names[0] || 'Cliente';
        const lastName = names.slice(1).join(' ') || 'Registrado';

        await updateDoc(doc(db, 'clients', userData.customerId), {
          firstName,
          lastName
        });

        // Propagation: update orders customerName
        const ordersQuery = query(collection(db, 'orders'), where('customerId', '==', userData.customerId));
        const ordersSnap = await getDocs(ordersQuery);
        if (!ordersSnap.empty) {
          const batch = writeBatch(db);
          const fullName = name.trim();
          ordersSnap.forEach(o => {
            batch.update(doc(db, 'orders', o.id), { customerName: fullName });
          });
          await batch.commit();
        }
      }

      setIsEditing(false);
      setMessage({ type: 'success', text: 'Datos actualizados correctamente.' });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: 'Error al actualizar los datos.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl animate-fadeIn">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Mi Cuenta</h1>
        <p className="text-slate-500">Gestiona tus datos personales y mantén tu perfil al día.</p>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-md">
            {(name || userData?.displayName)?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{name || userData?.displayName}</h2>
            <p className="text-slate-500 capitalize">Rol: {userData?.role}</p>
          </div>
        </div>

        {message && (
          <div className={`p-3 text-xs rounded-lg border mb-4 ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-500 mb-1">Nombre Completo</label>
            {isEditing ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input flex-1 text-xs"
                  placeholder="Tu Nombre Completo"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setName(userData?.displayName || '');
                    setIsEditing(false);
                  }}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2">
                  <User size={18} className="text-slate-400" />
                  <span>{userData?.displayName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="text-blue-600 hover:text-blue-700 font-semibold text-xs flex items-center gap-1"
                >
                  <Edit2 size={12} />
                  Editar
                </button>
              </div>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-500 mb-1">Correo Electrónico</label>
            <div className="flex items-center gap-2 text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-100">
              <Mail size={18} className="text-slate-400" />
              <span>{userData?.email}</span>
            </div>
          </div>
        </form>
      </div>

      {/* Payout Details Section */}
      {userData?.role === 'employee' && (
        <div className="card p-6 mt-6">
          <div className="flex items-center gap-2 mb-6 pb-6 border-b border-slate-100">
            <CreditCard className="text-indigo-600 animate-pulse" size={20} />
            <div>
              <h2 className="text-lg font-black text-slate-800 tracking-tight">Datos de Transferencia Bancaria</h2>
              <p className="text-slate-500 text-xs mt-0.5">Configura a dónde deseas recibir el pago de tus comisiones.</p>
            </div>
          </div>

          {payoutMessage && (
            <div className={`p-3 text-xs rounded-lg border mb-4 font-semibold ${
              payoutMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
            }`}>
              {payoutMessage.text}
            </div>
          )}

          <form onSubmit={handleSavePayout} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">CBU / CVU</label>
                <input
                  type="text"
                  required
                  maxLength={22}
                  placeholder="22 dígitos"
                  value={payoutCbu}
                  onChange={(e) => setPayoutCbu(e.target.value.replace(/\D/g, ''))}
                  className="input w-full text-xs font-mono bg-slate-50 hover:bg-slate-100/50 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Alias</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: pedro.pago.mp"
                  value={payoutAlias}
                  onChange={(e) => setPayoutAlias(e.target.value)}
                  className="input w-full text-xs bg-slate-50 hover:bg-slate-100/50 focus:bg-white transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre del Titular</label>
                <input
                  type="text"
                  required
                  placeholder="Nombre y Apellido completo"
                  value={payoutHolderName}
                  onChange={(e) => setPayoutHolderName(e.target.value)}
                  className="input w-full text-xs bg-slate-50 hover:bg-slate-100/50 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Banco</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Banco Galicia / Mercado Pago"
                  value={payoutBankName}
                  onChange={(e) => setPayoutBankName(e.target.value)}
                  className="input w-full text-xs bg-slate-50 hover:bg-slate-100/50 focus:bg-white transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">CUIT / CUIL (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: 20405006007"
                  value={payoutCuit}
                  onChange={(e) => setPayoutCuit(e.target.value.replace(/\D/g, ''))}
                  className="input w-full text-xs bg-slate-50 hover:bg-slate-100/50 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">WhatsApp / Teléfono</label>
                <input
                  type="text"
                  placeholder="Ej: 5491112345678 (código de país sin +)"
                  value={payoutPhone}
                  onChange={(e) => setPayoutPhone(e.target.value.replace(/\D/g, ''))}
                  className="input w-full text-xs bg-slate-50 hover:bg-slate-100/50 focus:bg-white transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={payoutLoading}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1.5 disabled:opacity-50"
              >
                {payoutLoading ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                <span>Guardar datos de transferencia</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
