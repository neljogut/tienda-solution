import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { UserData, UserPermissions } from '../../types/user';
import { 
  UserCog, Shield, Users, Search, Edit2, CheckSquare, 
  Square, X, ShieldAlert, Award, UserPlus
} from 'lucide-react';

export const Employees: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserData['role']>('employee');
  const [permissions, setPermissions] = useState<UserPermissions>({});

  // Add User states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'link-client' | 'promote'>('link-client');
  const [selectedClientIdToLink, setSelectedClientIdToLink] = useState('');
  const [selectedUserIdToPromote, setSelectedUserIdToPromote] = useState('');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [addLinkEmail, setAddLinkEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addRole, setAddRole] = useState<UserData['role']>('employee');
  const [addPermissions, setAddPermissions] = useState<UserPermissions>({});
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  const [clients, setClients] = useState<any[]>([]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);

    if (modalTab === 'link-client') {
      if (!selectedClientIdToLink) {
        setAddError('Por favor selecciona un cliente de la lista.');
        setAddLoading(false);
        return;
      }
      const client = clients.find(c => c.id === selectedClientIdToLink);
      if (!client) {
        setAddError('El cliente seleccionado no existe.');
        setAddLoading(false);
        return;
      }
      
      const effectiveEmail = client.email || addLinkEmail;
      if (!effectiveEmail || !effectiveEmail.includes('@')) {
        setAddError('Por favor proporciona un correo electrónico válido para este cliente.');
        setAddLoading(false);
        return;
      }

      // Check if this email is already registered in our users collection
      const existingUser = users.find(u => u.email?.toLowerCase() === effectiveEmail.toLowerCase());

      if (existingUser) {
        try {
          const { doc, updateDoc } = await import('firebase/firestore');
          const { db } = await import('../../firebase');
          
          // 1. Promote role & set permissions
          await updateDoc(doc(db, 'users', existingUser.uid), {
            role: addRole,
            permissions: addRole === 'employee' ? addPermissions : {}
          });
          
          // 2. Link in client profile (also sync email if it was missing)
          await updateDoc(doc(db, 'clients', client.id), {
            userId: existingUser.uid,
            email: effectiveEmail
          });
          
          // Reset
          setSelectedClientIdToLink('');
          setAddLinkEmail('');
          setAddPassword('');
          setAddRole('employee');
          setAddPermissions({});
          setIsAddModalOpen(false);
          alert('Cliente (ya registrado) vinculado y promovido exitosamente.');
        } catch (err: any) {
          console.error('Error linking existing user:', err);
          setAddError(err.message || 'Error al vincular el usuario registrado.');
        } finally {
          setAddLoading(false);
        }
        return;
      }

      // New user account registration: Password is required
      if (!addPassword || addPassword.length < 6) {
        setAddError('La contraseña para la cuenta nueva debe tener al menos 6 caracteres.');
        setAddLoading(false);
        return;
      }

      let secondaryApp;
      try {
        const { initializeApp } = await import('firebase/app');
        const { getAuth, createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
        const { firebaseConfig } = await import('../../firebase');
        
        const appName = `SecondaryApp-${Date.now()}`;
        secondaryApp = initializeApp(firebaseConfig, appName);
        const secondaryAuth = getAuth(secondaryApp);
        
        const displayName = `${client.firstName} ${client.lastName}`;
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, effectiveEmail, addPassword);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName });
        
        const { doc, setDoc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('../../firebase');
        
        // Create user document in users collection with forcePasswordChange: true
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName,
          role: addRole,
          permissions: addRole === 'employee' ? addPermissions : {},
          forcePasswordChange: true, // Force password change on first login!
          createdAt: new Date().toISOString()
        });
        
        // Link client document in clients collection to the auth user
        await updateDoc(doc(db, 'clients', client.id), {
          userId: user.uid,
          email: effectiveEmail
        });
        
        // Reset
        setSelectedClientIdToLink('');
        setAddLinkEmail('');
        setAddPassword('');
        setAddRole('employee');
        setAddPermissions({});
        setIsAddModalOpen(false);
        alert('Cliente vinculado y promovido exitosamente (se requerirá cambio de contraseña en su primer acceso).');
      } catch (err: any) {
        console.error('Error linking client:', err);
        setAddError(err.message || 'Error al vincular el cliente.');
      } finally {
        if (secondaryApp) {
          try {
            const { deleteApp } = await import('firebase/app');
            await deleteApp(secondaryApp);
          } catch (e) {}
        }
        setAddLoading(false);
      }
      return;
    }

    if (modalTab === 'promote') {
      if (!selectedUserIdToPromote) {
        setAddError('Por favor selecciona un usuario.');
        setAddLoading(false);
        return;
      }
      try {
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('../../firebase');
        
        const userRef = doc(db, 'users', selectedUserIdToPromote);
        await updateDoc(userRef, {
          role: addRole,
          permissions: addRole === 'employee' ? addPermissions : {}
        });

        // Reset
        setSelectedUserIdToPromote('');
        setAddRole('employee');
        setAddPermissions({});
        setIsAddModalOpen(false);
        alert('Usuario promovido exitosamente.');
      } catch (err: any) {
        console.error('Error promoting user:', err);
        setAddError(err.message || 'Error al promover al usuario.');
      } finally {
        setAddLoading(false);
      }
      return;
    }  };

  useEffect(() => {
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserData)));
      setLoading(false);
    }, (err) => {
      console.error('Error fetching users:', err);
      setLoading(false);
    });

    const unsubscribeClients = onSnapshot(collection(db, 'clients'), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error('Error fetching clients:', err);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeClients();
    };
  }, []);

  const handleOpenEdit = (user: UserData) => {
    setSelectedUser(user);
    setSelectedRole(user.role);
    setPermissions(user.permissions || {});
    setIsModalOpen(true);
  };

  const handleTogglePermission = (key: keyof UserPermissions) => {
    setPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    try {
      const userRef = doc(db, 'users', selectedUser.uid);
      
      const updatedData: Partial<UserData> = {
        role: selectedRole,
        permissions: selectedRole === 'employee' ? permissions : {}
      };

      await updateDoc(userRef, updatedData);
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving user role/permissions:', err);
      alert('Error al guardar cambios.');
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      (u.displayName && u.displayName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: UserData['role']) => {
    switch (role) {
      case 'owner':
        return <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-100 px-2 py-0.5 rounded text-[10px] font-bold"><Award size={11} /> Propietario</span>;
      case 'employee':
        return <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded text-[10px] font-bold"><Shield size={11} /> Empleado</span>;
      case 'client':
        return <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-bold"><Users size={11} /> Cliente</span>;
      default:
        return <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-500 border border-gray-100 px-2 py-0.5 rounded text-[10px] font-bold">Invitado</span>;
    }
  };

  const permissionsList: { key: keyof UserPermissions; label: string; group: string }[] = [
    // Pedidos
    { key: 'viewOrders', label: 'Ver Listado de Pedidos', group: 'Pedidos' },
    { key: 'createOrders', label: 'Crear Pedidos', group: 'Pedidos' },
    { key: 'editOrders', label: 'Editar Pedidos', group: 'Pedidos' },
    { key: 'changeOrderState', label: 'Cambiar Estado de Pedidos', group: 'Pedidos' },
    { key: 'registerPayments', label: 'Registrar Cobros / Pagos', group: 'Pedidos' },
    
    // Clientes
    { key: 'viewClients', label: 'Ver Clientes', group: 'Clientes' },
    { key: 'createClients', label: 'Agregar Clientes Manualmente', group: 'Clientes' },
    { key: 'editClients', label: 'Editar Clientes', group: 'Clientes' },

    // Catálogo
    { key: 'viewCatalog', label: 'Ver Catálogo Interno', group: 'Productos' },
    { key: 'createProducts', label: 'Crear Productos', group: 'Productos' },
    { key: 'editProducts', label: 'Editar Productos', group: 'Productos' },
    { key: 'viewManualPrices', label: 'Ver Identificativos de Precio Manual', group: 'Productos' },

    // Inventario
    { key: 'viewInventory', label: 'Ver Insumos / Inventario', group: 'Inventario' },
    { key: 'modifyInventory', label: 'Modificar Niveles de Stock', group: 'Inventario' },
    { key: 'viewInventoryMovements', label: 'Ver Historial de Auditoría / Movimientos', group: 'Inventario' },

    // Caja
    { key: 'viewCash', label: 'Ver Caja Diaria', group: 'Finanzas' },
    { key: 'openCash', label: 'Abrir Caja Diaria', group: 'Finanzas' },
    { key: 'closeCash', label: 'Cerrar Caja Diaria / Arqueos', group: 'Finanzas' },
    { key: 'viewCashHistory', label: 'Ver Historial de Cajas Cerradas', group: 'Finanzas' },
    { key: 'viewBalance', label: 'Ver Reporte de Balance Financiero', group: 'Finanzas' },

    // Descargas PDF
    { key: 'viewInternalPDFs', label: 'Ver PDFs Internos de Control', group: 'Archivos PDF' },
    { key: 'downloadInternalPDFs', label: 'Descargar PDFs Internos de Costos', group: 'Archivos PDF' },
    { key: 'downloadBalancePDFs', label: 'Descargar PDFs de Balance General', group: 'Archivos PDF' },
    { key: 'viewPriceSettings', label: 'Ver/Editar Parámetros de Precios', group: 'Configuración' }
  ];

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="page-header">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <UserCog size={26} className="text-blue-600" />
              Roles y Permisos de Empleados
            </h1>
            <p className="page-subtitle">
              Administra el acceso de los usuarios del sistema, promueve empleados y define permisos específicos.
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-primary flex items-center justify-center gap-2 self-start sm:self-auto text-xs py-2.5 px-4 whitespace-nowrap"
          >
            <UserPlus size={16} />
            Agregar Empleado
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row justify-between gap-4 items-center">
        {/* Search */}
        <div className="relative w-full md:flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
            <Search size={16} />
          </span>
          <input 
            type="text" 
            placeholder="Buscar usuario por nombre o correo..."
            className="input pl-10 w-full text-xs"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-48 text-xs">
            <select
              className="input w-full pr-8 appearance-none text-xs"
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
            >
              <option value="all">Todos los Roles</option>
              <option value="owner">Propietarios</option>
              <option value="employee">Empleados</option>
              <option value="client">Clientes</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users table */}
      <div className="card overflow-hidden border border-slate-200/80 shadow-sm">
        {loading ? (
          <div className="p-16 text-center text-slate-400">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium">Cargando cuentas...</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                  <tr>
                    <th className="p-4">Usuario</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Rol</th>
                    <th className="p-4">Permisos Habilitados</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-slate-400">
                        No se encontraron usuarios registrados.
                      </td>
                    </tr>
                  )}
                  {filteredUsers.map(u => {
                    const enabledPermCount = u.role === 'owner' 
                      ? 'Acceso Total' 
                      : u.role === 'employee' 
                        ? `${Object.values(u.permissions || {}).filter(Boolean).length} permisos`
                        : 'Ninguno';
                    
                    return (
                      <tr key={u.uid} className="hover:bg-slate-50/30 transition-colors">
                        <td className="p-4">
                          <p className="font-bold text-slate-800 text-sm">{u.displayName}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase">UID: #{u.uid.slice(0,8).toUpperCase()}</p>
                        </td>
                        <td className="p-4 font-mono text-slate-500">{u.email}</td>
                        <td className="p-4">{getRoleBadge(u.role)}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            u.role === 'owner' 
                              ? 'bg-red-50 text-red-600 border border-red-100'
                              : u.role === 'employee'
                                ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                : 'bg-slate-100 text-slate-400 border border-slate-200'
                          }`}>
                            {enabledPermCount}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button 
                            onClick={() => handleOpenEdit(u)}
                            disabled={u.role === 'owner'}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
                            title={u.role === 'owner' ? 'Propietario Principal' : 'Editar Rol / Permisos'}
                          >
                            <Edit2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="block md:hidden divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  No se encontraron usuarios registrados.
                </div>
              ) : (
                filteredUsers.map(u => {
                  const enabledPermCount = u.role === 'owner' 
                    ? 'Acceso Total' 
                    : u.role === 'employee' 
                      ? `${Object.values(u.permissions || {}).filter(Boolean).length} permisos`
                      : 'Ninguno';
                  
                  return (
                    <div key={u.uid} className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{u.displayName}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase">UID: #{u.uid.slice(0,8).toUpperCase()}</p>
                        </div>
                        <div>
                          {getRoleBadge(u.role)}
                        </div>
                      </div>
                      
                      <div className="space-y-1 text-xs">
                        <p className="text-slate-500 font-mono break-all">
                          <span className="font-semibold text-slate-400 text-[10px] uppercase">Email: </span>
                          {u.email}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="font-semibold text-slate-400 text-[10px] uppercase">Permisos:</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            u.role === 'owner' 
                              ? 'bg-red-50 text-red-600 border border-red-100'
                              : u.role === 'employee'
                                ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                : 'bg-slate-100 text-slate-400 border border-slate-200'
                          }`}>
                            {enabledPermCount}
                          </span>
                        </div>
                      </div>

                      {u.role !== 'owner' && (
                        <div className="flex justify-end pt-2 border-t border-slate-100">
                          <button 
                            onClick={() => handleOpenEdit(u)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 text-slate-600 rounded-lg text-xs font-bold transition-colors border border-slate-200 hover:border-blue-200"
                          >
                            <Edit2 size={13} />
                            Editar Acceso
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Permissions Edit Modal */}
      {isModalOpen && selectedUser && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto animate-fadeIn" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 border border-slate-100 my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-800">
                  Editar Acceso: {selectedUser.displayName}
                </h2>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">{selectedUser.email}</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 text-xs">
              {/* Role Selection */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-2">
                <label className="input-label font-bold text-slate-500 uppercase">Rol del Usuario</label>
                <div className="flex gap-4">
                  {(['client', 'employee'] as const).map(role => (
                    <label 
                      key={role}
                      className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer select-none"
                    >
                      <input 
                        type="radio" 
                        name="userRole" 
                        value={role}
                        checked={selectedRole === role}
                        onChange={() => setSelectedRole(role)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="capitalize">{role === 'client' ? 'Cliente' : 'Empleado'}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Permissions Grid (only if selectedRole is employee) */}
              {selectedRole === 'employee' ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-blue-50/50 p-3 rounded-lg border border-blue-100 text-blue-700">
                    <p className="font-bold flex items-center gap-1.5">
                      <ShieldAlert size={14} /> Permisos Granulares
                    </p>
                    <p className="text-[10px] font-semibold">Tilda los módulos a los que el empleado tendrá acceso.</p>
                  </div>

                  {/* Grouped permissions */}
                  {Array.from(new Set(permissionsList.map(p => p.group))).map(group => {
                    const groupPerms = permissionsList.filter(p => p.group === group);
                    return (
                      <div key={group} className="space-y-2">
                        <h4 className="font-bold text-slate-400 uppercase tracking-wider border-b pb-1">
                          {group}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {groupPerms.map(p => {
                            const isChecked = !!permissions[p.key];
                            return (
                              <button
                                key={p.key}
                                type="button"
                                onClick={() => handleTogglePermission(p.key)}
                                className={`flex items-center gap-2.5 p-2 rounded-xl text-left border transition-all ${
                                  isChecked 
                                    ? 'bg-blue-50/20 border-blue-200 text-slate-800' 
                                    : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50/30'
                                }`}
                              >
                                {isChecked ? (
                                  <CheckSquare size={16} className="text-blue-600 flex-shrink-0" />
                                ) : (
                                  <Square size={16} className="text-slate-300 flex-shrink-0" />
                                )}
                                <span className="font-semibold text-[11px] leading-tight">{p.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center text-slate-400 border border-slate-200 border-dashed rounded-xl">
                  Los clientes no tienen permisos administrativos y solo acceden a la interfaz pública de catálogo y compras.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t pt-4 mt-6">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSave}
                className="btn-primary"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Employee Modal */}
      {isAddModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto animate-fadeIn" onClick={() => setIsAddModalOpen(false)}>
          <form onSubmit={handleAddUser} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 border border-slate-100 my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-800">
                  Agregar Nuevo Colaborador
                </h2>
                <p className="text-[10px] text-slate-400 mt-0.5">Registra un nuevo usuario con rol administrativo o cliente</p>
              </div>
              <button 
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tabs selector */}
            <div className="flex border-b border-slate-100 mb-5">
              <button
                type="button"
                className={`flex-1 pb-3 text-xs font-bold transition-all border-b-2 text-center ${
                  modalTab === 'link-client' 
                    ? 'border-blue-600 text-blue-600 font-extrabold' 
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
                onClick={() => {
                  setModalTab('link-client');
                  setAddError('');
                  setClientSearchTerm('');
                }}
              >
                Vincular desde Clientes
              </button>
              <button
                type="button"
                className={`flex-1 pb-3 text-xs font-bold transition-all border-b-2 text-center ${
                  modalTab === 'promote' 
                    ? 'border-blue-600 text-blue-600 font-extrabold' 
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
                onClick={() => {
                  setModalTab('promote');
                  setAddError('');
                  setUserSearchTerm('');
                }}
              >
                Promover Usuario Registrado
              </button>
            </div>

            {addError && (
              <div className="p-3 mb-4 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100">
                {addError}
              </div>
            )}

            <div className="space-y-5 text-xs">
              {modalTab === 'link-client' ? (
                <div className="space-y-4">
                  {/* Search Input for Clients */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Buscar Cliente</label>
                    <input
                      type="text"
                      placeholder="Escribe el nombre o correo del cliente..."
                      className="input w-full text-xs mb-2"
                      value={clientSearchTerm}
                      onChange={(e) => setClientSearchTerm(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Seleccionar Cliente Existente</label>
                    {(() => {
                      const filtered = clients.filter(c => !c.userId && !users.some(u => u.email && c.email && u.email.toLowerCase() === c.email.toLowerCase()));
                      const matching = filtered.filter(c => 
                        `${c.firstName} ${c.lastName}`.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                        (c.email && c.email.toLowerCase().includes(clientSearchTerm.toLowerCase()))
                      );

                      if (matching.length === 0) {
                        return (
                          <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg text-slate-400 text-center text-xs">
                            {clientSearchTerm 
                              ? 'No se encontraron clientes que coincidan con la búsqueda.' 
                              : 'No hay clientes registrados en "Gestión de Clientes" disponibles para vincular.'}
                          </div>
                        );
                      }

                      return (
                        <select
                          value={selectedClientIdToLink}
                          onChange={(e) => {
                            setSelectedClientIdToLink(e.target.value);
                            setAddLinkEmail('');
                          }}
                          className="input w-full text-xs"
                          required
                        >
                          <option value="">-- Elige un cliente ({matching.length} disponibles) --</option>
                          {matching.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.firstName} {c.lastName} {c.email ? `(${c.email})` : '(Sin email registrado)'}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>

                  {/* Conditional inputs depending on chosen client */}
                  {(() => {
                    const selectedClient = clients.find(c => c.id === selectedClientIdToLink);
                    if (!selectedClient) return null;

                    const needsEmail = !selectedClient.email;
                    return (
                      <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                        <div>
                          <p className="font-semibold text-slate-700">Cliente Seleccionado: <span className="font-bold text-slate-900">{selectedClient.firstName} {selectedClient.lastName}</span></p>
                          {selectedClient.email ? (
                            <p className="text-slate-500 mt-0.5">Email Registrado: <span className="font-semibold font-mono">{selectedClient.email}</span></p>
                          ) : (
                            <p className="text-amber-600 font-semibold mt-0.5">⚠️ Este cliente no tiene correo electrónico asignado. Debes ingresarle uno ahora para crear su acceso.</p>
                          )}
                        </div>

                        {needsEmail && (
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Asignar Correo Electrónico (Requerido)</label>
                            <input
                              type="email"
                              required
                              value={addLinkEmail}
                              onChange={(e) => setAddLinkEmail(e.target.value)}
                              className="input w-full bg-white text-xs"
                              placeholder="correo@ejemplo.com"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Asignar Contraseña de Acceso</label>
                          <input
                            type="password"
                            required
                            value={addPassword}
                            onChange={(e) => setAddPassword(e.target.value)}
                            className="input w-full bg-white text-xs"
                            placeholder="Mínimo 6 caracteres"
                          />
                        </div>
                      </div>
                    );
                  })()}
                  <p className="text-[10px] text-slate-400 mt-1.5 font-medium leading-relaxed">
                    * Nota: Esta pestaña lista los clientes guardados en la sección "Clientes". Al elegir uno y ponerle contraseña, se creará su cuenta de usuario automáticamente para que pueda iniciar sesión como empleado.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Search Input for Users */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Buscar Usuario Registrado</label>
                    <input
                      type="text"
                      placeholder="Escribe el nombre o correo del usuario..."
                      className="input w-full text-xs mb-2"
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Seleccionar Usuario Registrado</label>
                    {(() => {
                      const filtered = users.filter(u => u.role !== 'owner' && u.role !== 'employee');
                      const matching = filtered.filter(u => 
                        (u.displayName || '').toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                        (u.email || '').toLowerCase().includes(userSearchTerm.toLowerCase())
                      );

                      if (matching.length === 0) {
                        return (
                          <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg text-slate-400 text-center text-xs">
                            {userSearchTerm 
                              ? 'No se encontraron usuarios que coincidan con la búsqueda.' 
                              : 'No hay usuarios registrados con el rol "Cliente" o "Invitado" disponibles para promover.'}
                          </div>
                        );
                      }

                      return (
                        <select
                          value={selectedUserIdToPromote}
                          onChange={(e) => setSelectedUserIdToPromote(e.target.value)}
                          className="input w-full text-xs"
                          required
                        >
                          <option value="">-- Elige un usuario ({matching.length} disponibles) --</option>
                          {matching.map(u => (
                            <option key={u.uid} value={u.uid}>
                              {u.displayName || 'Sin nombre'} ({u.email})
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 font-medium leading-relaxed">
                    * Nota: Esta pestaña lista los usuarios que ya se crearon una cuenta por su cuenta en la web.
                  </p>
                </div>
              )}

              {/* Role Selection */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-2">
                <label className="input-label font-bold text-slate-500 uppercase">Rol del Usuario</label>
                <div className="flex gap-4">
                  {(['client', 'employee'] as const).map(role => (
                    <label 
                      key={role}
                      className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer select-none"
                    >
                      <input 
                        type="radio" 
                        name="addRole" 
                        value={role}
                        checked={addRole === role}
                        onChange={() => setAddRole(role)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="capitalize">{role === 'client' ? 'Cliente' : 'Empleado'}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Permissions Grid (only if addRole is employee) */}
              {addRole === 'employee' ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-blue-50/50 p-3 rounded-lg border border-blue-100 text-blue-700">
                    <p className="font-bold flex items-center gap-1.5">
                      <ShieldAlert size={14} /> Permisos Granulares
                    </p>
                    <p className="text-[10px] font-semibold">Tilda los módulos a los que el empleado tendrá acceso.</p>
                  </div>

                  {/* Grouped permissions */}
                  {Array.from(new Set(permissionsList.map(p => p.group))).map(group => {
                    const groupPerms = permissionsList.filter(p => p.group === group);
                    return (
                      <div key={group} className="space-y-2">
                        <h4 className="font-bold text-slate-400 uppercase tracking-wider border-b pb-1">
                          {group}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {groupPerms.map(p => {
                            const isChecked = !!addPermissions[p.key];
                            return (
                              <button
                                key={p.key}
                                type="button"
                                onClick={() => {
                                  setAddPermissions(prev => ({
                                    ...prev,
                                    [p.key]: !prev[p.key]
                                  }));
                                }}
                                className={`flex items-center gap-2.5 p-2 rounded-xl text-left border transition-all ${
                                  isChecked 
                                    ? 'bg-blue-50/20 border-blue-200 text-slate-800' 
                                    : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50/30'
                                }`}
                              >
                                {isChecked ? (
                                  <CheckSquare size={16} className="text-blue-600 flex-shrink-0" />
                                ) : (
                                  <Square size={16} className="text-slate-300 flex-shrink-0" />
                                )}
                                <span className="font-semibold text-[11px] leading-tight">{p.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 border border-slate-200 border-dashed rounded-xl">
                  Los clientes no tienen permisos administrativos y solo acceden a la interfaz pública de catálogo y compras.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t pt-4 mt-6">
              <button 
                type="button" 
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl font-semibold transition-colors"
                disabled={addLoading}
              >
                Cancelar
              </button>
              <button 
                type="submit"
                disabled={addLoading}
                className="btn-primary flex items-center gap-1.5"
              >
                {addLoading ? 'Creando...' : 'Crear Colaborador'}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
};

