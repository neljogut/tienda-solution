import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { AppNotification } from '../types/notification';
import { markAllNotificationsRead, markNotificationRead } from '../services/notificationService';

export function useNotifications(uid: string | undefined) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!uid) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    // Solo filtro por usuario — ordenamos en cliente para no depender de índice compuesto
    const q = query(collection(db, 'notifications'), where('recipientUid', '==', uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: AppNotification[] = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as AppNotification)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 50);

        if (initializedRef.current && 'Notification' in window && Notification.permission === 'granted') {
          for (const notif of list) {
            if (!notif.read && !knownIdsRef.current.has(notif.id)) {
              try {
                new Notification(notif.title, {
                  body: notif.body.split('\n').slice(0, 3).join(' · '),
                  tag: notif.id,
                });
              } catch {
                // ignore browser notification errors
              }
            }
          }
        }

        list.forEach((n) => knownIdsRef.current.add(n.id));
        initializedRef.current = true;
        setNotifications(list);
        setLoading(false);
      },
      (err) => {
        // Errores transitorios de red/Firestore (p. ej. pestaña inactiva en Edge)
        if (import.meta.env.DEV) {
          console.warn('Notificaciones: reconectando...', err);
        }
        setLoading(false);
      }
    );

    return unsub;
  }, [uid]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = useCallback(async (id: string) => {
    await markNotificationRead(id);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!uid) return;
    await markAllNotificationsRead(uid);
  }, [uid]);

  const requestBrowserPermission = useCallback(async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    requestBrowserPermission,
  };
}
