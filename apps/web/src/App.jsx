import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthProvider';
import { ThemeProvider } from './context/ThemeProvider';
import { SettingsProvider } from './context/SettingsProvider';
import ProtectedRoute from './components/ui/ProtectedRoute';
import ViewportGuard from './components/ui/ViewportGuard';

// Route-level code splitting keeps the initial bundle small.
const Login = lazy(() => import('./pages/Login'));
const SuperadminDashboard = lazy(() => import('./pages/SuperadminDashboard'));
const OperatorDashboard = lazy(() => import('./pages/OperatorDashboard'));
const CashierDashboard = lazy(() => import('./pages/CashierDashboard'));

function App() {
  return (
    <ViewportGuard>
      <ThemeProvider>
        <AuthProvider>
          <SettingsProvider>
            <Router>
              <Suspense
                fallback={
                  <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                    Loading…
                  </div>
                }
              >
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
              </Suspense>
            </Router>
          </SettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    </ViewportGuard>
  );
}

export default App;
