import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { Menu, ShoppingCart } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { useCartStore } from '../store/cartStore';
import type { BusinessSettings } from '../types/settings';

interface NavbarProps {
  toggleSidebar: () => void;
  businessSettings?: BusinessSettings | null;
}

export const Navbar: React.FC<NavbarProps> = ({ toggleSidebar, businessSettings }) => {
  const { userData, currentUser } = useAuth();
  const { getTotalItems, toggleDrawer } = useCartStore();
  const totalItems = getTotalItems();

  const [showCatalogTitle, setShowCatalogTitle] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      
      const scrollY = target.scrollTop || window.scrollY;
      setShowCatalogTitle(scrollY > 150);
    };

    const scrollContainer = document.querySelector('main');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    } else {
      window.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll);
      }
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const formatWhatsappLink = (num: string) => {
    const cleanNum = num.replace(/\D/g, '');
    return `https://wa.me/${cleanNum}`;
  };

  return (
    <header className="h-16 topbar-glass topbar-visible flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button 
          onClick={toggleSidebar}
          className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 lg:hidden transition-colors"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* Scroll-triggered Title in the middle */}
      <div className={`flex flex-col items-center transition-all duration-500 transform ${
        showCatalogTitle 
          ? 'opacity-100 translate-y-0 scale-100' 
          : 'opacity-0 -translate-y-4 scale-95 pointer-events-none'
      }`}>
        <span className="text-xs md:text-sm font-black tracking-wider text-blue-900 uppercase">
          {businessSettings?.catalogTitle || 'SOLUTION CATÁLOGO'}
        </span>
        <span className="hidden sm:inline text-[9px] md:text-[10px] text-slate-500 font-bold uppercase tracking-normal">
          {businessSettings?.catalogHeroText || 'Tu tienda de impresión 3D y tecnología'}
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        {/* Social Media Links inside Top Header */}
        {businessSettings && (
          <div className="hidden sm:flex items-center gap-1 sm:gap-2 mr-2 border-r border-slate-200 pr-3">
            {businessSettings.instagram && (
              <a
                href={`https://instagram.com/${businessSettings.instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-xl text-slate-400 hover:text-pink-600 hover:bg-pink-50 transition-colors"
                title="Instagram"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </a>
            )}
            {businessSettings.tiktok && (
              <a
                href={`https://tiktok.com/@${businessSettings.tiktok.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center"
                title="TikTok"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="#00f2fe" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.86-.74-3.99-1.72-.08-.07-.17-.17-.25-.26V14c.02 2.78-1.56 5.48-4.17 6.48-2.61 1-5.74.45-7.79-1.51-2.05-1.95-2.64-5.07-1.45-7.7 1.19-2.62 4.22-4.22 7.09-3.86v4.16c-1.39-.21-2.88.22-3.77 1.29-.89 1.07-1.09 2.63-.49 3.84.6 1.2 2.05 1.94 3.39 1.7 1.34-.24 2.39-1.39 2.51-2.73.08-1.07.03-2.14.04-3.21V0h.03z" transform="translate(-0.5, -0.5)" />
                  <path fill="#fe0979" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.86-.74-3.99-1.72-.08-.07-.17-.17-.25-.26V14c.02 2.78-1.56 5.48-4.17 6.48-2.61 1-5.74.45-7.79-1.51-2.05-1.95-2.64-5.07-1.45-7.7 1.19-2.62 4.22-4.22 7.09-3.86v4.16c-1.39-.21-2.88.22-3.77 1.29-.89 1.07-1.09 2.63-.49 3.84.6 1.2 2.05 1.94 3.39 1.7 1.34-.24 2.39-1.39 2.51-2.73.08-1.07.03-2.14.04-3.21V0h.03z" transform="translate(0.5, 0.5)" />
                  <path fill="#111827" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.86-.74-3.99-1.72-.08-.07-.17-.17-.25-.26V14c.02 2.78-1.56 5.48-4.17 6.48-2.61 1-5.74.45-7.79-1.51-2.05-1.95-2.64-5.07-1.45-7.7 1.19-2.62 4.22-4.22 7.09-3.86v4.16c-1.39-.21-2.88.22-3.77 1.29-.89 1.07-1.09 2.63-.49 3.84.6 1.2 2.05 1.94 3.39 1.7 1.34-.24 2.39-1.39 2.51-2.73.08-1.07.03-2.14.04-3.21V0h.03z" />
                </svg>
              </a>
            )}
            {businessSettings.whatsapp && (
              <a
                href={formatWhatsappLink(businessSettings.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center"
                title="WhatsApp"
              >
                <svg className="w-6 h-6" viewBox="0 0 16 16">
                  <path fill="#25D366" d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326z" />
                  <path fill="#FFF" d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232" />
                </svg>
              </a>
            )}
          </div>
        )}

        {/* Cart for clients and testing owners */}
        <button 
          onClick={toggleDrawer} 
          className="relative p-2.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <ShoppingCart size={20} />
          {totalItems > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
              {totalItems}
            </span>
          )}
        </button>

        {currentUser && <NotificationBell />}
        
        {/* Auth buttons for guests */}
        {!userData && (
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-ghost text-sm">Iniciar Sesión</Link>
            <Link to="/register" className="btn-primary text-sm py-2 px-4">Registrarse</Link>
          </div>
        )}
      </div>
    </header>
  );
};
