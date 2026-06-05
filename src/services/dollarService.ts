import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { ExchangeRateData } from '../types/settings';

const EXCHANGE_RATE_DOC = 'settings/exchangeRate';

export const fetchDollarRate = async (): Promise<ExchangeRateData> => {
  try {
    // Try DolarAPI.com (free, no auth, Argentina-focused)
    const response = await fetch('https://dolarapi.com/v1/dolares/oficial');
    if (!response.ok) throw new Error('API failed');
    const data = await response.json();

    const rateData: ExchangeRateData = {
      currentUsdToArs: data.venta || data.compra || 1000,
      lastUpdate: new Date().toISOString(),
      provider: 'DolarAPI (Oficial)',
    };

    // Save to Firestore as fallback
    await setDoc(doc(db, EXCHANGE_RATE_DOC), rateData);
    return rateData;
  } catch (error) {
    console.warn('Dollar API failed, using cached rate:', error);
    return getLastSavedRate();
  }
};

export const getLastSavedRate = async (): Promise<ExchangeRateData> => {
  try {
    const docSnap = await getDoc(doc(db, EXCHANGE_RATE_DOC));
    if (docSnap.exists()) {
      return docSnap.data() as ExchangeRateData;
    }
  } catch (e) {
    console.error('Error reading saved rate:', e);
  }
  // Ultimate fallback
  return { currentUsdToArs: 1000, lastUpdate: '', provider: 'Manual (fallback)' };
};

export const setManualRate = async (rate: number): Promise<ExchangeRateData> => {
  const rateData: ExchangeRateData = {
    currentUsdToArs: rate,
    lastUpdate: new Date().toISOString(),
    provider: 'Manual',
  };
  await setDoc(doc(db, EXCHANGE_RATE_DOC), rateData);
  return rateData;
};
