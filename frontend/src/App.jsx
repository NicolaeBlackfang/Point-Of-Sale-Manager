import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ui/ProtectedRoute';
import Login from './pages/Login';
import SuperadminDashboard from './pages/SuperadminDashboard';
import OperatorDashboard from './pages/OperatorDashboard';
import CashierDashboard from './pages/CashierDashboard';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Superadmin Protected Routes */}
          <Route element={<ProtectedRoute allowedRoles={['Superadmin']} />}>
            <Route path="/superadmin" element={<SuperadminDashboard />} />
          </Route>

          {/* Operator Protected Routes */}
          <Route element={<ProtectedRoute allowedRoles={['Operator']} />}>
            <Route path="/operator" element={<OperatorDashboard />} />
          </Route>

          {/* Cashier Protected Routes */}
          <Route element={<ProtectedRoute allowedRoles={['Cashier']} />}>
            <Route path="/cashier" element={<CashierDashboard />} />
          </Route>

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;