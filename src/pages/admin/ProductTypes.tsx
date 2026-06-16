import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface ProductTypeDoc {
  id: string;
  name: string;
  isSystem?: boolean;
  createdAt?: string;
}

export const ProductTypes: React.FC = () => {
  const navigate = useNavigate();
  const { userData } = useAuth();
  const [types, setTypes] = useState<ProductTypeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editId, setEditId] = useState('');
  const [typeName, setTypeName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'product_types'), async (snapshot) => {
      if (snapshot.empty) {
        // Self-initialize default types if collection is empty
        const defaults = [
          { id: '3d', name: 'Impresión 3D', isSystem: true, createdAt: new Date().toISOString() },
          { id: 'resale', name: 'Productos Varios', isSystem: false, createdAt: new Date().toISOString() }
        ];
        for (const t of defaults) {
          await setDoc(doc(db, 'product_types', t.id), t);
        }
      } else {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProductTypeDoc));
        const sorted = list.sort((a, b) => {
          if (a.id === '3d') return -1;
          if (b.id === '3d') return 1;
          return a.name.localeCompare(b.name, 'es');
        });
        setTypes(sorted);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenCreate = () => {
    setModalMode('create');
    setEditId('');
    setTypeName('');
    setError('');
    setShowModal(true);
  };

  const handleOpenEdit = (t: ProductTypeDoc) => {
    if (t.isSystem) return;
    setModalMode('edit');
    setEditId(t.id);
    setTypeName(t.name);
    setError('');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrimmed = typeName.trim();
    if (!nameTrimmed) return;

    setSaving(true);
    setError('');

    try {
      if (modalMode === 'create') {
        const slug = nameTrimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (!slug || slug === '3d') {
          setError('El nombre elegido genera un identificador no permitido.');
          setSaving(false);
          return;
        }

        // Check if ID already exists
        const exists = types.some(t => t.id === slug);
        if (exists) {
          setError('Ya existe un tipo de producto con un nombre similar.');
          setSaving(false);
          return;
        }

        await setDoc(doc(db, 'product_types', slug), {
          id: slug,
          name: nameTrimmed,
          isSystem: false,
          createdAt: new Date().toISOString()
        });
      } else {
        // Edit mode
        await setDoc(doc(db, 'product_types', editId), {
          name: nameTrimmed
        }, { merge: true });
      }

      setShowModal(false);
    } catch (err) {
      console.error(err);
      setError('Error al guardar el tipo de producto.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: ProductTypeDoc) => {
    if (t.isSystem) return;

    // Check if any product is currently using this type
    setLoading(true);
    try {
      const q = query(collection(db, 'products'), where('type', '==', t.id));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        alert(`No se puede eliminar el tipo "${t.name}" porque está siendo usado por ${snap.size} producto(s). Primero cambiá el tipo de esos productos.`);
        setLoading(false);
        return;
      }

      if (window.confirm(`¿Estás seguro de que querés eliminar el tipo de producto "${t.name}"?`)) {
        await deleteDoc(doc(db, 'product_types', t.id));
      }
    } catch (err) {
      console.error(err);
      alert('Error al eliminar el tipo de producto.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 size={40} className="animate-spin text-blue-500 mb-4" />
        <p className="text-slate-500">Cargando tipos de producto...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/60 pb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="page-title">Tipos de Producto</h1>
            <p className="page-subtitle">Gestioná las clasificaciones de productos para tu inventario</p>
          </div>
        </div>
        <button onClick={handleOpenCreate} className="btn-primary py-2.5 px-4 text-sm flex items-center justify-center gap-2">
          <Plus size={18} /> Agregar Tipo
        </button>
      </div>

      {/* Grid/Table List */}
      <div className="card overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
              <th className="p-4">Nombre</th>
              <th className="p-4">Identificador</th>
              <th className="p-4">Sistema</th>
              <th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {types.map(t => (
              <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-4 font-semibold text-slate-800">{t.name}</td>
                <td className="p-4 text-slate-500 font-mono text-xs">{t.id}</td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.isSystem ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                    {t.isSystem ? 'Sistema' : 'Personalizado'}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {!t.isSystem ? (
                      <>
                        <button
                          onClick={() => handleOpenEdit(t)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-blue-600 transition-colors"
                          title="Editar nombre"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(t)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-red-600 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400 italic px-2">Bloqueado</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-scaleUp">
            <h3 className="text-lg font-bold text-slate-900 border-b pb-2">
              {modalMode === 'create' ? 'Nuevo Tipo de Producto' : 'Editar Tipo de Producto'}
            </h3>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase">Nombre</label>
              <input
                type="text"
                required
                className="input"
                placeholder="Ej. Regalos, Sublimación"
                value={typeName}
                onChange={e => setTypeName(e.target.value)}
                autoFocus
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn-secondary py-2 px-4 text-sm"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary py-2 px-4 text-sm flex items-center gap-1.5"
                disabled={saving || !typeName.trim()}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
