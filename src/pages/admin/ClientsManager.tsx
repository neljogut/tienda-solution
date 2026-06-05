import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Client, ClientType } from '../../types/client';
import {
  Users, Plus, Search, Edit, Trash2, Phone, Mail, MapPin,
  Crown, Shield, Star, X, ChevronUp, Eye, UserPlus
} from 'lucide-react';

/* ─────────────────────────── helpers ─────────────────────────── */

const CLIENT_TYPE_CONFIG: Record<ClientType, { label: string; badge: string; icon: React.ReactNode }> = {
  normal:    { label: 'Normal',    badge: 'badge badge-blue',   icon: <Star size={12} /> },
  wholesale: { label: 'Mayorista', badge: 'badge badge-purple', icon: <Crown size={12} /> },
  trusted:   { label: 'Confianza', badge: 'badge badge-yellow', icon: <Shield size={12} /> },
};

const emptyForm = (): Omit<Client, 'id' | 'createdAt' | 'totalPurchased' | 'totalOwed'> => ({
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  province: '',
  postalCode: '',
  cuit: '',
  clientType: 'normal',
  observations: '',
});

/* ─────────────────────────── component ─────────────────────────── */

export const ClientsManager: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<ClientType | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  /* ── real-time listener ── */
  useEffect(() => {
    const q = query(collection(db, 'clients'), orderBy('lastName', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Client[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Client);
      });
      setClients(list);
    });
    return () => unsubscribe();
  }, []);

  /* ── filtered list ── */
  const filtered = useMemo(() => {
    let result = clients;
    if (filterType !== 'all') {
      result = result.filter((c) => c.clientType === filterType);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (c) =>
          c.firstName.toLowerCase().includes(term) ||
          c.lastName.toLowerCase().includes(term) ||
          (c.phone && c.phone.includes(term)) ||
          (c.email && c.email.toLowerCase().includes(term)) ||
          (c.cuit && c.cuit.includes(term))
      );
    }
    return result;
  }, [clients, filterType, searchTerm]);

  /* ── modal helpers ── */
  const openAdd = () => {
    setEditingClient(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setForm({
      firstName: client.firstName,
      lastName: client.lastName,
      phone: client.phone || '',
      email: client.email || '',
      address: client.address || '',
      city: client.city || '',
      province: client.province || '',
      postalCode: client.postalCode || '',
      cuit: client.cuit || '',
      clientType: client.clientType,
      observations: client.observations || '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingClient(null);
    setForm(emptyForm());
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  /* ── save (add / edit) ── */
  const handleSave = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone?.trim() || '',
        email: form.email?.trim() || '',
        address: form.address?.trim() || '',
        city: form.city?.trim() || '',
        province: form.province?.trim() || '',
        postalCode: form.postalCode?.trim() || '',
        cuit: form.cuit?.trim() || '',
        clientType: form.clientType,
        observations: form.observations?.trim() || '',
      };

      if (editingClient) {
        await updateDoc(doc(db, 'clients', editingClient.id), data);
      } else {
        await addDoc(collection(db, 'clients'), {
          ...data,
          createdAt: new Date().toISOString(),
          totalPurchased: 0,
          totalOwed: 0,
        });
      }
      closeModal();
    } catch (err) {
      console.error('Error al guardar cliente:', err);
    } finally {
      setSaving(false);
    }
  };

  /* ── delete ── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'clients', deleteTarget.id));
    } catch (err) {
      console.error('Error al eliminar cliente:', err);
    } finally {
      setDeleteTarget(null);
    }
  };

  /* ── render ── */
  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users size={26} className="text-blue-600" />
            Gestión de Clientes
          </h1>
          <p className="page-subtitle">
            Administra tu cartera de clientes, datos de contacto y tipo de cliente.
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus size={20} />
          Nuevo Cliente
        </button>
      </div>

      {/* ─── Search & Filter Bar ─── */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-1 w-full">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono, email o CUIT..."
            className="input pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {(['all', 'normal', 'wholesale', 'trusted'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                filterType === t
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t === 'all' ? 'Todos' : CLIENT_TYPE_CONFIG[t].label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Clients Count ─── */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Users size={16} />
        <span>
          {filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'}
          {filterType !== 'all' && ` (${CLIENT_TYPE_CONFIG[filterType].label})`}
          {searchTerm && ` — búsqueda: "${searchTerm}"`}
        </span>
      </div>

      {/* ─── Client Table ─── */}
      <div className="table-container">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="table-header">
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th>Ciudad</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12">
                    <div className="flex flex-col items-center justify-center text-slate-400 gap-3">
                      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                        <UserPlus size={28} className="text-slate-300" />
                      </div>
                      <p className="font-medium text-slate-500">
                        {searchTerm || filterType !== 'all'
                          ? 'No se encontraron clientes con esos filtros.'
                          : 'Aún no hay clientes registrados.'}
                      </p>
                      {!searchTerm && filterType === 'all' && (
                        <button onClick={openAdd} className="btn-primary text-sm flex items-center gap-2 mt-1">
                          <Plus size={16} /> Agregar primer cliente
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((client) => {
                  const cfg = CLIENT_TYPE_CONFIG[client.clientType];
                  const isExpanded = expandedId === client.id;
                  return (
                    <React.Fragment key={client.id}>
                      {/* Main Row */}
                      <tr className="table-row group">
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                              {client.firstName[0]}{client.lastName[0]}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800">
                                {client.lastName}, {client.firstName}
                              </p>
                              {client.cuit && (
                                <p className="text-xs text-slate-400">CUIT: {client.cuit}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={cfg.badge}>
                            {cfg.icon}
                            {cfg.label}
                          </span>
                        </td>
                        <td>
                          {client.phone ? (
                            <span className="flex items-center gap-1.5 text-sm text-slate-600">
                              <Phone size={14} className="text-slate-400" />
                              {client.phone}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                        <td>
                          {client.email ? (
                            <span className="flex items-center gap-1.5 text-sm text-slate-600">
                              <Mail size={14} className="text-slate-400" />
                              {client.email}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                        <td>
                          {client.city ? (
                            <span className="flex items-center gap-1.5 text-sm text-slate-600">
                              <MapPin size={14} className="text-slate-400" />
                              {client.city}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                        <td>
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : client.id)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Ver detalle"
                            >
                              {isExpanded ? <ChevronUp size={18} /> : <Eye size={18} />}
                            </button>
                            <button
                              onClick={() => openEdit(client)}
                              className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <Edit size={18} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(client)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Detail Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={6} className="px-6 py-5">
                            <div className="animate-fadeIn grid grid-cols-1 md:grid-cols-3 gap-6">
                              {/* Personal Data */}
                              <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                  Datos Personales
                                </h4>
                                <div className="space-y-2 text-sm">
                                  <p>
                                    <span className="text-slate-400">Nombre:</span>{' '}
                                    <span className="font-medium text-slate-700">{client.firstName} {client.lastName}</span>
                                  </p>
                                  {client.cuit && (
                                    <p>
                                      <span className="text-slate-400">CUIT:</span>{' '}
                                      <span className="font-medium text-slate-700">{client.cuit}</span>
                                    </p>
                                  )}
                                  {client.phone && (
                                    <p className="flex items-center gap-1.5">
                                      <Phone size={13} className="text-slate-400" />
                                      <span className="font-medium text-slate-700">{client.phone}</span>
                                    </p>
                                  )}
                                  {client.email && (
                                    <p className="flex items-center gap-1.5">
                                      <Mail size={13} className="text-slate-400" />
                                      <span className="font-medium text-slate-700">{client.email}</span>
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Address */}
                              <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                  Dirección
                                </h4>
                                <div className="space-y-2 text-sm">
                                  {client.address && (
                                    <p className="flex items-center gap-1.5">
                                      <MapPin size={13} className="text-slate-400" />
                                      <span className="font-medium text-slate-700">{client.address}</span>
                                    </p>
                                  )}
                                  {(client.city || client.province) && (
                                    <p>
                                      <span className="text-slate-400">Localidad:</span>{' '}
                                      <span className="font-medium text-slate-700">
                                        {[client.city, client.province].filter(Boolean).join(', ')}
                                      </span>
                                    </p>
                                  )}
                                  {client.postalCode && (
                                    <p>
                                      <span className="text-slate-400">C.P.:</span>{' '}
                                      <span className="font-medium text-slate-700">{client.postalCode}</span>
                                    </p>
                                  )}
                                  {!client.address && !client.city && !client.province && !client.postalCode && (
                                    <p className="text-slate-300 italic">Sin dirección registrada</p>
                                  )}
                                </div>
                              </div>

                              {/* Account Info */}
                              <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                  Cuenta
                                </h4>
                                <div className="space-y-2 text-sm">
                                  <p>
                                    <span className="text-slate-400">Tipo:</span>{' '}
                                    <span className={cfg.badge}>
                                      {cfg.icon}
                                      {cfg.label}
                                    </span>
                                  </p>
                                  <p>
                                    <span className="text-slate-400">Total comprado:</span>{' '}
                                    <span className="font-bold text-emerald-600">
                                      ${(client.totalPurchased ?? 0).toLocaleString('es-AR')}
                                    </span>
                                  </p>
                                  <p>
                                    <span className="text-slate-400">Total adeudado:</span>{' '}
                                    <span className={`font-bold ${(client.totalOwed ?? 0) > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                                      ${(client.totalOwed ?? 0).toLocaleString('es-AR')}
                                    </span>
                                  </p>
                                  <p>
                                    <span className="text-slate-400">Registrado:</span>{' '}
                                    <span className="font-medium text-slate-700">
                                      {client.createdAt
                                        ? new Date(client.createdAt).toLocaleDateString('es-AR', {
                                            day: '2-digit',
                                            month: 'long',
                                            year: 'numeric',
                                          })
                                        : '—'}
                                    </span>
                                  </p>
                                </div>
                                {client.observations && (
                                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                                    <span className="font-semibold">Observaciones:</span> {client.observations}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════ Add / Edit Modal ══════════════ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeModal} />

          {/* Modal Panel */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  {editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {editingClient
                    ? `Editando datos de ${editingClient.firstName} ${editingClient.lastName}`
                    : 'Completa los datos del nuevo cliente'}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* Name row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="input-label">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="firstName"
                    className="input"
                    placeholder="Ej: Juan"
                    value={form.firstName}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label className="input-label">
                    Apellido <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="lastName"
                    className="input"
                    placeholder="Ej: Pérez"
                    value={form.lastName}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Contact row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Teléfono</label>
                  <input
                    name="phone"
                    className="input"
                    placeholder="Ej: 3515551234"
                    value={form.phone}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label className="input-label">Email</label>
                  <input
                    name="email"
                    type="email"
                    className="input"
                    placeholder="Ej: cliente@email.com"
                    value={form.email}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Address row */}
              <div>
                <label className="input-label">Dirección</label>
                <input
                  name="address"
                  className="input"
                  placeholder="Ej: Av. Colón 1234"
                  value={form.address}
                  onChange={handleChange}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="input-label">Ciudad</label>
                  <input
                    name="city"
                    className="input"
                    placeholder="Ej: Córdoba"
                    value={form.city}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label className="input-label">Provincia</label>
                  <input
                    name="province"
                    className="input"
                    placeholder="Ej: Córdoba"
                    value={form.province}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label className="input-label">Código Postal</label>
                  <input
                    name="postalCode"
                    className="input"
                    placeholder="Ej: 5000"
                    value={form.postalCode}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* CUIT + Client Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="input-label">CUIT</label>
                  <input
                    name="cuit"
                    className="input"
                    placeholder="Ej: 20-12345678-9"
                    value={form.cuit}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label className="input-label">Tipo de Cliente</label>
                  <select
                    name="clientType"
                    className="input"
                    value={form.clientType}
                    onChange={handleChange}
                  >
                    <option value="normal">Normal</option>
                    <option value="wholesale">Mayorista</option>
                    <option value="trusted">Confianza</option>
                  </select>
                </div>
              </div>

              {/* Observations */}
              <div>
                <label className="input-label">Observaciones</label>
                <textarea
                  name="observations"
                  className="input min-h-[80px] resize-y"
                  placeholder="Notas internas sobre el cliente..."
                  value={form.observations}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-6 border-t border-slate-100">
              <button onClick={closeModal} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!form.firstName.trim() || !form.lastName.trim() || saving}
                className="btn-primary flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Guardando...
                  </>
                ) : editingClient ? (
                  'Guardar Cambios'
                ) : (
                  <>
                    <Plus size={18} />
                    Crear Cliente
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ Delete Confirmation Modal ══════════════ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fadeIn p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
                <Trash2 size={24} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">¿Eliminar cliente?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Estás a punto de eliminar a{' '}
                  <span className="font-semibold text-slate-700">
                    {deleteTarget.firstName} {deleteTarget.lastName}
                  </span>
                  . Esta acción no se puede deshacer.
                </p>
              </div>
              <div className="flex gap-3 w-full mt-2">
                <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button onClick={handleDelete} className="btn-danger flex-1">
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
