import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  LayoutDashboard, ShoppingBag, Package, Users, Receipt, 
  Warehouse, ArrowLeftRight, DollarSign, BarChart3, Settings,
  Building2, UserCog, X, Tag, ShoppingCart, User, CreditCard,
  ChevronRight, LogOut, History
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  permission?: string;
  requiredRole?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userData, hasPermission, logout } = useAuth();
  const [businessSettings, setBusinessSettings] = useState<any>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'business'), (snap) => {
      if (snap.exists()) {
        setBusinessSettings(snap.data());
      }
    });
    return () => unsub();
  }, []);

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
        { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
        { label: 'Catálogo', icon: ShoppingBag, path: '/catalog' },
      ]
    },
    {
      title: 'Ventas',
      items: [
        { label: 'Pedidos', icon: Receipt, path: '/orders', permission: 'viewOrders' },
        { label: 'Clientes', icon: Users, path: '/clients', permission: 'viewClients' },
        { label: 'Cuentas Ctes.', icon: CreditCard, path: '/accounts', permission: 'viewCash' },
      ]
    },
    {
      title: 'Productos',
      items: [
        { label: 'Productos', icon: Package, path: '/admin/products', permission: 'viewCatalog' },
        { label: 'Categorías', icon: Tag, path: '/categories' },
        { label: 'Inventario', icon: Warehouse, path: '/inventory', permission: 'viewInventory' },
        { label: 'Movimientos', icon: ArrowLeftRight, path: '/inventory-movements', permission: 'viewInventoryMovements' },
      ]
    },
    {
      title: 'Finanzas',
      items: [
        { label: 'Caja Diaria', icon: DollarSign, path: '/cash', permission: 'viewCash' },
        { label: 'Historial de Cajas', icon: History, path: '/cash-history', permission: 'viewCash' },
        { label: 'Balance', icon: BarChart3, path: '/balance', permission: 'viewBalance' },
      ]
    },
    {
      title: 'Configuración',
      items: [
        { label: 'Precios', icon: Settings, path: '/pricing-settings', permission: 'viewPriceSettings' },
        { label: 'Negocio', icon: Building2, path: '/business-settings', requiredRole: 'owner' },
        { label: 'Roles y Permisos', icon: UserCog, path: '/employees', requiredRole: 'owner' },
      ]
    }
  ];

  // Client menu
  const clientItems: NavItem[] = [
    { label: 'Catálogo', icon: ShoppingBag, path: '/catalog' },
    { label: 'Mis Pedidos', icon: ShoppingCart, path: '/my-orders' },
    { label: 'Mi Cuenta', icon: CreditCard, path: '/my-account-balance' },
    { label: 'Mi Perfil', icon: User, path: '/my-account' },
  ];

  const isAdmin = userData?.role === 'owner' || userData?.role === 'employee';

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
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleNav('/catalog')}>
            {businessSettings?.logoUrl ? (
              <img src={businessSettings.logoUrl} className="w-9 h-9 object-cover rounded-xl shadow-lg" alt="Logo" />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <span className="text-white font-black text-sm">
                  {businessSettings?.name ? businessSettings.name.charAt(0).toUpperCase() : 'D'}
                </span>
              </div>
            )}
            <div>
              <h1 className="text-white font-bold text-base leading-tight truncate max-w-[140px]">
                {businessSettings?.name || 'Dualgi 3D'}
              </h1>
              <p className="text-slate-500 text-[10px] font-medium tracking-wider">PLATFORM</p>
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
              {clientItems.map((item) => {
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
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {userData.displayName?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{userData.displayName}</p>
                <p className="text-slate-500 text-[11px] capitalize">{userData.role}</p>
              </div>
            </div>
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
