import React, { useState } from 'react';
import { updatePassword, signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { KeyRound, LogOut, Loader2 } from 'lucide-react';

export const ForcePasswordChange: React.FC = () => {
  const { userData } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user || !userData) {
        throw new Error('Sesión no encontrada.');
      }

      // 1. Update password in Firebase Authentication
      await updatePassword(user, password);

      // 2. Set forcePasswordChange to false in Firestore
      const userRef = doc(db, 'users', userData.uid);
      await updateDoc(userRef, {
        forcePasswordChange: false
      });

      setSuccess(true);
    } catch (err: any) {
      console.error('Error changing password:', err);
      setError(err.message || 'Error al cambiar la contraseña. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-center text-white flex flex-col items-center">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md mb-3">
            <KeyRound size={22} className="text-white" />
          </div>
          <h2 className="text-xl font-bold">Cambio de Contraseña Obligatorio</h2>
          <p className="text-blue-100 text-xs mt-1 leading-relaxed">
            Por seguridad, debes establecer una contraseña personal en tu primer acceso antes de continuar.
          </p>
        </div>

        <div className="p-6">
          {success ? (
            <div className="space-y-4 text-center">
              <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-100 font-semibold">
                ¡Contraseña cambiada con éxito!
              </div>
              <p className="text-xs text-slate-500">
                Redirigiendo a la plataforma...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 font-semibold">
                  {error}
                </div>
              )}

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

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                  disabled={loading}
                >
                  <LogOut size={14} />
                  Salir
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-2 btn-primary flex-1 flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    'Establecer Contraseña'
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
