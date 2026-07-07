import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { AppNotification } from '../types/notification';
import { markAllNotificationsRead, markNotificationRead, clearAllNotifications } from '../services/notificationService';
import {
  playNotificationSound,
  showSystemNotification,
  requestNotificationPermission,
  unlockNotificationAudio,
} from '../utils/notificationAlert';

export function useNotifications(uid: string | undefined) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestAlert, setLatestAlert] = useState<AppNotification | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const dismissAlert = useCallback(() => setLatestAlert(null), []);

  useEffect(() => {
    if (!uid) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'notifications'), where('recipientUid', '==', uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: AppNotification[] = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as AppNotification)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 50);

        const newUnread = list.filter((n) => !n.read && !knownIdsRef.current.has(n.id));

        if (initializedRef.current && newUnread.length > 0) {
          const newest = newUnread[0];
          setLatestAlert(newest);
          window.setTimeout(() => setLatestAlert((cur) => (cur?.id === newest.id ? null : cur)), 12000);

          unlockNotificationAudio();
          void playNotificationSound();

          if ('Notification' in window && Notification.permission === 'granted') {
            for (const notif of newUnread) {
              void showSystemNotification({
                title: notif.title,
                body: notif.body.split('\n').slice(0, 3).join(' · '),
                tag: notif.id,
                linkPath: notif.linkPath,
                orderId: notif.orderId || undefined,
              });
            }
          }
        }

        list.forEach((n) => knownIdsRef.current.add(n.id));
        initializedRef.current = true;
        setNotifications(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error escuchando notificaciones:', err);
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
    setLatestAlert(null);
  }, [uid]);

  const clearNotifications = useCallback(async () => {
    if (!uid) return;
    await clearAllNotifications(uid);
    setLatestAlert(null);
  }, [uid]);

  const requestBrowserPermission = useCallback(async () => {
    return requestNotificationPermission();
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    latestAlert,
    dismissAlert,
    markRead,
    markAllRead,
    clearNotifications,
    requestBrowserPermission,
  };
}
