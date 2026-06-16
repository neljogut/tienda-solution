import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProductType, PriceTier } from '../types/product';
import type { Category } from '../types/category';
import type { VariantGroup } from '../types/variantGroup';
import { getTierPrice, roundPriceUp100, resolveInheritedPriceTiers, deepestTierScopeCategoryId, aggregatedQtyByScope } from '../services/pricingService';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '../firebase';
import type { PricingSettings3D } from '../types/settings';

let pricing3dSettings: PricingSettings3D | null = null;
let allCategories: Category[] = [];
let allVariantGroups: VariantGroup[] = [];

export interface CartItem {
  productId: string;
  name: string;
  type: ProductType;
  quantity: number;
  price: number;
  basePrice: number;
  priceTiers?: PriceTier[];
  resolvedPriceTiers?: PriceTier[];
  imageUrl?: string;
  maxStock: number;
  weightGrams?: number;
  categoryId?: string;
  category?: string;
  isKeychain?: boolean;
  variantGroup?: string;
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
  // 1. Resolve price tiers for each item first, storing it in resolvedPriceTiers
  const itemsWithResolved = items.map(item => {
    const resolvedPriceTiers = resolveInheritedPriceTiers(
      item.priceTiers,
      item.categoryId,
      allCategories,
      item.variantGroup,
      allVariantGroups
    );
    return { ...item, resolvedPriceTiers };
  });

  // 2. Build aggregated quantity map by tier scope (category or variant group level aggregation)
  // Items sharing the same scope pool their quantities for tier evaluation
  const scopeQtyMap = aggregatedQtyByScope(
    itemsWithResolved.map(i => ({
      priceTiers: i.priceTiers,
      categoryId: i.categoryId,
      variantGroup: i.variantGroup,
      quantity: i.quantity,
    })),
    allCategories,
    allVariantGroups
  );

  // 3. Calculate total weight of 3D products (excluding those with tiers)
  let total3DWeightNormal = 0;
  let total3DWeightKeychain = 0;

  itemsWithResolved.forEach(item => {
    // If it has price tiers (directly or inherited), it does NOT count towards threshold weight
    if (item.resolvedPriceTiers && item.resolvedPriceTiers.length > 0) {
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

  return itemsWithResolved.map(item => {
    // Priority 1: Price Tiers (using aggregated scope quantity)
    if (item.resolvedPriceTiers && item.resolvedPriceTiers.length > 0) {
      const scopeId = deepestTierScopeCategoryId(item.priceTiers, item.categoryId, allCategories, item.variantGroup);
      const effectiveQty = scopeId ? (scopeQtyMap.get(scopeId) ?? item.quantity) : item.quantity;
      const price = getTierPrice(effectiveQty, item.basePrice, item.resolvedPriceTiers);
      return { ...item, price };
    }

    // Priority 2: Threshold Discounts
    if (item.type === '3d') {
      if (item.isKeychain) {
        if (meetsKeychain) {
          const discountPrice = item.basePrice * (1 - discountPercentKeychain / 100);
          return { ...item, price: roundPriceUp100(discountPrice) };
        }
      } else {
        if (meetsNormal) {
          const discountPrice = item.basePrice * (1 - discountPercentNormal / 100);
          return { ...item, price: roundPriceUp100(discountPrice) };
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
                  categoryId: i.categoryId || newItem.categoryId,
                  isKeychain: i.isKeychain !== undefined ? i.isKeychain : newItem.isKeychain,
                  weightGrams: i.weightGrams || newItem.weightGrams,
                  priceTiers: i.priceTiers || newItem.priceTiers,
                  variantGroup: i.variantGroup || newItem.variantGroup
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
            categoryId: newItem.categoryId,
            category: newItem.category,
            isKeychain: newItem.isKeychain,
            variantGroup: newItem.variantGroup,
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

// Subscribe to categories
onSnapshot(collection(db, 'categories'), (snap) => {
  const cats: Category[] = [];
  snap.forEach((d) => {
    cats.push({ id: d.id, ...d.data() } as Category);
  });
  allCategories = cats;
  
  // Trigger recalculation if the store is already initialized and has items
  try {
    const store = useCartStore.getState();
    if (store && store.items.length > 0) {
      store.recalculatePrices();
    }
  } catch (e) {
    console.warn("Zustand store not fully initialized during categories fetch:", e);
  }
});

// Subscribe to variantGroups
onSnapshot(collection(db, 'variantGroups'), (snap) => {
  const groups: VariantGroup[] = [];
  snap.forEach((d) => {
    groups.push({ id: d.id, ...d.data() } as VariantGroup);
  });
  allVariantGroups = groups;
  
  // Trigger recalculation if the store is already initialized and has items
  try {
    const store = useCartStore.getState();
    if (store && store.items.length > 0) {
      store.recalculatePrices();
    }
  } catch (e) {
    console.warn("Zustand store not fully initialized during variantGroups fetch:", e);
  }
});
