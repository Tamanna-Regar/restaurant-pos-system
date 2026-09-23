import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom'; // <-- BrowserRouter yahan se hata diya hai
import { Toaster } from 'react-hot-toast';
import { Login } from './components/Login';
import Dashboard from './components/Dashboard';
import CustomerMenu from './components/CustomerMenu';
import { api } from './api';
import Feedback from './components/Feedback';
import WaiterOrderingApp from './components/WaiterOrderingApp';
import OnlineOrders from './components/OnlineOrders';
import KitchenDisplay from './components/KitchenDisplay';
import OfflineStatusBanner from './components/OfflineStatusBanner';
import OwnerLiveMonitor from './components/OwnerLiveMonitor';
import SupplierPortal from './components/SupplierPortal';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout', { refreshToken: localStorage.getItem('refreshToken') });
    } catch (error) {
      console.warn('Logout API failed; clearing local session.', error.message);
    }
    localStorage.clear();
    setIsLoggedIn(false);
  };

  return (
    <>
      <OfflineStatusBanner token={localStorage.getItem('token')} />
      <Toaster position="top-right" />
      <Routes>
        {/* 1. Public QR Menu Route (Bina login ke chalega) */}
        <Route path="/menu/:tableId" element={<CustomerMenu />} />
        <Route path="/feedback" element={<Feedback />} />

        {/* 2. Waiter / Captain Mobile POS App */}
        <Route path="/waiter" element={<WaiterOrderingApp />} />
        <Route path="/captain" element={<WaiterOrderingApp />} />

        {/* 3. Standalone Online Orders Delivery Aggregator */}
        <Route path="/online" element={<OnlineOrders />} />
        <Route path="/online-orders" element={<OnlineOrders />} />

        {/* 4. Kitchen Display System (KDS) for Chefs */}
        <Route path="/kitchen" element={<KitchenDisplay onBackToPos={() => window.location.href = '/'} />} />
        <Route path="/kds" element={<KitchenDisplay onBackToPos={() => window.location.href = '/'} />} />

        {/* 5. Owner Live Remote Monitor */}
        <Route path="/owner" element={<OwnerLiveMonitor />} />
        <Route path="/live" element={<OwnerLiveMonitor />} />

        {/* 6. Vendor / Supplier Self-Service Portal */}
        <Route path="/supplier" element={<SupplierPortal />} />
        <Route path="/vendor" element={<SupplierPortal />} />

        {/* 7. Main POS Application Route (Login ya Dashboard) */}
      <Route 
        path="/*" 
        element={
          isLoggedIn ? (
            <Dashboard handleLogout={handleLogout} />
          ) : (
            <Login onLoginSuccess={() => setIsLoggedIn(true)} />
          )
        } 
      />
      </Routes>
    </>
  );
}

export default App;