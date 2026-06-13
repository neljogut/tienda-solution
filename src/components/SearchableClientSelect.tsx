import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, ChevronDown, Check, UserPlus, X, Crown, Shield, Store, Loader2 } from 'lucide-react';
import type { Client } from '../types/client';
import { getClientLabel } from '../types/client';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

interface SearchableClientSelectProps {
  clients: Client[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// Helper for client initials
function getClientInitials(firstName: string, lastName: string): string {
  const f = firstName ? firstName.trim().charAt(0).toUpperCase() : '';
  const l = lastName ? lastName.trim().charAt(0).toUpperCase() : '';
  return `${f}${l}` || '?';
}

// Helper for client avatar background color style based on the first letter of their first name
function getClientAvatarStyle(firstName: string): React.CSSProperties {
  const name = (firstName || '').trim().toLowerCase();
  if (!name) return { backgroundColor: '#f1f5f9', color: '#475569' };
  
  const charCode = name.charCodeAt(0) || 0;
  
  const palettes = [
    { bg: '#e2e8f0', text: '#334155' }, // Slate 200 / 700
    { bg: '#dbeafe', text: '#1e40af' }, // Blue 100 / 800
    { bg: '#e0e7ff', text: '#3730a3' }, // Indigo 100 / 800
    { bg: '#e0f2fe', text: '#0369a1' }, // Sky 100 / 700
    { bg: '#f1f5f9', text: '#475569' }, // Slate 100 / 600
    { bg: '#eff6ff', text: '#2563eb' }, // Blue 50 / 600
    { bg: '#f5f3ff', text: '#5b21b6' }, // Violet 50 / 800
  ];
  const palette = palettes[charCode % palettes.length];
  return { backgroundColor: palette.bg, color: palette.text };
}

export const SearchableClientSelect: React.FC<SearchableClientSelectProps> = ({
  clients,
  value,
  onChange,
  placeholder = 'Buscar y seleccionar cliente...'
}) => {
  const { userData } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // Quick client creation states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newClientFirstName, setNewClientFirstName] = useState('');
  const [newClientLastName, setNewClientLastName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientIsWholesale, setNewClientIsWholesale] = useState(false);
  const [newClientIsTrusted, setNewClientIsTrusted] = useState(false);
  const [newClientIsLocal, setNewClientIsLocal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setNewClientFirstName('');
    setNewClientLastName('');
    setNewClientPhone('');
    setNewClientIsWholesale(false);
    setNewClientIsTrusted(false);
    setNewClientIsLocal(false);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientFirstName.trim()) {
      alert('El nombre es obligatorio.');
      return;
    }

    setIsSaving(true);
    try {
      const newClientData: Record<string, any> = {
        firstName: newClientFirstName.trim(),
        lastName: newClientLastName.trim(),
        phone: newClientPhone.trim(),
        email: '',
        address: '',
        city: '',
        province: '',
        postalCode: '',
        dni: '',
        cuit: '',
        isWholesale: userData?.role === 'employee' ? false : newClientIsWholesale,
        isTrusted: newClientIsTrusted,
        isLocal: newClientIsLocal,
        observations: 'Creado desde el selector rápido de pedidos',
        createdAt: new Date().toISOString(),
        totalPurchased: 0,
        totalOwed: 0,
      };

      if (userData?.role === 'employee') {
        newClientData.employeeId = userData.uid;
        newClientData.employeeName = userData.displayName || userData.email || 'Empleado';
      } else if (userData?.role === 'owner') {
        newClientData.employeeId = '';
        newClientData.employeeName = '';
      }

      const docRef = await addDoc(collection(db, 'clients'), newClientData);
      
      onChange(docRef.id);
      closeCreateModal();
    } catch (err: any) {
      console.error('Error creating client inline:', err);
      alert(`Error al guardar cliente: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedClient = clients.find(c => c.id === value);
  const displayValue = selectedClient 
    ? `${selectedClient.firstName} ${selectedClient.lastName}`
    : '';

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return clients;
    return clients.filter(c => 
      c.firstName.toLowerCase().includes(term) ||
      c.lastName.toLowerCase().includes(term)
    );
  }, [clients, search]);

  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      });
    }
  };

  const handleFocus = () => {
    setIsOpen(true);
    setSearch('');
    updateCoords();
  };

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);

    const clickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const portalDropdown = document.getElementById('portal-client-dropdown');
        if (portalDropdown && portalDropdown.contains(e.target as Node)) {
          return;
        }
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', clickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
      document.removeEventListener('mousedown', clickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          value={isOpen ? search : displayValue}
          onChange={e => setSearch(e.target.value)}
          onFocus={handleFocus}
          className="w-full border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white text-ellipsis truncate transition-all duration-200"
        />
        <div className="absolute left-3 top-3 text-slate-400">
          <User size={15} />
        </div>
        <div className="absolute right-3 top-3 text-slate-400 pointer-events-none">
          <ChevronDown size={15} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && coords && createPortal(
        <div 
          id="portal-client-dropdown"
          className="fixed bg-white border border-slate-200/80 rounded-xl shadow-2xl z-[999] text-xs ring-1 ring-black/5 flex flex-col overflow-hidden"
          style={{
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            top: `${coords.top + coords.height + 4}px`,
            maxHeight: '260px'
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Scrollable list */}
          <div className="overflow-y-auto flex-1 max-h-[210px] scrollbar-thin py-1">
            {filtered.length === 0 ? (
              <div className="text-slate-400 py-6 text-center flex flex-col items-center gap-1">
                <User size={18} className="opacity-40" />
                <span>No se encontraron clientes</span>
              </div>
            ) : (
              filtered.map(c => {
                const isSelected = c.id === value;
                const initials = getClientInitials(c.firstName, c.lastName);
                const avatarStyle = getClientAvatarStyle(c.firstName);
                const label = getClientLabel(c);

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onChange(c.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 transition-colors flex items-center justify-between gap-2 border-b border-slate-50 last:border-0 ${
                      isSelected 
                        ? 'bg-blue-50 text-blue-700' 
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div 
                        className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold shadow-sm" 
                        style={avatarStyle}
                      >
                        {initials}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-slate-800 truncate">{c.firstName} {c.lastName}</span>
                        <span className={`text-[10px] truncate font-medium ${isSelected ? 'text-blue-500' : 'text-slate-400'}`}>
                          {label}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isSelected && <Check size={14} className="text-blue-600" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Sticky Quick-Create Client Button */}
          <div className="border-t border-slate-100 p-1.5 bg-slate-50/80 backdrop-blur-[2px] flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                setNewClientFirstName(search.trim());
                setIsCreateModalOpen(true);
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-sm"
            >
              <UserPlus size={13} />
              <span>{search.trim() ? `Crear cliente "${search.trim()}"` : 'Crear nuevo cliente'}</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Quick Create Client Modal */}
      {isCreateModalOpen && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={closeCreateModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm animate-fadeIn flex flex-col" onClick={e => e.stopPropagation()}>
            <button
              onClick={closeCreateModal}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-blue-50">
                <UserPlus size={20} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Crear Nuevo Cliente</h3>
                <p className="text-slate-400 text-[10px]">Agregá el cliente sin perder el pedido actual</p>
              </div>
            </div>

            <form onSubmit={handleSaveClient} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nombre *</label>
                  <input
                    type="text"
                    required
                    value={newClientFirstName}
                    onChange={e => setNewClientFirstName(e.target.value)}
                    placeholder="Ej. Juan"
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Apellido</label>
                  <input
                    type="text"
                    value={newClientLastName}
                    onChange={e => setNewClientLastName(e.target.value)}
                    placeholder="Ej. Pérez"
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={newClientPhone}
                  onChange={e => setNewClientPhone(e.target.value)}
                  placeholder="Ej. +54911223344"
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                />
              </div>

              {/* Classification */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clasificación</label>
                <div className="flex flex-col gap-2">
                  {userData?.role !== 'employee' && (
                    <button
                      type="button"
                      onClick={() => setNewClientIsWholesale(!newClientIsWholesale)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-colors ${
                        newClientIsWholesale ? 'border-purple-500 bg-purple-50/50 text-purple-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Crown size={16} className={newClientIsWholesale ? 'text-purple-600' : 'text-slate-400'} />
                      <div className="flex-1">
                        <p className="font-semibold text-xs">Mayorista</p>
                      </div>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${newClientIsWholesale ? 'bg-purple-500 border-purple-500 text-white' : 'border-slate-300 bg-white'}`}>
                        {newClientIsWholesale && <span className="text-[9px] font-black">✓</span>}
                      </div>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setNewClientIsTrusted(!newClientIsTrusted)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-colors ${
                      newClientIsTrusted ? 'border-amber-500 bg-amber-50/50 text-amber-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Shield size={16} className={newClientIsTrusted ? 'text-amber-600' : 'text-slate-400'} />
                    <div className="flex-1">
                      <p className="font-semibold text-xs">De Confianza</p>
                    </div>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${newClientIsTrusted ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300 bg-white'}`}>
                      {newClientIsTrusted && <span className="text-[9px] font-black">✓</span>}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewClientIsLocal(!newClientIsLocal)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-colors ${
                      newClientIsLocal ? 'border-cyan-500 bg-cyan-50/50 text-cyan-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Store size={16} className={newClientIsLocal ? 'text-cyan-600' : 'text-slate-400'} />
                    <div className="flex-1">
                      <p className="font-semibold text-xs">Negocio / Local</p>
                    </div>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${newClientIsLocal ? 'bg-cyan-500 border-cyan-500 text-white' : 'border-slate-300 bg-white'}`}>
                      {newClientIsLocal && <span className="text-[9px] font-black">✓</span>}
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="flex-1 py-2 text-xs font-bold border border-slate-200 hover:border-slate-300 text-slate-500 hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-600/10"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="animate-spin" size={13} />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar Cliente</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
