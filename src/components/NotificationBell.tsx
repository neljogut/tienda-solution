import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Loader2, Package } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import type { AppNotification } from '../types/notification';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} d`;
}

export const NotificationBell: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    requestBrowserPermission,
  } = useNotifications(currentUser?.uid);

  useEffect(() => {
    if (currentUser) {
      void requestBrowserPermission();
    }
  }, [currentUser, requestBrowserPermission]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const handleSelect = async (notif: AppNotification) => {
    if (!notif.read) await markRead(notif.id);
    setOpen(false);
    navigate(notif.linkPath);
  };

  if (!currentUser) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        title="Notificaciones"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center shadow-lg">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(92vw,22rem)] bg-white rounded-2xl shadow-2xl border border-slate-200/80 z-50 overflow-hidden animate-fadeIn">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/80">
            <p className="text-sm font-bold text-slate-800">Notificaciones</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <CheckCheck size={14} />
                Marcar leídas
              </button>
            )}
          </div>

          <div className="max-h-[min(60vh,24rem)] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10 text-slate-400">
                <Loader2 size={22} className="animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10 px-4">
                No tenés notificaciones por ahora.
              </p>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => void handleSelect(notif)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-blue-50/40 transition-colors ${
                    !notif.read ? 'bg-blue-50/20' : ''
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${!notif.read ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                      <Package size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-snug ${!notif.read ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                        {notif.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 whitespace-pre-line line-clamp-3">
                        {notif.body}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1.5">{timeAgo(notif.createdAt)}</p>
                    </div>
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
