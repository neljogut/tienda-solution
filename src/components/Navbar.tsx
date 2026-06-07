import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { Menu, ShoppingCart, Bell } from 'lucide-react';
import { useCartStore } from '../store/cartStore';

interface NavbarProps {
  toggleSidebar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ toggleSidebar }) => {
  const { userData } = useAuth();
  const { getTotalItems, toggleDrawer } = useCartStore();
  const totalItems = getTotalItems();

  return (
    <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button 
          onClick={toggleSidebar}
          className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 lg:hidden transition-colors"
        >
          <Menu size={22} />
        </button>
      </div>
      
      <div className="flex items-center gap-2">
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

        {/* Notifications placeholder */}
        {userData && (
          <button className="relative p-2.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <Bell size={20} />
          </button>
        )}
        
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
