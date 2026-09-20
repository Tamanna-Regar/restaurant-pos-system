import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom'; // <-- BrowserRouter yahan se hata diya hai
import { Login } from './components/Login';
import Dashboard from './components/Dashboard';
import CustomerMenu from './components/CustomerMenu';
import { api } from './api';
import Feedback from './components/Feedback';

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
    <Routes>
      {/* 1. Public QR Menu Route (Bina login ke chalega) */}
      <Route path="/menu/:tableId" element={<CustomerMenu />} />
      <Route path="/feedback" element={<Feedback />} />

      {/* 2. Main POS Application Route (Login ya Dashboard) */}
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
  );
}

export default App;