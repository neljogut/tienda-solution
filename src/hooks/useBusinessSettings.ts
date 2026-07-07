import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export interface VisualSettings {
  outOfStockSaturate?: number;   // 0–100, default 20
  catalogTitle?: string;
  catalogHeroText?: string;
  [key: string]: any;
}

let cachedSettings: VisualSettings | null = null;
const listeners: Array<(s: VisualSettings) => void> = [];
let unsubscribe: (() => void) | null = null;

// Shared singleton listener so all hook instances reuse one Firestore subscription
function ensureSubscribed() {
  if (unsubscribe) return;
  unsubscribe = onSnapshot(doc(db, 'settings', 'business'), (snap) => {
    if (snap.exists()) {
      cachedSettings = snap.data() as VisualSettings;
      listeners.forEach((fn) => fn(cachedSettings!));
    }
  });
}

export function useBusinessSettings(): VisualSettings {
  const [settings, setSettings] = useState<VisualSettings>(cachedSettings ?? {});

  useEffect(() => {
    ensureSubscribed();

    const handler = (s: VisualSettings) => setSettings(s);
    listeners.push(handler);

    // If we already have cached data, sync immediately
    if (cachedSettings) setSettings(cachedSettings);

    return () => {
      const idx = listeners.indexOf(handler);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }, []);

  return settings;
}
