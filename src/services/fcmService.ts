import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import {
  getMessaging,
  getToken,
  deleteToken,
  isSupported,
  onMessage,
  type Messaging,
} from 'firebase/messaging';
import { app, db, firebaseConfig } from '../firebase';
import { playNotificationSound, showSystemNotification } from '../utils/notificationAlert';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

let messagingInstance: Messaging | null = null;
let currentRegisteredUid: string | null = null;
let currentToken: string | null = null;
let registerInFlight: Promise<boolean> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientPushError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === 'AbortError' ||
    msg.includes('push service error') ||
    msg.includes('failed to register') ||
    msg.includes('service worker')
  );
}

async function getMessagingInstance(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  const supported = await isSupported();
  if (!supported) return null;
  messagingInstance = getMessaging(app);
  return messagingInstance;
}

function tokenDocId(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = (hash << 5) - hash + token.charCodeAt(i);
    hash |= 0;
  }
  return `t_${Math.abs(hash).toString(36)}`;
}

async function saveToken(uid: string, token: string): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'fcm_tokens', tokenDocId(token)), {
    token,
    platform: navigator.userAgent,
    updatedAt: new Date().toISOString(),
    createdAt: serverTimestamp(),
  });
}

async function removeToken(uid: string, token: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'fcm_tokens', tokenDocId(token)));
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  let registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }
  await navigator.serviceWorker.ready;
  return registration;
}

async function clearPushSubscription(swReg: ServiceWorkerRegistration): Promise<void> {
  try {
    const sub = await swReg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch {
    // ignore
  }
}

async function registerFcmTokenInternal(uid: string): Promise<boolean> {
  if (!uid || !VAPID_KEY) return false;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  if (Notification.permission === 'denied') return false;

  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;
  }

  const messaging = await getMessagingInstance();
  if (!messaging) return false;

  const swReg = await getServiceWorkerRegistration();

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      if (attempt > 0) {
        await deleteToken(messaging).catch(() => {});
        await clearPushSubscription(swReg);
        await sleep(800 * attempt);
      }

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });

      if (!token) return false;

      if (currentRegisteredUid && currentToken && currentRegisteredUid !== uid) {
        await removeToken(currentRegisteredUid, currentToken).catch(() => {});
      }

      if (currentToken !== token || currentRegisteredUid !== uid) {
        await saveToken(uid, token);
        currentToken = token;
        currentRegisteredUid = uid;
        console.info('[FCM] Token registrado correctamente para push nativo.');
      }

      return true;
    } catch (err) {
      if (isTransientPushError(err) && attempt < 3) continue;
      console.warn('[FCM] No se pudo registrar token:', err);
      return false;
    }
  }

  return false;
}

/** Registra el dispositivo para push FCM (funciona con app cerrada). */
export async function registerFcmToken(uid: string, force = false): Promise<boolean> {
  if (!force && currentToken && currentRegisteredUid === uid) return true;
  if (registerInFlight) return registerInFlight;

  registerInFlight = registerFcmTokenInternal(uid).finally(() => {
    registerInFlight = null;
  });

  return registerInFlight;
}

export async function unregisterFcmToken(uid: string): Promise<void> {
  if (!uid || !currentToken) return;
  try {
    await removeToken(uid, currentToken);
    const messaging = await getMessagingInstance();
    if (messaging) await deleteToken(messaging).catch(() => {});
  } catch {
    // ignore
  }
  currentToken = null;
  currentRegisteredUid = null;
}

export async function setupFcmForegroundListener(): Promise<void> {
  const messaging = await getMessagingInstance();
  if (!messaging) return;

  onMessage(messaging, (payload) => {
    const title = payload.notification?.title || payload.data?.title || 'Nueva notificación';
    const body = payload.notification?.body || payload.data?.body || '';
    const linkPath = payload.data?.linkPath || '/';

    void playNotificationSound();
    void showSystemNotification({
      title,
      body,
      tag: payload.data?.notificationId || `fcm-${Date.now()}`,
      linkPath,
      orderId: payload.data?.orderId,
    });
  });
}

export function getFcmProjectId(): string {
  return firebaseConfig.projectId || '';
}
