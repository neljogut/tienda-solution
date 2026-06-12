import React, { useEffect } from 'react';
import { initNotificationAudio } from './utils/notificationAlert';
import { setupFcmForegroundListener } from './services/fcmService';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Catalog } from './pages/Catalog';
import { MyOrders } from './pages/client/MyOrders';
import { MyAccount } from './pages/client/MyAccount';
import { ProductDetail } from './pages/ProductDetail';
import { Dashboard } from './pages/Dashboard';
import { ProductList } from './pages/admin/ProductList';
import { ProductForm } from './pages/admin/ProductForm';
import { Inventory } from './pages/admin/Inventory';
import { Orders } from './pages/admin/Orders';
import { NewOrder } from './pages/admin/NewOrder';
import { Cash } from './pages/admin/Cash';
import { CurrentAccounts } from './pages/admin/CurrentAccounts';
import { Balance } from './pages/admin/Balance';
import { ClientsManager } from './pages/admin/ClientsManager';
import { Categories } from './pages/admin/Categories';
import { PricingSettings } from './pages/admin/PricingSettings';
import { CashHistory } from './pages/admin/CashHistory';
import { InventoryMovements } from './pages/admin/InventoryMovements';
import { BusinessSettingsPage } from './pages/admin/BusinessSettings';
import { Employees } from './pages/admin/Employees';
import { MyAccountBalance } from './pages/client/MyAccountBalance';
import { Checkout } from './pages/client/Checkout';
import { PaymentResult } from './pages/client/PaymentResult';
import { SharedOrder } from './pages/SharedOrder';
import { MyBalance } from './pages/client/MyBalance';
import { Liquidations } from './pages/admin/Liquidations';

// Rutas protegidas basadas en auth y roles
const ProtectedRoute = ({ children, requiredRole, requiredPermission }: { 
  children: React.ReactElement, 
  requiredRole?: string, 
  requiredPermission?: keyof NonNullable<import('./types/user').UserData['permissions']> 
}) => {
  const { currentUser, userData, loading, hasPermission } = useAuth();

  if (loading) return <div className="h-screen w-full flex items-center justify-center text-slate-500">Cargando...</div>;
  if (!currentUser || !userData) return <Navigate to="/login" replace />;
  
  if (requiredRole && userData.role !== 'owner' && userData.role !== requiredRole) {
    return <Navigate to="/catalog" replace />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
     return <Navigate to="/catalog" replace />;
  }

  return children;
};

function App() {
  useEffect(() => {
    initNotificationAudio();
    void setupFcmForegroundListener();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'business'), (snap) => {
      const data = snap.exists() ? snap.data() : null;
      
      // Update Title
      document.title = data?.name ? `${data.name} · Impresión 3D y Regalos Personalizados` : 'Dualgi 3D · Impresión 3D y Regalos Personalizados';
      
      // Update Favicon
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = data?.logoUrl || '/favicon.svg';
    });
    return () => unsub();
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/catalog" replace />} />
            <Route path="catalog" element={<Catalog />} />
            <Route path="catalog/:id" element={<ProductDetail />} />
            <Route path="shared-order/:orderId" element={<SharedOrder />} />
            
            {/* Client routes */}
            <Route path="my-orders" element={
              <ProtectedRoute>
                <MyOrders />
              </ProtectedRoute>
            } />
            <Route path="my-account-balance" element={
              <ProtectedRoute>
                <MyAccountBalance />
              </ProtectedRoute>
            } />
            <Route path="my-account" element={
              <ProtectedRoute>
                <MyAccount />
              </ProtectedRoute>
            } />
            <Route path="checkout" element={
              <ProtectedRoute>
                <Checkout />
              </ProtectedRoute>
            } />
            <Route path="payment/result" element={
              <ProtectedRoute>
                <PaymentResult />
              </ProtectedRoute>
            } />
            
            {/* Owner / Employee protected routes */}
            <Route path="dashboard" element={
              <ProtectedRoute requiredRole="owner">
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="admin/products" element={
              <ProtectedRoute requiredPermission="viewCatalog">
                <ProductList />
              </ProtectedRoute>
            } />
            <Route path="admin/products/new" element={
              <ProtectedRoute requiredPermission="createProducts">
                <ProductForm />
              </ProtectedRoute>
            } />
            <Route path="admin/products/:id" element={
              <ProtectedRoute requiredPermission="editProducts">
                <ProductForm />
              </ProtectedRoute>
            } />
            <Route path="inventory" element={
              <ProtectedRoute requiredPermission="viewInventory">
                <Inventory />
              </ProtectedRoute>
            } />
            <Route path="inventory-movements" element={
              <ProtectedRoute requiredPermission="viewInventoryMovements">
                <InventoryMovements />
              </ProtectedRoute>
            } />
            <Route path="orders" element={
              <ProtectedRoute requiredPermission="viewOrders">
                <Orders />
              </ProtectedRoute>
            } />
            <Route path="orders/new" element={
              <ProtectedRoute requiredPermission="createOrders">
                <NewOrder />
              </ProtectedRoute>
            } />
            <Route path="cash" element={
              <ProtectedRoute requiredPermission="viewCash">
                <Cash />
              </ProtectedRoute>
            } />
            <Route path="cash-history" element={
              <ProtectedRoute requiredPermission="viewCash">
                <CashHistory />
              </ProtectedRoute>
            } />
            <Route path="accounts" element={
              <ProtectedRoute requiredPermission="viewCash">
                <CurrentAccounts />
              </ProtectedRoute>
            } />
            <Route path="balance" element={
              <ProtectedRoute requiredRole="owner">
                <Balance />
              </ProtectedRoute>
            } />
            <Route path="clients" element={
              <ProtectedRoute requiredPermission="viewClients">
                <ClientsManager />
              </ProtectedRoute>
            } />
            <Route path="categories" element={
              <ProtectedRoute requiredPermission="viewCatalog">
                <Categories />
              </ProtectedRoute>
            } />
            <Route path="pricing-settings" element={
              <ProtectedRoute requiredPermission="viewPriceSettings">
                <PricingSettings />
              </ProtectedRoute>
            } />
            <Route path="business-settings" element={
              <ProtectedRoute requiredRole="owner">
                <BusinessSettingsPage />
              </ProtectedRoute>
            } />
            <Route path="employees" element={
              <ProtectedRoute requiredRole="owner">
                <Employees />
              </ProtectedRoute>
            } />
            <Route path="employee/balance" element={
              <ProtectedRoute requiredRole="employee">
                <MyBalance />
              </ProtectedRoute>
            } />
            <Route path="admin/liquidations" element={
              <ProtectedRoute requiredRole="owner">
                <Liquidations />
              </ProtectedRoute>
            } />
            
            {/* Fallback for undefined routes */}
            <Route path="*" element={<Navigate to="/catalog" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
