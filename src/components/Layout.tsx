import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { CartDrawer } from './CartDrawer';
import { Footer } from './Footer';
import { Chatbot } from './Chatbot';
import { useCartStore } from '../store/cartStore';
import { ShoppingCart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ForcePasswordChange } from './ForcePasswordChange';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { BusinessSettings } from '../types/settings';
import { getDefaultBusinessSettings } from '../constants/defaults';

export const Layout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { getTotalItems, getTotalPrice, openDrawer, isDrawerOpen } = useCartStore();
  const { userData } = useAuth();
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const totalItems = getTotalItems();
  const totalAmount = getTotalPrice();
  const location = useLocation();
  const navigate = useNavigate();

  const isAdminRoute = location.pathname.startsWith('/admin');
  const isNewOrderRoute = location.pathname === '/admin/orders/new';
  const showFloatingCart = !isDrawerOpen && totalItems > 0 && !isAdminRoute;

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'business'), (snap) => {
      if (snap.exists()) {
        setBusinessSettings(snap.data() as BusinessSettings);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    // Temporary helper to automatically upload the newly cropped/transparent logo to Firestore logoUrl
    if (businessSettings && (!businessSettings.logoUrl || !businessSettings.logoUrl.startsWith('data:image/png;base64'))) {
      const autoUpdateLogo = async () => {
        try {
          const res = await fetch('/logo.png');
          const blob = await res.blob();
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
            const base64data = reader.result as string;
            await setDoc(doc(db, 'settings', 'business'), { logoUrl: base64data }, { merge: true });
            console.log('Logo database updated successfully with cropped version!');
          };
        } catch (e) {
          console.error('Error auto-updating logo:', e);
        }
      };
      autoUpdateLogo();
    }
  }, [businessSettings]);

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
        <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} businessSettings={businessSettings} />
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

      {/* Floating button/bar to open the cart (for both mobile and desktop) */}
      {showFloatingCart && (
        <>
          {/* Mobile view floating bar */}
          <div className="fixed bottom-4 left-4 right-4 z-40 lg:hidden animate-fadeIn">
            <button
              type="button"
              onClick={openDrawer}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-4 px-5 rounded-2xl flex items-center justify-between font-extrabold shadow-2xl border-2 border-white/20 active:scale-98 transition-all"
            >
              <div className="flex items-center gap-3">
                <ShoppingCart size={20} className="animate-bounce" />
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-[10px] text-blue-200 uppercase tracking-wider font-bold">Ver Mi Pedido</span>
                  <span className="text-sm">Tu Carrito ({totalItems})</span>
                </div>
              </div>
              <span className="bg-white/20 px-3 py-1 rounded-xl text-sm font-black">
                ${totalAmount.toLocaleString('es-AR')}
              </span>
            </button>
          </div>

          {/* Desktop view floating button */}
          <div className="fixed bottom-8 right-8 z-40 hidden lg:block animate-fadeIn">
            <button
              type="button"
              onClick={openDrawer}
              className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold rounded-2xl shadow-2xl transition-all hover:scale-105 active:scale-95 duration-200 border-2 border-white/20"
            >
              <ShoppingCart size={24} className="animate-bounce animate-duration-1000" />
              <div className="flex flex-col items-start leading-tight">
                <span className="text-xs text-blue-200 font-bold uppercase tracking-wider">Ver Mi Pedido</span>
                <span className="text-base">Tu Carrito ({totalItems} {totalItems === 1 ? 'producto' : 'productos'})</span>
              </div>
              <div className="h-8 w-px bg-white/20 mx-1" />
              <span className="bg-white/20 px-3 py-1.5 rounded-xl text-base font-black">
                ${totalAmount.toLocaleString('es-AR')}
              </span>
            </button>
          </div>
        </>
      )}
      {businessSettings?.enableChatbot !== false && !isAdminRoute && (
        <Chatbot businessSettings={businessSettings} />
      )}
    </div>
  );
};
