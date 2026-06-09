const SOUND_URL = `/sounds/notification.wav?v=${import.meta.env.VITE_FIREBASE_PROJECT_ID || '1'}`;

let audioUnlocked = false;
let sharedAudio: HTMLAudioElement | null = null;
let audioContext: AudioContext | null = null;

function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.volume = 1;
  }
  return sharedAudio;
}

async function loadSoundBlob(): Promise<string> {
  const response = await fetch(SOUND_URL, { cache: 'no-store' });
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/** Desbloquea audio en el primer gesto del usuario (requerido por navegadores y móviles). */
export function initNotificationAudio(): void {
  if (typeof window === 'undefined' || audioUnlocked) return;

  const unlock = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;

    void loadSoundBlob()
      .then((blobUrl) => {
        const audio = getSharedAudio();
        audio.src = blobUrl;
        return audio.play();
      })
      .then(() => {
        getSharedAudio().pause();
        getSharedAudio().currentTime = 0;
      })
      .catch(() => {});

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      audioContext = new AudioCtx();
      if (audioContext.state === 'suspended') {
        void audioContext.resume();
      }
    }

    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
    document.removeEventListener('touchstart', unlock);
    document.removeEventListener('click', unlock);
  };

  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock, { passive: true });
  document.addEventListener('touchstart', unlock, { passive: true });
  document.addEventListener('click', unlock, { passive: true });
}

/** Fuerza desbloqueo tras un click explícito (ej. campanita). */
export function unlockNotificationAudio(): void {
  initNotificationAudio();
  if (audioUnlocked) return;

  void loadSoundBlob()
    .then((blobUrl) => {
      const audio = getSharedAudio();
      audio.src = blobUrl;
      return audio.play();
    })
    .then(() => {
      getSharedAudio().pause();
      getSharedAudio().currentTime = 0;
      audioUnlocked = true;
      if (audioContext?.state === 'suspended') {
        void audioContext.resume();
      }
    })
    .catch(() => {});
}

function playWebAudioFallback(): void {
  if (!audioUnlocked) return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx || !audioContext) return;

    const ctx = audioContext;
    audioContext = ctx;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    const t = ctx.currentTime;
    playTone(880, t, 0.15);
    playTone(1175, t + 0.18, 0.2);
  } catch {
    // ignore
  }
}

async function playLoadedSound(): Promise<void> {
  const blobUrl = await loadSoundBlob();
  const audio = getSharedAudio();
  audio.src = blobUrl;
  audio.currentTime = 0;
  await audio.play();
}

/** Reproduce sonido de notificación (pestaña activa). */
export async function playNotificationSound(): Promise<void> {
  vibrateOnNotification();

  try {
    await playLoadedSound();
    return;
  } catch {
    // fallback
  }

  try {
    const audio = new Audio(SOUND_URL);
    audio.volume = 1;
    await audio.play();
    return;
  } catch {
    // fallback
  }

  playWebAudioFallback();
}

export function vibrateOnNotification(): void {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([120, 60, 120, 60, 200]);
    }
  } catch {
    // ignore
  }
}

export interface SystemNotificationPayload {
  title: string;
  body: string;
  tag: string;
  linkPath?: string;
}

/** Notificación del sistema con sonido (funciona en móvil con permiso concedido). */
export async function showSystemNotification(payload: SystemNotificationPayload): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const options: NotificationOptions & { vibrate?: number[] } = {
    body: payload.body,
    tag: payload.tag,
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    silent: false,
    vibrate: [200, 100, 200, 100, 200],
    data: { linkPath: payload.linkPath || '/' },
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(payload.title, options);
      return;
    }
  } catch {
    // fallback
  }

  try {
    new Notification(payload.title, options);
  } catch {
    // ignore
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}
