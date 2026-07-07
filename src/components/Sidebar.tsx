import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

import { 
  ShoppingBag, Package, Users, Receipt, 
  ArrowLeftRight, DollarSign, BarChart3, Settings,
  Building2, UserCog, X, ShoppingCart, User, CreditCard,
  ChevronRight, LogOut, Tag, Eye, FileText, Wrench
} from 'lucide-react';


import type { BusinessSettings } from '../types/settings';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  businessSettings: BusinessSettings | null;
}

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  permission?: string;
  requiredRole?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, businessSettings }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userData, hasPermission, logout, viewAsClient, setViewAsClient } = useAuth();

  const [hasEmployees, setHasEmployees] = useState(false);

  useEffect(() => {
    if (userData?.role !== 'owner') return;

    const q = query(collection(db, 'users'), where('role', '==', 'employee'));
    const unsub = onSnapshot(q, (snap) => {
      setHasEmployees(snap.size > 0);
    }, (err) => {
      console.error('Error fetching employees count in sidebar:', err);
    });

    return () => unsub();
  }, [userData]);


  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const handleNav = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Admin/Owner menu
  const adminSections: { title: string; items: NavItem[] }[] = [
    {
      title: 'General',
      items: [
        { label: 'Catálogo', icon: ShoppingBag, path: '/catalog' },
        { label: 'Mi Balance', icon: DollarSign, path: '/employee/balance', requiredRole: 'employee' },
      ]
    },
    {
      title: 'Ventas',
      items: [
        { label: 'Pedidos', icon: Receipt, path: '/orders', permission: 'viewOrders' },
        { label: 'Servicios', icon: Wrench, path: '/admin/servicios', permission: 'viewOrders' },
        { label: 'Presupuestos', icon: FileText, path: '/admin/quotes', requiredRole: 'owner' },
        { label: 'Clientes', icon: Users, path: '/clients', permission: 'viewClients' },
        { label: 'Cuentas Ctes.', icon: CreditCard, path: '/accounts', permission: 'viewAccounts' },
        { label: 'Liquidaciones', icon: ArrowLeftRight, path: '/admin/liquidations', requiredRole: 'owner' },
      ]
    },
    {
      title: 'Productos',
      items: [
        { label: 'Productos', icon: Package, path: '/admin/products', permission: 'viewCatalog' },
        { label: 'Categorías', icon: Tag, path: '/admin/categories', permission: 'viewCategories' },
      ]
    },
    {
      title: 'Finanzas',
      items: [
        { label: 'Balance', icon: BarChart3, path: '/balance', permission: 'viewBalance' },
      ]
    },
    {
      title: 'Configuración',
      items: [
        { label: 'Negocio', icon: Building2, path: '/business-settings', requiredRole: 'owner' },
        { label: 'Roles y Permisos', icon: UserCog, path: '/employees', requiredRole: 'owner' },
      ]
    }
  ];

  // Client menu
  const clientItems: NavItem[] = [
    { label: 'Catálogo', icon: ShoppingBag, path: '/catalog' },
    { label: 'Servicio Técnico', icon: Wrench, path: '/servicios' },
    { label: 'Mis Pedidos', icon: ShoppingCart, path: '/my-orders' },
    { label: 'Mi Cuenta', icon: CreditCard, path: '/my-account-balance' },
  ];

  const isRealAdmin = userData?.role === 'owner' || userData?.role === 'employee';
  const isAdmin = isRealAdmin && !viewAsClient;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed top-0 left-0 z-50 h-full w-[260px] 
        bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 
        flex flex-col transition-transform duration-300 ease-out
        lg:translate-x-0 lg:static lg:z-auto
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3 cursor-pointer w-full" onClick={() => handleNav('/catalog')}>
            <img src="/logo-icon.png" className="w-9 h-9 object-contain rounded-xl shadow-lg" alt="Logo" />
            <div>
              <h1 className="text-white font-black text-base tracking-wider leading-tight uppercase truncate max-w-[120px]">
                {businessSettings?.name || 'SOLUTION'}
              </h1>
              <p className="text-slate-500 text-[8px] font-bold tracking-wider uppercase">
                {(businessSettings as any)?.tagline || 'tu centro de soluciones'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 no-scrollbar">
          {isAdmin ? (
            adminSections.map((section) => {
              const visibleItems = section.items.filter(item => {
                if (item.path === '/admin/liquidations' && !hasEmployees) return false;
                if (item.requiredRole && userData?.role !== item.requiredRole) return false;
                if (!item.permission) return true;
                if (userData?.role === 'owner') return true;
                return hasPermission(item.permission as any);
              });
              if (visibleItems.length === 0) return null;

              return (
                <div key={section.title}>
                  <p className="sidebar-section-title">{section.title}</p>
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                      <button
                        key={item.path}
                        onClick={() => handleNav(item.path)}
                        className={`sidebar-item w-full ${active ? 'sidebar-item-active' : ''}`}
                      >
                        <Icon size={18} />
                        <span className="flex-1 text-left">{item.label}</span>
                        {active && <ChevronRight size={14} className="text-blue-400" />}
                      </button>
                    );
                  })}
                </div>
              );
            })
          ) : (
            <div>
              <p className="sidebar-section-title">Menú</p>
              {clientItems
                .filter(item => item.path === '/catalog' || item.path === '/servicios' || !!userData)
                .map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <button
                      key={item.path}
                      onClick={() => handleNav(item.path)}
                      className={`sidebar-item w-full ${active ? 'sidebar-item-active' : ''}`}
                    >
                      <Icon size={18} />
                      <span className="flex-1 text-left">{item.label}</span>
                      {active && <ChevronRight size={14} className="text-blue-400" />}
                    </button>
                  );
                })}
            </div>
          )}
        </nav>

        {/* User info */}
        {userData && (
          <div className="px-3 pb-4 pt-2 border-t border-white/5 flex-shrink-0">
            <button 
              onClick={() => handleNav('/my-account')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/5 transition-all text-left group"
              title="Configurar Perfil"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                {userData.displayName?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 justify-between">
                  <p className="text-white text-sm font-semibold truncate group-hover:text-blue-400 transition-colors">{userData.displayName}</p>
                  <Settings size={12} className="text-slate-500 group-hover:text-blue-400 group-hover:rotate-45 transition-all shrink-0" />
                </div>
                <p className="text-slate-500 text-[11px] capitalize">{userData.role === 'owner' ? 'Propietario' : userData.role === 'employee' ? 'Colaborador' : 'Cliente'}</p>
              </div>
            </button>
            
            {isRealAdmin && (
              <button 
                onClick={() => {
                  setViewAsClient(!viewAsClient);
                  if (viewAsClient) navigate('/catalog'); // if turning off, maybe stay or go to orders
                }}
                className={`sidebar-item w-full mt-2 transition-colors ${viewAsClient ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
              >
                <Eye size={18} />
                <span>{viewAsClient ? 'Volver a Admin' : 'Ver como Cliente'}</span>
              </button>
            )}

            <button 
              onClick={handleLogout}
              className="sidebar-item w-full mt-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <LogOut size={18} />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );
};
