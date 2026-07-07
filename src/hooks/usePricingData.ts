import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { default3D, defaultResale } from '../constants/defaults';
import type { PricingSettings3D, PricingSettingsResale, ExchangeRateData } from '../types/settings';
import type { Product } from '../types/product';
import { resolveProductCost, resolveProductRetailPrice } from '../services/pricingService';

type InventoryItem = any;

const FALLBACK_RATE: ExchangeRateData = {
  currentUsdToArs: 1000,
  lastUpdate: '',
  provider: 'Fallback',
};

export function usePricingData() {
  const [settings3d] = useState<PricingSettings3D>(default3D);
  const [settingsResale, setSettingsResale] = useState<PricingSettingsResale>(defaultResale);
  const [exchangeRate] = useState<ExchangeRateData>(FALLBACK_RATE);
  const [inventoryMap] = useState<Map<string, InventoryItem>>(new Map());
  const [productTypes] = useState<Record<string, string>>({
    'resale': 'Productos'
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'pricingResale'), (snap) => {
      if (snap.exists()) {
        setSettingsResale({ ...defaultResale, ...snap.data() } as PricingSettingsResale);
      }
      setReady(true);
    });

    return () => unsub();
  }, []);

  const getRetailPrice = useCallback(
    (product: Product) =>
      resolveProductRetailPrice(product, settings3d, settingsResale, exchangeRate, inventoryMap),
    [settings3d, settingsResale, exchangeRate, inventoryMap]
  );

  const getCost = useCallback(
    (product: Product) =>
      resolveProductCost(product, settings3d, settingsResale, exchangeRate, inventoryMap),
    [settings3d, settingsResale, exchangeRate, inventoryMap]
  );

  return { ready, settings3d, settingsResale, exchangeRate, inventoryMap, productTypes, getRetailPrice, getCost };
}
