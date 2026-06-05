import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProductType } from '../types/product';

export interface CartItem {
  productId: string;
  name: string;
  type: ProductType;
  quantity: number;
  price: number;
  imageUrl?: string;
  maxStock: number;
}

interface CartState {
  items: CartItem[];
  isDrawerOpen: boolean;
  
  // Actions
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
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
          return {
            items: state.items.map(i => 
              i.productId === newItem.productId 
                ? { ...i, quantity: newQuantity }
                : i
            )
          };
        }
        
        // Add new
        return {
          items: [...state.items, { ...newItem, quantity: addQty }]
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
              return { ...i, quantity: Math.min(quantity, i.maxStock) };
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
