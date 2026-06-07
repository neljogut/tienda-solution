import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProductType, PriceTier } from '../types/product';
import { getTierPrice } from '../services/pricingService';

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
}

interface CartState {
  items: CartItem[];
  isDrawerOpen: boolean;
  
  // Actions
  addItem: (item: Omit<CartItem, 'quantity' | 'basePrice'> & { quantity?: number; basePrice?: number }) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  
  // UI Actions
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  
  // Computed (getters handled in components or as helper methods)
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isDrawerOpen: false,

      addItem: (newItem) => set((state) => {
        const existingItem = state.items.find(i => i.productId === newItem.productId);
        const addQty = newItem.quantity || 1;
        
        if (existingItem) {
          const newQuantity = Math.min(existingItem.quantity + addQty, existingItem.maxStock);
          const price = getTierPrice(newQuantity, existingItem.basePrice, existingItem.priceTiers);
          return {
            items: state.items.map(i => 
              i.productId === newItem.productId 
                ? { ...i, quantity: newQuantity, price }
                : i
            )
          };
        }
        
        // Add new
        const basePrice = newItem.basePrice ?? newItem.price;
        const price = getTierPrice(addQty, basePrice, newItem.priceTiers);
        
        return {
          items: [...state.items, { 
            productId: newItem.productId,
            name: newItem.name,
            type: newItem.type,
            imageUrl: newItem.imageUrl,
            maxStock: newItem.maxStock,
            priceTiers: newItem.priceTiers,
            basePrice,
            price,
            quantity: addQty 
          }]
        };
      }),

      removeItem: (productId) => set((state) => ({
        items: state.items.filter(i => i.productId !== productId)
      })),

      updateQuantity: (productId, quantity) => set((state) => {
        if (quantity <= 0) {
          return { items: state.items.filter(i => i.productId !== productId) };
        }
        return {
          items: state.items.map(i => {
            if (i.productId === productId) {
              const newQuantity = Math.min(quantity, i.maxStock);
              const price = getTierPrice(newQuantity, i.basePrice, i.priceTiers);
              return { ...i, quantity: newQuantity, price };
            }
            return i;
          })
        };
      }),

      clearCart: () => set({ items: [] }),

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
