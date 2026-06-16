import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { CartDrawer } from './CartDrawer';
import { Footer } from './Footer';
import { useCartStore } from '../store/cartStore';
import { ShoppingCart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ForcePasswordChange } from './ForcePasswordChange';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { BusinessSettings } from '../types/settings';
import { getDefaultBusinessSettings } from '../constants/defaults';

export const Layout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { getTotalItems, openDrawer, isDrawerOpen } = useCartStore();
  const { userData } = useAuth();
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const totalItems = getTotalItems();
  const location = useLocation();
  const navigate = useNavigate();

  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname === '/dashboard';

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'business'), (snap) => {
      if (snap.exists()) {
        setBusinessSettings(snap.data() as BusinessSettings);
      }
    });
    return unsub;
  }, []);

  if (userData?.forcePasswordChange) {
    return <ForcePasswordChange />;
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 transform ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 transition-transform duration-300 ease-in-out`}>
        <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <Navbar toggleSidebar={() => setMobileMenuOpen(true)} businessSettings={businessSettings} />
        
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 flex flex-col justify-between">
          <div className="mx-auto max-w-7xl w-full p-4 sm:p-6 lg:p-8 flex-1">
            {userData?.role === 'owner' && (!businessSettings || businessSettings.name === getDefaultBusinessSettings().name) && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between text-xs text-amber-800 animate-fadeIn shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <h4 className="font-bold text-amber-900">Configuración Inicial Pendiente</h4>
                    <p className="mt-0.5 text-amber-700 font-medium">Por favor, ve a la sección <strong>Configuración del Negocio</strong> para personalizar el nombre, contacto y redes de tu tienda.</p>
                  </div>
                </div>
                <button 
                  onClick={() => navigate('/business-settings')}
                  className="btn-primary py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] rounded-lg shadow-md shadow-amber-600/20 flex-shrink-0"
                >
                  Configurar
                </button>
              </div>
            )}
            <Outlet />
          </div>
          {!isAdminRoute && <Footer settings={businessSettings} />}
        </main>
      </div>
      <CartDrawer />

      {/* Floating cart button for mobile and quick desktop access */}
      {!isDrawerOpen && totalItems > 0 && (
        <button
          onClick={openDrawer}
          className="fixed bottom-6 right-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white p-4 rounded-full shadow-2xl transition-transform transform hover:scale-110 z-40 flex items-center justify-center"
        >
          <ShoppingCart size={24} />
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[20px] h-[20px] rounded-full flex items-center justify-center shadow-md animate-pulse">
            {totalItems}
          </span>
        </button>
      )}
    </div>
  );
};
