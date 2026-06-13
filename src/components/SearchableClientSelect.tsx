import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, ChevronDown, Check } from 'lucide-react';
import type { Client } from '../types/client';
import { getClientLabel } from '../types/client';

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
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

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
          className="fixed bg-white border border-slate-200/80 rounded-xl shadow-2xl z-[999] py-1.5 text-xs ring-1 ring-black/5 scrollbar-thin max-h-56 overflow-y-auto"
          style={{
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            top: `${coords.top + coords.height + 4}px`,
          }}
          onClick={e => e.stopPropagation()}
        >
          {filtered.length === 0 ? (
            <div className="text-slate-400 py-4 text-center flex flex-col items-center gap-1">
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
        </div>,
        document.body
      )}
    </div>
  );
};
