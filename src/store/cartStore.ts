import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProductType, PriceTier } from '../types/product';
import { getTierPrice, roundPriceUp10 } from '../services/pricingService';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { PricingSettings3D } from '../types/settings';

let pricing3dSettings: PricingSettings3D | null = null;

export interface CartItem {
  productId: string;
  name: string;
  type: ProductType;
  quantity: number;
  price: number;
  basePrice: number;
  priceTiers?: PriceTier[];
  imageUrl?: string;
  maxStock: number;
  weightGrams?: number;
  category?: string;
  isKeychain?: boolean;
}

interface CartState {
  items: CartItem[];
  isDrawerOpen: boolean;
  
  // Actions
  addItem: (item: Omit<CartItem, 'quantity' | 'basePrice'> & { quantity?: number; basePrice?: number }) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  recalculatePrices: () => void;
  
  // UI Actions
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  
  // Computed (getters handled in components or as helper methods)
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

function recalculateCartItems(items: CartItem[]): CartItem[] {
  // 1. Calculate total weight of 3D products (excluding those with tiers)
  let total3DWeightNormal = 0;
  let total3DWeightKeychain = 0;

  items.forEach(item => {
    // If it has price tiers, it does NOT count towards threshold weight and does NOT receive threshold discounts
    if (item.priceTiers && item.priceTiers.length > 0) {
      return;
    }
    if (item.type === '3d') {
      const weight = (item.weightGrams || 0) * item.quantity;
      if (item.isKeychain) {
        total3DWeightKeychain += weight;
      } else {
        total3DWeightNormal += weight;
      }
    }
  });

  const thresholdNormal = pricing3dSettings?.wholesaleThresholdGramsNormal ?? 1000;
  const thresholdKeychain = pricing3dSettings?.wholesaleThresholdGramsKeychain ?? 600;

  const discountPercentNormal = pricing3dSettings?.wholesaleDiscountPercentNormal ?? 15;
  const discountPercentKeychain = pricing3dSettings?.wholesaleDiscountPercentKeychain ?? 10;

  const meetsNormal = total3DWeightNormal >= thresholdNormal;
  const meetsKeychain = total3DWeightKeychain >= thresholdKeychain;

  return items.map(item => {
    // Priority 1: Price Tiers
    if (item.priceTiers && item.priceTiers.length > 0) {
      const price = getTierPrice(item.quantity, item.basePrice, item.priceTiers);
      return { ...item, price };
    }

    // Priority 2: Threshold Discounts
    if (item.type === '3d') {
      if (item.isKeychain) {
        if (meetsKeychain) {
          const discountPrice = item.basePrice * (1 - discountPercentKeychain / 100);
          return { ...item, price: roundPriceUp10(discountPrice) };
        }
      } else {
        if (meetsNormal) {
          const discountPrice = item.basePrice * (1 - discountPercentNormal / 100);
          return { ...item, price: roundPriceUp10(discountPrice) };
        }
      }
    }

    // Default: Base price
    return { ...item, price: item.basePrice };
  });
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isDrawerOpen: false,

      addItem: (newItem) => set((state) => {
        const existingItem = state.items.find(i => i.productId === newItem.productId);
        const addQty = newItem.quantity || 1;
        
        let newItems;
        if (existingItem) {
          const newQuantity = Math.min(existingItem.quantity + addQty, existingItem.maxStock);
          newItems = state.items.map(i => 
            i.productId === newItem.productId 
              ? { 
                  ...i, 
                  quantity: newQuantity,
                  category: i.category || newItem.category,
                  isKeychain: i.isKeychain !== undefined ? i.isKeychain : newItem.isKeychain,
                  weightGrams: i.weightGrams || newItem.weightGrams,
                  priceTiers: i.priceTiers || newItem.priceTiers
                }
              : i
          );
        } else {
          // Add new
          const basePrice = newItem.basePrice ?? newItem.price;
          newItems = [...state.items, { 
            productId: newItem.productId,
            name: newItem.name,
            type: newItem.type,
            imageUrl: newItem.imageUrl,
            maxStock: newItem.maxStock,
            priceTiers: newItem.priceTiers,
            weightGrams: newItem.weightGrams,
            category: newItem.category,
            isKeychain: newItem.isKeychain,
            basePrice,
            price: basePrice,
            quantity: addQty 
          }];
        }
        
        return { items: recalculateCartItems(newItems) };
      }),

      removeItem: (productId) => set((state) => {
        const remaining = state.items.filter(i => i.productId !== productId);
        return { items: recalculateCartItems(remaining) };
      }),

      updateQuantity: (productId, quantity) => set((state) => {
        if (quantity <= 0) {
          const remaining = state.items.filter(i => i.productId !== productId);
          return { items: recalculateCartItems(remaining) };
        }
        const updated = state.items.map(i => {
          if (i.productId === productId) {
            return { ...i, quantity: Math.min(quantity, i.maxStock) };
          }
          return i;
        });
        return { items: recalculateCartItems(updated) };
      }),

      clearCart: () => set({ items: [] }),

      recalculatePrices: () => set((state) => ({
        items: recalculateCartItems(state.items)
      })),

      openDrawer: () => set({ isDrawerOpen: true }),
      closeDrawer: () => set({ isDrawerOpen: false }),
      toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),

      getTotalItems: () => get().items.reduce((total, item) => total + item.quantity, 0),
      getTotalPrice: () => get().items.reduce((total, item) => total + (item.price * item.quantity), 0),
    }),
    {
      name: 'dualgi-cart-storage',
      // only persist items, not UI state
      partialize: (state) => ({ items: state.items }),
    }
  )
);

// Subscribe to Firestore pricing configurations
onSnapshot(doc(db, 'settings', 'pricing3d'), (snap) => {
  if (snap.exists()) {
    pricing3dSettings = snap.data() as PricingSettings3D;
    // Trigger recalculation if the store is already initialized and has items
    try {
      const store = useCartStore.getState();
      if (store && store.items.length > 0) {
        store.recalculatePrices();
      }
    } catch (e) {
      console.warn("Zustand store not fully initialized during config fetch:", e);
    }
  }
});
