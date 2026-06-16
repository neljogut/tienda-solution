import { useCallback, useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { default3D, defaultResale } from '../constants/defaults';
import type { PricingSettings3D, PricingSettingsResale, ExchangeRateData } from '../types/settings';
import type { Product } from '../types/product';
import { resolveProductCost, resolveProductRetailPrice } from '../services/pricingService';

type InventoryItem = {
  type?: string;
  priceUsdKg?: number;
  unitCostArs?: number;
};

const FALLBACK_RATE: ExchangeRateData = {
  currentUsdToArs: 1000,
  lastUpdate: '',
  provider: 'Fallback',
};

export function usePricingData() {
  const [settings3d, setSettings3d] = useState<PricingSettings3D>(default3D);
  const [settingsResale, setSettingsResale] = useState<PricingSettingsResale>(defaultResale);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateData>(FALLBACK_RATE);
  const [inventoryMap, setInventoryMap] = useState<Map<string, InventoryItem>>(new Map());
  const [productTypes, setProductTypes] = useState<Record<string, string>>({
    '3d': 'Impresión 3D',
    'resale': 'Productos Varios'
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let loaded = 0;
    const markReady = () => {
      loaded += 1;
      if (loaded >= 5) setReady(true);
    };

    const unsubs = [
      onSnapshot(doc(db, 'settings', 'pricing3d'), (snap) => {
        if (snap.exists()) {
          setSettings3d({ ...default3D, ...snap.data() } as PricingSettings3D);
        }
        markReady();
      }),
      onSnapshot(doc(db, 'settings', 'pricingResale'), (snap) => {
        if (snap.exists()) {
          setSettingsResale({ ...defaultResale, ...snap.data() } as PricingSettingsResale);
        }
        markReady();
      }),
      onSnapshot(doc(db, 'settings', 'exchangeRate'), (snap) => {
        if (snap.exists()) {
          setExchangeRate(snap.data() as ExchangeRateData);
        }
        markReady();
      }),
      onSnapshot(collection(db, 'inventory'), (snap) => {
        const map = new Map<string, InventoryItem>();
        snap.forEach((d) => map.set(d.id, d.data() as InventoryItem));
        setInventoryMap(map);
        markReady();
      }),
      onSnapshot(collection(db, 'product_types'), (snap) => {
        const map: Record<string, string> = {};
        snap.forEach((d) => {
          map[d.id] = d.data().name;
        });
        if (!map['3d']) map['3d'] = 'Impresión 3D';
        setProductTypes(map);
        markReady();
      }),
    ];

    return () => unsubs.forEach((u) => u());
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
