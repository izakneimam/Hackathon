import React from 'react';
import { Navigate } from 'react-router-dom';
import { getDashboardPathForRole, useAuth } from '../contexts/AuthContext';
import type { UserRoleType } from '../types/hackathon';

interface ProtectedRouteProps {
  allowedRoles: UserRoleType[];
  requireEmailVerified?: boolean;
  children: React.ReactNode;
}

export function ProtectedRoute({
  allowedRoles,
  requireEmailVerified = true,
  children,
}: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060913] bg-grid-pattern flex items-center justify-center p-6">
        <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 flex items-center space-x-3 text-sm text-slate-300">
          <i className="fa-solid fa-circle-notch fa-spin text-indigo-400 text-lg" />
          <span className="font-code">Verificando sessão...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!role) {
    return <Navigate to="/login" replace />;
  }

  if (requireEmailVerified && role === 'participante' && !user.emailVerified) {
    return <Navigate to="/verificar-email" replace />;
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to={getDashboardPathForRole(role)} replace />;
  }

  return <>{children}</>;
}
