import React, { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';

const ProtectedRoute = ({ allowedRoles }) => {
    const { user, loading } = useContext(AuthContext);

    if (loading) {
        return <div className="flex h-screen items-center justify-center">Loading...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        // Redirect user to their respective valid path if trying to access unauthorized route
        if (user.role === 'Superadmin') return <Navigate to="/superadmin" replace />;
        if (user.role === 'Operator') return <Navigate to="/operator" replace />;
        if (user.role === 'Cashier') return <Navigate to="/cashier" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;