import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, Mail } from 'lucide-react';

export const MyAccount: React.FC = () => {
  const { userData } = useAuth();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Mi Cuenta</h1>
        <p className="text-slate-500">Gestiona tus datos personales.</p>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-md">
            {userData?.displayName?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{userData?.displayName}</h2>
            <p className="text-slate-500 capitalize">Rol: {userData?.role}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-500 mb-1">Nombre Completo</label>
            <div className="flex items-center gap-2 text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-100">
              <User size={18} className="text-slate-400" />
              <span>{userData?.displayName}</span>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-500 mb-1">Correo Electrónico</label>
            <div className="flex items-center gap-2 text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-100">
              <Mail size={18} className="text-slate-400" />
              <span>{userData?.email}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
